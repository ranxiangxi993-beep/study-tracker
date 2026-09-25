import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "../constants";
import { dateKey } from "../statsModel";
import {
  EMPTY_ACADEMIC_GOAL,
  GOAL_LIMITS,
  academicGoalError,
  loadAcademicGoal,
  saveAcademicGoal,
  clearAcademicGoal,
} from "../academicGoal";
import { useBg } from "../../App";
import DefaultBackdrop from "../components/DefaultBackdrop";
import {
  PageHeader,
  IconButton,
  Icon,
  Section,
  Sheet,
  ActionButton,
  ui,
} from "../components/UI";

function parseDate(value) {
  const parts = value.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return dateKey(date) === value ? date : null;
}
export default function CountdownScreen({ navigation }) {
  const { bgUri } = useBg();
  const [target, setTarget] = useState("2026-12-20");
  const [start, setStart] = useState(null);
  const [now, setNow] = useState(new Date());
  const [editing, setEditing] = useState(null);
  const [input, setInput] = useState("");
  const [academicGoal, setAcademicGoal] = useState(EMPTY_ACADEMIC_GOAL);
  const [goalDraft, setGoalDraft] = useState(EMPTY_ACADEMIC_GOAL);
  const [goalEditor, setGoalEditor] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [goalLoading, setGoalLoading] = useState(true);
  const [goalSaving, setGoalSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const savingRef = useRef(false);
  const majorRef = useRef(null);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      AsyncStorage.multiGet(["exam_target_date", "kaoyan_study_start"]),
      loadAcademicGoal(),
    ])
      .then(([entries, goal]) => {
        if (!mounted) return;
        setAcademicGoal(goal);
        const saved = Object.fromEntries(entries);
        if (saved.exam_target_date && parseDate(saved.exam_target_date))
          setTarget(saved.exam_target_date);
        if (saved.kaoyan_study_start) {
          const date = new Date(saved.kaoyan_study_start);
          if (Number.isFinite(date.getTime())) setStart(dateKey(date));
        }
      })
      .catch(() => {
        if (mounted) Alert.alert("读取备考目标失败", "请返回后重试。");
      })
      .finally(() => {
        if (mounted) setGoalLoading(false);
      });
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);
  const editGoal = () => {
    setGoalDraft({ ...academicGoal });
    setGoalError("");
    setConfirmClear(false);
    setGoalEditor(true);
  };
  const closeGoal = () => {
    if (!savingRef.current) setGoalEditor(false);
  };
  const updateGoal = async (clear = false) => {
    if (savingRef.current) return;
    const error = clear ? "" : academicGoalError(goalDraft);
    if (error) return setGoalError(error);
    savingRef.current = true;
    setGoalSaving(true);
    setGoalError("");
    try {
      const saved = clear
        ? await clearAcademicGoal()
        : await saveAcademicGoal(goalDraft);
      setAcademicGoal(saved);
      setGoalEditor(false);
    } catch {
      setGoalError("未能保存，请重试。原来的目标不会被替换。");
    } finally {
      savingRef.current = false;
      setGoalSaving(false);
    }
  };
  const targetDate = parseDate(target);
  const today = parseDate(dateKey(now));
  const days = Math.max(0, Math.round((targetDate - today) / 86400000));
  const studied = start
    ? Math.max(0, Math.round((today - parseDate(start)) / 86400000) + 1)
    : 0;
  const progress = start
    ? Math.min(
        100,
        Math.max(
          0,
          ((today - parseDate(start)) /
            Math.max(1, targetDate - parseDate(start))) *
            100,
        ),
      )
    : 0;
  const save = async (kind, value) => {
    const date = parseDate(value);
    if (!date || (kind === "start" && value > dateKey()))
      return Alert.alert("请输入有效日期", "备考开始日期不能晚于今天。");
    try {
      await AsyncStorage.setItem(
        kind === "target" ? "exam_target_date" : "kaoyan_study_start",
        kind === "target" ? value : date.toISOString(),
      );
      if (kind === "target") setTarget(value);
      else setStart(value);
      setEditing(null);
    } catch {
      Alert.alert("日期未能保存");
    }
  };
  const pick = (kind) => {
    const value = kind === "target" ? target : start || dateKey();
    if (Platform.OS === "android")
      DateTimePickerAndroid.open({
        mode: "date",
        value: parseDate(value) || new Date(),
        minimumDate: new Date(2000, 0, 1),
        maximumDate: kind === "start" ? new Date() : new Date(2100, 0, 1),
        onChange: (event, date) => {
          if (event.type === "set" && date) save(kind, dateKey(date));
        },
      });
    else {
      setInput(value);
      setEditing(kind);
    }
  };
  return (
    <View style={{ flex: 1 }}>
      {!bgUri && <DefaultBackdrop />}
      <PageHeader title="备考进度" subtitle="自己的节奏，自己的目标">
        <IconButton
          name="close"
          label="返回专注"
          onPress={() => navigation.goBack()}
        />
      </PageHeader>
      <ScrollView contentContainerStyle={s.body}>
        <Pressable
          style={s.school}
          onPress={editGoal}
          disabled={goalLoading}
          accessibilityRole="button"
          accessibilityLabel="编辑目标院校和专业"
          accessibilityState={{ disabled: goalLoading }}
        >
          <View style={s.schoolIcon}>
            <Icon name="graduation-cap" size={26} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.schoolLabel}>目标院校</Text>
            <Text style={s.schoolName}>
              {goalLoading
                ? "正在读取"
                : academicGoal.university || "设置我的目标院校"}
            </Text>
            {!!academicGoal.major && (
              <Text style={s.major}>{academicGoal.major}</Text>
            )}
          </View>
          <Icon name="edit" size={18} />
        </Pressable>
        <View style={s.hero}>
          <Text style={s.caption}>{days ? "距离目标日" : "已到目标日"}</Text>
          <Text style={s.days}>{days}</Text>
          <Text style={s.daysUnit}>天</Text>
          <Pressable style={s.target} onPress={() => pick("target")}>
            <Icon name="calendar" size={16} />
            <Text style={s.targetText}>{target}</Text>
            <Icon name="edit" size={16} />
          </Pressable>
        </View>
        <Section title="这一路的积累">
          <View style={s.progressRow}>
            <Text style={ui.muted}>已备考</Text>
            <Text style={s.studied}>
              {studied}
              <Text style={s.small}> 天</Text>
            </Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${progress}%` }]} />
          </View>
          <Pressable style={s.start} onPress={() => pick("start")}>
            <Text style={ui.muted}>备考开始日期</Text>
            <Text style={s.date}>{start || "未设置"}</Text>
            <Icon name="right" />
          </Pressable>
        </Section>
        <ActionButton
          title="开始今天的学习"
          icon="play"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
      <Sheet visible={goalEditor} onClose={closeGoal} title="我的升学目标">
        <Text style={s.fieldLabel}>目标院校</Text>
        <TextInput
          style={ui.input}
          value={goalDraft.university}
          onChangeText={(university) => {
            setGoalDraft((value) => ({ ...value, university }));
            setGoalError("");
          }}
          accessibilityLabel="目标院校"
          placeholder="填写院校名称"
          placeholderTextColor={COLORS.text2}
          maxLength={GOAL_LIMITS.university}
          editable={!goalSaving}
          returnKeyType="next"
          onSubmitEditing={() => majorRef.current?.focus()}
        />
        <Text style={s.fieldLabel}>目标专业（选填）</Text>
        <TextInput
          ref={majorRef}
          style={ui.input}
          value={goalDraft.major}
          onChangeText={(major) => {
            setGoalDraft((value) => ({ ...value, major }));
            setGoalError("");
          }}
          accessibilityLabel="目标专业"
          placeholder="填写专业名称或代码"
          placeholderTextColor={COLORS.text2}
          maxLength={GOAL_LIMITS.major}
          editable={!goalSaving}
          returnKeyType="done"
          onSubmitEditing={() => updateGoal()}
        />
        {!!goalError && (
          <Text style={s.error} accessibilityRole="alert">{goalError}</Text>
        )}
        <ActionButton
          title={goalSaving ? "正在保存" : "保存目标"}
          icon="check"
          disabled={goalSaving}
          onPress={() => updateGoal()}
          style={{ marginTop: 24 }}
        />
        {!!academicGoal.university &&
          (confirmClear ? (
            <View style={s.clearConfirmation}>
              <Text style={ui.muted}>清除院校和专业目标？</Text>
              <View style={s.clearActions}>
                <ActionButton
                  secondary
                  title="保留"
                  disabled={goalSaving}
                  onPress={() => setConfirmClear(false)}
                  style={{ flex: 1 }}
                />
                <ActionButton
                  title="确认清除"
                  disabled={goalSaving}
                  onPress={() => updateGoal(true)}
                  style={{ flex: 1, backgroundColor: COLORS.lock }}
                />
              </View>
            </View>
          ) : (
            <Pressable
              style={s.clearGoal}
              onPress={() => setConfirmClear(true)}
              disabled={goalSaving}
              accessibilityRole="button"
            >
              <Icon name="delete" size={16} />
              <Text style={ui.muted}>清除院校目标</Text>
            </Pressable>
          ))}
      </Sheet>
      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "target" ? "目标日期" : "备考开始日期"}
      >
        <TextInput
          style={[ui.input, { marginVertical: 20 }]}
          value={input}
          onChangeText={setInput}
          accessibilityLabel="日期"
          placeholder="YYYY-MM-DD"
          placeholderTextColor={COLORS.text2}
        />
        <ActionButton title="保存日期" onPress={() => save(editing, input)} />
      </Sheet>
    </View>
  );
}
const s = StyleSheet.create({
  body: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  school: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  schoolIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  schoolLabel: { color: COLORS.text2, fontSize: 12, marginBottom: 6 },
  schoolName: { color: COLORS.text, fontSize: 20, lineHeight: 28, fontWeight: "600" },
  major: { color: COLORS.text2, fontSize: 13, lineHeight: 20, marginTop: 5 },
  fieldLabel: { color: COLORS.text, fontSize: 14, marginTop: 18, marginBottom: 10 },
  error: { color: COLORS.lock, fontSize: 13, lineHeight: 20, marginTop: 12 },
  clearGoal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
  },
  clearConfirmation: { marginTop: 20, gap: 12 },
  clearActions: { flexDirection: "row", gap: 12 },
  hero: { alignItems: "center", paddingVertical: 32 },
  caption: { color: COLORS.text2, fontSize: 14 },
  days: {
    color: COLORS.text,
    fontSize: 104,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0,
  },
  daysUnit: { color: COLORS.text2, fontSize: 16 },
  target: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    minHeight: 44,
  },
  targetText: { color: COLORS.text2, fontSize: 14 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  studied: { color: COLORS.text, fontSize: 28 },
  small: { color: COLORS.text2, fontSize: 14 },
  track: {
    height: 5,
    backgroundColor: COLORS.card2,
    borderRadius: 3,
    marginTop: 18,
  },
  fill: { height: "100%", backgroundColor: COLORS.accent, borderRadius: 3 },
  start: { flexDirection: "row", alignItems: "center", minHeight: 66, gap: 10 },
  date: { flex: 1, color: COLORS.text, textAlign: "right", fontSize: 13 },
});
