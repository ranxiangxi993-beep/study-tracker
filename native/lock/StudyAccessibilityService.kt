package com.kaoyan.studytimer.lock

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

class StudyAccessibilityService : AccessibilityService() {

    companion object {
        var instance: StudyAccessibilityService? = null
        var lockActive = false
        var lockLevel = "strong"
        val whitelist = mutableSetOf<String>()

        fun releaseExpiredStudyLock(context: Context) {
            val prefs = context.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
            val deadline = prefs.getLong("study_end_at", 0L)
            if (deadline > 0L && System.currentTimeMillis() >= deadline) {
                lockActive = false
                prefs.edit().putBoolean("lock_active", false).remove("study_end_at").apply()
                LockForegroundService.stop(context)
            }
        }
    }

    private var lastToastTime = 0L
    private var serviceReady = false
    private val lockHandler = Handler(Looper.getMainLooper())
    private var pendingLock: Runnable? = null
    private var lastAllowedTime = 0L
    private val essentialPackages = mutableSetOf<String>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        releaseExpiredStudyLock(this)
        loadEssentialPackages()
        val prefs = getSharedPreferences("study_lock", Context.MODE_PRIVATE)
        // 国产 ROM 杀掉进程后系统会重启无障碍服务：从持久化标志恢复锁定状态，
        // 而不是清零，否则"锁一下就没了"。
        lockActive = prefs.getBoolean("lock_active", false)
        lockLevel = prefs.getString("lock_level", "strong") ?: "strong"
        val saved = prefs.getString("whitelist", "") ?: ""
        whitelist.clear()
        if (saved.isNotEmpty()) whitelist.addAll(saved.split(","))
        // 恢复后若仍处于锁定，重新拉起前台保活服务
        if (lockActive && lockLevel != "light") {
            try { LockForegroundService.start(this) } catch (_: Exception) {}
        }
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
        releaseExpiredStudyLock(this)
        val eventType = event?.eventType ?: return
        if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            eventType != AccessibilityEvent.TYPE_WINDOWS_CHANGED) return

        val eventPkg = event.packageName?.toString()?.takeIf { it.isNotEmpty() }
        val rootPkg = rootInActiveWindow?.packageName?.toString()?.takeIf { it.isNotEmpty() }
        val pkg = rootPkg ?: eventPkg ?: return

        val isOurApp = pkg == "com.kaoyan.studytimer"

        if (!lockActive || !serviceReady) return

        if (isAllowed(pkg)) {
            lastAllowedTime = System.currentTimeMillis()
            pendingLock?.let { lockHandler.removeCallbacks(it) }
            pendingLock = null
            return
        }

        if (lockLevel == "light") {
            pendingLock?.let { lockHandler.removeCallbacks(it) }
            pendingLock = null
            val now = System.currentTimeMillis()
            if (now - lastToastTime > 10_000) {
                Toast.makeText(this, "当前是学习时间，返回研途继续专注", Toast.LENGTH_SHORT).show()
                lastToastTime = now
            }
            return
        }

        // 仅当"用户白名单 App"的窗口仍在栈中（比如被自身密码弹窗盖住）才不锁定。
        // 系统应用/桌面不在此列，避免切换残留窗口造成漏锁。
        if (hasWhitelistedWindowInStack()) {
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
            releaseExpiredStudyLock(this)
            if (!lockActive) return@Runnable
            val nowRoot = rootInActiveWindow?.packageName?.toString() ?: ""
            if (nowRoot.isNotEmpty() && isAllowed(nowRoot)) {
                lastAllowedTime = System.currentTimeMillis()
                return@Runnable
            }
            if (hasWhitelistedWindowInStack()) return@Runnable
            kickToHome()
            val now = System.currentTimeMillis()
            if (now - lastToastTime > 1000) {
                Toast.makeText(this, "已锁定", Toast.LENGTH_SHORT).show()
                lastToastTime = now
            }
        }
        pendingLock = runnable
        lockHandler.postDelayed(runnable, delay)
    }

    // 遍历所有可见窗口，只要有一个属于"用户白名单 App"（或本应用）就返回 true。
    // 注意：这里只认白名单，不能把系统应用/桌面算进来——否则从桌面切到非白名单
    // App 时，过渡阶段残留的桌面窗口会被误判为"放行窗口"，导致漏锁（如微信打不开锁）。
    private fun hasWhitelistedWindowInStack(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return false
        return try {
            windows.any { w ->
                if (!w.isActive && !w.isFocused) return@any false
                val wPkg = try { w.root?.packageName?.toString() } catch (_: Exception) { null } ?: ""
                wPkg.isNotEmpty() && isWhitelisted(wPkg)
            }
        } catch (_: Exception) { false }
    }

    private fun isAllowed(pkg: String) =
        pkg == "com.kaoyan.studytimer" || isSystem(pkg) || isWhitelisted(pkg)

    private fun isSystem(pkg: String): Boolean {
        if (pkg.isEmpty() || pkg == "android") return true
        if (essentialPackages.contains(pkg)) return true

        // 各厂商"应用加密/指纹·人脸·密码验证/锁屏"界面统一放行：打开白名单 App 时
        // 弹出的这类验证界面不应被踢回桌面（如 ColorOS 应用加密的指纹验证界面）。
        // 这些关键字几乎不可能出现在需要被锁的普通应用包名里，故安全。
        val systemOwned = runCatching {
            packageManager.getApplicationInfo(pkg, 0).flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM != 0
        }.getOrDefault(false)
        if (systemOwned && (pkg.contains("safecenter") || pkg.contains("securitycenter") ||
            pkg.contains("keyguard") || pkg.contains("fingerprint") ||
            pkg.contains("biometric") || pkg.contains("applock") ||
            pkg.contains("facecheck") || pkg.contains("faceunlock"))) return true

        val knownSystem = setOf(
            "com.android.settings", "com.android.phone", "com.android.server.telecom",
            "com.android.dialer", "com.google.android.dialer", "com.android.emergency",
            "com.oplus.safecenter", "com.oplus.securitypermission", "com.coloros.securitypermission",
            "com.oplus.battery", "com.coloros.oppoguardelf", "com.coloros.sceneservice",
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

    private fun loadEssentialPackages() {
        essentialPackages.clear()
        runCatching {
            val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            packageManager.resolveActivity(home, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)
                ?.activityInfo?.packageName?.let { essentialPackages.add(it) }
            val input = getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            input.enabledInputMethodList.forEach { essentialPackages.add(it.packageName) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val telecom = getSystemService(Context.TELECOM_SERVICE) as android.telecom.TelecomManager
                telecom.defaultDialerPackage?.let { essentialPackages.add(it) }
            }
        }
    }

    private fun isWhitelisted(pkg: String): Boolean {
        if (pkg == "com.kaoyan.studytimer") return true
        return whitelist.contains(pkg)
    }

    // 回桌面：先直接拉起 Launcher（能清掉最近任务/悬浮残留窗口，
    // 比单纯 GLOBAL_ACTION_HOME 在 ColorOS 上更干净），再补一次 HOME 兜底。
    private fun kickToHome() {
        try {
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            startActivity(intent)
        } catch (_: Exception) {}
        try { performGlobalAction(GLOBAL_ACTION_HOME) } catch (_: Exception) {}
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        pendingLock?.let { lockHandler.removeCallbacks(it) }
        super.onDestroy()
    }
}
