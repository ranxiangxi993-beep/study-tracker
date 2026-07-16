import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TextInput,
  Pressable,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PieChart from "../components/PieChart";
import DefaultBackdrop from "../components/DefaultBackdrop";

import { SUBJECTS, COLORS, DEFAULT_GOAL_MINUTES } from "../constants";
import { useBg } from "../../App";
import {
  getPeriodStats,
  getHistoryInRange,
  getHistoryCountInRange,
  deleteSession,
  addManualSession,
  clearManualSessions,
  formatDuration,
  getWeekStats,
  getYearlyHeatmap,
  getStatsInRange,
  localDate,
  updateSessionDuration,
} from "../storage";

// Month calendar grid
function heatColor(min, goalMin) {
  if (!min) return COLORS.card2;
  const ratio = min / Math.max(1, goalMin);
  if (ratio >= 1.5) return "#e74c3c";
  if (ratio >= 1) return "#f39c12";
  if (ratio >= 0.75) return "#2ecc71";
  if (ratio >= 0.5) return "#1f9d58";
  if (ratio >= 0.25) return "#1a6b3a";
  return "#2a4a3a";
}

function CalendarGrid({ year, month, data, goalMin }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay() || 7; // Mon=1..Sun=7
  const DAYS = ["一", "二", "三", "四", "五", "六", "日"];

  const cells = [];
  for (let i = 1; i < firstDay; i++) cells.push(null); // empty before month start
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, min: Math.floor((data[ds] || 0) / 60) });
  }

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8, alignItems: "center" }}>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {DAYS.map((l) => (
          <Text
            key={l}
            style={{
              width: 36,
              textAlign: "center",
              fontSize: 10,
              color: COLORS.text2,
              fontWeight: "600",
            }}
          >
            {l}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", width: 36 * 7 }}>
        {cells.map((c, i) => (
          <View
            key={i}
            style={{
              width: 34,
              height: 34,
              margin: 1,
              borderRadius: 6,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: c ? heatColor(c.min, goalMin) : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: c
                  ? c.min === 0
                    ? COLORS.text2
                    : "#fff"
                  : "transparent",
                fontWeight: c && c.min > 0 ? "700" : "400",
              }}
            >
              {c ? c.day : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function formatGoalHours(minutes) {
  const min = Math.max(1, parseInt(minutes) || DEFAULT_GOAL_MINUTES);
  const hours = min / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

const PERIODS = [
  { key: "week", label: "本周" },
  { key: "month", label: "月度" },
  { key: "year", label: "年度" },
];

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return { start: localDate(monday), end: localDate(now) };
}

function getSelectedRange(period, year, month) {
  if (period === "week") return getWeekRange();
  if (period === "month") {
    const mm = String(month + 1).padStart(2, "0");
    return {
      start: `${year}-${mm}-01`,
      end: `${year}-${mm}-${new Date(year, month + 1, 0).getDate()}`,
    };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function getSelectedLabel(period, year, month) {
  if (period === "week") return "本周";
  if (period === "month") return `${year}年${month + 1}月`;
  return `${year}年`;
}

// 本周 周一~周日 的 7 个具体日期（用于"本周手动补录"选择落在哪一天）
function getWeekDays() {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1);
  const wk = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return {
      date: localDate(d),
      label: wk[i],
      md: `${d.getMonth() + 1}/${d.getDate()}`,
    };
  });
}

export default function StatsScreen() {
  const { bgUri } = useBg();
  const [period, setPeriod] = useState("week");
  const [stats, setStats] = useState({ total_sec: 0, subjects: {} });
  const [sessions, setSessions] = useState([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [weekData, setWeekData] = useState([]);
  const [heatmapData, setHeatmapData] = useState({});
  const [dailyGoalMin, setDailyGoalMin] = useState(DEFAULT_GOAL_MINUTES);
  const [showGoal, setShowGoal] = useState(false);
  const [goalHoursInput, setGoalHoursInput] = useState(
    String(DEFAULT_GOAL_MINUTES / 60),
  );
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());

  // 手动增减时长
  const [showManual, setShowManual] = useState(false);
  const [manualSubject, setManualSubject] = useState("english");
  const [manualMin, setManualMin] = useState("30");
  const [manualSign, setManualSign] = useState(1); // 1 = 增加, -1 = 扣减
  const [manualPeriod, setManualPeriod] = useState("month"); // 这笔总时长算进哪个区间
  const [manualWeekDay, setManualWeekDay] = useState(localDate()); // 选"本周"时，具体落在哪一天

  // 编辑某条记录的时长
  const [editSession, setEditSession] = useState(null); // 正在编辑的 session
  const [editMin, setEditMin] = useState("0");

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [period, selMonth, selYear]),
  );

  const loadAll = async () => {
    const { start, end } = getSelectedRange(period, selYear, selMonth);
    const [periodStats, hist, count, week, yearly, savedGoal] =
      await Promise.all([
        getStatsInRange(start, end),
        getHistoryInRange(start, end, 20, 0),
        getHistoryCountInRange(start, end),
        getWeekStats(),
        getYearlyHeatmap(selYear),
        AsyncStorage.getItem("daily_goal_minutes"),
      ]);
    const goal = Math.max(30, parseInt(savedGoal) || DEFAULT_GOAL_MINUTES);
    setStats(periodStats);
    setSessions(hist);
    setSessionsTotal(count);
    setPage(0);
    setWeekData(week);
    setHeatmapData(yearly);
    setDailyGoalMin(goal);
    setGoalHoursInput(String(Math.round((goal / 60) * 10) / 10));
  };

  const loadMoreHistory = async () => {
    const nextPage = page + 1;
    const { start, end } = getSelectedRange(period, selYear, selMonth);
    const more = await getHistoryInRange(start, end, 20, nextPage * 20);
    setSessions((prev) => [...prev, ...more]);
    setPage(nextPage);
  };

  const changeMonth = (delta) => {
    const next = new Date(selYear, selMonth + delta, 1);
    setSelYear(next.getFullYear());
    setSelMonth(next.getMonth());
  };

  const saveDailyGoal = async () => {
    const hours = parseFloat(String(goalHoursInput).replace(",", "."));
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) {
      Alert.alert("请输入 0.5 到 24 小时");
      return;
    }
    const minutes = Math.round(hours * 60);
    await AsyncStorage.setItem("daily_goal_minutes", String(minutes));
    setDailyGoalMin(minutes);
    setGoalHoursInput(String(Math.round(hours * 10) / 10));
    setShowGoal(false);
  };

  const handleDelete = (id) => {
    Alert.alert("删除记录", "确定删除吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          await deleteSession(id);
          loadAll();
        },
      },
    ]);
  };

  const PERIOD_LABELS = { week: "本周", month: "本月", year: "本年" };

  // 手动补录只进"区间合计/饼图"，不进柱状图/热力图，所以记到区间起点那天即可
  // （本周→周一 / 本月→1号 / 本年→1月1日），让 getStatsInRange 把它算进该区间合计。
  const periodAnchor = (p) => {
    const now = new Date();
    if (p === "week") {
      const day = now.getDay() || 7;
      const mon = new Date(now);
      mon.setDate(now.getDate() - day + 1);
      return mon;
    }
    if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
    return new Date(now.getFullYear(), 0, 1); // year
  };

  const saveManual = async () => {
    const min = parseInt(manualMin) || 0;
    if (min <= 0) {
      Alert.alert("请输入分钟数");
      return;
    }
    let secs = min * 60;
    if (manualSign === -1) {
      // 扣减只从该区间该科目已有时长里扣，扣到 0 为止，不出现负数
      const ps = await getPeriodStats(manualPeriod);
      const have = ps.subjects?.[manualSubject] || 0;
      if (have <= 0) {
        Alert.alert(
          "无可扣减",
          `${PERIOD_LABELS[manualPeriod]}「${SUBJECTS[manualSubject]?.name}」暂无可扣减的时长`,
        );
        return;
      }
      secs = -Math.min(secs, have);
    }
    // 选"本周"时落到用户指定的那一天（其余区间落到区间起点：1号 / 1月1日）
    const targetDate =
      manualPeriod === "week"
        ? manualWeekDay
        : localDate(periodAnchor(manualPeriod));
    await addManualSession(manualSubject, secs, targetDate);
    setShowManual(false);
    setManualMin("30");
    setManualSign(1);
    setManualPeriod("month");
    setManualWeekDay(localDate());
    loadAll();
  };

  // 保存对某条记录时长的编辑
  const saveEdit = async () => {
    if (!editSession) return;
    const min = parseInt(editMin);
    if (isNaN(min) || min < 0) {
      Alert.alert("请输入分钟数");
      return;
    }
    await updateSessionDuration(editSession.id, min * 60);
    setEditSession(null);
    loadAll();
  };

  const handleClearManual = () => {
    Alert.alert(
      "清空手动补录",
      '将删除所有"手动补录/扣减"的记录（不影响真实计时记录），确定吗？',
      [
        { text: "取消", style: "cancel" },
        {
          text: "清空",
          style: "destructive",
          onPress: async () => {
            const n = await clearManualSessions();
            Alert.alert("已清空", `删除了 ${n} 条手动记录`);
            loadAll();
          },
        },
      ],
    );
  };

  // 分钟数友好提示（几十小时时显示约几小时）
  const manualMinNum = parseInt(manualMin) || 0;
  const manualHourHint =
    manualMinNum >= 60
      ? `（约 ${Math.floor(manualMinNum / 60)} 小时${manualMinNum % 60 ? " " + (manualMinNum % 60) + " 分" : ""}）`
      : "";

  const periodLabel = getSelectedLabel(period, selYear, selMonth);
  const weekDays = getWeekDays();
  const subjectCount = Object.values(stats.subjects || {}).filter(
    (v) => v > 0,
  ).length;

  // Week bar chart data (only show for day/week period)
  const maxWeekSec = Math.max(1, ...weekData.map((d) => d.total_sec));

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      {!bgUri && <DefaultBackdrop />}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>学习统计</Text>
          <Text style={styles.subtitle}>
            {periodLabel} · {sessionsTotal} 条记录
          </Text>
        </View>
        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => setShowManual(true)}
          accessibilityRole="button"
          accessibilityLabel="手动记录学习时长"
        >
          <Text style={styles.manualBtnText}>✏️ 手动记录</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Period Tabs */}
        <View style={styles.periodTabs}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.periodTab,
                period === p.key && styles.periodTabActive,
              ]}
              onPress={() => setPeriod(p.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: period === p.key }}
            >
              <Text
                style={[
                  styles.periodTabText,
                  period === p.key && styles.periodTabTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>
              {formatDuration(stats.total_sec || 0)}
            </Text>
            <Text style={styles.summaryLabel}>{periodLabel}总计</Text>
          </View>
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() => setShowGoal(true)}
            accessibilityRole="button"
            accessibilityLabel={`每日最低学习时长 ${formatGoalHours(dailyGoalMin)}，点击调整`}
          >
            <Text style={styles.summaryValue}>
              {formatGoalHours(dailyGoalMin)}
            </Text>
            <Text style={styles.summaryLabel}>每日最低 · 调整</Text>
          </TouchableOpacity>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{subjectCount}</Text>
            <Text style={styles.summaryLabel}>学习科目</Text>
          </View>
        </View>

        {/* Month navigation keeps month and year in sync across boundaries. */}
        {period === "month" && (
          <View style={styles.nav}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => changeMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="上个月"
            >
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.navTitle}>
              {selYear}年 {selMonth + 1}月
            </Text>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => changeMonth(1)}
              accessibilityRole="button"
              accessibilityLabel="下个月"
            >
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Year Nav */}
        {period === "year" && (
          <View style={styles.nav}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => setSelYear((y) => y - 1)}
              accessibilityRole="button"
              accessibilityLabel="上一年"
            >
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.navTitle}>{selYear}年</Text>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => setSelYear((y) => y + 1)}
              accessibilityRole="button"
              accessibilityLabel="下一年"
            >
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Month heatmap is the primary monthly view. */}
        {period === "month" && (
          <View style={styles.dataSection}>
            <Text style={styles.sectionTitle}>{selMonth + 1}月学习热力图</Text>
            <CalendarGrid
              year={selYear}
              month={selMonth}
              data={heatmapData}
              goalMin={dailyGoalMin}
            />
            <View style={styles.heatLegend}>
              <LegendDot
                color="#1f9d58"
                label={`不足 ${formatGoalHours(dailyGoalMin)}`}
              />
              <LegendDot color="#f39c12" label="达到最低" />
              <LegendDot color="#e74c3c" label="达到 1.5 倍" />
            </View>
          </View>
        )}

        {/* Week bar (for overview) */}
        {period === "week" ? (
          <View style={styles.weekSection}>
            <Text style={styles.sectionTitle}>本周每日</Text>
            <View style={styles.weekGrid}>
              {weekData.map((d, i) => {
                const h = Math.max(
                  3,
                  Math.round((d.total_sec / maxWeekSec) * 50),
                );
                const today =
                  new Date().toDateString() === new Date(d.date).toDateString();
                return (
                  <View key={i} style={[styles.wd, today && styles.wdToday]}>
                    <Text style={styles.wdLabel}>{d.weekday}</Text>
                    <Text style={styles.wdDate}>{d.date.slice(5)}</Text>
                    <View style={styles.wdBarBox}>
                      <View style={[styles.wdBar, { height: h }]} />
                    </View>
                    <Text style={styles.wdTime}>
                      {d.total_sec ? formatDuration(d.total_sec) : "0"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>{periodLabel}科目占比</Text>
          <PieChart data={stats.subjects} totalSec={stats.total_sec} />
        </View>

        {/* Records follow the selected week, month, or year. */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>{periodLabel}记录</Text>
          {sessions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{periodLabel}还没有记录</Text>
            </View>
          ) : (
            sessions.map((s) => {
              const subj = SUBJECTS[s.subject] || {
                icon: "📝",
                name: s.subject || "记录",
                color: COLORS.accent,
              };
              const t = new Date(s.start_time);
              const hh = String(t.getHours()).padStart(2, "0");
              const mm = String(t.getMinutes()).padStart(2, "0");
              return (
                <View key={s.id} style={styles.historyItem}>
                  <View
                    style={[styles.historyDot, { backgroundColor: subj.color }]}
                  />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historySubj}>
                      {subj.icon} {subj.name}
                      {s.manual ? " · 手动" : ""}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {s.date.slice(5)} {hh}:{mm}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.historyDur,
                      s.duration < 0 && { color: COLORS.lock },
                    ]}
                  >
                    {formatDuration(s.duration)}
                  </Text>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => {
                      setEditSession(s);
                      setEditMin(
                        String(Math.max(0, Math.round(s.duration / 60))),
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`编辑 ${subj.name} 记录`}
                  >
                    <Text style={styles.editIconH}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => handleDelete(s.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`删除 ${subj.name} 记录`}
                  >
                    <Text style={styles.delBtn}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          {sessions.length < sessionsTotal && (
            <TouchableOpacity style={styles.loadMore} onPress={loadMoreHistory}>
              <Text style={styles.loadMoreText}>
                加载更多（{sessions.length}/{sessionsTotal}）
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showGoal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowGoal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowGoal(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>每日最低学习时长</Text>
            <Text style={styles.goalCopy}>
              月热力图会按这个目标判断是否达标，单位为小时。
            </Text>
            <View style={styles.goalRow}>
              <TouchableOpacity
                style={styles.goalStep}
                onPress={() =>
                  setGoalHoursInput((value) =>
                    String(Math.max(0.5, (parseFloat(value) || 0.5) - 0.5)),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="减少半小时"
              >
                <Text style={styles.goalStepText}>−</Text>
              </TouchableOpacity>
              <View style={styles.goalInputWrap}>
                <TextInput
                  style={styles.goalInput}
                  value={goalHoursInput}
                  onChangeText={setGoalHoursInput}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  accessibilityLabel="每日最低学习小时数"
                />
                <Text style={styles.goalUnit}>h</Text>
              </View>
              <TouchableOpacity
                style={styles.goalStep}
                onPress={() =>
                  setGoalHoursInput((value) =>
                    String(Math.min(24, (parseFloat(value) || 0) + 0.5)),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="增加半小时"
              >
                <Text style={styles.goalStepText}>＋</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.saveGoal}
              onPress={saveDailyGoal}
              accessibilityRole="button"
            >
              <Text style={styles.saveManualText}>保存目标</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 手动记录 Modal */}
      <Modal
        visible={showManual}
        animationType="slide"
        transparent
        onRequestClose={() => setShowManual(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowManual(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>✏️ 手动记录时长</Text>

            {/* 增加 / 扣减 */}
            <View style={styles.signRow}>
              {[
                { v: 1, lab: "➕ 增加" },
                { v: -1, lab: "➖ 扣减" },
              ].map((o) => (
                <TouchableOpacity
                  key={o.v}
                  style={[
                    styles.signTab,
                    manualSign === o.v &&
                      (o.v === 1 ? styles.signTabAdd : styles.signTabSub),
                  ]}
                  onPress={() => setManualSign(o.v)}
                >
                  <Text
                    style={[
                      styles.signTabText,
                      manualSign === o.v && { color: "#fff" },
                    ]}
                  >
                    {o.lab}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 算进哪个区间（不堆到今天） */}
            <Text style={styles.mLbl}>算进</Text>
            <View style={styles.signRow}>
              {["week", "month", "year"].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.signTab,
                    manualPeriod === p && styles.periodTabSel,
                  ]}
                  onPress={() => setManualPeriod(p)}
                >
                  <Text
                    style={[
                      styles.signTabText,
                      manualPeriod === p && { color: "#fff" },
                    ]}
                  >
                    {PERIOD_LABELS[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 选"本周"时，可精确到本周的某一天（落到该天，柱状图也会体现） */}
            {manualPeriod === "week" && (
              <>
                <Text style={styles.mLbl}>具体哪一天</Text>
                <View style={styles.weekDayRow}>
                  {weekDays.map((d) => (
                    <TouchableOpacity
                      key={d.date}
                      style={[
                        styles.weekDayChip,
                        manualWeekDay === d.date && styles.weekDayChipSel,
                      ]}
                      onPress={() => setManualWeekDay(d.date)}
                    >
                      <Text
                        style={[
                          styles.weekDayLab,
                          manualWeekDay === d.date && { color: "#fff" },
                        ]}
                      >
                        {d.label}
                      </Text>
                      <Text
                        style={[
                          styles.weekDayMd,
                          manualWeekDay === d.date && { color: "#fff" },
                        ]}
                      >
                        {d.md}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* 科目 */}
            <Text style={styles.mLbl}>科目</Text>
            <View style={styles.subjGrid}>
              {Object.entries(SUBJECTS).map(([key, subj]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.subjChip,
                    manualSubject === key && {
                      backgroundColor: subj.color + "33",
                      borderColor: subj.color,
                    },
                  ]}
                  onPress={() => setManualSubject(key)}
                >
                  <Text
                    style={[
                      styles.subjChipText,
                      manualSubject === key && {
                        color: "#fff",
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {subj.icon} {subj.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 分钟数（补一段时间的总时长，支持几十小时） */}
            <Text style={styles.mLbl}>分钟数 {manualHourHint}</Text>
            <View style={styles.minRow}>
              <TouchableOpacity
                onPress={() =>
                  setManualMin((p) =>
                    String(Math.max(1, (parseInt(p) || 0) - 60)),
                  )
                }
              >
                <Text style={styles.minBtn}>−60</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setManualMin((p) =>
                    String(Math.max(1, (parseInt(p) || 0) - 10)),
                  )
                }
              >
                <Text style={styles.minBtn}>−10</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.minInput}
                keyboardType="numeric"
                value={manualMin}
                onChangeText={setManualMin}
              />
              <TouchableOpacity
                onPress={() =>
                  setManualMin((p) => String((parseInt(p) || 0) + 10))
                }
              >
                <Text style={styles.minBtn}>+10</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setManualMin((p) => String((parseInt(p) || 0) + 60))
                }
              >
                <Text style={styles.minBtn}>+60</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.mHint}>
              {manualSign === 1 ? "将把 " : "将从 "}
              {PERIOD_LABELS[manualPeriod]}「{SUBJECTS[manualSubject]?.name}」
              {manualSign === 1 ? "合计增加 " : "合计扣减 "}
              {manualMinNum} 分钟{manualHourHint}
              {"\n"}
              {manualPeriod === "week"
                ? "（落在所选那天，柱状图、饼图与合计都会更新）"
                : "（落在区间起点那天，饼图与合计都会更新）"}
            </Text>

            <TouchableOpacity
              style={[
                styles.saveManual,
                manualSign === -1 && { backgroundColor: COLORS.lock },
              ]}
              onPress={saveManual}
            >
              <Text style={styles.saveManualText}>
                {manualSign === 1 ? "确认增加" : "确认扣减"}
              </Text>
            </TouchableOpacity>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 10,
              }}
            >
              <TouchableOpacity
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
                onPress={() => setShowManual(false)}
              >
                <Text style={{ color: COLORS.text2 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
                onPress={handleClearManual}
              >
                <Text style={{ color: COLORS.lock, fontSize: 12 }}>
                  🗑 清空全部手动补录
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 编辑某条记录的时长 */}
      <Modal
        visible={!!editSession}
        animationType="fade"
        transparent
        onRequestClose={() => setEditSession(null)}
      >
        <View style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditSession(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>✏️ 编辑时长</Text>
            {editSession && (
              <Text style={styles.mLbl}>
                {SUBJECTS[editSession.subject]?.name || "记录"} ·{" "}
                {editSession.date}
              </Text>
            )}
            <View style={styles.minRow}>
              <TouchableOpacity
                onPress={() =>
                  setEditMin((p) =>
                    String(Math.max(0, (parseInt(p) || 0) - 10)),
                  )
                }
              >
                <Text style={styles.minBtn}>−10</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setEditMin((p) => String(Math.max(0, (parseInt(p) || 0) - 1)))
                }
              >
                <Text style={styles.minBtn}>−1</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.minInput}
                keyboardType="numeric"
                value={editMin}
                onChangeText={setEditMin}
              />
              <TouchableOpacity
                onPress={() =>
                  setEditMin((p) => String((parseInt(p) || 0) + 1))
                }
              >
                <Text style={styles.minBtn}>+1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setEditMin((p) => String((parseInt(p) || 0) + 10))
                }
              >
                <Text style={styles.minBtn}>+10</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.mHint}>
              改成 {parseInt(editMin) || 0} 分钟（柱状图、饼图会同步更新）
            </Text>
            <TouchableOpacity style={styles.saveManual} onPress={saveEdit}>
              <Text style={styles.saveManualText}>保存</Text>
            </TouchableOpacity>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 10,
              }}
            >
              <TouchableOpacity
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
                onPress={() => setEditSession(null)}
              >
                <Text style={{ color: COLORS.text2 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
                onPress={() => {
                  const id = editSession.id;
                  setEditSession(null);
                  handleDelete(id);
                }}
              >
                <Text style={{ color: COLORS.lock, fontSize: 12 }}>
                  🗑 删除这条
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 44 : 56,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  subtitle: {
    color: COLORS.text2,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },
  manualBtn: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  manualBtnText: { fontSize: 12, fontWeight: "600", color: COLORS.text },
  scroll: { flex: 1 },
  periodTabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  periodTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  periodTabActive: { backgroundColor: COLORS.card2 },
  periodTabText: { fontSize: 13, fontWeight: "600", color: COLORS.text2 },
  periodTabTextActive: { color: "#fff" },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  summaryCard: {
    flex: 1,
    minHeight: 68,
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryValue: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  summaryLabel: {
    color: COLORS.text2,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  heatLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 3 },
  legendText: { color: COLORS.text2, fontSize: 10, fontWeight: "700" },
  nav: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  navButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  navArrow: { fontSize: 28, lineHeight: 30, color: COLORS.text },
  navTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    minWidth: 112,
    textAlign: "center",
  },
  dataSection: { paddingHorizontal: 20, marginTop: 18 },
  chartSection: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 0,
  },
  breakdown: { paddingHorizontal: 20, marginTop: 4 },
  breakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownName: { flex: 1, fontSize: 13, color: COLORS.text },
  breakdownTime: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  breakdownPct: {
    fontSize: 12,
    color: COLORS.text2,
    width: 36,
    textAlign: "right",
  },
  weekSection: { paddingHorizontal: 20, marginTop: 18 },
  sectionTitle: {
    alignSelf: "flex-start",
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },
  weekGrid: { flexDirection: "row", gap: 5 },
  wd: {
    flex: 1,
    alignItems: "center",
    backgroundColor: COLORS.card,
    paddingVertical: 8,
    borderRadius: 10,
  },
  wdToday: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.15)" },
  wdLabel: { fontSize: 9, color: COLORS.text2 },
  wdDate: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
    marginVertical: 1,
  },
  wdBarBox: {
    height: 50,
    justifyContent: "flex-end",
    alignItems: "center",
    width: "100%",
  },
  wdBar: {
    width: "60%",
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    minHeight: 3,
  },
  wdTime: { fontSize: 8, color: COLORS.text2, marginTop: 2 },
  historySection: { paddingHorizontal: 20, marginTop: 16 },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 5,
    gap: 10,
  },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyInfo: { flex: 1 },
  historySubj: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  historyMeta: { fontSize: 10, color: COLORS.text2, marginTop: 1 },
  historyDur: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  delBtn: { fontSize: 14, opacity: 0.4 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -8,
  },
  empty: { alignItems: "center", paddingVertical: 20 },
  emptyText: { fontSize: 13, color: COLORS.text2 },
  loadMore: { alignItems: "center", paddingVertical: 14 },
  loadMoreText: { fontSize: 13, color: COLORS.text2 },
  // 手动记录 Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: COLORS.card2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 18,
  },
  sheetT: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 16,
  },
  signRow: {
    flexDirection: "row",
    backgroundColor: COLORS.card2,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 16,
  },
  signTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
  },
  signTabAdd: { backgroundColor: COLORS.success },
  signTabSub: { backgroundColor: COLORS.lock },
  signTabText: { fontSize: 14, fontWeight: "700", color: COLORS.text2 },
  mLbl: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text2,
    marginBottom: 8,
  },
  periodTabSel: { backgroundColor: COLORS.accent },
  weekDayRow: { flexDirection: "row", gap: 4, marginBottom: 16 },
  weekDayChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: "center",
    backgroundColor: COLORS.card2,
  },
  weekDayChipSel: { backgroundColor: COLORS.accent },
  weekDayLab: { fontSize: 11, fontWeight: "700", color: COLORS.text2 },
  weekDayMd: { fontSize: 9, color: COLORS.text2, marginTop: 1 },
  editIconH: { fontSize: 14, opacity: 0.5, paddingHorizontal: 2 },
  subjGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  subjChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: COLORS.card2,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  subjChipText: { fontSize: 13, color: COLORS.text2 },
  minRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
  },
  minBtn: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  minInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    width: 80,
    borderWidth: 1,
    borderColor: COLORS.card2,
  },
  mHint: {
    fontSize: 12,
    color: COLORS.text2,
    textAlign: "center",
    marginBottom: 16,
  },
  saveManual: {
    backgroundColor: COLORS.success,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveManualText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  goalCopy: {
    color: COLORS.text2,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -8,
    marginBottom: 18,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 20,
  },
  goalStep: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  goalStepText: { color: COLORS.text, fontSize: 24, fontWeight: "700" },
  goalInputWrap: {
    minWidth: 112,
    height: 54,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  goalInput: {
    minWidth: 60,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "800",
    textAlign: "right",
  },
  goalUnit: {
    color: COLORS.text2,
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 5,
  },
  saveGoal: {
    minHeight: 48,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
