import React, { useState, useEffect, createContext, useContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, StyleSheet, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
// SDK 54 起 expo-file-system 默认导出改为新版 File/Directory API，
// downloadAsync/cacheDirectory/getContentUriAsync 等旧方法移到 legacy 子模块
import * as FileSystem from 'expo-file-system/legacy';
import TimerScreen from './src/screens/TimerScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import StatsScreen from './src/screens/StatsScreen';
import CountdownScreen from './src/screens/CountdownScreen';
import { COLORS, APP_VERSION_CODE } from './src/constants';
import { startScheduleMonitor } from './src/notify';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export const BgContext = createContext({ bgUri: null, setBgUri: () => {}, resetBg: () => {} });
export const useBg = () => useContext(BgContext);

const GITHUB_REPO = 'ranxiangxi993-beep/study-tracker';
const RELEASE_TAG = 'latest-build';

async function checkForUpdate() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${RELEASE_TAG}`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return;
    const release = await res.json();
    const verAsset = release.assets?.find(a => a.name === 'version.json');
    if (!verAsset) return;
    const verRes = await fetch(verAsset.browser_download_url);
    const { versionCode } = await verRes.json();
    if (!versionCode || versionCode <= APP_VERSION_CODE) return;
    const apkAsset = release.assets?.find(a => a.name === 'app-release.apk');
    if (!apkAsset) return;
    Alert.alert(
      '发现新版本',
      '研途有新版本可用，是否立即下载安装？',
      [
        { text: '稍后', style: 'cancel' },
        { text: '立即更新', onPress: () => downloadAndInstall(apkAsset.browser_download_url) },
      ]
    );
  } catch (_) {}
}

// 国内直连 GitHub 下载 CDN（objects.githubusercontent.com）常超时，
// 优先走加速镜像，逐个回退，最后才直连。
const DL_MIRRORS = [
  u => 'https://ghfast.top/' + u,
  u => 'https://gh-proxy.com/' + u,
  u => 'https://ghproxy.net/' + u,
  u => u, // 直连兜底
];

async function downloadAndInstall(url) {
  Alert.alert('下载中...', '正在下载新版本（约 75MB），请稍候');
  const localUri = FileSystem.cacheDirectory + 'study_update.apk';
  let lastErr = '';
  for (const wrap of DL_MIRRORS) {
    try {
      const { uri, status } = await FileSystem.downloadAsync(wrap(url), localUri);
      if (status >= 400) { lastErr = 'HTTP ' + status; continue; }
      const contentUri = await FileSystem.getContentUriAsync(uri);
      let IntentLauncher;
      try { IntentLauncher = require('expo-intent-launcher'); } catch (_) {}
      if (IntentLauncher?.startActivityAsync) {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: 'application/vnd.android.package-archive',
          flags: 1,
        });
      }
      return; // 成功
    } catch (e) {
      lastErr = (e && e.message) ? e.message : String(e);
    }
  }
  Alert.alert('更新失败', '下载失败（' + lastErr + '）。\n可在浏览器打开项目 Release 页手动下载安装。');
}

function TabIcon({ emoji, label, focused }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={{ fontSize: 9, marginTop: 2, color: focused ? '#fff' : COLORS.text2, fontWeight: focused ? '600' : '400' }}>
        {label}
      </Text>
    </View>
  );
}

function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: 'rgba(255,255,255,0.05)',
          borderTopWidth: 1,
          paddingTop: 4,
          height: 60,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: COLORS.text2,
      }}
    >
      <Tab.Screen name="Timer" component={TimerScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⏱️" label="计时" focused={focused} /> }} />
      <Tab.Screen name="Schedule" component={ScheduleScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📅" label="日程" focused={focused} /> }} />
      <Tab.Screen name="Stats" component={StatsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📊" label="统计" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { bgUri } = useBg();

  const navTheme = {
    dark: true,
    colors: {
      primary: COLORS.accent,
      background: bgUri ? 'transparent' : COLORS.bg,
      card: bgUri ? 'rgba(26,26,46,0.92)' : COLORS.card,
      text: COLORS.text,
      border: 'rgba(255,255,255,0.05)',
      notification: COLORS.accent,
    },
  };

  const inner = (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="Tabs" component={TabsNavigator} />
        <Stack.Screen name="Countdown" component={CountdownScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  if (bgUri) {
    return (
      <View style={styles.bg}>
        <Image source={bgUri} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.bgOverlay} />
        {inner}
      </View>
    );
  }

  return inner;
}

export default function App() {
  const [bgUri, setBgUri] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('bg_image').then(data => { if (data) setBgUri(data); });
    startScheduleMonitor();
    setTimeout(checkForUpdate, 3000);
  }, []);

  const updateBg = (uri) => {
    setBgUri(uri);
    AsyncStorage.setItem('bg_image', uri);
  };

  const resetBg = () => {
    setBgUri(null);
    AsyncStorage.removeItem('bg_image');
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <BgContext.Provider value={{ bgUri, setBgUri: updateBg, resetBg }}>
        <AppContent />
      </BgContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,26,0.55)',
  },
});
