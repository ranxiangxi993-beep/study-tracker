// Smart heads-up notifications for OPPO/Xiaomi Dynamic Island area
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUBJECTS } from './constants';

const CHANNEL_REMINDER = 'study_reminder';
const CHANNEL_COMPLETE = 'study_complete';

// Configure how notifications behave (heads-up, no persistent icon)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, // heads-up
  }),
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;

  // Reminder channel - IMPORTANCE_HIGH = heads-up popup
  await Notifications.setNotificationChannelAsync(CHANNEL_REMINDER, {
    name: '学习提醒',
    description: '日程提醒和学习状态通知',
    importance: Notifications.AndroidImportance.HIGH, // heads-up, pops at top
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    bypassDnd: false,
    enableVibrate: true,
  });

  // Completion channel
  await Notifications.setNotificationChannelAsync(CHANNEL_COMPLETE, {
    name: '学习完成',
    description: '计时器完成通知',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    bypassDnd: false,
    enableVibrate: true,
  });
}

// ---- Schedule Reminder ----
// Pops up 5 min before a scheduled class, then auto-dismisses

export async function remindSchedule(subjectName, startTime) {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `📅 ${startTime} ${subjectName}`,
      body: '即将开始，准备好学习资料 ✨',
      data: { type: 'schedule_reminder' },
      ...(Platform.OS === 'android' ? {
        channelId: CHANNEL_REMINDER,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      } : {}),
    },
    trigger: null, // immediate - shows right away as heads-up
  });
}

// ---- Timer Complete ----
// Celebration heads-up, auto-dismisses after ~5 seconds

export async function celebrateComplete(subjectName, duration) {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🎉 学习完成！`,
      body: `${subjectName} · ${duration} · 继续加油 🔥`,
      data: { type: 'timer_complete' },
      ...(Platform.OS === 'android' ? {
        channelId: CHANNEL_COMPLETE,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      } : {}),
    },
    trigger: null,
  });
}

// ---- Break Reminder ----
export async function remindBreak() {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '☕ 休息一下',
      body: '站起来走动一下，看看远处',
      data: { type: 'break' },
      ...(Platform.OS === 'android' ? {
        channelId: CHANNEL_REMINDER,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      } : {}),
    },
    trigger: null,
  });
}

// ====== Schedule Monitor ======
// Checks every minute if there's an upcoming class to remind about

let scheduleTimer = null;
let lastReminded = {}; // { scheduleId: dateReminded }

export function startScheduleMonitor() {
  stopScheduleMonitor();

  scheduleTimer = setInterval(async () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Read daily plan from AsyncStorage
    const data = await AsyncStorage.getItem('daily_plan');
    const plan = data ? JSON.parse(data) : [];
    plan.forEach(s => {
      const [sh, sm] = s.start.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const diffMin = startMin - nowMin;

      // Remind 5 minutes before scheduled time
      if (diffMin > 0 && diffMin <= 5) {
        const todayKey = `${s.id}_${new Date().toDateString()}`;
        if (lastReminded[todayKey]) return;
        lastReminded[todayKey] = true;

        const subjName = SUBJECTS[s.subject]?.name || '课程';
        remindSchedule(subjName, s.start);
      }
    });
  }, 60000); // check every minute
}

export function stopScheduleMonitor() {
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
  lastReminded = {};
}
