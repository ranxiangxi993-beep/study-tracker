package com.kaoyan.studytimer.lock

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

object DynamicIsland {
    private var windowManager: WindowManager? = null
    private var view: View? = null
    private var dismissHandler = Handler(Looper.getMainLooper())
    private var dismissRunnable: Runnable? = null

    fun show(ctx: Context, icon: String, title: String, sub: String) {
        dismiss()
        windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val pad = dp(ctx, 12)
        val bg = Color.parseColor("#E8222244")

        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(pad * 2, pad, pad * 2, pad)
            setBackgroundColor(bg)
            val radius = dp(ctx, 40).toFloat()
            outlineProvider = object : android.view.ViewOutlineProvider() {
                override fun getOutline(v: View, o: android.graphics.Outline) {
                    o.setRoundRect(0, 0, v.width, v.height, radius)
                }
            }
            clipToOutline = true
            elevation = 8f
        }

        container.addView(iconView(ctx, icon))
        val textCol = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, 0, 0, 0)
        }
        textCol.addView(text(ctx, title, 14f, true))
        textCol.addView(text(ctx, sub, 11f, false))
        container.addView(textCol)

        view = container

        val params = WindowManager.LayoutParams().apply {
            type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE
            format = PixelFormat.TRANSLUCENT
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            width = WindowManager.LayoutParams.WRAP_CONTENT
            height = WindowManager.LayoutParams.WRAP_CONTENT
            y = dp(ctx, 60)
        }

        // Slide in animation
        container.translationY = -200f
        windowManager?.addView(view, params)
        container.animate().translationY(0f).setDuration(300).start()

        // Auto-dismiss after 4 seconds
        dismissRunnable = Runnable { dismiss() }
        dismissHandler.postDelayed(dismissRunnable!!, 4000)
    }

    fun dismiss() {
        dismissRunnable?.let { dismissHandler.removeCallbacks(it) }
        view?.let {
            it.animate().translationY(-200f).setDuration(300).withEndAction {
                try { windowManager?.removeView(view) } catch (_: Exception) {}
            }.start()
        }
        view = null
    }

    private fun iconView(ctx: Context, icon: String) = TextView(ctx).apply {
        text = icon; textSize = 22f
    }
    private fun text(ctx: Context, t: String, size: Float, bold: Boolean) = TextView(ctx).apply {
        text = t; textSize = size; setTextColor(Color.WHITE)
        if (bold) setTypeface(null, android.graphics.Typeface.BOLD)
    }
    private fun dp(ctx: Context, dp: Int) = (dp * ctx.resources.displayMetrics.density).toInt()
}
