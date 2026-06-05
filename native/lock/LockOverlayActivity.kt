package com.kaoyan.studytimer.lock

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView

class LockOverlayActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Full screen, show over lock screen, block everything
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

        val tv = TextView(this).apply {
            text = "🔒 专注中\n\n此应用已被锁定\n请返回研途继续学习"
            textSize = 20f
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            setBackgroundColor(0xFF0f0f1a.toInt())
            setTextColor(0xFFe8e8f0.toInt())
            setOnClickListener {
                // Return to our app
                val intent = packageManager.getLaunchIntentForPackage(packageName)
                startActivity(intent)
                finish()
            }
        }
        setContentView(tv)
    }

    // Block all physical keys
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_HOME, KeyEvent.KEYCODE_BACK,
            KeyEvent.KEYCODE_APP_SWITCH, KeyEvent.KEYCODE_VOLUME_UP,
            KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_MENU -> return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onBackPressed() {} // blocked
}
