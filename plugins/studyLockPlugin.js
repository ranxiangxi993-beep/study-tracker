const { withAndroidManifest, withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Source files to inject into the Android project
const SOURCE_FILES = {
  'StudyDeviceAdminReceiver.kt': `package com.kaoyan.studytimer.lock

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class StudyDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
    }
    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
    }
}
`,
  'StudyLockModule.kt': `package com.kaoyan.studytimer.lock

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import com.facebook.react.bridge.*

class StudyLockModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "StudyLock"

    private val dpm: DevicePolicyManager
        get() = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private val adminComponent: ComponentName
        get() = ComponentName(reactContext, StudyDeviceAdminReceiver::class.java)

    @ReactMethod
    fun isDeviceAdminActive(promise: Promise) {
        promise.resolve(dpm.isAdminActive(adminComponent))
    }

    @ReactMethod
    fun requestDeviceAdmin(promise: Promise) {
        try {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "\\u8003\\u7814\\u8ba1\\u65f6\\u5668\\u9700\\u8981\\u8bbe\\u5907\\u7ba1\\u7406\\u5668\\u6743\\u9650\\u6765\\u9501\\u5b9a\\u624b\\u673a\\uff0c\\u5e2e\\u52a9\\u4f60\\u4e13\\u6ce8\\u5b66\\u4e60")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun lockScreen(promise: Promise) {
        try {
            val activity = currentActivity
            if (dpm.isAdminActive(adminComponent)) {
                dpm.setLockTaskPackages(adminComponent, arrayOf(reactApplicationContext.packageName))
                if (activity != null) activity.startLockTask()
                promise.resolve("locked_kiosk")
            } else if (activity != null) {
                try {
                    activity.startLockTask()
                    promise.resolve("locked_pin")
                } catch (e: Exception) {
                    promise.reject("NO_PIN", "Screen pinning not enabled")
                }
            } else {
                promise.reject("ERROR", "No activity")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun unlockScreen(promise: Promise) {
        try {
            val activity = currentActivity
            if (activity != null) { try { activity.stopLockTask() } catch (_: Exception) {} }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
            val activities: List<ResolveInfo> = pm.queryIntentActivities(intent, 0)
            val apps = Arguments.createArray()
            for (info in activities) {
                val app = Arguments.createMap().apply {
                    putString("packageName", info.activityInfo.packageName)
                    putString("appName", info.loadLabel(pm).toString())
                }
                apps.pushMap(app)
            }
            promise.resolve(apps)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setLockTaskWhitelist(packages: ReadableArray, promise: Promise) {
        try {
            if (!dpm.isAdminActive(adminComponent)) {
                promise.reject("NO_ADMIN", "Device Admin not active")
                return
            }
            val list = mutableListOf(reactApplicationContext.packageName)
            for (i in 0 until packages.size()) {
                list.add(packages.getString(i) ?: continue)
            }
            dpm.setLockTaskPackages(adminComponent, list.toTypedArray())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
`,
  'StudyLockPackage.kt': `package com.kaoyan.studytimer.lock

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class StudyLockPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(StudyLockModule(reactContext))
    }
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`,
};

const DEVICE_ADMIN_XML = `<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <lock-task />
        <force-lock />
    </uses-policies>
</device-admin>
`;

function withStudyLockAndroid(config) {
  // 1. Modify AndroidManifest
  config = withAndroidManifest(config, async (cfg) => {
    const manifest = cfg.modResults;

    // Add QUERY_ALL_PACKAGES for app listing
    manifest.manifest.$ = manifest.manifest.$ || {};
    if (!manifest.manifest['uses-permission']) manifest.manifest['uses-permission'] = [];
    const perms = manifest.manifest['uses-permission'];
    const permNames = perms.map(p => p.$?.['android:name'] || '');
    if (!permNames.includes('android.permission.QUERY_ALL_PACKAGES')) {
      perms.push({ $: { 'android:name': 'android.permission.QUERY_ALL_PACKAGES' } });
    }

    // Add queries for launcher apps
    if (!manifest.manifest.queries) manifest.manifest.queries = [];
    const queries = Array.isArray(manifest.manifest.queries) ? manifest.manifest.queries : [manifest.manifest.queries];
    const hasLauncherQuery = queries.some(q => {
      const intents = q.intent || [];
      return intents.some(i => {
        const actions = i.action || [];
        return actions.some(a => a.$?.['android:name'] === 'android.intent.action.MAIN');
      });
    });
    if (!hasLauncherQuery) {
      queries.push({
        intent: [{
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        }],
      });
      manifest.manifest.queries = queries;
    }

    // Add DeviceAdminReceiver
    if (!manifest.manifest.application) manifest.manifest.application = [{}];
    const app = Array.isArray(manifest.manifest.application) ? manifest.manifest.application[0] : manifest.manifest.application;
    if (!app.receiver) app.receiver = [];
    const receivers = Array.isArray(app.receiver) ? app.receiver : [app.receiver];
    const hasAdmin = receivers.some(r => r.$?.['android:name'] === '.lock.StudyDeviceAdminReceiver');
    if (!hasAdmin) {
      receivers.push({
        $: {
          'android:name': '.lock.StudyDeviceAdminReceiver',
          'android:label': '考研计时器专注锁',
          'android:description': '用于在学习时锁定手机',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
        },
        'meta-data': [{ $: { 'android:name': 'android.app.device_admin', 'android:resource': '@xml/device_admin_policies' } }],
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' } }] }],
      });
      app.receiver = receivers;
    }

    return cfg;
  });

  // 2. Inject source files via dangerous mod
  config = withDangerousMod(config, ['android', (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const androidRoot = path.join(projectRoot, 'android');
    const srcDir = path.join(androidRoot, 'app', 'src', 'main', 'java', 'com', 'kaoyan', 'studytimer', 'lock');
    const xmlDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'xml');
    const mainAppPath = path.join(androidRoot, 'app', 'src', 'main', 'java', 'com', 'kaoyan', 'studytimer', 'MainApplication.kt');

    // Create directories
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(xmlDir, { recursive: true });

    // Write source files
    Object.entries(SOURCE_FILES).forEach(([filename, content]) => {
      fs.writeFileSync(path.join(srcDir, filename), content, 'utf-8');
    });

    // Write device admin XML
    fs.writeFileSync(path.join(xmlDir, 'device_admin_policies.xml'), DEVICE_ADMIN_XML, 'utf-8');

    // Patch MainApplication.kt to register StudyLockPackage
    if (fs.existsSync(mainAppPath)) {
      let content = fs.readFileSync(mainAppPath, 'utf-8');

      // Add import if not present
      if (!content.includes('StudyLockPackage')) {
        content = content.replace(
          /import expo\.modules\.ExpoReactHostFactory/,
          'import expo.modules.ExpoReactHostFactory\nimport com.kaoyan.studytimer.lock.StudyLockPackage'
        );
        content = content.replace(
          /\/\/ Packages that cannot be autolinked yet can be added manually here[:\s\w,]*\/\/\s*add\(MyReactNativePackage\(\)\)/,
          '// Packages that cannot be autolinked yet can be added manually here:\n          add(StudyLockPackage())'
        );
        fs.writeFileSync(mainAppPath, content, 'utf-8');
      }
    }

    return cfg;
  }]);

  return config;
}

module.exports = function studyLockPlugin(config) {
  return withStudyLockAndroid(config);
};
