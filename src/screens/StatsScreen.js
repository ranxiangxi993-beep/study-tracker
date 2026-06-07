import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform,
} from 'react-native';
import Svg, { Circle as SvgCircle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import PieChart from '../components/PieChart';

import { SUBJECTS, COLORS } from '../constants';
import { useBg } from '../../App';
import { nextQuote, getDailyQuote } from '../quotes';
import {
  getPeriodStats, getHistory, getHistoryCount,
  getHistoryInRange, getHistoryCountInRange,
  deleteSession, formatDuration, getWeekStats,
  getYearlyHeatmap, getStatsInRange, localDate,
} from '../storage';

// Month calendar grid
function CalendarGrid({ year, month, data }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay() || 7; // Mon=1..Sun=7
  const DAYS = ['一','二','三','四','五','六','日'];

  const cells = [];
  for (let i = 1; i < firstDay; i++) cells.push(null); // empty before month start
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ day: d, min: Math.floor((data[ds] || 0) / 60) });
  }

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DAYS.map(l => <Text key={l} style={{ width: 36, textAlign: 'center', fontSize: 10, color: COLORS.text2, fontWeight: '600' }}>{l}</Text>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 36 * 7 }}>
        {cells.map((c, i) => (
          <View key={i} style={{
            width: 34, height: 34, margin: 1, borderRadius: 6, justifyContent: 'center', alignItems: 'center',
            backgroundColor: c ? (c.min === 0 ? COLORS.card2 : c.min < 15 ? '#2a4a3a' : c.min < 30 ? '#1a6b3a' : c.min < 60 ? '#1a8b4a' : c.min < 120 ? '#2ecc71' : '#e74c3c') : 'transparent'
          }}>
            <Text style={{ fontSize: 11, color: c ? (c.min === 0 ? COLORS.text2 : '#fff') : 'transparent', fontWeight: c && c.min > 0 ? '700' : '400' }}>
              {c ? c.day : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const PERIODS = [
  { key: 'week',  label: '本周' },
  { key: 'month', label: '月度' },
  { key: 'year',  label: '年度' },
];

const KAOYAN_TARGET = new Date(2026, 11, 20, 9, 0, 0); // 2026-12-20 09:00
const KAOYAN_START  = new Date(2026, 4, 31);            // 2026-05-31 起点

const PHASES = [
  { minDays: 150, label: '基础积累期', color: '#4A90D9' },
  { minDays: 90,  label: '强化提升期', color: '#9B59B6' },
  { minDays: 30,  label: '冲刺备考期', color: '#f39c12' },
  { minDays: 0,   label: '最终决战期', color: '#e74c3c' },
];

function Countdown() {
  const [now, setNow] = useState(new Date());
  const [quote] = useState(() => getDailyQuote());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainMs  = Math.max(0, KAOYAN_TARGET - now);
  const totalMs   = KAOYAN_TARGET - KAOYAN_START;
  const pct       = Math.min(100, Math.max(0, Math.round((1 - remainMs / totalMs) * 100)));
  const days      = Math.floor(remainMs / 86400000);
  const hours     = Math.floor((remainMs % 86400000) / 3600000);
  const mins      = Math.floor((remainMs % 3600000) / 60000);
  const secs      = Math.floor((remainMs % 60000) / 1000);
  const phase     = PHASES.find(p => days >= p.minDays) || PHASES[PHASES.length - 1];

  // SVG arc
  const SZ = 220;
  const CX = SZ / 2, CY = SZ / 2, R = 88;
  const FULL = 2 * Math.PI * R;
  const dash = (pct / 100) * FULL;

  const pad = n => String(n).padStart(2, '0');

  return (
    <View style={cdStyles.card}>
      {/* 顶部标题行 */}
      <View style={cdStyles.header}>
        <Text style={cdStyles.headerLabel}>🎯 2026 考研倒计时</Text>
        <View style={[cdStyles.phasePill, { borderColor: phase.color + '66', backgroundColor: phase.color + '18' }]}>
          <Text style={[cdStyles.phaseText, { color: phase.color }]}>{phase.label}</Text>
        </View>
      </View>

      {/* 弧形进度 + 天数 */}
      <View style={cdStyles.arcWrap}>
        <Svg width={SZ} height={SZ}>
          <Defs>
            <LinearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={phase.color} stopOpacity="1" />
              <Stop offset="100%" stopColor={phase.color} stopOpacity="0.5" />
            </LinearGradient>
          </Defs>
          {/* 背景轨道 */}
          <SvgCircle cx={CX} cy={CY} r={R}
            stroke="rgba(255,255,255,0.07)" strokeWidth={10} fill="none" />
          {/* 进度弧 */}
          <SvgCircle cx={CX} cy={CY} r={R}
            stroke={`url(#arcGrad)`}
            strokeWidth={10} fill="none"
            strokeDasharray={`${dash} ${FULL}`}
            strokeLinecap="round"
            rotation="-90" origin={`${CX}, ${CY}`} />
        </Svg>

        <View style={cdStyles.daysOverlay}>
          <Text style={cdStyles.daysNum}>{days}</Text>
          <Text style={cdStyles.daysUnit}>天</Text>
          <Text style={cdStyles.pctHint}>{pct}% 已走过</Text>
        </View>
      </View>

      {/* 时分秒倒计时 */}
      <View style={cdStyles.timeRow}>
        {[{v: pad(hours), u:'时'}, {v: pad(mins), u:'分'}, {v: pad(secs), u:'秒'}].map(({v, u}, i) => (
          <React.Fragment key={u}>
            {i > 0 && <Text style={cdStyles.timeSep}>:</Text>}
            <View style={cdStyles.timeCell}>
              <Text style={cdStyles.timeVal}>{v}</Text>
              <Text style={cdStyles.timeUnit}>{u}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* 细进度条 */}
      <View style={cdStyles.barWrap}>
        <View style={cdStyles.barTrack}>
          <View style={[cdStyles.barFill, { width: `${pct}%`, backgroundColor: phase.color }]} />
        </View>
        <Text style={cdStyles.barLabel}>距考试还有 {days} 天</Text>
      </View>

      {/* 语录 */}
      <View style={cdStyles.quoteBox}>
        <Text style={cdStyles.quoteText}>「{quote}」</Text>
      </View>
    </View>
  );
}

const cdStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6,
  },
  headerLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  phasePill: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
  },
  phaseText: { fontSize: 10, fontWeight: '700' },
  arcWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  daysOverlay: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center',
  },
  daysNum: {
    fontSize: 76, fontWeight: '900', color: COLORS.text,
    letterSpacing: -3, lineHeight: 82,
  },
  daysUnit: { fontSize: 16, color: COLORS.text2, marginTop: -2 },
  pctHint: { fontSize: 10, color: COLORS.text2, marginTop: 4, opacity: 0.7 },
  timeRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end',
    marginTop: -8, marginBottom: 16, gap: 6,
  },
  timeCell: {
    alignItems: 'center', backgroundColor: COLORS.card2,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, minWidth: 54,
  },
  timeVal: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  timeUnit: { fontSize: 9, color: COLORS.text2, marginTop: 1 },
  timeSep: { fontSize: 16, color: COLORS.text2, marginBottom: 10 },
  barWrap: { paddingHorizontal: 20, marginBottom: 14 },
  barTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 2, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 2 },
  barLabel: { fontSize: 10, color: COLORS.text2, marginTop: 5, textAlign: 'center', opacity: 0.7 },
  quoteBox: {
    marginHorizontal: 16, marginBottom: 18,
    backgroundColor: COLORS.card2, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  quoteText: {
    fontSize: 12, color: COLORS.text2, textAlign: 'center',
    lineHeight: 19, fontStyle: 'italic',
  },
});

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return { start: localDate(monday), end: localDate(now) };
}

