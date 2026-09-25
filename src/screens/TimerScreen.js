import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  AppState,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, SUBJECTS, DEFAULT_GOAL_MINUTES } from "../constants";
import { getTodayStats, getStreak, formatDuration } from "../storage";
import { isLockActive } from "../nativeLock";
import { useBg } from "../../App";
import useStudyTimer from "../useStudyTimer";
import TimerCircle from "../components/TimerCircle";
import DefaultBackdrop from "../components/DefaultBackdrop";
import StudySettings from "../components/StudySettings";
import SubjectIcon from "../components/SubjectIcon";
import { EMPTY_ACADEMIC_GOAL, loadAcademicGoal } from "../academicGoal";
import {
  Icon,
  IconButton,
  PageHeader,
  Section,
  Segmented,
  ActionButton,
  ui,
} from "../components/UI";

const defaults = {
  work: 25,
  short: 5,
  long: 15,
  goal: DEFAULT_GOAL_MINUTES,
  accent: COLORS.accent,
  breakColors: { short: COLORS.success, long: SUBJECTS.english.color },
  strongAlert: false,
  level: "strong",
  bindStudy: true,
};
const modes = [
  { value: "work", label: "学习", icon: "book-open" },
  { value: "short", label: "短休", icon: "coffee" },
  { value: "long", label: "长休", icon: "moon" },
];

