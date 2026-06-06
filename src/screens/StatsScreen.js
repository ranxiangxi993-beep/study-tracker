import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import PieChart from '../components/PieChart';
import Heatmap from '../components/Heatmap';
import { SUBJECTS, COLORS } from '../constants';
import { useBg } from '../../App';
import {
  getPeriodStats, getHistory, getHistoryCount,
  deleteSession, formatDuration, getWeekStats,
  getYearlyHeatmap, getStatsInRange,
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
  { key: 'day',   label: '今日' },
  { key: 'week',  label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year',  label: '今年' },
];

export default function StatsScreen() {
  const { bgUri } = useBg();
  const [period, setPeriod] = useState('day');
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
    const [hist, count, week] = await Promise.all([
      getHistory(20, 0),
      getHistoryCount(),
      getWeekStats(),
    ]);
    getYearlyHeatmap().then(setHeatmapData);
    setStats(periodStats);
    setSessions(hist);
    setSessionsTotal(count);
    setPage(0);
    setWeekData(week);
  };

  const loadMoreHistory = async () => {
    const nextPage = page + 1;
    const more = await getHistory(20, nextPage * 20);
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

        {/* Month/Year Nav */}
        {period === 'month' && (
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => setSelMonth(m => m === 0 ? 11 : m - 1)}><Text style={styles.navArrow}>◀</Text></TouchableOpacity>
            <Text style={styles.navTitle}>{selMonth + 1}月</Text>
            <TouchableOpacity onPress={() => setSelMonth(m => m === 11 ? 0 : m + 1)}><Text style={styles.navArrow}>▶</Text></TouchableOpacity>
          </View>
        )}
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

        {/* Month Calendar Grid */}
        {period === 'month' && (
          <CalendarGrid year={selYear} month={selMonth} data={heatmapData} />
        )}

        {/* Yearly Heatmap */}
        {period === 'year' && (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>🗓️ {selYear}年学习热力图</Text>
            <Heatmap data={heatmapData} />
          </View>
        )}

        {/* Week bar (for overview) */}
        {period === 'day' || period === 'week' ? (
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

        {/* History list - only for today and week */}
        {(period === 'day' || period === 'week') && (
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
