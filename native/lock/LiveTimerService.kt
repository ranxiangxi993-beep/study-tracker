package com.kaoyan.studytimer.lock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper

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

    private val ticker = object : Runnable {
        override fun run() {
            val remaining = endAt - System.currentTimeMillis()
            if (remaining <= 0) { stopSelf(); return }
            // 每秒重发，刷新胶囊/锁屏上的剩余时间。ColorOS 的锁屏/AOD 不会自行走 chronometer，
            // 只有重发通知显示才会更新——不重发就卡住不跳、且与真实结束时刻对不上。
            try {
                (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NID, build(remaining))
            } catch (_: Throwable) {}
            handler.postDelayed(this, 1000)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        endAt = intent?.getLongExtra("endAt", 0L) ?: 0L
        total = intent?.getLongExtra("total", 0L) ?: 0L
        title = intent?.getStringExtra("title") ?: "专注中"
        createChannel()
        val remaining = (endAt - System.currentTimeMillis()).coerceAtLeast(0L)
        startForeground(NID, build(remaining))
        handler.removeCallbacks(ticker)
        handler.postDelayed(ticker, 1000)
        // 被系统杀掉不自动重启（结束提醒由 TimerAlarm 的 setAlarmClock 负责，互不依赖）
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NID) } catch (_: Throwable) {}
        super.onDestroy()
    }

    private fun build(remainingMs: Long): Notification {
        val totalMs = if (total > 0) total else 1L
        val elapsed = (totalMs - remainingMs).coerceIn(0L, totalMs)
        val pct = ((elapsed * 100) / totalMs).toInt().coerceIn(0, 100)
        val secs = remainingMs / 1000
        val timeText = String.format("%02d:%02d", secs / 60, secs % 60)

        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: Intent()
        val pi = PendingIntent.getActivity(this, 2003, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val b = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("剩余 $timeText")
            .setSmallIcon(smallIconRes())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setWhen(endAt)
            .setUsesChronometer(true)        // 系统自动渲染倒计时（API 17+ / countDown API 24+）
            .setChronometerCountDown(true)

        // 请求"晋升为常驻实时通知"——仅是一个 Bundle 布尔位，无新方法，必定可编译。
        // 系统据此把它显示为状态栏胶囊；ColorOS 流体云同样读这套谷歌规范。
        b.addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })

        // 以下为 API 36 专有的"胶囊短文案 + 进度条样式"，用反射调用以零编译风险；
        // 在安卓16生效，否则静默降级为带倒计时的标准常驻通知。
        if (Build.VERSION.SDK_INT >= 36) {
            runCatching {
                b.javaClass.getMethod("setShortCriticalText", CharSequence::class.java).invoke(b, timeText)
            }
            runCatching {
                val segCls = Class.forName("android.app.Notification\$ProgressStyle\$Segment")
                val seg = segCls.getConstructor(Int::class.javaPrimitiveType).newInstance(100)
                val psCls = Class.forName("android.app.Notification\$ProgressStyle")
                val ps = psCls.getConstructor().newInstance()
                psCls.getMethod("setProgressSegments", List::class.java).invoke(ps, listOf(seg))
                psCls.getMethod("setProgress", Int::class.javaPrimitiveType).invoke(ps, pct)
                b.setStyle(ps as Notification.Style)
            }
        }
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
