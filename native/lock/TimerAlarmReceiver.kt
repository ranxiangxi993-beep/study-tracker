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

        // 息屏时主动点亮屏幕一下（来电式强提醒的一环）。JS 此时被冻结，靠这里唤醒。
        runCatching {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val wl = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "study:timerEnd"
            )
            wl.acquire(5000)
        }

        // 直接驱动振动器震动，不依赖通知渠道——国产 ROM 在息屏/Doze 下常吞掉后台通知的渠道震动，
        // 显式 vibrate 才能保证息屏也震（之前震动只来自 JS finish()，回 App 才补震）。
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

        // 点击通知打开 App
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        val contentPI = PendingIntent.getActivity(
            context, 2002, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 单色矢量小图标，避免全彩 launcher 图在状态栏/锁屏被渲染成空白白块
        val iconRes = context.resources.getIdentifier("ic_stat_timer", "drawable", context.packageName)
            .let { if (it != 0) it else context.applicationInfo.icon }

        val builder = NotificationCompat.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(iconRes)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL) // 来电级：最易触发息屏亮屏 / ColorOS 边缘呼吸光
            .setVibrate(longArrayOf(0, 400, 250, 400, 250, 600))
            .setDefaults(Notification.DEFAULT_SOUND)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentPI)
            // 来电式全屏意图：息屏时像闹钟/来电一样点亮屏幕并强提醒（需 USE_FULL_SCREEN_INTENT 权限）
            .setFullScreenIntent(contentPI, true)

        nm.notify(7001, builder.build())
    }
}
