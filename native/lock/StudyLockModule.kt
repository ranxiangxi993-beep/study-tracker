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

    @ReactMethod fun openAccessibilitySettings(p: Promise) {
        try {
            reactApplicationContext.startActivity(Intent("android.settings.ACCESSIBILITY_SETTINGS").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
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
        StudyAccessibilityService.lockActive = true
        p.resolve("accessibility")
    }

    @ReactMethod fun unlock(p: Promise) {
        StudyAccessibilityService.lockActive = false
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
        p.resolve(true)
    }
}
