package com.kaoyan.studytimer.lock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

// 安卓 Live Updates / ColorOS 流体云：计时进行中常驻显示倒计时/进度。
// 核心原则：倒计时交给系统 Notification chronometer 自走，不靠 App 每秒重发通知。
// 这样锁屏/流体云更像系统时钟，息屏时也不会因为 App 线程被冻结而一秒一闪或卡死。
//
// 实现选择（关键）：
//  · 用前台服务承载——保持计时通知常驻，顺带把进程钉住不被国产 ROM 冻结，提升可靠性。
//  · 只用"稳定老 API + 一个 Bundle extra(android.requestPromotedOngoing)"来构建通知，
//    保证一定能编译通过；API 36 才有的 setShortCriticalText / ProgressStyle 用反射调用，
//    在安卓16上生效、在更低版本或方法不存在时自动降级，绝不导致编译失败。
class LiveTimerService : Service() {
    companion object {
        const val CHANNEL_ID = "study-live-timer"
        const val NID = 7100
        // 胶囊是否正在运行 + 当前实例引用。nudge 保留给调试/兼容入口，但默认业务不再调用：
        // OPPO/ColorOS 上反复 notify 会让流体云重新弹出，尤其解锁后很打扰。
        @Volatile var isRunning = false
        private var inst: LiveTimerService? = null
        private var lastNudge = 0L
        // 无障碍线程调用：轻量节流，避免 TYPE_WINDOWS_CHANGED 连发时狂刷
        fun nudge() {
            val now = System.currentTimeMillis()
            if (now - lastNudge < 500L) return
            lastNudge = now
            inst?.repost()
        }
        fun start(ctx: Context, endAt: Long, totalMs: Long, title: String) {
            val i = Intent(ctx, LiveTimerService::class.java).apply {
                putExtra("endAt", endAt); putExtra("total", totalMs); putExtra("title", title)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }
        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, LiveTimerService::class.java))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var endAt = 0L
    private var total = 0L
    private var title = "专注中"
    // 屏幕是否点亮。息屏(AOD)由系统 UI 节能策略控制，普通 App 不能保证每秒刷新。
    // 这里保持 PUBLIC，让系统决定是否展示；不在解锁/亮屏瞬间重发，避免流体云弹窗打断用户。
    private var screenOn = true

    // 不做每秒刷新：系统 chronometer 自走；这里仅每分钟校准一次 ProgressStyle/兜底文本，并检查到点退出。
    private val ticker = object : Runnable {
        override fun run() {
            if (endAt - System.currentTimeMillis() <= 0) { stopSelf(); return }
            if (screenOn) repost()
            handler.postDelayed(this, 60_000)
        }
    }

