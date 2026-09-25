import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { COLORS, SUBJECTS, DEFAULT_GOAL_MINUTES } from "../constants";
import { useBg } from "../../App";
import {
  getStatsInRange,
  getYearlyHeatmap,
  getHistoryInRange,
  getHistoryCountInRange,
  getWeekStats,
  addManualSession,
  updateSessionDuration,
  deleteSession,
  clearManualSessions,
  formatDuration,
} from "../storage";
import {
  dateKey,
  selectedRange,
  heatLevel,
  hoursLabel,
  validStudyDate,
} from "../statsModel";
import {
  PageHeader,
  IconButton,
  Icon,
  Segmented,
  Section,
  ActionButton,
  Sheet,
  ui,
} from "../components/UI";
import DefaultBackdrop from "../components/DefaultBackdrop";
import PieChart from "../components/PieChart";
import SubjectIcon from "../components/SubjectIcon";

const heat = ["#EEF0EF", "#D7E7DF", "#91B9A5", "#EBB473", "#DE8D62"];
const periods = [
  { value: "week", label: "本周" },
  { value: "month", label: "月度" },
  { value: "year", label: "年度" },
];
export default function StatsScreen() {
  const { bgUri } = useBg();
  const [period, setPeriod] = useState("month");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState({ total_sec: 0, subjects: {} });
  const [days, setDays] = useState({});
  const [week, setWeek] = useState([]);
  const [history, setHistory] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [goal, setGoal] = useState(DEFAULT_GOAL_MINUTES);
  const [goalInput, setGoalInput] = useState("2");
  const [goalOpen, setGoalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(dateKey());
  const [subject, setSubject] = useState("english");
  const [minutes, setMinutes] = useState("30");
  const [sign, setSign] = useState("add");
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const seq = useRef(0);
  const saveGuard = useRef(false);
  const moreGuard = useRef(false);
  const range = selectedRange(period, year, month);
  const label =
    period === "week"
      ? "本周"
      : period === "month"
        ? `${year}年${month + 1}月`
        : `${year}年`;
  const load = useCallback(async () => {
    const request = ++seq.current;
    setLoading(true);
    try {
      const r = selectedRange(period, year, month);
      const [summary, heatmap, records, total, weekData, savedGoal] =
        await Promise.all([
          getStatsInRange(r.start, r.end),
          getYearlyHeatmap(period === "week" ? new Date().getFullYear() : year),
          getHistoryInRange(r.start, r.end, 20),
          getHistoryCountInRange(r.start, r.end),
          getWeekStats(),
          AsyncStorage.getItem("daily_goal_minutes"),
        ]);
      if (request !== seq.current) return;
      setStats(summary);
      setDays(
        period === "week"
          ? Object.fromEntries(
              weekData.map((item) => [item.date, item.total_sec]),
            )
          : heatmap,
      );
      setHistory(records);
      setCount(total);
      setWeek(weekData);
      const g = Number(savedGoal) || DEFAULT_GOAL_MINUTES;
      setGoal(g);
      setGoalInput(String(g / 60));
    } catch {
      if (request === seq.current)
        Alert.alert("统计读取失败", "请重新进入统计页重试。");
    } finally {
      if (request === seq.current) setLoading(false);
    }
  }, [period, year, month]);
  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        seq.current++;
      };
    }, [load]),
  );

  const previous = () => {
    if (period === "year") setYear((y) => y - 1);
    else {
      const d = new Date(year, month - 1, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
  };
  const next = () => {
    if (period === "year") setYear((y) => y + 1);
    else {
      const d = new Date(year, month + 1, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
  };
  const canNext =
    period === "year"
      ? year < new Date().getFullYear()
      : new Date(year, month + 1, 1) <= new Date();
  const studied = Object.entries(days).filter(
    ([key, value]) => key >= range.start && key <= range.end && value > 0,
  );
  const achieved = studied.filter(([, value]) => value >= goal * 60).length;
  const maxWeek = Math.max(goal * 60, ...week.map((item) => item.total_sec));

  const openManual = (day = null) => {
    setEdit(null);
    setMinutes("30");
    setSign("add");
    setEntryDate(
      day ||
        (range.start <= dateKey() && range.end >= dateKey()
          ? dateKey()
          : range.start),
    );
    setSelectedDay(null);
    setManualOpen(true);
  };
  const save = async () => {
    if (saveGuard.current) return;
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0 || value > 1440)
      return Alert.alert("请输入 1 到 1440 分钟");
    if (!edit && !validStudyDate(entryDate))
      return Alert.alert(
        "日期无效",
        "请输入有效日期，例如 2026-09-25，不能记录未来日期。",
      );
    saveGuard.current = true;
    setSaving(true);
    try {
      if (edit) await updateSessionDuration(edit.id, value * 60);
      else {
        if (sign === "subtract") {
          const available = await getStatsInRange(entryDate, entryDate);
          if (!(available.subjects[subject] > 0)) {
            Alert.alert("当天没有可扣减时长");
            return;
          }
        }
        await addManualSession(
          subject,
          (sign === "subtract" ? -1 : 1) * value * 60,
          entryDate,
        );
      }
      setManualOpen(false);
      await load();
    } catch (error) {
      Alert.alert("记录未保存", error.message || "请重试。");
    } finally {
      saveGuard.current = false;
      setSaving(false);
    }
  };
  const saveGoal = async () => {
    const value = Number(goalInput.replace(",", "."));
    if (!Number.isFinite(value) || value < 0.5 || value > 24)
      return Alert.alert("请输入 0.5 到 24 h");
    try {
      const min = Math.round(value * 60);
      await AsyncStorage.setItem("daily_goal_minutes", String(min));
      setGoal(min);
      setGoalOpen(false);
    } catch {
      Alert.alert("目标未保存", "请重试。");
    }
  };
  const remove = (session) =>
    Alert.alert(
      "删除学习记录",
      `${session.date} ${SUBJECTS[session.subject]?.name || "学习"}，${formatDuration(session.duration)}`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSession(session.id);
              await load();
            } catch (error) {
              Alert.alert("无法删除", error.message || "请重试。");
            }
          },
        },
      ],
    );
  const loadMore = async () => {
    if (moreGuard.current) return;
    moreGuard.current = true;
    setMoreLoading(true);
    const request = seq.current;
    try {
      const more = await getHistoryInRange(
        range.start,
        range.end,
        20,
        history.length,
      );
      if (request === seq.current) setHistory((items) => [...items, ...more]);
    } catch {
      Alert.alert("读取失败", "请稍后重试。");
    } finally {
      moreGuard.current = false;
      setMoreLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {!bgUri && <DefaultBackdrop />}
      <PageHeader title="学习统计" subtitle="看见每一天的积累">
        <IconButton
          name="plus"
          label="手动记录学习时长"
          onPress={() => openManual()}
        />
      </PageHeader>
      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
      >
        <Segmented options={periods} value={period} onChange={setPeriod} />
        <View style={s.navigation}>
          {period !== "week" && (
            <IconButton name="left" label="上一个统计周期" onPress={previous} />
          )}
          <Text style={s.period}>{label}</Text>
          {period !== "week" && (
            <IconButton
              name="right"
              label="下一个统计周期"
              onPress={next}
              disabled={!canNext}
            />
          )}
        </View>
        <View style={s.overview}>
          <View>
            <Text style={s.overviewCaption}>累计学习</Text>
            <Text style={s.total}>
              {(Math.max(0, stats.total_sec) / 3600).toFixed(1)}
              <Text style={s.unit}> h</Text>
            </Text>
          </View>
          <View style={s.overviewRight}>
            <Text style={s.secondaryValue}>
              {studied.length}
              <Text style={s.unit}> 天</Text>
            </Text>
            <Text style={ui.muted}>有学习记录</Text>
          </View>
        </View>
        <Pressable
          style={s.goalRow}
          onPress={() => {
            setGoalInput(String(goal / 60));
            setGoalOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="设置每日最低学习时长"
        >
          <Icon name="target" size={18} color={COLORS.accent} />
          <Text style={s.goalLabel}>
            每日最低{" "}
            <Text style={s.goalValue}>{Number((goal / 60).toFixed(2))} h</Text>
          </Text>
          <Text style={ui.muted}>达标 {achieved} 天</Text>
          <Icon name="right" size={16} />
        </Pressable>
        {period === "month" && (
          <Section title="学习热力图">
            <MonthGrid
              year={year}
              month={month}
              data={days}
              goal={goal}
              onDay={setSelectedDay}
            />
            <View style={s.legend}>
              {["未学", "起步", "过半", "达标", "超额"].map((text, index) => (
                <View key={text} style={s.legendItem}>
                  <View
                    style={[s.legendBox, { backgroundColor: heat[index] }]}
                  />
                  <Text style={s.legendText}>{text}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}
        {period === "week" && (
          <Section title="每天的投入">
            <View style={s.week}>
              {week.map((item) => (
                <Pressable
                  key={item.date}
                  style={s.weekDay}
                  onPress={() => setSelectedDay(item.date)}
                >
                  <Text style={s.barValue}>
                    {Number((Math.max(0, item.total_sec) / 3600).toFixed(1))}
                  </Text>
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.bar,
                        {
                          height: `${Math.max(2, (item.total_sec / maxWeek) * 100)}%`,
                          backgroundColor:
                            heat[heatLevel(item.total_sec, goal)],
                        },
                      ]}
                    />
                  </View>
                  <Text style={s.weekLabel}>{item.weekday.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.axisUnit}>单位 h</Text>
          </Section>
        )}
        <Section
          title={period === "year" ? "年度科目分布" : "科目分布"}
          action={<Text style={ui.muted}>{count} 条记录</Text>}
        >
          <PieChart data={stats.subjects} totalSec={stats.total_sec} />
        </Section>
        <Section
          title="学习记录"
          action={
            <IconButton
              name="plus"
              label="添加记录"
              onPress={() => openManual()}
            />
          }
        >
          {!history.length ? (
            <View style={s.empty}>
              <Icon name="chart" size={32} />
              <Text style={ui.muted}>
                {loading ? "正在读取" : "这个时间段还没有记录"}
              </Text>
            </View>
          ) : (
            history.map((session) => (
              <View key={session.id} style={s.record}>
                <SubjectIcon subject={session.subject} />
                <View style={{ flex: 1 }}>
                  <Text style={s.recordTitle}>
                    {SUBJECTS[session.subject]?.name || "学习"}
                  </Text>
                  <Text style={s.recordDate}>
                    {session.date.slice(5)}
                    {session.manual ? " · 手动记录" : ""}
                  </Text>
                </View>
                <Text
                  style={[
                    s.recordTime,
                    session.duration < 0 && { color: COLORS.lock },
                  ]}
                >
                  {formatDuration(session.duration)}
                </Text>
                <IconButton
                  name="edit"
                  label={`编辑${session.date}记录`}
                  onPress={() => {
                    setEdit(session);
                    setMinutes(String(Math.abs(session.duration) / 60));
                    setManualOpen(true);
                  }}
                />
                <IconButton
                  name="delete"
                  label={`删除${session.date}记录`}
                  onPress={() => remove(session)}
                />
              </View>
            ))
          )}
          {history.length < count && (
            <ActionButton
              secondary
              title={moreLoading ? "读取中" : "更多记录"}
              disabled={moreLoading}
              onPress={loadMore}
            />
          )}
        </Section>
      </ScrollView>
      <Sheet
        visible={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="每日最低学习时长"
      >
        <View style={s.goalEditor}>
          <IconButton
            name="minus"
            label="减少半小时"
            onPress={() =>
              setGoalInput(
                String(Math.max(0.5, (Number(goalInput) || 0.5) - 0.5)),
              )
            }
          />
          <TextInput
            value={goalInput}
            onChangeText={setGoalInput}
            style={[ui.input, s.goalInput]}
            keyboardType="decimal-pad"
            accessibilityLabel="每日最低学习小时数"
          />
          <Text style={s.unit}>h</Text>
          <IconButton
            name="plus"
            label="增加半小时"
            onPress={() =>
              setGoalInput(String(Math.min(24, (Number(goalInput) || 0) + 0.5)))
            }
          />
        </View>
        <ActionButton title="保存目标" onPress={saveGoal} />
      </Sheet>
      <Sheet
        visible={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay || "学习详情"}
      >
        <Text style={s.dayTotal}>{hoursLabel(days[selectedDay] || 0)}</Text>
        <Text style={[ui.muted, { marginBottom: 24 }]}>
          每日最低 {goal / 60} h ·{" "}
          {(days[selectedDay] || 0) >= goal * 60 ? "已达标" : "未达标"}
        </Text>
        <ActionButton
          title="补录这一天"
          icon="plus"
          onPress={() => openManual(selectedDay)}
        />
      </Sheet>
      <Sheet
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        title={
          edit
            ? edit.duration < 0
              ? "修改扣减时长"
              : "修改记录时长"
            : "手动记录"
        }
      >
        {!edit && (
          <>
            <Segmented
              options={[
                { value: "add", label: "增加" },
                { value: "subtract", label: "扣减" },
              ]}
              value={sign}
              onChange={setSign}
            />
            <Text style={s.fieldLabel}>日期</Text>
            <TextInput
              value={entryDate}
              onChangeText={setEntryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.text2}
              accessibilityLabel="记录日期"
              style={ui.input}
            />
            <Text style={s.fieldLabel}>科目</Text>
            <View style={s.subjects}>
              {Object.entries(SUBJECTS).map(([key, value]) => (
                <Pressable
                  key={key}
                  onPress={() => setSubject(key)}
                  accessibilityRole="radio"
                  accessibilityLabel={value.name}
                  aria-checked={key === subject}
                  accessibilityState={{ checked: key === subject }}
                  style={[
                    s.subject,
                    key === subject && { borderColor: value.color },
                  ]}
                >
                  <SubjectIcon subject={key} size={28} />
                  <Text style={s.subjectText}>{value.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Text style={s.fieldLabel}>学习时长 / min</Text>
        <TextInput
          accessibilityLabel="学习分钟数"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="decimal-pad"
          style={ui.input}
        />
        <View style={{ height: 24 }} />
        <ActionButton
          title={saving ? "保存中" : "保存记录"}
          disabled={saving}
          onPress={save}
        />
        {!edit && (
          <Pressable
            style={s.clearManual}
            onPress={() =>
              Alert.alert(
                "清空所有手动记录",
                "仅删除补录和扣减记录，真实计时记录会保留。",
                [
                  { text: "取消", style: "cancel" },
                  {
                    text: "清空",
                    style: "destructive",
                    onPress: async () => {
                      await clearManualSessions();
                      setManualOpen(false);
                      load();
                    },
                  },
                ],
              )
            }
          >
            <Text style={ui.muted}>清空手动记录</Text>
          </Pressable>
        )}
      </Sheet>
    </View>
  );
}

function MonthGrid({ year, month, data, goal, onDay }) {
  const count = new Date(year, month + 1, 0).getDate();
  const prefix = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells = Array.from(
    { length: Math.ceil((prefix + count) / 7) * 7 },
    (_, i) => (i >= prefix && i < prefix + count ? i - prefix + 1 : null),
  );
  return (
    <View>
      <View style={s.calendarRow}>
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <Text key={day} style={s.calendarWeek}>
            {day}
          </Text>
        ))}
      </View>
      <View style={s.calendar}>
        {cells.map((day, index) => {
          const key = day ? dateKey(new Date(year, month, day)) : "";
          const future = key > dateKey();
          const level = heatLevel(data[key] || 0, goal);
          return (
            <View key={index} style={s.calendarSlot}>
              {day ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${key} 学习${hoursLabel(data[key] || 0)}`}
                  disabled={future}
                  onPress={() => onDay(key)}
                  style={[
                    s.calendarDay,
                    { backgroundColor: future ? "transparent" : heat[level] },
                    key === dateKey() && {
                      borderWidth: 1,
                      borderColor: COLORS.accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.dayNumber,
                      { color: future ? "#899093" : COLORS.text },
                    ]}
                  >
                    {day}
                  </Text>
                  {level >= 3 && <View style={s.achievedDot} />}
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
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
  navigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    minHeight: 44,
  },
  period: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
  overview: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
  },
  overviewCaption: { color: COLORS.text2, fontSize: 12 },
  total: {
    color: COLORS.text,
    fontSize: 42,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    marginTop: 6,
  },
  unit: { color: COLORS.text2, fontSize: 15 },
  overviewRight: { alignItems: "flex-end", gap: 5 },
  secondaryValue: { color: COLORS.text, fontSize: 22 },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 50,
    marginBottom: 16,
  },
  goalLabel: { flex: 1, color: COLORS.text2, fontSize: 12 },
  goalValue: { color: COLORS.text, fontWeight: "600" },
  calendarRow: { flexDirection: "row", marginBottom: 8 },
  calendarWeek: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: COLORS.text2,
    fontSize: 11,
  },
  calendar: { flexDirection: "row", flexWrap: "wrap" },
  calendarSlot: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  calendarDay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  dayNumber: { fontSize: 13, fontWeight: "600" },
  achievedDot: {
    position: "absolute",
    bottom: 5,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.bg,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
    justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendBox: { width: 9, height: 9, borderRadius: 2 },
  legendText: { color: COLORS.text2, fontSize: 10 },
  week: { flexDirection: "row", gap: 12 },
  weekDay: { flex: 1, alignItems: "center" },
  barTrack: {
    width: "100%",
    height: 110,
    justifyContent: "flex-end",
    marginVertical: 10,
  },
  bar: {
    width: "100%",
    maxWidth: 28,
    alignSelf: "center",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barValue: { color: COLORS.text, fontSize: 11 },
  weekLabel: { color: COLORS.text2, fontSize: 11 },
  axisUnit: {
    color: COLORS.text2,
    fontSize: 10,
    textAlign: "right",
    marginTop: 12,
  },
  record: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 74,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  recordTitle: { color: COLORS.text, fontSize: 13 },
  recordDate: { color: COLORS.text2, fontSize: 10, marginTop: 6 },
  recordTime: { color: COLORS.text, fontSize: 11, maxWidth: 80 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 32 },
  goalEditor: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 24,
  },
  goalInput: { width: 86, textAlign: "center", fontSize: 24 },
  dayTotal: { fontSize: 36, color: COLORS.text, marginVertical: 20 },
  fieldLabel: {
    color: COLORS.text2,
    fontSize: 12,
    marginTop: 22,
    marginBottom: 10,
  },
  subjects: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subject: {
    width: "47%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  subjectText: { color: COLORS.text, fontSize: 13 },
  clearManual: { padding: 20, alignItems: "center" },
});
