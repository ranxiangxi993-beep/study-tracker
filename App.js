import React, { useState, useEffect, createContext, useContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TimerScreen from './src/screens/TimerScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import StatsScreen from './src/screens/StatsScreen';
import { COLORS } from './src/constants';
import { startScheduleMonitor } from './src/notify';

const Tab = createBottomTabNavigator();

export const BgContext = createContext({ bgUri: null, setBgUri: () => {}, resetBg: () => {} });
export const useBg = () => useContext(BgContext);

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

function AppContent() {
  const { bgUri } = useBg();

  // Build a transparent theme when background is set
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
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: bgUri ? 'rgba(26,26,46,0.92)' : COLORS.card,
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
    </NavigationContainer>
  );

  // expo-image handles content:// and file:// URIs correctly on Android
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
    startScheduleMonitor(); // Start monitoring user's schedule for reminders
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
