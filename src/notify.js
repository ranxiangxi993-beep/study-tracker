import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUBJECTS } from './constants';

const CHAN_REMINDER = 'study_reminder';
const CHAN_COMPLETE = 'study_complete';

// Request notification permission on import
Notifications.requestPermissionsAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
  }),
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  // Reminder channel：max importance + vibration + heads-up
  await Notifications.setNotificationChannelAsync(CHAN_REMINDER, {
    name: '学习提醒',
    description: '日程开始前提醒',
    importance: Notifications.AndroidImportance.MAX, // MAX > HIGH
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 200, 100, 200],
    bypassDnd: true,
  });
  // Completion channel
  await Notifications.setNotificationChannelAsync(CHAN_COMPLETE, {
    name: '学习完成',
    description: '计时结束通知',
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 100, 50, 200, 50, 300],
  });
}

// ====== Schedule Reminder ======
export async function remindSchedule(subjectName, startTime) {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `📅 ${startTime} ${subjectName}`,
      body: '该开始学习了 ✨',
      data: { type: 'schedule_reminder' },
      ...(Platform.OS === 'android' ? {
        channelId: CHAN_REMINDER,
        priority: Notifications.AndroidNotificationPriority.MAX,
        category: Notifications.AndroidNotificationCategory.ALARM,
      } : {}),
    },
    trigger: null,
  });
}

// ====== Timer Complete ======
export async function celebrateComplete(subjectName, duration) {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🎉 学习完成',
      body: `${subjectName} · ${duration}`,
      data: { type: 'timer_complete' },
      ...(Platform.OS === 'android' ? {
        channelId: CHAN_COMPLETE,
        priority: Notifications.AndroidNotificationPriority.MAX,
      } : {}),
    },
    trigger: null,
  });
}

// ====== Break Reminder ======
export async function remindBreak() {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '☕ 休息一下',
      body: '站起来走动，看看远处',
      data: { type: 'break' },
      ...(Platform.OS === 'android' ? {
        channelId: CHAN_REMINDER,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      } : {}),
    },
    trigger: null,
  });
}

// ====== Schedule Monitor ======
let scheduleTimer = null;
let lastReminded = {};

export function startScheduleMonitor() {
  stopScheduleMonitor();
  scheduleTimer = setInterval(async () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const data = await AsyncStorage.getItem('daily_plan');
    const plan = data ? JSON.parse(data) : [];
    plan.forEach(s => {
      const [sh, sm] = s.start.split(':').map(Number);
      const diffMin = sh * 60 + sm - nowMin;
      if (diffMin > 0 && diffMin <= 5) {
        const key = `${s.id}_${new Date().toDateString()}`;
        if (lastReminded[key]) return;
        lastReminded[key] = true;
        remindSchedule(SUBJECTS[s.subject]?.name || '课程', s.start);
      }
      // Also remind at exact start time
      if (diffMin === 0 && !lastReminded[`${s.id}_exact_${new Date().toDateString()}`]) {
        lastReminded[`${s.id}_exact_${new Date().toDateString()}`] = true;
        remindSchedule(SUBJECTS[s.subject]?.name || '课程', s.start);
      }
    });
  }, 30000); // check every 30 seconds (faster)
}

export function stopScheduleMonitor() {
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
  lastReminded = {};
}
