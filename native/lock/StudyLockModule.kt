package com.kaoyan.studytimer.lock

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.facebook.react.bridge.*

class StudyLockModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "StudyLock"

    private val dpm get() = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val comp get() = ComponentName(reactApplicationContext, StudyDeviceAdminReceiver::class.java)

    @ReactMethod fun isAdmin(p: Promise) { p.resolve(dpm.isAdminActive(comp)) }

    @ReactMethod fun isAccessibilityEnabled(p: Promise) {
        p.resolve(StudyAccessibilityService.isActive)
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

    @ReactMethod fun lock(p: Promise) {
        try {
            // Read saved whitelist from SharedPreferences
            val prefs = reactApplicationContext.getSharedPreferences("study_lock", Context.MODE_PRIVATE)
            val saved = prefs.getString("whitelist", "") ?: ""
            val pkgs = if (saved.isNotEmpty()) saved.split(",").toTypedArray() else arrayOf()
            val fullList = (listOf(reactApplicationContext.packageName) + pkgs).toTypedArray()

            if (dpm.isAdminActive(comp)) {
                dpm.setLockTaskPackages(comp, fullList)
                try {
                    reactApplicationContext.currentActivity?.startLockTask()
                    p.resolve("kiosk")
                } catch (se: SecurityException) {
                    p.reject("PIN_OFF", "请先开启系统画面固定：设置→安全→画面固定→开启")
                }
            } else {
                try {
                    reactApplicationContext.currentActivity?.startLockTask()
                    p.resolve("pin")
                } catch (se: SecurityException) {
                    p.reject("PIN_OFF", "请先开启系统画面固定：设置→安全→画面固定→开启")
                }
            }
        } catch (e: Exception) { p.reject("ERR", e.message) }
    }

    @ReactMethod fun unlock(p: Promise) {
        try { reactApplicationContext.currentActivity?.stopLockTask(); p.resolve(true) }
        catch (e: Exception) { p.reject("ERR", e.message) }
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
        try {
            if (!dpm.isAdminActive(comp)) { p.reject("NO_ADMIN", "先激活设备管理器"); return }
            val list = mutableListOf(reactApplicationContext.packageName)
            for (i in 0 until pkgs.size()) list.add(pkgs.getString(i))
            dpm.setLockTaskPackages(comp, list.toTypedArray())
            p.resolve(true)
        } catch (e: Exception) { p.reject("ERR", e.message) }
    }
}
