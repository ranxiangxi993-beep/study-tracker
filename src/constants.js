export const SUBJECTS = {
  english:    { name: '英语',   icon: '📖', color: '#4A90D9' },
  math:       { name: '数学',   icon: '📐', color: '#E85D75' },
  politics:   { name: '政治',   icon: '📰', color: '#5CB85C' },
  automation: { name: '专业课', icon: '📘', color: '#9B59B6' },
};

export const TIMER_MODES = {
  work:       { label: '📖 学习', minutes: 25, color: '#ff6b6b' },
  shortBreak: { label: '☕ 短休', minutes: 5,  color: '#5CB85C' },
  longBreak:  { label: '😴 长休', minutes: 15, color: '#4A90D9' },
};

export const COLORS = {
  bg:       '#0f0f1a',
  card:     'rgba(26,26,46,0.6)',
  card2:    'rgba(34,34,64,0.5)',
  text:     '#e8e8f0',
  text2:    'rgba(153,153,187,0.7)',
  accent:   '#ff6b6b',
  lock:     '#e74c3c',
  success:  '#27ae60',
  warning:  '#f39c12',
  border:   'rgba(255,255,255,0.06)',
};

export const DEFAULT_GOAL_MINUTES = 120; // 每科默认2小时

// 自更新版本号 — 每次要推送更新时与 app.json 的 android.versionCode 同步递增（OTA 靠它比对，必须单调 +1）
export const APP_VERSION_CODE = 36;
// 给用户看的版本名（与 app.json 的 expo.version 同步）；和上面的内部递增号解耦，可随心命名
export const APP_VERSION_NAME = '2.0';
