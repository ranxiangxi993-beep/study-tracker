// Pure AsyncStorage storage - no native SQLite dependency
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSIONS_KEY = 'study_sessions';
const GOALS_KEY = 'study_goals';

// Local date helper (UTC+8 safe, unlike toISOString)
function localDate(d) { const t = d || new Date(); return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0'); }

// ====== Sessions ======

export async function getSessions() {
  const data = await AsyncStorage.getItem(SESSIONS_KEY);
  return data ? JSON.parse(data) : [];
}

 async function saveSessions(sessions) {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

// Start a new session
export async function startSession(subject) {
  const sessions = await getSessions();
  const session = {
    id: Date.now(),
    subject,
    start_time: new Date().toISOString(),
    end_time: null,
    duration: 0,
    date: localDate(),
    note: '',
  };
  sessions.push(session);
  await saveSessions(sessions);
  return session.id;
}

// Stop an active session
export async function stopSession(sessionId, note = '') {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return null;
  const session = sessions[idx];
  if (session.end_time) return session;
  session.end_time = new Date().toISOString();
  session.duration = Math.floor((new Date(session.end_time) - new Date(session.start_time)) / 1000);
  session.note = note;
  sessions[idx] = session;
  await saveSessions(sessions);
  return session;
}

// Get active (unfinished) session
export async function getActiveSession() {
  const sessions = await getSessions();
  return sessions.find(s => !s.end_time) || null;
}

// Delete a session
export async function deleteSession(id) {
  const sessions = await getSessions();
  await saveSessions(sessions.filter(s => s.id !== id));
}

// ====== Stats ======

export async function getTodayStats() {
  const sessions = await getSessions();
  const today = localDate();
  const todaySessions = sessions.filter(s => s.date === today && s.duration > 0);
  const bySubject = {};
  todaySessions.forEach(s => {
    bySubject[s.subject] = (bySubject[s.subject] || 0) + s.duration;
  });
  return bySubject;
}

export async function getWeekStats() {
  const sessions = await getSessions();
  const today = new Date();
  const dayOfWeek = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1);

  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = localDate(d);
    const daySessions = sessions.filter(s => s.date === dateStr && s.duration > 0);
    const bySubject = {};
    let total = 0;
    daySessions.forEach(s => {
      bySubject[s.subject] = (bySubject[s.subject] || 0) + s.duration;
      total += s.duration;
    });
    days.push({ date: dateStr, weekday: weekdays[i], total_sec: total, subjects: bySubject });
  }
  return days;
}

export async function getTotalStats() {
  const sessions = await getSessions();
  const completed = sessions.filter(s => s.duration > 0);
  const bySubject = {};
  completed.forEach(s => {
    if (!bySubject[s.subject]) bySubject[s.subject] = { seconds: 0, count: 0 };
    bySubject[s.subject].seconds += s.duration;
    bySubject[s.subject].count += 1;
  });
  return { total_sec: completed.reduce((sum, s) => sum + s.duration, 0), subjects: bySubject };
}

// Get per-day study seconds for a year (for heatmap)
export async function getYearlyHeatmap(year) {
  const sessions = await getSessions();
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const yearStart = new Date(targetYear, 0, 1);
  // For current year, only show up to today; for past years, full year
  const endDate = targetYear === now.getFullYear() ? now : new Date(targetYear, 11, 31);
  const days = {};

  // Initialize all days of the year with 0
  for (let d = new Date(yearStart); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = localDate(d);
    days[key] = 0;
  }

  // Sum durations per day
  sessions.forEach(s => {
    if (s.duration > 0 && days[s.date] !== undefined) {
      days[s.date] += s.duration;
    }
  });

  return days;
}

// Get stats for a specific date range
export async function getStatsInRange(startDate, endDate) {
  const sessions = await getSessions();
  const inRange = sessions.filter(s => {
    return s.date >= startDate && s.date <= endDate && s.duration > 0;
  });
  const bySubject = {};
  let total = 0;
  inRange.forEach(s => {
    bySubject[s.subject] = (bySubject[s.subject] || 0) + s.duration;
    total += s.duration;
  });
  return { total_sec: total, subjects: bySubject };
}

// Period stats: day / week / month / year
export async function getPeriodStats(period) {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'day':
      startDate = new Date(now);
      break;
    case 'week': {
      const day = now.getDay() || 7;
      startDate = new Date(now);
      startDate.setDate(now.getDate() - day + 1);
      break;
    }
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now);
  }

  const startStr = localDate(startDate);
  const endStr = localDate(now);
  return getStatsInRange(startStr, endStr);
}

export async function getStreak() {
  const sessions = await getSessions();
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = localDate(d);
    if (sessions.some(s => s.date === dateStr && s.duration > 0)) {
      streak = i + 1;
    } else {
      if (i === 0) streak = 0;
      break;
    }
  }
  return streak;
}

export async function getHistory(limit = 30, offset = 0) {
  const sessions = await getSessions();
  return sessions
    .filter(s => s.duration > 0)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(offset, offset + limit);
}

export async function getHistoryCount() {
  const sessions = await getSessions();
  return sessions.filter(s => s.duration > 0).length;
}

// ====== Goals ======

export async function getGoals() {
  const data = await AsyncStorage.getItem(GOALS_KEY);
  return data ? JSON.parse(data) : {};
}

export async function setGoal(subject, minutes) {
  const goals = await getGoals();
  goals[subject] = minutes;
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

// ====== Helpers ======

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}
