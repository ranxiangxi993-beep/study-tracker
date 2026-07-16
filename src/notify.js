import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, NativeModules } from "react-native";
import * as Notifications from "expo-notifications";
import { SUBJECTS } from "./constants";

// 原生精确闹钟模块（setAlarmClock）：用于"计时结束"提醒，绕过 Doze/省电冻结
const TimerAlarm = NativeModules.TimerAlarm;

// 打开"本应用的通知设置"页（用于让用户开启横幅/悬浮/锁屏通知——
// 国产 ROM 默认关着，App 无法代为打开，只能引导用户手动开）。
let IntentLauncher;
try {
  IntentLauncher = require("expo-intent-launcher");
} catch (_) {}
export async function openNotificationSettings() {
  if (Platform.OS !== "android" || !IntentLauncher?.startActivityAsync) return;
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.APP_NOTIFICATION_SETTINGS",
      {
        extra: {
          "android.provider.extra.APP_PACKAGE": "com.kaoyan.studytimer",
        },
      },
    );
  } catch (_) {}
}

// 打开"全屏通知"特殊权限页（Android 14+）。来电式 setFullScreenIntent 在 14+ 默认会被
// 系统降级为普通横幅，必须用户在此手动放行，息屏才会像闹钟/来电那样点亮屏幕强提醒。
export async function openFullScreenIntentSettings() {
  if (Platform.OS !== "android" || !IntentLauncher?.startActivityAsync) return;
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
      {
        data: "package:com.kaoyan.studytimer",
      },
    );
  } catch (_) {
    // 低于 Android 14 没有这个页面，退回普通通知设置页
    await openNotificationSettings();
  }
}

// ============================================================================
// 为什么 v13 离开界面就收不到提醒？
// 旧实现靠 JS 的 setInterval(每 30s 扫一遍日程) + 自绘悬浮提示。
// JS 定时器只在 App 前台活着时才跑，App 切后台/被系统杀掉后 JS 引擎被冻结，
// 自然就不再触发。这跟"微信收不到消息要保活"是同一类问题。
//
// 微信的做法是"自建长连接 + 厂商推送通道"——但那是给"服务器主动下发的消息"用的。
// 本 App 的提醒全是【按时间触发的本地提醒】(专注结束、日程到点)，根本不需要联网，
// 正确做法是把提醒交给【系统的本地定时通知】(AlarmManager / expo-notifications)：
// 时间一到由安卓系统负责弹出，App 不在前台、甚至被杀掉也照样送达，且更省电。
// 所以这里改用 expo-notifications 预约通知，并对日程用"每日重复"触发器。
// ============================================================================

// ⚠️ 安卓通知渠道一旦创建，其重要性/震动等设置就被系统永久缓存，
// 后续用 setNotificationChannelAsync 改 importance 不会生效（这就是"升到 MAX 也不弹横幅/不震动"的真因）。
// 日程、计时结束和进行中状态的打扰等级不同，必须使用独立且稳定的渠道。
const PLAN_CHANNEL_ID = "study-plan-reminders-v2";
const TIMER_CHANNEL_ID = "study-timer-complete-v2";
const OLD_CHANNEL_IDS = ["study-reminders", "study-reminders-max"];
const PLAN_IDS_KEY = "plan_notif_ids";
const PLAN_NOTIFICATION_KIND = "daily-plan-reminder";
const PLAN_NOTIFICATION_TITLE = "📅 即将开始";
const OLD_PLAN_TITLE_KEYWORDS = [
  "即将开始",
  "学习提醒",
  "学习计划",
  "日程提醒",
];

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
let planSyncQueue = Promise.resolve();

// 申请通知权限 + 建立安卓通知渠道。App 启动时调一次。
export async function ensureNotifPermission() {
  try {
    if (Platform.OS === "android") {
      // 删掉旧渠道（旧设置已被系统缓存、改不动）
      for (const old of OLD_CHANNEL_IDS) {
        try {
          await Notifications.deleteNotificationChannelAsync(old);
        } catch (_) {}
      }
      await Notifications.setNotificationChannelAsync(PLAN_CHANNEL_ID, {
        name: "学习计划提醒",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        bypassDnd: false,
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      await Notifications.setNotificationChannelAsync(TIMER_CHANNEL_ID, {
        name: "计时结束提醒",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 400, 250, 400],
        enableVibrate: true,
        bypassDnd: false,
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    permGranted = status === "granted";
  } catch (_) {
    permGranted = false;
  }
  return permGranted;
}

// ====== 专注计时：预约"计时结束"通知（后台/锁屏/息屏也会准时响） ======
// 在开始计时时调用；返回一个 id，暂停/结束/切换时用 cancelScheduled 取消。
//
// ⚠️ 为什么不用 expo 的 timeInterval 触发器？
// expo-notifications 的定时通知在安卓 Doze（息屏静止）下会被系统推迟，直到设备唤醒
// （解锁/回 App）才一次性补发——这就是"息屏收不到、回 App 过一会才弹"的真因
// （见 expo/expo#10456）。改用原生 AlarmManager.setAlarmClock：它是最高优先级闹钟，
// 绕过 Doze/省电/后台冻结，息屏也精确触发。原生不可用时（如 Expo Go）回退到 expo。
export async function scheduleTimerEnd(
  seconds,
  isWork,
  subjectName,
  strongAlert = false,
) {
  if (seconds <= 0) return null;
  const title = isWork ? "🎉 学习完成！" : "⏰ 休息结束";
  const body = isWork
    ? `${subjectName || "本轮"} 计时到啦，继续加油`
    : "该回去学习了";

  if (TimerAlarm?.schedule) {
    try {
      await TimerAlarm.schedule(Math.round(seconds), title, body, strongAlert);
      return "native-timer";
    } catch (_) {
      /* 落到 expo 回退 */
    }
  }
  // 回退：expo 定时通知（Doze 下可能延迟，但聊胜于无）
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      },
      trigger: {
        type: "timeInterval",
        seconds: Math.round(seconds),
        channelId: TIMER_CHANNEL_ID,
      },
    });
  } catch (_) {
    return null;
  }
}

