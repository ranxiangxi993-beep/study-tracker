package com.kaoyan.studytimer.lock

import android.app.admin.DevicePolicyManager
import android.os.Build
import android.os.PowerManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.*

class StudyLockModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "StudyLock"

    private val dpm get() = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val comp get() = ComponentName(reactApplicationContext, StudyDeviceAdminReceiver::class.java)

    @ReactMethod fun isAdmin(p: Promise) { p.resolve(dpm.isAdminActive(comp)) }

    @ReactMethod fun isLockActive(p: Promise) {
        StudyAccessibilityService.releaseExpiredStudyLock(reactApplicationContext)
        val prefs = reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
        val active = prefs.getBoolean("lock_active", false)
        val level = prefs.getString("lock_level", "strong") ?: "strong"
        StudyAccessibilityService.lockActive = active
        StudyAccessibilityService.lockLevel = level
        // 持久化标志只代表用户意图；服务不在时锁机并没有真正生效。
        p.resolve(active && StudyAccessibilityService.instance != null)
    }

    @ReactMethod fun setStudyDeadline(endAt: Double, p: Promise) {
        reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
            .edit().putLong("study_end_at", endAt.toLong()).apply()
        p.resolve(true)
    }

    @ReactMethod fun isIgnoringBatteryOptimizations(p: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                p.resolve(true)
                return
            }
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            p.resolve(pm.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } catch (_: Exception) {
            p.resolve(false)
        }
    }

    @ReactMethod fun setLockLevel(level: String, p: Promise) {
        val safeLevel = if (level in setOf("light", "medium", "strong")) level else "strong"
        reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
            .edit().putString("lock_level", safeLevel).apply()
        StudyAccessibilityService.lockLevel = safeLevel
        p.resolve(true)
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
            val brand = "${Build.BRAND} ${Build.MANUFACTURER}".lowercase()
            val components = when {
                brand.contains("oppo") || brand.contains("oneplus") || brand.contains("realme") -> listOf(
                    ComponentName("com.oplus.battery", "com.oplus.powermanager.fuelgaue.PowerUsageModelActivity"),
                    ComponentName("com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity"),
                    ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
                    ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")
                )
                brand.contains("xiaomi") || brand.contains("redmi") -> listOf(
                    ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
                )
                brand.contains("huawei") || brand.contains("honor") -> listOf(
                    ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
                )
                brand.contains("vivo") || brand.contains("iqoo") -> listOf(
                    ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
                )
                else -> emptyList()
            }

            var opened = false
            for (component in components) {
                try {
                    reactApplicationContext.startActivity(Intent().apply {
                        this.component = component
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    })
                    opened = true
                    break
                } catch (_: Exception) {}
            }
            if (!opened) {
                reactApplicationContext.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.parse("package:${reactApplicationContext.packageName}")
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
        if (StudyAccessibilityService.instance == null) {
            p.resolve("accessibility-required")
            return
        }
        val prefs = reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
        val saved = prefs.getString("whitelist", "") ?: ""
        StudyAccessibilityService.whitelist.clear()
        if (saved.isNotEmpty()) StudyAccessibilityService.whitelist.addAll(saved.split(","))
        StudyAccessibilityService.lockLevel = prefs.getString("lock_level", "strong") ?: "strong"
        StudyAccessibilityService.lockActive = true
        // 持久化锁定状态：进程被杀重启后无障碍服务可据此自动恢复
        prefs.edit().putBoolean("lock_active", true).remove("study_end_at").apply()
        if (StudyAccessibilityService.lockLevel == "light") {
            LockForegroundService.stop(reactApplicationContext)
        } else {
            LockForegroundService.start(reactApplicationContext)
        }
        p.resolve("accessibility")
    }

    @ReactMethod fun unlock(p: Promise) {
        StudyAccessibilityService.lockActive = false
        reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
            .edit().putBoolean("lock_active", false).remove("study_end_at").apply()
        LockForegroundService.stop(reactApplicationContext)
        try { reactApplicationContext.currentActivity?.stopLockTask() } catch (_: Exception) {}
        p.resolve(true)
    }

    @ReactMethod fun isAccessibilityEnabled(p: Promise) {
        p.resolve(StudyAccessibilityService.instance != null)
    }

    // 系统设置里"研途专注"开关是否打开（与服务是否真正在运行无关）。
    // 更新 App 后安卓会杀掉服务但开关仍显示开启，用它来识别这种"假开启"。
    @ReactMethod fun isAccessibilitySettingOn(p: Promise) {
        try {
            val ctx = reactApplicationContext
            val enabled = android.provider.Settings.Secure.getString(
                ctx.contentResolver,
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""
            val svc = "${ctx.packageName}/${StudyAccessibilityService::class.java.name}"
            val svcShort = "${ctx.packageName}/.lock.StudyAccessibilityService"
            val on = enabled.split(":").any {
                it.equals(svc, ignoreCase = true) || it.equals(svcShort, ignoreCase = true)
            }
            p.resolve(on)
        } catch (e: Exception) { p.resolve(false) }
    }

    @ReactMethod fun getApps(p: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
            val apps = Arguments.createArray()
            pm.queryIntentActivities(intent, 0)
                .distinctBy { it.activityInfo.packageName }
                .filter { it.activityInfo.packageName != reactApplicationContext.packageName }
                .sortedBy { it.loadLabel(pm).toString().lowercase() }
                .forEach { info ->
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
