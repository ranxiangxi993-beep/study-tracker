package com.kaoyan.studytimer.lock

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

class StudyAccessibilityService : AccessibilityService() {

    companion object {
        var instance: StudyAccessibilityService? = null
        var lockActive = false
        val whitelist = mutableSetOf<String>()
    }

    private var lastToastTime = 0L
    private var serviceReady = false
    private val lockHandler = Handler(Looper.getMainLooper())
    private var pendingLock: Runnable? = null
    private var lastAllowedTime = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        lockActive = false
        val saved = getSharedPreferences("study_lock", Context.MODE_PRIVATE)
            .getString("whitelist", "") ?: ""
        whitelist.clear()
        if (saved.isNotEmpty()) whitelist.addAll(saved.split(","))
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                         AccessibilityEvent.TYPE_WINDOWS_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 50
            flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
        Handler(mainLooper).postDelayed({ serviceReady = true }, 2000)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!lockActive || !serviceReady) return
        val eventType = event?.eventType ?: return
        if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            eventType != AccessibilityEvent.TYPE_WINDOWS_CHANGED) return

        val eventPkg = event.packageName?.toString()?.takeIf { it.isNotEmpty() }
        val rootPkg = rootInActiveWindow?.packageName?.toString()?.takeIf { it.isNotEmpty() }
        val pkg = rootPkg ?: eventPkg ?: return

        if (isAllowed(pkg)) {
            lastAllowedTime = System.currentTimeMillis()
            pendingLock?.let { lockHandler.removeCallbacks(it) }
            pendingLock = null
            return
        }

        // 检查整个窗口栈——如果白名单 App 的窗口仍在栈中（比如被密码弹窗盖住），
        // 则不锁定。这是系统应用锁密码弹窗触发误锁的根本修复。
        if (hasAllowedWindowInStack()) {
            pendingLock?.let { lockHandler.removeCallbacks(it) }
            pendingLock = null
            return
        }

        // 刚离开白名单 App 的 300ms 内给窗口栈一点时间更新，其余立即踢出
        val sinceAllowed = System.currentTimeMillis() - lastAllowedTime
        val delay = if (sinceAllowed < 300L) 300L else 80L

        pendingLock?.let { lockHandler.removeCallbacks(it) }
        val runnable = Runnable {
            pendingLock = null
            val nowRoot = rootInActiveWindow?.packageName?.toString() ?: ""
            if (nowRoot.isNotEmpty() && isAllowed(nowRoot)) {
                lastAllowedTime = System.currentTimeMillis()
                return@Runnable
            }
            if (hasAllowedWindowInStack()) return@Runnable
            performGlobalAction(GLOBAL_ACTION_HOME)
            val now = System.currentTimeMillis()
            if (now - lastToastTime > 1000) {
                Toast.makeText(this, "已锁定", Toast.LENGTH_SHORT).show()
                lastToastTime = now
            }
        }
        pendingLock = runnable
        lockHandler.postDelayed(runnable, delay)
    }

    // 遍历所有可见窗口，只要有一个属于白名单 App 就返回 true
    private fun hasAllowedWindowInStack(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return false
        return try {
            windows.any { w ->
                val wPkg = try { w.root?.packageName?.toString() } catch (_: Exception) { null } ?: ""
                wPkg.isNotEmpty() && isAllowed(wPkg)
            }
        } catch (_: Exception) { false }
    }

    private fun isAllowed(pkg: String) =
        pkg == "com.kaoyan.studytimer" || isSystem(pkg) || isWhitelisted(pkg)

    private fun isSystem(pkg: String): Boolean {
        if (pkg.isEmpty() || pkg == "android") return true
        if (pkg.startsWith("com.android.")) return true
        if (pkg.startsWith("com.google.android.")) return true
        if (pkg.startsWith("com.miui.") || pkg.startsWith("com.xiaomi.")) return true
        if (pkg.startsWith("com.lbe.security.")) return true
        if (pkg.startsWith("com.oppo.") || pkg.startsWith("com.coloros.")) return true
        if (pkg.startsWith("com.realme.")) return true
        if (pkg.startsWith("com.huawei.") || pkg.startsWith("com.hihon.")) return true
        if (pkg.startsWith("com.honor.")) return true
        if (pkg.startsWith("com.samsung.") || pkg.startsWith("com.sec.")) return true
        if (pkg.startsWith("com.vivo.") || pkg.startsWith("com.bbk.")) return true
        if (pkg.startsWith("com.oneplus.")) return true
        if (pkg.startsWith("com.meizu.")) return true
        if (pkg.startsWith("com.zui.") || pkg.startsWith("com.lenovo.")) return true
        if (pkg.startsWith("com.asus.")) return true
        if (pkg.startsWith("com.lge.") || pkg.startsWith("com.sony.") || pkg.startsWith("com.nothing.")) return true

        val knownSystem = setOf(
            "com.oppo.launcher", "com.huawei.android.launcher",
            "com.sec.android.app.launcher", "com.miui.home", "com.coloros.launcher",
            "com.google.android.apps.nexuslauncher",
            "com.google.android.inputmethod.latin",
            "com.iflytek.inputmethod", "com.sohu.inputmethod.sogou",
            "com.baidu.input", "com.baidu.input_mi",
            "com.touchtype.swiftkey", "com.swiftkey.swiftkeyconfigurator",
            "com.google.android.webview", "com.android.webview",
            "com.android.permissioncontroller", "com.google.android.permissioncontroller",
            "com.google.android.packageinstaller", "com.android.packageinstaller",
            "com.android.systemui",
            "com.iqoo.secure",
            "com.qiku.security",
            "com.yulong.android.security",
            "com.coloros.safecenter",
            "com.miui.securitycenter",
        )
        return knownSystem.contains(pkg)
    }

    private fun isWhitelisted(pkg: String): Boolean {
        if (pkg == "com.kaoyan.studytimer") return true
        return whitelist.contains(pkg)
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        pendingLock?.let { lockHandler.removeCallbacks(it) }
        super.onDestroy()
    }
}
