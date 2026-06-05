package com.kaoyan.studytimer.lock

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.view.accessibility.AccessibilityEvent

class StudyAccessibilityService : AccessibilityService() {

    companion object {
        var instance: StudyAccessibilityService? = null
        var lockActive = false
    }

    private var lastLockTime = 0L

    // System packages that should never be locked
    private val SYSTEM_PKGS = setOf(
        "com.android.systemui",
        "com.android.settings",
        "com.android.launcher",
        "com.google.android.apps.nexuslauncher",
        "com.miui.home",
        "com.oppo.launcher",
        "com.huawei.android.launcher",
        "com.sec.android.app.launcher"
    )

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 200 // slight delay to debounce
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!lockActive) return
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val pkg = event.packageName?.toString() ?: return
            if (pkg == packageName) return  // never lock our own app
            if (isSystem(pkg)) return       // never lock system/launcher
            if (isWhitelisted(pkg)) return  // user-approved apps

            // Cooldown: at most one lock per 3 seconds
            val now = System.currentTimeMillis()
            if (now - lastLockTime < 3000) return
            lastLockTime = now

            performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
        }
    }

    private fun isSystem(pkg: String): Boolean {
        if (SYSTEM_PKGS.contains(pkg)) return true
        return pkg.startsWith("com.android.") || pkg == "android"
    }

    private fun isWhitelisted(pkg: String): Boolean {
        val prefs = getSharedPreferences("study_lock", Context.MODE_PRIVATE)
        val saved = prefs.getString("whitelist", "") ?: return false
        return saved.split(",").contains(pkg)
    }

    override fun onInterrupt() {}
    override fun onDestroy() { instance = null; super.onDestroy() }
}
