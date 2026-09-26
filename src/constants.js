export const SUBJECTS = {
  english: { name: "英语", icon: "", symbol: "英", glyph: "languages", color: "#347D9F" },
  math: { name: "数学", icon: "", symbol: "数", glyph: "radical", color: "#B87939" },
  politics: { name: "政治", icon: "", symbol: "政", glyph: "notebook-pen", color: "#3E846E" },
  automation: { name: "专业课", icon: "", symbol: "专", glyph: "graduation-cap", color: "#8870A3" },
};

export const TIMER_MODES = {
  work: { label: "学习", minutes: 25, color: "#AB4567" },
  shortBreak: { label: "短休", minutes: 5, color: "#3E846E" },
  longBreak: { label: "长休", minutes: 15, color: "#347D9F" },
};

export const COLORS = {
  bg: "#E7E9E8",
  card: "#FFFFFF",
  card2: "#EEEDF0",
  text: "#30373A",
  text2: "#687175",
  accent: "#AB4567",
  accentText: "#FFFFFF",
  lock: "#B54850",
  success: "#357B64",
  warning: "#9A682B",
  border: "#E3E5E5",
  accentSoft: "#F5E4E9",
};

export const DEFAULT_GOAL_MINUTES = 120; // 每日最低学习时长默认 2 小时

// 自更新版本号 — 每次要推送更新时与 app.json 的 android.versionCode 同步递增（OTA 靠它比对，必须单调 +1）
export const APP_VERSION_CODE = 49;
// 给用户看的版本名（与 app.json 的 expo.version 同步）；和上面的内部递增号解耦，可随心命名
export const APP_VERSION_NAME = "2.8.2";