export async function cancelScheduled(id) {
  if (!id) return;
  if (id === "native-timer") {
    try {
      await TimerAlarm?.cancel?.();
    } catch (_) {}
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (_) {}
}

// ====== 流体云：计时进行中的实时胶囊（安卓16 Live Update） ======
// 开始倒计时时调用，结束/暂停/切换时调用 stopLiveTimer 收起。仅原生(非Expo Go)生效。
export async function startLiveTimer(seconds, title) {
  if (seconds <= 0 || !TimerAlarm?.startLive) return;
  try {
    await TimerAlarm.startLive(Math.round(seconds), title);
  } catch (_) {}
}

export async function stopLiveTimer() {
  if (!TimerAlarm?.stopLive) return;
  try {
    await TimerAlarm.stopLive();
  } catch (_) {}
}

export async function setLiveTimerPromoted(promoted) {
  if (!TimerAlarm?.setLivePromoted) return false;
  try {
    return await TimerAlarm.setLivePromoted(promoted);
  } catch (_) {
    return false;
  }
}

export async function isScreenInteractive() {
  if (!TimerAlarm?.isInteractive) return true;
  try {
    return await TimerAlarm.isInteractive();
  } catch (_) {
    return true;
  }
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
        title,
        body,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        data: { kind: PLAN_NOTIFICATION_KIND },
      },
      trigger: {
        type: "daily", // SchedulableTriggerInputTypes.DAILY
        hour,
        minute,
        channelId: PLAN_CHANNEL_ID,
      },
    });
  } catch (_) {
    return null;
  }
}

async function cancelExistingPlanNotifications() {
  const oldIds = JSON.parse((await AsyncStorage.getItem(PLAN_IDS_KEY)) || "[]");
  const ids = new Set(oldIds.filter(Boolean));

  // 兼容旧版本：早期可能排过"开始前 3 分钟"、"开始前 2 分钟"等多套 daily 通知，
  // 且旧通知没有 data.kind。日程提醒是本 app 唯一 daily/repeating 通知，所以这里直接
  // 清掉所有 daily/repeating 计划项，再只按当前规则重建一套，避免 7:57、7:58 连续弹。
  if (Notifications.getAllScheduledNotificationsAsync) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled || []) {
      const title = n?.content?.title;
      const kind = n?.content?.data?.kind;
      const trigger = n?.trigger || {};
      const isDaily =
        trigger?.type === "daily" ||
        trigger?.repeats === true ||
        (Number.isFinite(trigger?.hour) && Number.isFinite(trigger?.minute));
      const looksLikePlan = OLD_PLAN_TITLE_KEYWORDS.some((k) =>
        title?.includes?.(k),
      );
      if (kind === PLAN_NOTIFICATION_KIND || isDaily || looksLikePlan) {
        ids.add(n.identifier);
      }
    }
  }

  for (const id of ids) await cancelScheduled(id);
  await AsyncStorage.setItem(PLAN_IDS_KEY, "[]");
}

function buildPlanReminders(plan) {
  const reminders = new Map();

  for (const s of plan) {
    if (!s.start) continue;
    const [sh, sm] = s.start.split(":").map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(sm)) continue;

    const subjName = s.customName || SUBJECTS[s.subject]?.name || "课程";
    const t = shiftTime(sh, sm, 2); // 开始前 2 分钟
    const key = `${t.hour}:${t.minute}`;
    const item = reminders.get(key) || {
      hour: t.hour,
      minute: t.minute,
      subjects: [],
    };
    item.subjects.push(`${s.start} ${subjName}`);
    reminders.set(key, item);
  }

  return [...reminders.values()];
}

// 根据当前每日计划，重建所有"每日重复"提醒。
// 计划修改后 / App 启动时调用即可，系统会每天自动按点提醒。
export async function syncPlanNotifications() {
  planSyncQueue = planSyncQueue.catch(() => {}).then(runSyncPlanNotifications);
  return planSyncQueue;
}

async function runSyncPlanNotifications() {
  try {
    // 先清掉所有日程提醒（包括旧版本或并发同步留下的孤儿预约），不动计时结束提醒。
    await cancelExistingPlanNotifications();

    const data = await AsyncStorage.getItem("daily_plan");
    const plan = data ? JSON.parse(data) : [];
    const newIds = [];

    // 只推"即将开始"，不再推"即将结束"；同一分钟的多门课合成一条，避免连续弹窗。
    for (const reminder of buildPlanReminders(plan)) {
      const id = await scheduleDaily(
        reminder.hour,
        reminder.minute,
        PLAN_NOTIFICATION_TITLE,
        reminder.subjects.join("、"),
      );
      if (id) newIds.push(id);
    }

    await AsyncStorage.setItem(PLAN_IDS_KEY, JSON.stringify(newIds));
  } catch (_) {}
}
