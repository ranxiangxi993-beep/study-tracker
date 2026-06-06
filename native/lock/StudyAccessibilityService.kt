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

    // Use explicit package name - HyperOS may change `packageName` property
    private val MY_PKG = "com.kaoyan.studytimer"
    private var lastBackTime = 0L
    private var serviceReady = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        lockActive = false
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
        }
        android.os.Handler(mainLooper).postDelayed({ serviceReady = true }, 2000)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!lockActive || !serviceReady) return
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val pkg = event.packageName?.toString() ?: return
            // Skip our own app, system apps, and whitelisted apps
            if (pkg == MY_PKG || pkg == "com.kaoyan.studytimer" || isSystem(pkg) || isWhitelisted(pkg)) return

            val now = System.currentTimeMillis()
            if (now - lastBackTime < 800) return
            lastBackTime = now

            // Launch 研途 directly - more reliable than HOME
            val intent = packageManager.getLaunchIntentForPackage("com.kaoyan.studytimer")
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(intent)
            } else {
                // Fallback to HOME
                performGlobalAction(GLOBAL_ACTION_HOME)
            }
            Toast.makeText(this, "已锁定", Toast.LENGTH_SHORT).show()
        }
    }

    private fun isSystem(pkg: String): Boolean {
        if (pkg.isEmpty() || pkg.startsWith("com.android.") || pkg == "android") return true
        if (pkg.startsWith("com.miui.") || pkg.startsWith("com.xiaomi.")) return true
        val knownLaunchers = setOf("com.oppo.launcher","com.huawei.android.launcher","com.sec.android.app.launcher")
        return knownLaunchers.contains(pkg)
    }

    private fun isWhitelisted(pkg: String): Boolean {
        val saved = getSharedPreferences("study_lock", Context.MODE_PRIVATE).getString("whitelist", "") ?: return false
        return saved.split(",").contains(pkg)
    }

    override fun onInterrupt() {}
    override fun onDestroy() { instance = null; super.onDestroy() }
}
