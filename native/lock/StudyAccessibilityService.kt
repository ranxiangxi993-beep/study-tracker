package com.kaoyan.studytimer.lock

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

class StudyAccessibilityService : AccessibilityService() {

    companion object {
        var instance: StudyAccessibilityService? = null
        var lockActive = false
    }

    private var lastBackTime = 0L
    private var serviceReady = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        lockActive = false  // always reset on startup, prevents HyperOS auto-trigger
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
        }
        // Grace period: ignore events for 2 seconds after connection
        android.os.Handler(mainLooper).postDelayed({ serviceReady = true }, 2000)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!lockActive || !serviceReady) return
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val pkg = event.packageName?.toString() ?: return
            if (pkg == packageName || isSystem(pkg) || isWhitelisted(pkg)) return

            val now = System.currentTimeMillis()
            if (now - lastBackTime < 800) return
            lastBackTime = now

            val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(homeIntent)
            Toast.makeText(this, "已锁定", Toast.LENGTH_SHORT).show()
        }
    }

    private fun isSystem(pkg: String): Boolean {
        if (pkg.startsWith("com.android.") || pkg == "android") return true
        // Xiaomi specific system packages
        if (pkg.startsWith("com.miui.") || pkg.startsWith("com.xiaomi.")) return true
        return false
    }

    private fun isWhitelisted(pkg: String): Boolean {
        val saved = getSharedPreferences("study_lock", Context.MODE_PRIVATE).getString("whitelist", "") ?: return false
        return saved.split(",").contains(pkg)
    }

    override fun onInterrupt() {}
    override fun onDestroy() { instance = null; super.onDestroy() }
}
