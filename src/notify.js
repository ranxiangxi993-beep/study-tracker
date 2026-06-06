import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUBJECTS } from './constants';
import { showDynamicIsland } from './nativeLock';

export async function celebrateComplete(subjectName, duration) {
  showDynamicIsland('🎉 学习完成', `${subjectName} · ${duration}`);
}

export async function remindBreak() {
  showDynamicIsland('☕ 休息一下', '站起来走动');
}

function notify(title, body) {
  showDynamicIsland(title, body);
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
        alerts.push({ key: `end_${s.id}_${today}`, title: '⏰ 即将结束', body: `${subjName} · ${s.end}`, time: endMin });
      }
    });

    const seen = {};
    alerts.forEach(a => { if (!seen[a.time] || a.title.includes('即将开始')) seen[a.time] = a; });
    Object.values(seen).forEach(a => { lastFired[a.key] = true; notify(a.title, a.body); });
  }, 30000);
}

export function stopScheduleMonitor() {
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
  lastFired = {};
}
