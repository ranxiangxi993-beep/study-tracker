const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");

function environment(initial = {}, os = "android") {
  const data = new Map(Object.entries(initial));
  const scheduled = new Map();
  const canceled = [];
  let nextId = 0;
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  const notifications = {
    setNotificationHandler() {},
    AndroidNotificationPriority: { HIGH: "high" },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async (id) => {
      canceled.push(id);
      scheduled.delete(id);
    },
    scheduleNotificationAsync: async (value) => {
      const identifier = `test-${++nextId}`;
      scheduled.set(identifier, { ...value, identifier });
      return identifier;
    },
  };
  const mocks = {
    "@react-native-async-storage/async-storage": storage,
    "react-native": {
      Platform: { OS: os },
      NativeModules: {},
      StyleSheet: { create: (value) => value },
    },
    "react-native-svg": {},
    "expo-notifications": notifications,
    "expo-intent-launcher": {},
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, "..", relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [
        "@babel/plugin-transform-modules-commonjs",
        "@babel/plugin-transform-react-jsx",
      ],
    });
    const localRequire = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("."))
        return load(
          path.relative(
            path.resolve(__dirname, ".."),
            path.resolve(
              path.dirname(filename),
              id.endsWith(".js") ? id : `${id}.js`,
            ),
          ),
        );
      return require(id);
    };
    new Function("require", "module", "exports", code)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }
  return { data, scheduled, canceled, load };
}

const timer = environment().load("src/timerState.js");
const stats = environment().load("src/statsModel.js");
const initialTimer = {
  mode: "work",
  subject: "english",
  duration: 2700,
  startedAt: 1000,
  elapsed: 0,
  paused: false,
  countUp: false,
};

test("subject symbols are distinct and retain the existing subject keys", () => {
  const { SUBJECTS } = environment().load("src/constants.js");
  assert.deepEqual(
    Object.fromEntries(Object.entries(SUBJECTS).map(([key, value]) => [key, value.symbol])),
    { english: "英", math: "数", politics: "政", automation: "专" },
  );
  assert.equal(new Set(Object.values(SUBJECTS).map((value) => value.symbol)).size, 4);
});

test("academic goal saves normalized school and optional major across reloads", async () => {
  const env = environment({ exam_target_date: "2026-12-20", daily_goal_minutes: "120" });
  const goals = env.load("src/academicGoal.js");
  const value = await goals.saveAcademicGoal({ university: "  示例大学  ", major: "  0854   电子信息  " });
  assert.deepEqual(value, { university: "示例大学", major: "0854 电子信息" });
  const restarted = environment(Object.fromEntries(env.data)).load("src/academicGoal.js");
  assert.deepEqual(await restarted.loadAcademicGoal(), value);
  assert.equal(env.data.get("exam_target_date"), "2026-12-20");
  assert.equal(env.data.get("daily_goal_minutes"), "120");
  assert.deepEqual(await goals.saveAcademicGoal({ university: "另一所大学" }), { university: "另一所大学", major: "" });
});

test("invalid academic goal never replaces a previously saved target", async () => {
  const env = environment();
  const goals = env.load("src/academicGoal.js");
  const original = await goals.saveAcademicGoal({ university: "示例大学", major: "计算机科学" });
  for (const invalid of [null, {}, { university: "  " }, { university: "校".repeat(61) }, { university: "大学", major: "科".repeat(81) }]) {
    await assert.rejects(goals.saveAcademicGoal(invalid));
    assert.deepEqual(await goals.loadAcademicGoal(), original);
  }
});

test("empty or malformed academic goal is safe to load", async () => {
  for (const raw of [null, "invalid json", "null", "[]", "42", '{"university":42}', '{"major":"专业"}']) {
    const goals = environment({ academic_goal: raw }).load("src/academicGoal.js");
    assert.deepEqual(await goals.loadAcademicGoal(), { university: "", major: "" });
  }
});

test("clearing academic goal keeps exam date, study history and daily minimum", async () => {
  const initial = { exam_target_date: "2027-12-19", study_sessions: "[]", daily_goal_minutes: "180" };
  const env = environment(initial);
  const goals = env.load("src/academicGoal.js");
  await goals.saveAcademicGoal({ university: "示例大学" });
  await goals.clearAcademicGoal();
  assert.deepEqual(await goals.loadAcademicGoal(), { university: "", major: "" });
  assert.deepEqual(Object.fromEntries(env.data), initial);
});

