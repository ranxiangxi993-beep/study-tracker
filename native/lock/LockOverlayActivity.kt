package com.kaoyan.studytimer.lock

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

class LockOverlayActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        // Gradient background
        val bg = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(Color.parseColor("#1a1a2e"), Color.parseColor("#0f3460"), Color.parseColor("#16213e"))
        )
        bg.cornerRadius = 0f

        val root = FrameLayout(this).apply {
            setBackgroundDrawable(bg)
            setOnClickListener {
                val intent = packageManager.getLaunchIntentForPackage(packageName)
                if (intent != null) { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP); startActivity(intent) }
                finish()
            }
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(60, 0, 60, 0)
        }

        // Large lock icon
        val icon = TextView(this).apply {
            text = "🔒"
            textSize = 64f
            gravity = Gravity.CENTER
        }

        // Title
        val title = TextView(this).apply {
            text = "专注学习中"
            textSize = 28f
            setTextColor(Color.parseColor("#ffffff"))
            gravity = Gravity.CENTER
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(0, 24, 0, 0)
        }

        // App name that was blocked
        val pkg = intent.getStringExtra("blocked_pkg") ?: ""
        val pm = packageManager
        val appName = try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }

        val subtitle = TextView(this).apply {
            text = "\"$appName\" 已锁定"
            textSize = 16f
            setTextColor(Color.parseColor("#9999bb"))
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 40)
        }

        val hint = TextView(this).apply {
            text = "点击任意位置返回研途"
            textSize = 13f
            setTextColor(Color.parseColor("#666688"))
            gravity = Gravity.CENTER
        }

        content.addView(icon)
        content.addView(title)
        content.addView(subtitle)
        content.addView(hint)
        root.addView(content)
        setContentView(root)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        return when (event.keyCode) {
            KeyEvent.KEYCODE_HOME, KeyEvent.KEYCODE_BACK,
            KeyEvent.KEYCODE_APP_SWITCH, KeyEvent.KEYCODE_VOLUME_UP,
            KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_MENU -> true
            else -> super.dispatchKeyEvent(event)
        }
    }

    override fun onBackPressed() {}
}
