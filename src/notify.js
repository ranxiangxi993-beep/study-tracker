import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SUBJECTS } from './constants';
import { showDynamicIsland } from './nativeLock';

// 打开"本应用的通知设置"页（用于让用户开启横幅/悬浮/锁屏通知——
// 国产 ROM 默认关着，App 无法代为打开，只能引导用户手动开）。
let IntentLauncher;
try { IntentLauncher = require('expo-intent-launcher'); } catch (_) {}
export async function openNotificationSettings() {
  if (Platform.OS !== 'android' || !IntentLauncher?.startActivityAsync) return;
  try {
    await IntentLauncher.startActivityAsync('android.settings.APP_NOTIFICATION_SETTINGS', {
      extra: { 'android.provider.extra.APP_PACKAGE': 'com.kaoyan.studytimer' },
    });
  } catch (_) {}
}

// ============================================================================
// 为什么 v13 离开界面就收不到提醒？
// 旧实现靠 JS 的 setInterval(每 30s 扫一遍日程) + 悬浮窗(DynamicIsland)。
// JS 定时器只在 App 前台活着时才跑，App 切后台/被系统杀掉后 JS 引擎被冻结，
// 自然就不再触发。这跟"微信收不到消息要保活"是同一类问题。
//
// 微信的做法是"自建长连接 + 厂商推送通道"——但那是给"服务器主动下发的消息"用的。
// 本 App 的提醒全是【按时间触发的本地提醒】(番茄钟结束、日程到点)，根本不需要联网，
// 正确做法是把提醒交给【系统的本地定时通知】(AlarmManager / expo-notifications)：
// 时间一到由安卓系统负责弹出，App 不在前台、甚至被杀掉也照样送达，且更省电。
// 所以这里改用 expo-notifications 预约通知，并对日程用"每日重复"触发器。
// ============================================================================

const CHANNEL_ID = 'study-reminders';
const PLAN_IDS_KEY = 'plan_notif_ids';

// 前台收到通知时也弹出横幅(否则前台默认静默)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permGranted = false;

// 申请通知权限 + 建立安卓通知渠道。App 启动时调一次。
export async function ensureNotifPermission() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: '学习提醒',
        // MAX = 安卓"紧急/横幅"级别，才会像微信那样以悬浮横幅弹出（HIGH 在部分 ROM 只进通知栏）
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        bypassDnd: true, // 勿扰模式下也提醒
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    permGranted = status === 'granted';
  } catch (_) {
    permGranted = false;
  }
  return permGranted;
}

// ====== 前台即时反馈（保留原悬浮窗效果） ======
export async function celebrateComplete(subjectName, duration) {
  showDynamicIsland('🎉 学习完成', `${subjectName} · ${duration}`);
}

export async function remindBreak() {
  showDynamicIsland('☕ 休息一下', '站起来走动');
}

// ====== 番茄钟：预约"计时结束"通知（后台/锁屏也会响） ======
// 在开始计时时调用；返回通知 id，暂停/结束/切换时用 cancelScheduled 取消。
export async function scheduleTimerEnd(seconds, isWork, subjectName) {
  if (seconds <= 0) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: isWork ? '🎉 学习完成！' : '⏰ 休息结束',
        body: isWork ? `${subjectName || '本轮'} 计时到啦，继续加油` : '该回去学习了',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX, // 触发悬浮横幅
        vibrationPattern: [0, 250, 250, 250],
      },
      trigger: {
        type: 'timeInterval', // SchedulableTriggerInputTypes.TIME_INTERVAL
        seconds: Math.round(seconds),
        channelId: CHANNEL_ID,
      },
    });
  } catch (_) {
    return null;
  }
}

export async function cancelScheduled(id) {
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch (_) {}
}

// ====== 日程提醒：用"每日重复"通知，无需 App 在前台 ======
function shiftTime(hh, mm, deltaMin) {
  let total = hh * 60 + mm - deltaMin;
  total = ((total % 1440) + 1440) % 1440; // 处理跨午夜
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

async function scheduleDaily(hour, minute, title, body) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title, body, sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX, // 触发悬浮横幅
        vibrationPattern: [0, 250, 250, 250],
      },
      trigger: {
        type: 'daily', // SchedulableTriggerInputTypes.DAILY
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
  } catch (_) {
    return null;
  }
}

// 根据当前每日计划，重建所有"每日重复"提醒。
// 计划修改后 / App 启动时调用即可，系统会每天自动按点提醒。
export async function syncPlanNotifications() {
  try {
    // 先清掉上次预约的日程通知（只清日程的，不动番茄钟那条）
    const oldIds = JSON.parse((await AsyncStorage.getItem(PLAN_IDS_KEY)) || '[]');
    for (const id of oldIds) await cancelScheduled(id);

    const data = await AsyncStorage.getItem('daily_plan');
    const plan = data ? JSON.parse(data) : [];
    const newIds = [];

    for (const s of plan) {
      const subjName = s.customName || SUBJECTS[s.subject]?.name || '课程';
      if (s.start) {
        const [sh, sm] = s.start.split(':').map(Number);
        const t = shiftTime(sh, sm, 2); // 开始前 2 分钟
        const id = await scheduleDaily(t.hour, t.minute, '📅 即将开始', `${s.start} ${subjName}`);
        if (id) newIds.push(id);
      }
      if (s.end) {
        const [eh, em] = s.end.split(':').map(Number);
        const t = shiftTime(eh, em, 2); // 结束前 2 分钟
        const id = await scheduleDaily(t.hour, t.minute, '⏰ 即将结束', `${subjName} · ${s.end}`);
        if (id) newIds.push(id);
      }
    }

    await AsyncStorage.setItem(PLAN_IDS_KEY, JSON.stringify(newIds));
  } catch (_) {}
}
