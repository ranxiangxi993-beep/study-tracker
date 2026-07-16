package com.kaoyan.studytimer.lock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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
        val channelId = "study-timer-complete-v2"

        // 到点后立刻收起进行中通知，避免胶囊继续停留。
        LiveTimerService.stop(context)

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // 渠道通常已由 JS 创建；进程曾被杀的极端情况下这里幂等兜底，避免通知被系统丢弃
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channelId) == null) {
            val channel = NotificationChannel(channelId, "计时结束提醒", NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 250, 250)
                setBypassDnd(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(channel)
        }

        if (strongAlert) {
            runCatching {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                @Suppress("DEPRECATION")
                val wl = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                    "study:timerEnd"
                )
                wl.acquire(5000)
            }
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
            .setDefaults(Notification.DEFAULT_SOUND)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentPI)

        if (strongAlert) builder.setFullScreenIntent(contentPI, true)

        nm.notify(7001, builder.build())
    }
}