export default function TimerScreen({ navigation }) {
  const { bgUri } = useBg();
  const [settings, setSettings] = useState(defaults);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState("work");
  const [subject, setSubject] = useState("english");
  const [countUp, setCountUp] = useState(false);
  const [today, setToday] = useState({});
  const [streak, setStreak] = useState(0);
  const [locked, setLocked] = useState(false);
  const [plan, setPlan] = useState([]);
  const [target, setTarget] = useState("2026-12-20");
  const [academicGoal, setAcademicGoal] = useState(EMPTY_ACADEMIC_GOAL);
  const [date, setDate] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const [stats, days, active, entries, goal] = await Promise.all([
        getTodayStats(),
        getStreak(),
        isLockActive(),
        AsyncStorage.multiGet([
          "custom_durations",
          "daily_goal_minutes",
          "accent_color",
          "break_colors",
          "timer_strong_alert",
          "lock_level",
          "lock_bind_study",
          "daily_plan",
          "exam_target_date",
        ]),
        loadAcademicGoal(),
      ]);
      const data = Object.fromEntries(entries);
      let duration = {};
      let savedPlan = [];
      let breakColors = {};
      try {
        duration = JSON.parse(data.custom_durations || "{}");
        savedPlan = JSON.parse(data.daily_plan || "[]");
        breakColors = JSON.parse(data.break_colors || "{}");
      } catch {}
      setSettings({
        ...defaults,
        ...duration,
        goal: Number(data.daily_goal_minutes) || defaults.goal,
        accent: data.accent_color || defaults.accent,
        breakColors: { ...defaults.breakColors, ...breakColors },
        strongAlert: data.timer_strong_alert === "1",
        level:
          data.lock_level === "normal" ? "medium" : data.lock_level || "strong",
        bindStudy: data.lock_bind_study !== "0",
      });
      setToday(stats);
      setStreak(days);
      setLocked(active);
      setPlan(savedPlan);
      setTarget(data.exam_target_date || "2026-12-20");
      setAcademicGoal(goal);
      setDate(Date.now());
    } catch {
      Alert.alert("读取设置失败", "请稍后重试。");
    }
  }, []);
  const onTimerComplete = useCallback(
    (_timer, natural) => {
      if (natural) setMode("work");
      refresh();
    },
    [refresh],
  );
  const study = useStudyTimer(onTimerComplete);
  const active = study.timer;
  const currentMode = active?.mode || mode;
  const currentSubject = active?.subject || subject;
  const isCountUp = active ? active.countUp : countUp;
  const duration = active?.duration || settings[currentMode] * 60;
  const seconds = active
    ? isCountUp
      ? study.elapsed
      : Math.max(0, duration - study.elapsed)
    : isCountUp
      ? 0
      : duration;
  const color =
    currentMode === "work"
      ? settings.accent
      : settings.breakColors[currentMode];
  const total =
    Object.values(today).reduce((sum, value) => sum + value, 0) +
    (active?.mode === "work" ? study.elapsed : 0);
  const percentage = Math.min(
    100,
    Math.round((total / (settings.goal * 60)) * 100),
  );
  const time = new Date(date);
  const nowMinutes = time.getHours() * 60 + time.getMinutes();
  const next = [...plan]
    .sort((a, b) => a.start.localeCompare(b.start))
    .find((item) => {
      const [h, m] = (item.end || item.start).split(":").map(Number);
      return h * 60 + m > nowMinutes;
    });
  const targetParts = target.split("-").map(Number);
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(targetParts[0], targetParts[1] - 1, targetParts[2]) -
        new Date(time.getFullYear(), time.getMonth(), time.getDate())) /
        86400000,
    ),
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
      const id = setInterval(refresh, 60000);
      return () => clearInterval(id);
    }, [refresh]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    isLockActive().then(setLocked);
  }, [active, study.busy]);

  const changeMode = (value) => {
    if (active)
      return Alert.alert("本段仍在进行", "结束并保存本段后再切换。", [
        { text: "继续本段", style: "cancel" },
        {
          text: "结束并切换",
          onPress: async () => {
            await study.end();
            setMode(value);
          },
        },
      ]);
    setMode(value);
  };
  const start = () =>
    study.start({
      mode,
      subject,
      subjectName: SUBJECTS[subject].name,
      countUp,
      minutes: settings[mode],
      strongAlert: settings.strongAlert,
      bindStudy: settings.bindStudy,
      level: settings.level,
    });
  const activeLockLabel = locked
    ? "专注锁已开启"
    : settings.level === "strong" && settings.bindStudy
      ? active?.paused
        ? "暂停中，专注锁已释放"
        : "学习时自动开启专注锁"
      : "专注锁未开启";

  return (
    <View style={s.root}>
      {!bgUri && <DefaultBackdrop />}
      <PageHeader
        title="研途"
        subtitle={`${time.getMonth() + 1}月${time.getDate()}日  ${["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][time.getDay()]}`}
      >
        <View style={s.streak}>
          <Icon name="flame" size={16} color={COLORS.warning} />
          <Text style={s.streakText}>{streak} 天</Text>
        </View>
        <IconButton
          name="settings"
          label="学习设置"
          onPress={() => setShowSettings(true)}
        />
      </PageHeader>
      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => navigation.navigate("Countdown")}
          accessibilityRole="button"
          accessibilityLabel={
            academicGoal.university
              ? `编辑备考目标：${academicGoal.university}，${academicGoal.major || "未设置专业"}`
              : "设置目标院校与备考日期"
          }
          style={s.examRow}
        >
          <Icon name="graduation-cap" size={23} color={COLORS.accent} />
          <View style={s.schoolSummary}>
            <Text style={s.schoolName} numberOfLines={1}>
              {academicGoal.university || "设置目标院校"}
            </Text>
            <Text style={s.examLabel} numberOfLines={1}>
              {academicGoal.major || "我的备考目标"}
            </Text>
          </View>
          <View style={s.examCountdown}>
            <Text style={s.examLabel}>距目标日</Text>
            <Text style={s.examValue}>
              {daysLeft}
              <Text style={s.examLabel}> 天</Text>
            </Text>
          </View>
          <Icon name="right" size={16} />
        </Pressable>
        <Segmented
          options={modes}
          value={currentMode}
          onChange={changeMode}
          disabled={study.busy}
        />
        <View style={s.subjectRow}>
          {Object.entries(SUBJECTS).map(([key, value]) => (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={value.name}
              aria-checked={currentSubject === key}
              accessibilityState={{
                checked: currentSubject === key,
                disabled: !!active,
              }}
              disabled={!!active}
              onPress={() => setSubject(key)}
              style={[
                s.subject,
                currentSubject === key && {
                  borderColor: value.color + "70",
                  backgroundColor: COLORS.card,
                },
              ]}
            >
              <SubjectIcon subject={key} size={40} />
              <Text
                style={[
                  s.subjectText,
                  currentSubject === key && {
                    color: value.color,
                    fontWeight: "600",
                  },
                ]}
              >
                {value.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.focus}>
          <Pressable
            onPress={() => setCountUp((value) => !value)}
            disabled={!!active}
            accessibilityRole="button"
            accessibilityLabel="切换正计时或倒计时"
            style={s.timerType}
          >
            <Text style={ui.muted}>{isCountUp ? "正计时" : "倒计时"}</Text>
            {!active && <Icon name="right" size={14} />}
          </Pressable>
          <TimerCircle
            timeLeft={seconds}
            progress={isCountUp ? study.elapsed / duration : seconds / duration}
            modeColor={color}
            label={
              !active
                ? currentMode === "work"
                  ? "准备好，就开始"
                  : "给自己一点休息"
                : active.paused
                  ? "已暂停"
                  : currentMode === "work"
                    ? `${SUBJECTS[currentSubject]?.name} · 专注中`
                    : "休息中"
            }
          />
        </View>
        <View style={s.actions}>
          <ActionButton
            style={{ flex: 1, backgroundColor: color }}
            icon={active && !active.paused ? "pause" : "play"}
            title={
              !study.ready
                ? "正在恢复"
                : study.busy
                  ? "处理中"
                  : !active
                    ? currentMode === "work"
                      ? "开始学习"
                      : "开始休息"
                    : active.paused
                      ? "继续专注"
                      : "暂停"
            }
            disabled={study.busy || !study.ready}
            onPress={active && !active.paused ? study.pause : start}
          />
          {active && (
            <ActionButton
              secondary
              title="结束"
              icon="stop"
              disabled={study.busy}
              onPress={() => study.end()}
            />
          )}
        </View>
        <Pressable
          style={s.lockStatus}
          onPress={() => navigation.navigate("Lock")}
        >
          <Icon
            name={locked ? "shield-check" : "shield"}
            size={15}
            color={locked ? COLORS.success : COLORS.text2}
          />
          <Text style={s.lockText}>{activeLockLabel}</Text>
          <Icon name="right" size={14} />
        </Pressable>
        <Section
          title="今日积累"
          action={
            <Pressable
              onPress={() => navigation.navigate("Stats")}
              accessibilityRole="button"
              accessibilityLabel="查看学习统计"
            >
              <Icon name="arrow" />
            </Pressable>
          }
        >
          <View style={s.progressHead}>
            <Text style={s.total}>
              {(Math.max(0, total) / 3600).toFixed(1)}
              <Text style={s.hours}> h</Text>
            </Text>
            <Pressable
              onPress={() => setShowSettings(true)}
              accessibilityRole="button"
              accessibilityLabel="调整每日最低学习时长"
            >
              <Text style={ui.muted}>
                每日最低{" "}
                <Text style={s.goal}>
                  {Number((settings.goal / 60).toFixed(2))} h
                </Text>
                <Text style={ui.muted}> / {percentage}%</Text>
              </Text>
            </Pressable>
          </View>
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                {
                  width: `${percentage}%`,
                  backgroundColor:
                    percentage >= 100 ? COLORS.warning : settings.accent,
                },
              ]}
            />
          </View>
          <Text style={s.progressMeta}>
            {percentage >= 100
              ? "今日已达标"
              : `距离最低目标还差 ${formatDuration(Math.max(0, settings.goal * 60 - total))}`}
          </Text>
        </Section>
        <Section
          title="学习安排"
          action={
            <IconButton
              name="plus"
              label="编辑今日计划"
              onPress={() => navigation.navigate("Schedule")}
            />
          }
        >
          {next ? (
            <Pressable
              style={s.planRow}
              onPress={() => navigation.navigate("Schedule")}
            >
              <Text style={s.planTime}>{next.start}</Text>
              <View
                style={[
                  s.planRule,
                  {
                    backgroundColor:
                      SUBJECTS[next.subject]?.color || COLORS.accent,
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.planName}>
                  {next.customName || SUBJECTS[next.subject]?.name}
                </Text>
                <Text style={s.planMeta}>
                  {next.start} - {next.end}
                </Text>
              </View>
              <Icon name="right" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => navigation.navigate("Schedule")}
              style={s.planRow}
            >
              <Icon name="calendar" />
              <Text style={ui.muted}>
                {plan.length ? "今天的计划时间已结束" : "还没有学习安排"}
              </Text>
              <Icon name="right" />
            </Pressable>
          )}
        </Section>
      </ScrollView>
      <StudySettings
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSaved={setSettings}
        running={!!active}
      />
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1 },
  body: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  streak: { flexDirection: "row", gap: 5, alignItems: "center" },
  streakText: { color: COLORS.text2, fontSize: 12 },
  examRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    marginBottom: 12,
  },
  schoolSummary: { flex: 1, minWidth: 0, gap: 4 },
  schoolName: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  examLabel: { color: COLORS.text2, fontSize: 12 },
  examCountdown: { alignItems: "flex-end", gap: 2, flexShrink: 0 },
  examValue: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  subjectRow: { flexDirection: "row", gap: 6, marginTop: 14 },
  subject: {
    flex: 1,
    minHeight: 70,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 4,
  },
  subjectText: { fontSize: 12, color: COLORS.text2 },
  focus: { alignItems: "center", paddingTop: 6, paddingBottom: 12 },
  timerType: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
    marginBottom: 4,
  },
  actions: { flexDirection: "row", gap: 10 },
  lockStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 50,
    paddingVertical: 10,
  },
  lockText: { color: COLORS.text2, fontSize: 11 },
  progressHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },
  total: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  hours: { color: COLORS.text2, fontSize: 15 },
  goal: { color: COLORS.text },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.card2,
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  progressMeta: { color: COLORS.text2, fontSize: 11, marginTop: 10 },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 52,
  },
  planTime: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  planRule: { width: 2, height: 38 },
  planName: { color: COLORS.text, fontSize: 15 },
  planMeta: { color: COLORS.text2, fontSize: 11, marginTop: 5 },
});