test("45-minute countdown uses an absolute deadline, not a JS tick counter", () => {
  assert.equal(timer.remainingSeconds(initialTimer, 181000), 2520);
  assert.equal(timer.remainingSeconds(initialTimer, 3601000), 0);
  assert.equal(timer.elapsedSeconds(initialTimer, 3601000), 2700);
});
test("pause, process restart and resume do not count paused time", () => {
  const paused = timer.pauseTimer(initialTimer, 61000);
  const restored = timer.parseTimer(JSON.stringify(paused));
  assert.equal(timer.elapsedSeconds(restored, 3601000), 60);
  const resumed = timer.resumeTimer(restored, 3601000);
  assert.equal(timer.elapsedSeconds(resumed, 3661000), 120);
});
test("count-up can exceed the default countdown duration", () => {
  assert.equal(
    timer.elapsedSeconds({ ...initialTimer, countUp: true }, 7201000),
    7200,
  );
});
test("clock moving backward never creates negative study time", () => {
  assert.equal(timer.elapsedSeconds(initialTimer, 0), 0);
});
test("invalid saved checkpoints do not crash startup", () => {
  for (const raw of [
    null,
    "{broken",
    "{}",
    "null",
    JSON.stringify({ ...initialTimer, elapsed: -1 }),
    JSON.stringify({ ...initialTimer, duration: 0 }),
  ])
    assert.equal(timer.parseTimer(raw), null);
});
test("heatmap changes with the goal, including exact and excess thresholds", () => {
  assert.deepEqual(
    [0, 1, 3599, 3600, 7199, 7200, 10799, 10800].map((seconds) =>
      stats.heatLevel(seconds, 120),
    ),
    [0, 1, 1, 2, 2, 3, 3, 4],
  );
  assert.equal(stats.heatLevel(3600, 60), 3);
});
test("month ranges handle leap years and December", () => {
  assert.deepEqual(stats.selectedRange("month", 2024, 1), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.deepEqual(stats.selectedRange("month", 2026, 11), {
    start: "2026-12-01",
    end: "2026-12-31",
  });
});
test("current week crosses year boundaries correctly", () => {
  assert.deepEqual(stats.selectedRange("week", 2026, 0, new Date(2026, 0, 1)), {
    start: "2025-12-29",
    end: "2026-01-01",
  });
});
test("manual date validation rejects invalid and future days", () => {
  assert.equal(stats.validStudyDate("2024-02-29", "2026-09-25"), true);
  for (const day of [
    "2025-02-29",
    "2026-02-31",
    "2026-09-26",
    "2026-9-25",
    "1999-12-31",
  ])
    assert.equal(stats.validStudyDate(day, "2026-09-25"), false);
});
test("concurrent manual saves retain every record with a unique ID", async () => {
  const s = environment().load("src/storage.js");
  await Promise.all(
    Array.from({ length: 40 }, () =>
      s.addManualSession("english", 60, "2026-09-01"),
    ),
  );
  const all = await s.getSessions();
  assert.equal(all.length, 40);
  assert.equal(new Set(all.map((item) => item.id)).size, 40);
  assert.equal(
    (await s.getStatsInRange("2026-09-01", "2026-09-01")).total_sec,
    2400,
  );
});
test("deductions are limited to the selected subject and day", async () => {
  const s = environment().load("src/storage.js");
  await s.addManualSession("english", 600, "2026-09-01");
  await s.addManualSession("math", 900, "2026-09-01");
  await s.addManualSession("english", -900, "2026-09-01");
  await s.addManualSession("english", -900, "2026-09-02");
  assert.deepEqual(
    (await s.getStatsInRange("2026-09-01", "2026-09-01")).subjects,
    { english: 0, math: 900 },
  );
  assert.equal((await s.getSessions()).length, 3);
});
test("editing a deduction preserves its sign and caps it at available time", async () => {
  const s = environment().load("src/storage.js");
  await s.addManualSession("english", 3600, "2026-09-01");
  await s.addManualSession("english", -600, "2026-09-01");
  const deduction = (await s.getSessions()).find((item) => item.duration < 0);
  await s.updateSessionDuration(deduction.id, 1200);
  assert.equal(
    (await s.getStatsInRange("2026-09-01", "2026-09-01")).total_sec,
    2400,
  );
  await s.updateSessionDuration(deduction.id, 9000);
  assert.equal(
    (await s.getStatsInRange("2026-09-01", "2026-09-01")).total_sec,
    0,
  );
});
test("deleting or shrinking a record cannot strand a larger deduction", async () => {
  const s = environment().load("src/storage.js");
  await s.addManualSession("english", 600, "2026-09-01");
  await s.addManualSession("english", -500, "2026-09-01");
  const positive = (await s.getSessions()).find((item) => item.duration > 0);
  await assert.rejects(s.deleteSession(positive.id));
  await assert.rejects(s.updateSessionDuration(positive.id, 100));
  assert.equal(
    (await s.getStatsInRange("2026-09-01", "2026-09-01")).total_sec,
    100,
  );
});
test("finishing twice is idempotent and cannot duplicate study time", async () => {
  const s = environment().load("src/storage.js");
  const id = await s.startSession("english");
  await Promise.all([s.stopSession(id, 100), s.stopSession(id, 100)]);
  assert.equal((await s.getSessions()).length, 1);
  assert.equal((await s.getSessions())[0].duration, 100);
  assert.equal(await s.getActiveSession(), null);
});
test("a failed mutation does not block subsequent saves", async () => {
  const s = environment().load("src/storage.js");
  const id = await s.startSession("english");
  await assert.rejects(s.updateSessionDuration(id, 100));
  await s.stopSession(id, 100);
  assert.equal((await s.getSessions())[0].duration, 100);
});
test("all pie labels retain a readable gap even when three small slices cluster", () => {
  const { placeSideLabels } = environment().load("src/components/PieChart.js");
  for (const angles of [
    [1, 2, 3, 4],
    [177, 178, 179],
    [181, 182, 183],
    [356, 357, 358, 359],
  ]) {
    const placed = placeSideLabels(
      angles.map((midAngle, key) => ({ key, midAngle })),
      angles[0] <= 180,
    );
    for (let i = 0; i < placed.length; i++) {
      assert.ok(placed[i].labelY >= 32 && placed[i].labelY <= 240);
      if (i) assert.ok(placed[i].labelY - placed[i - 1].labelY >= 62);
    }
  }
});
test("plan sync removes legacy 3-minute reminders and keeps one 2-minute reminder", async () => {
  const env = environment({
    daily_plan: JSON.stringify([{ start: "08:00", subject: "english" }]),
  });
  env.scheduled.set("old-3", {
    identifier: "old-3",
    content: { title: "学习提醒" },
    trigger: { type: "daily", hour: 7, minute: 57 },
  });
  env.scheduled.set("old-2", {
    identifier: "old-2",
    content: { title: "即将开始" },
    trigger: { type: "daily", hour: 7, minute: 58 },
  });
  env.scheduled.set("timer", {
    identifier: "timer",
    content: { title: "学习完成" },
    trigger: { type: "timeInterval", seconds: 600 },
  });
  const n = env.load("src/notify.js");
  await Promise.all([n.syncPlanNotifications(), n.syncPlanNotifications()]);
  const plans = [...env.scheduled.values()].filter(
    (item) => item.trigger.type === "daily",
  );
  assert.equal(plans.length, 1);
  assert.equal(plans[0].trigger.hour, 7);
  assert.equal(plans[0].trigger.minute, 58);
  assert.ok(env.scheduled.has("timer"));
});
test("same-minute plans merge and midnight reminders roll to the previous day", async () => {
  const env = environment({
    daily_plan: JSON.stringify([
      { start: "00:01", subject: "english" },
      { start: "00:01", subject: "math" },
      { start: "25:30" },
      { start: "08:80" },
    ]),
  });
  await env.load("src/notify.js").syncPlanNotifications();
  const [item] = [...env.scheduled.values()];
  assert.equal(env.scheduled.size, 1);
  assert.equal(item.trigger.hour, 23);
  assert.equal(item.trigger.minute, 59);
  assert.match(item.content.body, /英语.*数学/);
});
