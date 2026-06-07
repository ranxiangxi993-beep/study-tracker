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
            // Use root window package as primary source — it stays as the real
            // foreground app even when IME/keyboard or transient dialogs pop up.
            // Fall back to event.packageName if root window is unavailable.
            val eventPkg = event.packageName?.toString()?.takeIf { it.isNotEmpty() }
            val rootPkg = rootInActiveWindow?.packageName?.toString()?.takeIf { it.isNotEmpty() }
            val pkg = rootPkg ?: eventPkg ?: return

            // Always allow our own app, system apps, and whitelisted apps
            if (pkg == "com.kaoyan.studytimer" || isSystem(pkg) || isWhitelisted(pkg)) return

            val now = System.currentTimeMillis()
            performGlobalAction(GLOBAL_ACTION_HOME)
            if (now - lastBackTime > 200) {
                Toast.makeText(this, "已锁定", Toast.LENGTH_SHORT).show()
            }
            lastBackTime = now
        }
    }

    private fun isSystem(pkg: String): Boolean {
        if (pkg.isEmpty() || pkg == "android") return true
        // AOSP / system
        if (pkg.startsWith("com.android.")) return true
        // Google system apps (Gboard, WebView, Play Services, etc.)
        if (pkg.startsWith("com.google.android.")) return true
        // Major OEM system UIs
        if (pkg.startsWith("com.miui.") || pkg.startsWith("com.xiaomi.")) return true
        if (pkg.startsWith("com.oppo.") || pkg.startsWith("com.coloros.")) return true
        if (pkg.startsWith("com.huawei.") || pkg.startsWith("com.hihon.")) return true
        if (pkg.startsWith("com.samsung.") || pkg.startsWith("com.sec.")) return true
        if (pkg.startsWith("com.vivo.") || pkg.startsWith("com.bbk.")) return true
        if (pkg.startsWith("com.oneplus.")) return true
        if (pkg.startsWith("com.realme.")) return true
        if (pkg.startsWith("com.meizu.")) return true
        if (pkg.startsWith("com.zui.") || pkg.startsWith("com.lenovo.")) return true
        if (pkg.startsWith("com.asus.")) return true
        if (pkg.startsWith("com.lge.")) return true
        if (pkg.startsWith("com.sony.")) return true
        if (pkg.startsWith("com.nothing.")) return true
        // Known system components
        val knownSystem = setOf(
            "android",
            // Launchers
            "com.oppo.launcher", "com.huawei.android.launcher", "com.sec.android.app.launcher",
            "com.miui.home", "com.coloros.launcher",
            // Common input methods (IME)
            "com.google.android.inputmethod.latin",
            "com.iflytek.inputmethod", "com.sohu.inputmethod.sogou",
            "com.baidu.input", "com.baidu.input_mi",
            "com.touchtype.swiftkey", "com.swiftkey.swiftkeyconfigurator",
            // WebView
            "com.google.android.webview", "com.android.webview",
            // Permission / settings dialogs
            "com.android.permissioncontroller", "com.google.android.permissioncontroller",
            "com.google.android.packageinstaller", "com.android.packageinstaller",
            // System UI
            "com.android.systemui", "com.google.android.apps.nexuslauncher",
        )
        return knownSystem.contains(pkg)
    }

    private fun isWhitelisted(pkg: String): Boolean {
        // 研途 itself is always allowed
        if (pkg == "com.kaoyan.studytimer") return true
        val saved = getSharedPreferences("study_lock", Context.MODE_PRIVATE).getString("whitelist", "") ?: return false
        return saved.split(",").contains(pkg)
    }

    override fun onInterrupt() {}
    override fun onDestroy() { instance = null; super.onDestroy() }
}
