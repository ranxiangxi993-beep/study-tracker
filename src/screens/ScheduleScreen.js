import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBg } from "../../App";
import { SUBJECTS, COLORS } from "../constants";
import { syncPlanNotifications } from "../notify";
import DefaultBackdrop from "../components/DefaultBackdrop";
import SubjectIcon from "../components/SubjectIcon";
import {
  PageHeader,
  IconButton,
  Icon,
  ActionButton,
  Sheet,
  ui,
} from "../components/UI";

const minuteOf = (time) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const clockOf = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export default function ScheduleScreen() {
  const { bgUri } = useBg();
  const [plan, setPlan] = useState([]);
  const [editor, setEditor] = useState(null);
  const [subject, setSubject] = useState("english");
  const [name, setName] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [now, setNow] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const guard = useRef(false);
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem("daily_plan")
        .then((value) => {
          const saved = JSON.parse(value || "[]");
          setPlan(Array.isArray(saved) ? saved : []);
        })
        .catch(() => Alert.alert("计划读取失败"));
      setNow(new Date());
      const id = setInterval(() => setNow(new Date()), 15000);
      return () => clearInterval(id);
    }, []),
  );
  const openEditor = (item = {}) => {
    setSubject(SUBJECTS[item.subject] ? item.subject : "english");
    setName(item.customName || "");
    setStart(item.start || "08:00");
    setEnd(item.end || "09:00");
    setEditor(item);
  };
  const savePlan = async (next) => {
    const sorted = [...next].sort((a, b) => a.start.localeCompare(b.start));
    await AsyncStorage.setItem("daily_plan", JSON.stringify(sorted));
    setPlan(sorted);
    await syncPlanNotifications();
  };
  const save = async () => {
    if (guard.current) return;
    const from = minuteOf(start),
      until = minuteOf(end);
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from)
      return Alert.alert(
        "时间有误",
        "请输入 00:00 至 23:59 之间的时间，结束时间需晚于开始时间。",
      );
    const conflict = plan.find(
      (item) =>
        item.id !== editor?.id &&
        from < minuteOf(item.end) &&
        until > minuteOf(item.start),
    );
    if (conflict)
      return Alert.alert(
        "计划时间重叠",
        `与 ${conflict.start}-${conflict.end} 的${conflict.customName || SUBJECTS[conflict.subject]?.name || "计划"}重叠。`,
      );
    guard.current = true;
    setSaving(true);
    try {
      const item = {
        id:
          editor?.id ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        subject,
        customName: name.trim() || undefined,
        start,
        end,
      };
      await savePlan(
        editor?.id
          ? plan.map((existing) =>
              existing.id === editor.id ? item : existing,
            )
          : [...plan, item],
      );
      setEditor(null);
    } catch {
      Alert.alert("计划未保存", "请重试。");
    } finally {
      guard.current = false;
      setSaving(false);
    }
  };
  const openTime = (value, change) => {
    const date = new Date();
    const minutes = minuteOf(value);
    date.setHours(Math.floor(minutes / 60) || 0, minutes % 60 || 0);
    DateTimePickerAndroid.open({
      value: date,
      mode: "time",
      is24Hour: true,
      onChange: (event, result) => {
        if (event.type === "set" && result)
          change(clockOf(result.getHours() * 60 + result.getMinutes()));
      },
    });
  };
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const ordered = [...plan].sort((a, b) => a.start.localeCompare(b.start));
  const current = ordered.find(
    (item) =>
      currentMinute >= minuteOf(item.start) &&
      currentMinute < minuteOf(item.end),
  );
  const next = ordered.find((item) => minuteOf(item.start) > currentMinute);
  const totalMin = plan.reduce(
    (sum, item) => sum + Math.max(0, minuteOf(item.end) - minuteOf(item.start)),
    0,
  );

  return (
    <View style={{ flex: 1 }}>
      {!bgUri && <DefaultBackdrop />}
      <PageHeader
        title="今日计划"
        subtitle={`${now.getMonth() + 1}月${now.getDate()}日  ·  每日重复`}
      >
        <IconButton name="plus" label="添加计划" onPress={() => openEditor()} />
      </PageHeader>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
      >
        <View style={s.summary}>
          <View>
            <Text style={ui.muted}>计划投入</Text>
            <Text style={s.total}>
              {Number((totalMin / 60).toFixed(1))}
              <Text style={s.unit}> h</Text>
            </Text>
          </View>
          <View style={s.summaryRight}>
            <Text style={s.count}>
              {plan.length}
              <Text style={s.unit}> 段</Text>
            </Text>
            <Text style={ui.muted}>提前 2 分钟提醒</Text>
          </View>
        </View>
        <View style={s.current}>
          <Icon name={current ? "timer" : "calendar"} color={COLORS.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.currentLabel}>
              {current ? "当前安排" : next ? "下一段" : "日程"}
            </Text>
            <Text style={s.currentName}>
              {current
                ? current.customName || SUBJECTS[current.subject]?.name
                : next
                  ? `${next.start}  ${next.customName || SUBJECTS[next.subject]?.name}`
                  : plan.length
                    ? "今日计划时间已结束"
                    : "留一段时间给自己"}
            </Text>
          </View>
          {current && <Text style={s.currentEnd}>至 {current.end}</Text>}
        </View>
        {!ordered.length ? (
          <View style={s.empty}>
            <Icon name="calendar" size={36} />
            <Text style={s.emptyTitle}>今天，从一个学习段开始</Text>
            <ActionButton
              title="添加计划"
              icon="plus"
              onPress={() => openEditor()}
            />
          </View>
        ) : (
          ordered.map((item) => {
            const subj = SUBJECTS[item.subject] || SUBJECTS.english;
            const isNow = item.id === current?.id;
            const isPast = currentMinute >= minuteOf(item.end);
            return (
              <View key={item.id} style={s.slot}>
                <View style={s.times}>
                  <Text style={s.start}>{item.start}</Text>
                  <View style={s.line} />
                  <Text style={s.end}>{item.end}</Text>
                </View>
                <View style={[s.item, isNow && { borderColor: COLORS.accent }]}>
                  <View style={s.itemTop}>
                    <SubjectIcon subject={item.subject} />
                    <Text style={s.itemSubject}>
                      {item.customName || subj.name}
                    </Text>
                  </View>
                  <Text style={s.itemMeta}>
                    {minuteOf(item.end) - minuteOf(item.start)} min ·{" "}
                    {isNow ? "进行中" : isPast ? "时间已过" : "待开始"}
                  </Text>
                  <View style={s.itemActions}>
                    <IconButton
                      name="edit"
                      label={`编辑 ${item.customName || subj.name}`}
                      onPress={() => openEditor(item)}
                    />
                    <IconButton
                      name="delete"
                      label={`删除 ${item.customName || subj.name}`}
                      onPress={() =>
                        Alert.alert(
                          "删除计划",
                          `${item.start} ${item.customName || subj.name}`,
                          [
                            { text: "取消", style: "cancel" },
                            {
                              text: "删除",
                              style: "destructive",
                              onPress: () =>
                                savePlan(
                                  plan.filter(
                                    (existing) => existing.id !== item.id,
                                  ),
                                ),
                            },
                          ],
                        )
                      }
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <Sheet
        visible={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? "编辑计划" : "添加计划"}
      >
        <Text style={s.fieldLabel}>科目</Text>
        <View style={s.subjects}>
          {Object.entries(SUBJECTS).map(([key, subj]) => (
            <Pressable
              key={key}
              onPress={() => setSubject(key)}
              accessibilityRole="radio"
              accessibilityLabel={subj.name}
              aria-checked={subject === key}
              accessibilityState={{ checked: subject === key }}
              style={[s.chip, subject === key && { borderColor: subj.color }]}
            >
              <SubjectIcon subject={key} size={28} />
              <Text style={s.chipText}>{subj.name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.fieldLabel}>学习内容（选填）</Text>
        <TextInput
          accessibilityLabel="学习内容"
          value={name}
          onChangeText={setName}
          maxLength={40}
          placeholder="例如：阅读理解、线性代数"
          placeholderTextColor={COLORS.text2}
          style={ui.input}
        />
        <View style={s.timeInputs}>
          {[
            ["开始", start, setStart],
            ["结束", end, setEnd],
          ].map(([label, value, change]) => (
            <View key={label} style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>{label}时间</Text>
              {Platform.OS === "android" ? (
                <Pressable
                  onPress={() => openTime(value, change)}
                  style={s.timeInput}
                >
                  <Icon name="timer" />
                  <Text style={s.timeValue}>{value}</Text>
                </Pressable>
              ) : (
                <TextInput
                  accessibilityLabel={`${label}时间`}
                  value={value}
                  onChangeText={change}
                  maxLength={5}
                  style={[ui.input, { textAlign: "center" }]}
                />
              )}
            </View>
          ))}
        </View>
        <View style={{ height: 24 }} />
        <ActionButton
          title={saving ? "保存中" : "保存计划"}
          onPress={save}
          disabled={saving}
        />
      </Sheet>
    </View>
  );
}
const s = StyleSheet.create({
  body: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  total: {
    fontSize: 42,
    fontWeight: "500",
    color: COLORS.text,
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  unit: { fontSize: 14, color: COLORS.text2 },
  count: { color: COLORS.text, fontSize: 22 },
  summaryRight: { gap: 8, alignItems: "flex-end" },
  current: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  currentLabel: { color: COLORS.text2, fontSize: 11 },
  currentName: { color: COLORS.text, fontSize: 15, marginTop: 6 },
  currentEnd: { color: COLORS.accent, fontSize: 11 },
  slot: { flexDirection: "row", gap: 16, marginBottom: 16 },
  times: { width: 44, alignItems: "center", paddingVertical: 8 },
  start: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  end: { color: COLORS.text2, fontSize: 11, fontVariant: ["tabular-nums"] },
  line: {
    width: 1,
    flex: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
    minHeight: 18,
  },
  item: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemSubject: { flex: 1, color: COLORS.text, fontSize: 15, lineHeight: 22 },
  itemMeta: { color: COLORS.text2, fontSize: 11, marginTop: 10 },
  itemActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: -10,
    marginTop: 4,
    marginRight: -8,
  },
  empty: { alignItems: "center", gap: 24, paddingVertical: 40 },
  emptyTitle: { color: COLORS.text2, fontSize: 14 },
  fieldLabel: {
    color: COLORS.text2,
    fontSize: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  subjects: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    width: "47%",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  chipText: { color: COLORS.text, fontSize: 13 },
  timeInputs: { flexDirection: "row", gap: 16 },
  timeInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 54,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
  },
  timeValue: {
    fontSize: 22,
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
});
