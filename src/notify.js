import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUBJECTS } from './constants';

const CHAN = 'study_alert';

Notifications.requestPermissionsAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHAN, {
    name: '研途提醒',
    description: '学习日程提醒',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    enableVibrate: false,
    bypassDnd: false,
  });
}

async function notify(title, body) {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title, body,
      data: { type: 'schedule' },
      ...(Platform.OS === 'android' ? {
        channelId: CHAN,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      } : {}),
    },
    trigger: null,
  });
}

export async function celebrateComplete(subjectName, duration) {
  await notify('🎉 学习完成', `${subjectName} · ${duration}`);
}

export async function remindBreak() {
  await notify('☕ 休息一下', '站起来走动，看看远处');
}

// ====== Schedule Monitor ======
let scheduleTimer = null;
let lastFired = {};

export function startScheduleMonitor() {
  stopScheduleMonitor();
  scheduleTimer = setInterval(async () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const data = await AsyncStorage.getItem('daily_plan');
    const plan = data ? JSON.parse(data) : [];
    const today = new Date().toDateString();

    // Collect all notifications first, dedup same-minute conflicts
    const alerts = [];
    plan.forEach(s => {
      const subjName = SUBJECTS[s.subject]?.name || '课程';
      const [sh, sm] = s.start.split(':').map(Number);
      const [eh, em] = (s.end || s.start).split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      if (nowMin === startMin - 2 && !lastFired[`soon_${s.id}_${today}`]) {
        alerts.push({ key: `soon_${s.id}_${today}`, title: '📅 即将开始', body: `${s.start} ${subjName}`, time: startMin });
      }
      if (nowMin === endMin - 2 && !lastFired[`end_${s.id}_${today}`]) {
        alerts.push({ key: `end_${s.id}_${today}`, title: '⏰ 即将结束', body: `${subjName} · ${s.end} 结束`, time: endMin });
      }
    });
    // If same minute has both end and start, keep only the upcoming start
    const seen = {};
    alerts.forEach(a => {
      if (!seen[a.time] || a.title === '📅 即将开始') {
        seen[a.time] = a;
      }
    });
    Object.values(seen).forEach(a => {
      lastFired[a.key] = true;
      notify(a.title, a.body);
    });
  }, 30000);
}

export function stopScheduleMonitor() {
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
  lastFired = {};
}
