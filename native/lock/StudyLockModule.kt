package com.kaoyan.studytimer.lock

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.*

class StudyLockModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "StudyLock"

    private val dpm get() = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val comp get() = ComponentName(reactApplicationContext, StudyDeviceAdminReceiver::class.java)

    @ReactMethod fun isAdmin(p: Promise) { p.resolve(dpm.isAdminActive(comp)) }

    @ReactMethod fun showDynamicIsland(title: String, body: String, promise: Promise) {
        try {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                DynamicIsland.show(reactApplicationContext, "📅", title, body)
            }
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("ERR", e.message) }
    }

    // Jump to manufacturer's autostart/permission management
    @ReactMethod fun openBatterySettings(p: Promise) {
        try {
            val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = android.net.Uri.parse("package:${reactApplicationContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            p.resolve(true)
        } catch (e: Exception) {
            // Fallback to general battery settings
            try { reactApplicationContext.startActivity(Intent(android.provider.Settings.ACTION_BATTERY_SAVER_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }); p.resolve(true) }
            catch (e2: Exception) { p.reject("ERR", e2.message) }
        }
    }

    @ReactMethod fun openWhiteListSettings(p: Promise) {
        try {
            val intent = when (android.os.Build.BRAND.lowercase()) {
                "xiaomi", "redmi" -> Intent().apply {
                    setComponent(android.content.ComponentName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.autostart.AutoStartManagementActivity"))
                }
                "huawei" -> Intent().apply {
                    setComponent(android.content.ComponentName(
                        "com.huawei.systemmanager",
                        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"))
                }
                "oppo" -> Intent().apply {
                    setComponent(android.content.ComponentName(
                        "com.coloros.oppoguardelf",
                        "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity"))
                }
                "vivo" -> Intent().apply {
                    setComponent(android.content.ComponentName(
                        "com.iqoo.secure",
                        "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"))
                }
                else -> Intent().apply { action = android.provider.Settings.ACTION_SETTINGS }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { reactApplicationContext.startActivity(intent) } catch (_: Exception) {
                reactApplicationContext.startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                })
            }
            p.resolve(true)
        } catch (e: Exception) { p.reject("ERR", e.message) }
    }

    @ReactMethod fun openAccessibilitySettings(p: Promise) {
        try {
            val ctx = reactApplicationContext
            // Try 1: standard accessibility settings
            var intent = Intent("android.settings.ACCESSIBILITY_SETTINGS").apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            // Try 2: direct accessibility class
            if (ctx.packageManager.resolveActivity(intent, 0) == null) {
                intent = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            // Try 3: MIUI specific
            if (ctx.packageManager.resolveActivity(intent, 0) == null) {
                intent = Intent().apply {
                    setClassName("com.android.settings", "com.android.settings.SubSettings")
                    putExtra(":settings:fragment_args_key", "accessibility_settings")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            // Fallback: app details page (always works)
            if (ctx.packageManager.resolveActivity(intent, 0) == null) {
                intent = Intent("android.settings.APPLICATION_DETAILS_SETTINGS").apply {
                    data = android.net.Uri.parse("package:${ctx.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            ctx.startActivity(intent)
            p.resolve(true)
        } catch (e: Exception) { p.reject("ERR", e.message) }
    }

    @ReactMethod fun requestAdmin(p: Promise) {
        try {
            reactApplicationContext.startActivity(Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, comp)
                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "需要设备管理器权限来锁定手机辅助专注学习")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            p.resolve(true)
        } catch (e: Exception) { p.reject("ERR", e.message) }
    }

    // Accessibility-based lock (primary method)
    @ReactMethod fun lock(p: Promise) {
        val saved = reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
            .getString("whitelist", "") ?: ""
        StudyAccessibilityService.whitelist.clear()
        if (saved.isNotEmpty()) StudyAccessibilityService.whitelist.addAll(saved.split(","))
        StudyAccessibilityService.lockActive = true
        LockForegroundService.start(reactApplicationContext)
        p.resolve("accessibility")
    }

    @ReactMethod fun unlock(p: Promise) {
        StudyAccessibilityService.lockActive = false
        LockForegroundService.stop(reactApplicationContext)
        try { reactApplicationContext.currentActivity?.stopLockTask() } catch (_: Exception) {}
        p.resolve(true)
    }

    @ReactMethod fun isAccessibilityEnabled(p: Promise) {
        p.resolve(StudyAccessibilityService.instance != null)
    }

    @ReactMethod fun getApps(p: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
            val apps = Arguments.createArray()
            pm.queryIntentActivities(intent, 0).forEach { info ->
                apps.pushMap(Arguments.createMap().apply {
                    putString("pkg", info.activityInfo.packageName)
                    putString("name", info.loadLabel(pm).toString())
                })
            }
            p.resolve(apps)
        } catch (e: Exception) { p.reject("ERR", e.message) }
    }

    @ReactMethod fun setWhitelist(pkgs: ReadableArray, p: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
        val list = mutableListOf<String>()
        for (i in 0 until pkgs.size()) list.add(pkgs.getString(i) ?: continue)
        prefs.edit().putString("whitelist", list.joinToString(",")).apply()
        StudyAccessibilityService.whitelist.clear()
        StudyAccessibilityService.whitelist.addAll(list)
        p.resolve(true)
    }
}