    // 监听屏幕开关：息屏不打扰系统展示；亮屏只恢复分钟级校准，不主动重发通知。
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            when (i?.action) {
                Intent.ACTION_SCREEN_OFF -> {
                    screenOn = false
                }
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
                    if (screenOn) return
                    screenOn = true
                    handler.removeCallbacks(ticker)
                    handler.postDelayed(ticker, 60_000)
                }
            }
        }
    }

    private fun repost() {
        val remaining = endAt - System.currentTimeMillis()
        if (remaining <= 0) { stopSelf(); return }
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NID, build(remaining))
        } catch (_: Throwable) {}
    }

    override fun onCreate() {
        super.onCreate()
        inst = this
        isRunning = true
        val f = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        // 屏幕开关广播是受保护的隐式广播，只能运行时 registerReceiver（不能写在 manifest）。
        // 安卓13+ 须显式声明导出标志，这里只收系统广播、不对外暴露 → RECEIVER_NOT_EXPORTED。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(screenReceiver, f, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(screenReceiver, f)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        endAt = intent?.getLongExtra("endAt", 0L) ?: 0L
        total = intent?.getLongExtra("total", 0L) ?: 0L
        title = intent?.getStringExtra("title") ?: "专注中"
        createChannel()
        screenOn = (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
        val remaining = (endAt - System.currentTimeMillis()).coerceAtLeast(0L)
        startForeground(NID, build(remaining))
        handler.removeCallbacks(ticker)
        // 启动阶段轻推两次：部分 ROM(ColorOS/HyperOS) 要等通知第一次"被更新"才晋升成胶囊。
        // 只在刚开始时做，之后不靠解锁/窗口变化重发，避免流体云反复弹出。
        handler.postDelayed({ repost() }, 300)
        handler.postDelayed({ repost() }, 1500)
        handler.postDelayed(ticker, 60_000)
        // 被系统杀掉不自动重启（结束提醒由 TimerAlarm 的 setAlarmClock 负责，互不依赖）
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        inst = null
        handler.removeCallbacks(ticker)
        try { unregisterReceiver(screenReceiver) } catch (_: Throwable) {}
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NID) } catch (_: Throwable) {}
        super.onDestroy()
    }

    private fun build(remainingMs: Long): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: Intent()
        val pi = PendingIntent.getActivity(this, 2003, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val remainingText = formatRemaining(remainingMs)
        val b = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("剩余 $remainingText")
            .setContentText("$title · ${formatEndClock(endAt)} 结束")
            .setSmallIcon(smallIconRes())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setWhen(endAt)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(Color.rgb(255, 98, 95))
            .setColorized(false)

        applyLiveUpdateHints(b, remainingMs)
        b.addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })
        return b.build()
    }

    private fun applyLiveUpdateHints(b: Notification.Builder, remainingMs: Long) {
        // Android 16+ 官方 promoted ongoing 入口。用反射避免低 compileSdk 或旧系统直接崩。
        runCatching {
            b.javaClass
                .getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType)
                .invoke(b, true)
        }

        // 胶囊/流体云的紧凑态优先显示短文本；OPPO 上如果不显式给，常会只显示科目名。
        // Android 官方建议极短文本，所以这里用 mm:ss / h:mm:ss 的剩余时间。
        runCatching {
            b.javaClass
                .getMethod("setShortCriticalText", String::class.java)
                .invoke(b, formatRemaining(remainingMs))
        }

        // Android 16 ProgressStyle：给展开锁屏卡/实时活动一个进度条。
        // 进度按"已过去"计算，每分钟校准一次即可；秒级倒计时仍由系统 chronometer 负责。
        runCatching {
            val totalMs = total.coerceAtLeast(1L)
            val elapsed = (totalMs - remainingMs).coerceIn(0L, totalMs)
            val progress = ((elapsed * 100) / totalMs).toInt().coerceIn(0, 100)
            val styleClass = Class.forName("android.app.Notification\$ProgressStyle")
            val segmentClass = Class.forName("android.app.Notification\$ProgressStyle\$Segment")
            val style = styleClass.getConstructor().newInstance()
            val segment = segmentClass.getConstructor(Int::class.javaPrimitiveType).newInstance(100)
            segmentClass.getMethod("setColor", Int::class.javaPrimitiveType).invoke(segment, Color.rgb(255, 98, 95))
            styleClass.getMethod("addProgressSegment", segmentClass).invoke(style, segment)
            styleClass.getMethod("setStyledByProgress", Boolean::class.javaPrimitiveType).invoke(style, true)
            styleClass.getMethod("setProgress", Int::class.javaPrimitiveType).invoke(style, progress)
            b.javaClass.getMethod("setStyle", Notification.Style::class.java).invoke(b, style)
        }
    }

    private fun formatRemaining(ms: Long): String {
        val sec = (ms / 1000).coerceAtLeast(0L)
        val h = sec / 3600
        val m = (sec % 3600) / 60
        val s = sec % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
    }

    private fun formatEndClock(at: Long): String {
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = at }
        return "%02d:%02d".format(
            cal.get(java.util.Calendar.HOUR_OF_DAY),
            cal.get(java.util.Calendar.MINUTE)
        )
    }

    // 通知小图标用单色剪影 ic_stat_timer；绝不能用全彩 applicationInfo.icon——状态栏/锁屏/胶囊
    // 只取 alpha 通道，全彩图会被画成空白白块。直接引用 R.drawable（而非按名字 getIdentifier）：
    // 编译期解析，且不会被 release 的资源压缩器当成"无引用"删掉（那正是上版图标仍空白的真因）。
    private fun smallIconRes(): Int = com.kaoyan.studytimer.R.drawable.ic_stat_timer

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // IMPORTANCE_LOW：常驻、不发声不震动；且满足"晋升通知渠道不可为 MIN"的要求
            val ch = NotificationChannel(CHANNEL_ID, "专注进行中", NotificationManager.IMPORTANCE_LOW).apply {
                description = "计时进行中的实时胶囊（流体云）"
                setShowBadge(false)
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
    }
}
