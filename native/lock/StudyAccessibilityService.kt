package com.kaoyan.studytimer.lock

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
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
            // TYPE_WINDOW_STATE_CHANGED: Activity/Screen切换
            // TYPE_WINDOWS_CHANGED: 悬浮窗、画中画、系统弹层等
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                         AccessibilityEvent.TYPE_WINDOWS_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 50
        }
        Handler(mainLooper).postDelayed({ serviceReady = true }, 2000)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!lockActive || !serviceReady) return
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val eventPkg = event.packageName?.toString()?.takeIf { it.isNotEmpty() }
        val rootPkg = rootInActiveWindow?.packageName?.toString()?.takeIf { it.isNotEmpty() }
        val pkg = rootPkg ?: eventPkg ?: return

        if (isAllowed(pkg)) {
            lastAllowedTime = System.currentTimeMillis()
            pendingLock?.let { lockHandler.removeCallbacks(it) }
            pendingLock = null
            return
        }

        // 刚刚（500ms内）切换自白名单app，这个陌生包名很可能是系统应用锁的密码界面
        // 给 3000ms 等用户输完密码，白名单app回到前台后上面的 cancel 会取消锁定
        val delay = if (System.currentTimeMillis() - lastAllowedTime < 500L) 3000L else 80L

        pendingLock?.let { lockHandler.removeCallbacks(it) }
        val runnable = Runnable {
            pendingLock = null
            val nowRoot = rootInActiveWindow?.packageName?.toString() ?: ""
            if (nowRoot.isNotEmpty() && isAllowed(nowRoot)) {
                lastAllowedTime = System.currentTimeMillis()
                return@Runnable
            }
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

    private fun isAllowed(pkg: String) =
        pkg == "com.kaoyan.studytimer" || isSystem(pkg) || isWhitelisted(pkg)

    private fun isSystem(pkg: String): Boolean {
        if (pkg.isEmpty() || pkg == "android") return true
        // AOSP 系统
        if (pkg.startsWith("com.android.")) return true
        // Google 系统组件
        if (pkg.startsWith("com.google.android.")) return true
        // 小米 / Redmi / MIUI
        if (pkg.startsWith("com.miui.") || pkg.startsWith("com.xiaomi.")) return true
        if (pkg.startsWith("com.lbe.security.")) return true   // MIUI 应用锁解锁界面
        // OPPO / ColorOS / Realme
        if (pkg.startsWith("com.oppo.") || pkg.startsWith("com.coloros.")) return true
        if (pkg.startsWith("com.realme.")) return true
        // 华为 / Honor
        if (pkg.startsWith("com.huawei.") || pkg.startsWith("com.hihon.")) return true
        if (pkg.startsWith("com.honor.")) return true
        // 三星
        if (pkg.startsWith("com.samsung.") || pkg.startsWith("com.sec.")) return true
        // vivo / iQOO
        if (pkg.startsWith("com.vivo.") || pkg.startsWith("com.bbk.")) return true
        // OnePlus
        if (pkg.startsWith("com.oneplus.")) return true
        // 魅族
        if (pkg.startsWith("com.meizu.")) return true
        // 联想 / ZUK
        if (pkg.startsWith("com.zui.") || pkg.startsWith("com.lenovo.")) return true
        // 华硕
        if (pkg.startsWith("com.asus.")) return true
        // LG / 索尼 / Nothing
        if (pkg.startsWith("com.lge.") || pkg.startsWith("com.sony.") || pkg.startsWith("com.nothing.")) return true

        val knownSystem = setOf(
            // 常见桌面启动器
            "com.oppo.launcher", "com.huawei.android.launcher",
            "com.sec.android.app.launcher", "com.miui.home", "com.coloros.launcher",
            "com.google.android.apps.nexuslauncher",
            // 输入法
            "com.google.android.inputmethod.latin",
            "com.iflytek.inputmethod", "com.sohu.inputmethod.sogou",
            "com.baidu.input", "com.baidu.input_mi",
            "com.touchtype.swiftkey", "com.swiftkey.swiftkeyconfigurator",
            // WebView
            "com.google.android.webview", "com.android.webview",
            // 权限 / 安装 / 系统 UI
            "com.android.permissioncontroller", "com.google.android.permissioncontroller",
            "com.google.android.packageinstaller", "com.android.packageinstaller",
            "com.android.systemui",
            // 各厂商应用锁 / 安全中心
            "com.iqoo.secure",                  // vivo 应用锁
            "com.qiku.security",                // 360 / 奇酷
            "com.yulong.android.security",      // 酷派
            "com.coloros.safecenter",           // OPPO 安全中心
            "com.miui.securitycenter",          // 小米安全中心
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
