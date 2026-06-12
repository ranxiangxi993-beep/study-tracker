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
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

// 安卓16 Live Update（Promoted Ongoing 通知）：计时进行中常驻显示倒计时/进度。
// ColorOS16 流体云遵循谷歌实时活动规范，会自动把这种"已晋升的常驻通知"渲染成胶囊，
// 无需对接 OPPO 私有接口（美团/谷歌地图/ChatGPT 走的也是这套标准 API）。
//
// 实现选择（关键）：
//  · 用前台服务承载——既能每秒刷新胶囊，又顺带把进程钉住不被国产 ROM 冻结，提升可靠性。
//  · 只用"稳定老 API + 一个 Bundle extra(android.requestPromotedOngoing)"来构建通知，
//    保证一定能编译通过；API 36 才有的 setShortCriticalText / ProgressStyle 用反射调用，
//    在安卓16上生效、在更低版本或方法不存在时自动降级，绝不导致编译失败。
class LiveTimerService : Service() {
    companion object {
        const val CHANNEL_ID = "study-live-timer"
        const val NID = 7100
        // 胶囊是否正在运行 + 当前实例引用：供 StudyAccessibilityService 在"用户离开本 App"那一刻
        // 直接捅一下重发通知，让 ColorOS 立刻把常驻通知晋升成流体云胶囊（比 JS 的 AppState 更快更稳）。
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
    // 屏幕是否点亮。息屏(AOD)时 CPU 休眠、ticker 走不动，会留下一张冻结的卡；
    // 因此息屏把通知设为 SECRET（AOD/息屏不显示），亮屏(锁屏)再设回 PUBLIC 正常显示并恢复每秒走。
    private var screenOn = true

    // 【v35】不再每秒重发（那是"闪/整框跳"的根源）。改用 chronometer 让系统自走秒，
    // ticker 只负责到点把服务停掉，期间不碰通知，胶囊由系统平滑刷新。
    private val ticker = object : Runnable {
        override fun run() {
            if (endAt - System.currentTimeMillis() <= 0) { stopSelf(); return }
            handler.postDelayed(this, 1000)
        }
    }

    // 监听屏幕开关：息屏隐藏(SECRET)+停 ticker，亮屏显示(PUBLIC)+恢复每秒走
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            when (i?.action) {
                Intent.ACTION_SCREEN_OFF -> {
                    screenOn = false
                    handler.removeCallbacks(ticker)   // 息屏 ticker 本就走不动，停掉避免最后两拍闪烁
                    repost()                          // 以 SECRET 重发一次：AOD/息屏不再显示这张会冻结的卡
                }
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
                    if (screenOn) return
                    screenOn = true
                    repost()                          // 以 PUBLIC 重发：锁屏立刻显示当前剩余
                    handler.removeCallbacks(ticker)
                    handler.postDelayed(ticker, 200)  // 屏亮 CPU 醒，恢复每秒跳
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
        handler.postDelayed(ticker, 1000)   // 仅周期检查到点 stopSelf（不再每秒重发）
        // 一次性补发(非循环)：部分 ROM(ColorOS/HyperOS) 要等通知第一次"被更新"才晋升成胶囊。
        // 只发这一发促晋升，之后全交给系统 chronometer 自走，绝不每秒重发→不闪。
        handler.postDelayed({ repost() }, 400)
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
        val secs = remainingMs / 1000
        val timeText = String.format("%02d:%02d", secs / 60, secs % 60)

        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: Intent()
        val pi = PendingIntent.getActivity(this, 2003, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        // 【v35 核心】用系统 chronometer 自走秒，不再每秒重发——这是"不闪/不跳"的关键。
        // setWhen(endAt 绝对时刻) + setUsesChronometer + setChronometerCountDown：系统每秒平滑刷新
        // 倒计时 MM:SS，App 一秒都不用重发通知（重发=整框重绘=闪）。基准是绝对 endAt、不被重置，故不跳。
        // contentTitle 不再放静态时间（不重发会冻住）；标签退到 contentText 仅展开看，药丸由系统走时显示。
        val b = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("剩余 $timeText")
            .setSmallIcon(smallIconRes())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setWhen(endAt)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            // 息屏(AOD)隐藏、亮屏(锁屏)正常显示：该 ROM 的 AOD 不自走 chronometer，息屏会留一张冻结卡
            .setVisibility(if (screenOn) Notification.VISIBILITY_PUBLIC else Notification.VISIBILITY_SECRET)

        // 请求"晋升为常驻实时通知"——仅是一个 Bundle 布尔位，无新方法，必定可编译。
        // 系统据此把它显示为状态栏胶囊；ColorOS 流体云同样读这套谷歌规范。
        b.addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })
        return b.build()
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
