package com.kaoyan.studytimer.lock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.IBinder

/**
 * Carries the active timer as one ongoing system notification.
 *
 * The countdown is owned by Android's chronometer. Reposting the notification on
 * every tick or screen unlock makes ColorOS present the capsule again, so this
 * service posts once per start and only updates when the app deliberately changes
 * between promoted and compact presentation. Screen unlock never triggers a post.
 */
class LiveTimerService : Service() {
    companion object {
        const val CHANNEL_ID = "study-live-timer"
        const val NID = 7100
        @Volatile var isRunning = false
        private var instance: LiveTimerService? = null

        fun start(ctx: Context, endAt: Long, title: String) {
            val i = Intent(ctx, LiveTimerService::class.java).apply {
                putExtra("endAt", endAt)
                putExtra("title", title)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, LiveTimerService::class.java))
        }

        fun setPromoted(promoted: Boolean): Boolean {
            val service = instance ?: return false
            service.updatePromotion(promoted)
            return true
        }
    }

    private var endAt = 0L
    private var title = "专注中"
    private var promoted = true

    override fun onCreate() {
        super.onCreate()
        instance = this
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        endAt = intent?.getLongExtra("endAt", 0L) ?: 0L
        title = intent?.getStringExtra("title") ?: "专注中"
        if (endAt <= System.currentTimeMillis()) {
            stopSelf()
            return START_NOT_STICKY
        }

        createChannel()
        promoted = true
        startForeground(NID, build(promoted))
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        instance = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        runCatching {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NID)
        }
        super.onDestroy()
    }

    private fun updatePromotion(next: Boolean) {
        if (promoted == next || endAt <= System.currentTimeMillis()) return
        promoted = next
        runCatching {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(NID, build(promoted))
        }
    }

    private fun build(requestPromotion: Boolean): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: Intent()
        val pi = PendingIntent.getActivity(
            this,
            2003,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        builder
            .setContentTitle(title)
            .setContentText("${formatEndClock(endAt)} 结束")
            .setSmallIcon(com.kaoyan.studytimer.R.drawable.ic_stat_timer)
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

        // Best-effort Android live-update promotion. ColorOS may choose its own
        // presentation; no static countdown text is supplied because it freezes.
        runCatching {
            builder.javaClass
                .getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType)
                .invoke(builder, requestPromotion)
        }
        builder.addExtras(Bundle().apply {
            putBoolean("android.requestPromotedOngoing", requestPromotion)
        })
        return builder.build()
    }

    private fun formatEndClock(at: Long): String {
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = at }
        return "%02d:%02d".format(
            cal.get(java.util.Calendar.HOUR_OF_DAY),
            cal.get(java.util.Calendar.MINUTE)
        )
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "专注进行中",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "专注计时的锁屏和状态栏进度"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }
}
