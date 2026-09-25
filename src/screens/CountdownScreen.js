import React, { useEffect, useState } from "react";
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
  useEffect(() => {
    AsyncStorage.multiGet(["exam_target_date", "kaoyan_study_start"]).then(
      (entries) => {
        const saved = Object.fromEntries(entries);
        if (saved.exam_target_date && parseDate(saved.exam_target_date))
          setTarget(saved.exam_target_date);
        if (saved.kaoyan_study_start) {
          const date = new Date(saved.kaoyan_study_start);
          if (Number.isFinite(date.getTime())) setStart(dateKey(date));
        }
      },
    );
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
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
        <View style={s.hero}>
          <Icon name="target" size={32} color={COLORS.accent} />
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
  hero: { alignItems: "center", paddingVertical: 40 },
  caption: { color: COLORS.text2, fontSize: 14, marginTop: 24 },
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