export default function StatsScreen() {
  const { bgUri } = useBg();
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState({ total_sec: 0, subjects: {} });
  const [sessions, setSessions] = useState([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [weekData, setWeekData] = useState([]);
  const [heatmapData, setHeatmapData] = useState({});
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [period, selMonth, selYear])
  );

  const loadAll = async () => {
    let periodStats;
    if (period === 'month') {
      const start = `${selYear}-${String(selMonth+1).padStart(2,'0')}-01`;
      const end = `${selYear}-${String(selMonth+1).padStart(2,'0')}-${new Date(selYear, selMonth+1, 0).getDate()}`;
      periodStats = await getStatsInRange(start, end);
    } else if (period === 'year') {
      periodStats = await getStatsInRange(`${selYear}-01-01`, `${selYear}-12-31`);
    } else {
      periodStats = await getPeriodStats(period);
    }

    const { start: wStart, end: wEnd } = getWeekRange();
    const [hist, count, week] = await Promise.all([
      getHistoryInRange(wStart, wEnd, 20, 0),
      getHistoryCountInRange(wStart, wEnd),
      getWeekStats(),
    ]);
    getYearlyHeatmap(selYear).then(setHeatmapData);
    setStats(periodStats);
    setSessions(hist);
    setSessionsTotal(count);
    setPage(0);
    setWeekData(week);
  };

  const loadMoreHistory = async () => {
    const nextPage = page + 1;
    const { start: wStart, end: wEnd } = getWeekRange();
    const more = await getHistoryInRange(wStart, wEnd, 20, nextPage * 20);
    setSessions(prev => [...prev, ...more]);
    setPage(nextPage);
  };

  const handleDelete = (id) => {
    Alert.alert('删除记录', '确定删除吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          await deleteSession(id);
          loadAll();
        },
      },
    ]);
  };

  const periodLabel = PERIODS.find(p => p.key === period)?.label || '';

  // Week bar chart data (only show for day/week period)
  const maxWeekSec = Math.max(1, ...weekData.map(d => d.total_sec));

  return (
    <View style={[styles.container, { backgroundColor: bgUri ? 'transparent' : COLORS.bg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 学习统计 · {sessionsTotal}次</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Period Tabs */}
        <View style={styles.periodTabs}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodTab, period === p.key && styles.periodTabActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodTabText, period === p.key && styles.periodTabTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Month Nav: year row + month row */}
        {period === 'month' && (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <View style={styles.navRow}>
              <TouchableOpacity onPress={() => setSelYear(y => y - 1)}><Text style={styles.navArrow}>◀</Text></TouchableOpacity>
              <Text style={styles.navTitle}>{selYear}年</Text>
              <TouchableOpacity onPress={() => setSelYear(y => y + 1)}><Text style={styles.navArrow}>▶</Text></TouchableOpacity>
            </View>
            <View style={styles.navRow}>
              <TouchableOpacity onPress={() => setSelMonth(m => m === 0 ? 11 : m - 1)}><Text style={styles.navArrow}>◀</Text></TouchableOpacity>
              <Text style={styles.navTitle}>{selMonth + 1}月</Text>
              <TouchableOpacity onPress={() => setSelMonth(m => m === 11 ? 0 : m + 1)}><Text style={styles.navArrow}>▶</Text></TouchableOpacity>
            </View>
          </View>
        )}
        {/* Year Nav */}
        {period === 'year' && (
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => setSelYear(y => y - 1)}><Text style={styles.navArrow}>◀</Text></TouchableOpacity>
            <Text style={styles.navTitle}>{selYear}年</Text>
            <TouchableOpacity onPress={() => setSelYear(y => y + 1)}><Text style={styles.navArrow}>▶</Text></TouchableOpacity>
          </View>
        )}

        {/* Pie Chart */}
        <View style={styles.chartSection}>
          <PieChart data={stats.subjects} totalSec={stats.total_sec} />
        </View>

        {/* Countdown - year view only */}
        {period === 'year' && <Countdown />}

        {/* Month Calendar Grid */}
        {period === 'month' && (
          <CalendarGrid year={selYear} month={selMonth} data={heatmapData} />
        )}

        {/* Week bar (for overview) */}
        {period === 'week' ? (
          <View style={styles.weekSection}>
            <Text style={styles.sectionTitle}>📅 本周每日</Text>
            <View style={styles.weekGrid}>
              {weekData.map((d, i) => {
                const h = Math.max(3, Math.round(d.total_sec / maxWeekSec * 50));
                const today = new Date().toDateString() === new Date(d.date).toDateString();
                return (
                  <View key={i} style={[styles.wd, today && styles.wdToday]}>
                    <Text style={styles.wdLabel}>{d.weekday}</Text>
                    <Text style={styles.wdDate}>{d.date.slice(5)}</Text>
                    <View style={styles.wdBarBox}>
                      <View style={[styles.wdBar, { height: h }]} />
                    </View>
                    <Text style={styles.wdTime}>{d.total_sec ? formatDuration(d.total_sec) : '0'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* History list - only for week */}
        {period === 'week' && (
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>
            📋 {periodLabel}记录 · 共 {sessionsTotal} 条
          </Text>

          {sessions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无学习记录</Text>
            </View>
          ) : (
            sessions.map(s => {
              const subj = SUBJECTS[s.subject];
              const time = s.start_time ? new Date(s.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
              return (
                <View key={s.id} style={styles.historyItem}>
                  <View style={[styles.historyDot, { backgroundColor: subj?.color || COLORS.accent }]} />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historySubj}>{subj?.icon || '📚'} {subj?.name || s.subject}</Text>
                    <Text style={styles.historyMeta}>{s.date} {time}{s.note ? ' · ' + s.note : ''}</Text>
                  </View>
                  <Text style={styles.historyDur}>{formatDuration(s.duration)}</Text>
                  <TouchableOpacity onPress={() => handleDelete(s.id)}>
                    <Text style={styles.delBtn}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {sessions.length < sessionsTotal && (
            <TouchableOpacity style={styles.loadMore} onPress={loadMoreHistory}>
              <Text style={styles.loadMoreText}>加载更多...</Text>
            </TouchableOpacity>
          )}
        </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  scroll: { flex: 1 },
  periodTabs: {
    flexDirection: 'row', marginHorizontal: 20,
    backgroundColor: COLORS.card, borderRadius: 12, padding: 4, gap: 4,
  },
  periodTab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  periodTabActive: { backgroundColor: COLORS.card2 },
  periodTabText: { fontSize: 13, fontWeight: '600', color: COLORS.text2 },
  periodTabTextActive: { color: '#fff' },
  nav: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  navRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginVertical: 2 },
  navArrow: { fontSize: 16, color: COLORS.text2, paddingHorizontal: 8, paddingVertical: 4 },
  navTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, minWidth: 72, textAlign: 'center' },
  chartSection: { alignItems: 'center', paddingTop: 20, paddingBottom: 0 },
  breakdown: { paddingHorizontal: 20, marginTop: 4 },
  breakdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, gap: 8,
  },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownName: { flex: 1, fontSize: 13, color: COLORS.text },
  breakdownTime: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  breakdownPct: { fontSize: 12, color: COLORS.text2, width: 36, textAlign: 'right' },
  weekSection: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text2, marginBottom: 8 },
  weekGrid: { flexDirection: 'row', gap: 5 },
  wd: { flex: 1, alignItems: 'center', backgroundColor: COLORS.card, paddingVertical: 8, borderRadius: 10 },
  wdToday: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  wdLabel: { fontSize: 9, color: COLORS.text2 },
  wdDate: { fontSize: 10, fontWeight: '700', color: COLORS.text, marginVertical: 1 },
  wdBarBox: { height: 50, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  wdBar: { width: '60%', backgroundColor: COLORS.accent, borderRadius: 4, minHeight: 3 },
  wdTime: { fontSize: 8, color: COLORS.text2, marginTop: 2 },
  historySection: { paddingHorizontal: 20, marginTop: 16 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, padding: 12, borderRadius: 12, marginBottom: 5, gap: 10,
  },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyInfo: { flex: 1 },
  historySubj: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  historyMeta: { fontSize: 10, color: COLORS.text2, marginTop: 1 },
  historyDur: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  delBtn: { fontSize: 14, opacity: 0.4 },
  empty: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { fontSize: 13, color: COLORS.text2 },
  loadMore: { alignItems: 'center', paddingVertical: 14 },
  loadMoreText: { fontSize: 13, color: COLORS.text2 },
});
