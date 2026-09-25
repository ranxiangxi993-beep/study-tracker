package com.kaoyan.studytimer.lock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

// 专注/休息计时结束时由 AlarmManager 唤醒触发，直接贴出系统通知。
// 关键：通知由原生在闹钟回调里发出，不依赖 JS 运行——即使 App 被冻结/杀掉、
// 屏幕熄灭处于 Doze，setAlarmClock 也会准时唤醒本接收器把横幅/锁屏通知贴出来。
class TimerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "⏰ 时间到"
        val body = intent.getStringExtra("body") ?: ""
        val strongAlert = intent.getBooleanExtra("strongAlert", false)
        val channelId = "study-timer-complete-v3"

        // 到点后立刻收起进行中通知，避免胶囊继续停留。
        LiveTimerService.stop(context)
        StudyAccessibilityService.releaseExpiredStudyLock(context)

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // 渠道通常已由 JS 创建；进程曾被杀的极端情况下这里幂等兜底，避免通知被系统丢弃
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channelId) == null) {
            nm.deleteNotificationChannel("study-timer-complete-v2")
            val channel = NotificationChannel(channelId, "计时结束提醒", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "学习段或休息段结束时亮屏、响铃并振动"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 250, 250)
                setBypassDnd(false)
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                enableLights(true)
                lightColor = Color.rgb(255, 98, 95)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(channel)
        }

        // A normal completion must still reach the user. Strong mode only adds
        // a full-screen alarm; it no longer gates the basic wake-up behavior.
        runCatching {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val wakeFlags = if (strongAlert) {
                PowerManager.FULL_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE
            } else {
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE
            }
            val wl = pm.newWakeLock(wakeFlags, "study:timerEnd")
            wl.acquire(if (strongAlert) 12_000L else 6_000L)
        }

        if (strongAlert) {
            runCatching {
                val pattern = longArrayOf(0, 400, 250, 400, 250, 600)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                    vm.defaultVibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
                } else {
                    @Suppress("DEPRECATION")
                    val v = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createWaveform(pattern, -1))
                    } else {
                        @Suppress("DEPRECATION") v.vibrate(pattern, -1)
                    }
                }
            }
        }

        // 点击通知打开 App
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        val contentPI = PendingIntent.getActivity(
            context, 2002, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 单色小图标，避免全彩 launcher 图在状态栏/锁屏被渲染成空白白块。
        // 直接引用 R.drawable：编译期解析，且不被 release 资源压缩器删除。
        val iconRes = com.kaoyan.studytimer.R.drawable.ic_stat_timer

        val builder = NotificationCompat.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(iconRes)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVibrate(longArrayOf(0, 250, 250, 250))
            .setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_LIGHTS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentPI)

        if (strongAlert) builder.setFullScreenIntent(contentPI, true)

        nm.notify(7001, builder.build())
    }
}
