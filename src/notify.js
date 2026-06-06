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

    plan.forEach(s => {
      const [sh, sm] = s.start.split(':').map(Number);
      const [eh, em] = (s.end || s.start).split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const subjName = SUBJECTS[s.subject]?.name || '课程';

      const upcomingKey = `up_${s.id}_${today}`;
      const startKey = `start_${s.id}_${today}`;
      const endKey = `end_${s.id}_${today}`;

      // 2 min before: upcoming notice
      if (nowMin === startMin - 2 && !lastFired[upcomingKey]) {
        lastFired[upcomingKey] = true;
        notify('📅 即将开始', `${s.start} ${subjName} · 2分钟后开始`);
      }
      // At start time: started
      if (nowMin === startMin && !lastFired[startKey]) {
        lastFired[startKey] = true;
        notify('⏱️ 现在开始', `${subjName} · 开始学习！`);
      }
      // At end time: completed
      if (nowMin === endMin && !lastFired[endKey]) {
        lastFired[endKey] = true;
        notify('✅ 已完成', `${subjName} · ${s.start}-${s.end}`);
      }
    });
  }, 30000);
}

export function stopScheduleMonitor() {
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
  lastFired = {};
}
