package com.kaoyan.studytimer.lock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

// 番茄钟/休息计时结束时由 AlarmManager 唤醒触发，直接贴出系统通知。
// 关键：通知由原生在闹钟回调里发出，不依赖 JS 运行——即使 App 被冻结/杀掉、
// 屏幕熄灭处于 Doze，setAlarmClock 也会准时唤醒本接收器把横幅/锁屏通知贴出来。
class TimerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "⏰ 时间到"
        val body = intent.getStringExtra("body") ?: ""
        val channelId = "study-reminders-max" // 与 notify.js 的 CHANNEL_ID 保持一致

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // 渠道通常已由 JS 创建；进程曾被杀的极端情况下这里幂等兜底，避免通知被系统丢弃
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channelId) == null) {
            val channel = NotificationChannel(channelId, "学习提醒", NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 250, 250)
                setBypassDnd(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(channel)
        }

        // 点击通知打开 App
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        val contentPI = PendingIntent.getActivity(
            context, 2002, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(context.applicationInfo.icon)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVibrate(longArrayOf(0, 250, 250, 250))
            .setDefaults(Notification.DEFAULT_SOUND)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentPI)

        nm.notify(7001, builder.build())
    }
}
