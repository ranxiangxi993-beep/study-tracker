package com.kaoyan.studytimer.lock

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.*

// 用 AlarmManager.setAlarmClock 调度"计时结束"提醒：
// 这是安卓里优先级最高的闹钟类型，被当作用户闹钟对待，完全绕过 Doze / 电池优化 /
// 国产 ROM 的后台冻结——息屏、后台、甚至进程被杀也会准时触发（expo 的 timeInterval
// 触发器在 Doze 下会被推迟，解锁后才补发，这正是"息屏收不到、回 App 过一会才弹"的根因）。
class TimerAlarmModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "TimerAlarm"

    private val REQ = 1001

    // 用于 cancel 的等价 PendingIntent（PendingIntent 匹配只看 component/action，不看 extra）
    private fun alarmPendingIntent(): PendingIntent {
        val i = Intent(reactApplicationContext, TimerAlarmReceiver::class.java)
        return PendingIntent.getBroadcast(
            reactApplicationContext, REQ, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @ReactMethod
    fun schedule(seconds: Double, title: String, body: String, p: Promise) {
        try {
            val ctx = reactApplicationContext
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val triggerAt = System.currentTimeMillis() + (seconds * 1000).toLong()

            val i = Intent(ctx, TimerAlarmReceiver::class.java).apply {
                putExtra("title", title)
                putExtra("body", body)
            }
            val alarmPI = PendingIntent.getBroadcast(
                ctx, REQ, i,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            // setAlarmClock 需要一个"展示用" PendingIntent（点状态栏闹钟图标时打开 App）
            val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()
            val showPI = PendingIntent.getActivity(
                ctx, 1003, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            am.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, showPI), alarmPI)
            p.resolve(true)
        } catch (e: Exception) { p.reject("ERR", e.message) }
    }

    @ReactMethod
    fun cancel(p: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(alarmPendingIntent())
            p.resolve(true)
        } catch (e: Exception) { p.resolve(false) }
    }
}
