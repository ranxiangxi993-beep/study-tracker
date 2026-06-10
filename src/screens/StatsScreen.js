import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform,
  Modal, TextInput, Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import PieChart from '../components/PieChart';

import { SUBJECTS, COLORS } from '../constants';
import { useBg } from '../../App';
import {
  getPeriodStats, getHistory, getHistoryCount,
  getHistoryInRange, getHistoryCountInRange,
  deleteSession, addManualSession, clearManualSessions, formatDuration, getWeekStats,
  getYearlyHeatmap, getStatsInRange, localDate, updateSessionDuration,
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

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return { start: localDate(monday), end: localDate(now) };
}

// 本周 周一~周日 的 7 个具体日期（用于"本周手动补录"选择落在哪一天）
function getWeekDays() {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1);
  const wk = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { date: localDate(d), label: wk[i], md: `${d.getMonth() + 1}/${d.getDate()}` };
  });
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

  // 手动增减时长
  const [showManual, setShowManual] = useState(false);
  const [manualSubject, setManualSubject] = useState('english');
  const [manualMin, setManualMin] = useState('30');
  const [manualSign, setManualSign] = useState(1); // 1 = 增加, -1 = 扣减
  const [manualPeriod, setManualPeriod] = useState('month'); // 这笔总时长算进哪个区间
  const [manualWeekDay, setManualWeekDay] = useState(localDate()); // 选"本周"时，具体落在哪一天

  // 编辑某条记录的时长
  const [editSession, setEditSession] = useState(null); // 正在编辑的 session
  const [editMin, setEditMin] = useState('0');

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

  const PERIOD_LABELS = { week: '本周', month: '本月', year: '本年' };

  // 手动补录只进"区间合计/饼图"，不进柱状图/热力图，所以记到区间起点那天即可
  // （本周→周一 / 本月→1号 / 本年→1月1日），让 getStatsInRange 把它算进该区间合计。
  const periodAnchor = (p) => {
    const now = new Date();
    if (p === 'week') { const day = now.getDay() || 7; const mon = new Date(now); mon.setDate(now.getDate() - day + 1); return mon; }
    if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    return new Date(now.getFullYear(), 0, 1); // year
  };

  const saveManual = async () => {
    const min = parseInt(manualMin) || 0;
    if (min <= 0) { Alert.alert('请输入分钟数'); return; }
    let secs = min * 60;
    if (manualSign === -1) {
      // 扣减只从该区间该科目已有时长里扣，扣到 0 为止，不出现负数
      const ps = await getPeriodStats(manualPeriod);
      const have = ps.subjects?.[manualSubject] || 0;
      if (have <= 0) { Alert.alert('无可扣减', `${PERIOD_LABELS[manualPeriod]}「${SUBJECTS[manualSubject]?.name}」暂无可扣减的时长`); return; }
      secs = -Math.min(secs, have);
    }
    // 选"本周"时落到用户指定的那一天（其余区间落到区间起点：1号 / 1月1日）
    const targetDate = manualPeriod === 'week' ? manualWeekDay : localDate(periodAnchor(manualPeriod));
    await addManualSession(manualSubject, secs, targetDate);
    setShowManual(false);
    setManualMin('30');
    setManualSign(1);
    setManualPeriod('month');
    setManualWeekDay(localDate());
    loadAll();
  };

  // 保存对某条记录时长的编辑
  const saveEdit = async () => {
    if (!editSession) return;
    const min = parseInt(editMin);
    if (isNaN(min) || min < 0) { Alert.alert('请输入分钟数'); return; }
    await updateSessionDuration(editSession.id, min * 60);
    setEditSession(null);
    loadAll();
  };

  const handleClearManual = () => {
    Alert.alert('清空手动补录', '将删除所有"手动补录/扣减"的记录（不影响真实计时记录），确定吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => { const n = await clearManualSessions(); Alert.alert('已清空', `删除了 ${n} 条手动记录`); loadAll(); } },
    ]);
  };

  // 分钟数友好提示（几十小时时显示约几小时）
  const manualMinNum = parseInt(manualMin) || 0;
  const manualHourHint = manualMinNum >= 60 ? `（约 ${Math.floor(manualMinNum / 60)} 小时${manualMinNum % 60 ? ' ' + (manualMinNum % 60) + ' 分' : ''}）` : '';

  const periodLabel = PERIODS.find(p => p.key === period)?.label || '';
  const weekDays = getWeekDays();

  // Week bar chart data (only show for day/week period)
  const maxWeekSec = Math.max(1, ...weekData.map(d => d.total_sec));

  return (
    <View style={[styles.container, { backgroundColor: bgUri ? 'transparent' : COLORS.bg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 学习统计 · {sessionsTotal}次</Text>
        <TouchableOpacity style={styles.manualBtn} onPress={() => setShowManual(true)}>
          <Text style={styles.manualBtnText}>✏️ 手动记录</Text>
        </TouchableOpacity>
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

        {/* 本周学习记录（可编辑时长 / 删除，改动后柱状图、饼图同步刷新） */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>📝 本周记录</Text>
          {sessions.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>本周还没有记录</Text></View>
          ) : (
            sessions.map(s => {
              const subj = SUBJECTS[s.subject] || { icon: '📝', name: s.subject || '记录', color: COLORS.accent };
              const t = new Date(s.start_time);
              const hh = String(t.getHours()).padStart(2, '0');
              const mm = String(t.getMinutes()).padStart(2, '0');
              return (
                <View key={s.id} style={styles.historyItem}>
                  <View style={[styles.historyDot, { backgroundColor: subj.color }]} />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historySubj}>{subj.icon} {subj.name}{s.manual ? ' · 手动' : ''}</Text>
                    <Text style={styles.historyMeta}>{s.date.slice(5)} {hh}:{mm}</Text>
                  </View>
                  <Text style={[styles.historyDur, s.duration < 0 && { color: COLORS.lock }]}>{formatDuration(s.duration)}</Text>
                  <TouchableOpacity onPress={() => { setEditSession(s); setEditMin(String(Math.max(0, Math.round(s.duration / 60)))); }}>
                    <Text style={styles.editIconH}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(s.id)}>
                    <Text style={styles.delBtn}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          {sessions.length < sessionsTotal && (
            <TouchableOpacity style={styles.loadMore} onPress={loadMoreHistory}>
              <Text style={styles.loadMoreText}>加载更多（{sessions.length}/{sessionsTotal}）</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 手动记录 Modal */}
      <Modal visible={showManual} animationType="slide" transparent onRequestClose={() => setShowManual(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowManual(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>✏️ 手动记录时长</Text>

            {/* 增加 / 扣减 */}
            <View style={styles.signRow}>
              {[{ v: 1, lab: '➕ 增加' }, { v: -1, lab: '➖ 扣减' }].map(o => (
                <TouchableOpacity key={o.v}
                  style={[styles.signTab, manualSign === o.v && (o.v === 1 ? styles.signTabAdd : styles.signTabSub)]}
                  onPress={() => setManualSign(o.v)}>
                  <Text style={[styles.signTabText, manualSign === o.v && { color: '#fff' }]}>{o.lab}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 算进哪个区间（不堆到今天） */}
            <Text style={styles.mLbl}>算进</Text>
            <View style={styles.signRow}>
              {['week', 'month', 'year'].map(p => (
                <TouchableOpacity key={p}
                  style={[styles.signTab, manualPeriod === p && styles.periodTabSel]}
                  onPress={() => setManualPeriod(p)}>
                  <Text style={[styles.signTabText, manualPeriod === p && { color: '#fff' }]}>{PERIOD_LABELS[p]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 选"本周"时，可精确到本周的某一天（落到该天，柱状图也会体现） */}
            {manualPeriod === 'week' && (
              <>
                <Text style={styles.mLbl}>具体哪一天</Text>
                <View style={styles.weekDayRow}>
                  {weekDays.map(d => (
                    <TouchableOpacity key={d.date}
                      style={[styles.weekDayChip, manualWeekDay === d.date && styles.weekDayChipSel]}
                      onPress={() => setManualWeekDay(d.date)}>
                      <Text style={[styles.weekDayLab, manualWeekDay === d.date && { color: '#fff' }]}>{d.label}</Text>
                      <Text style={[styles.weekDayMd, manualWeekDay === d.date && { color: '#fff' }]}>{d.md}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* 科目 */}
            <Text style={styles.mLbl}>科目</Text>
            <View style={styles.subjGrid}>
              {Object.entries(SUBJECTS).map(([key, subj]) => (
                <TouchableOpacity key={key}
                  style={[styles.subjChip, manualSubject === key && { backgroundColor: subj.color + '33', borderColor: subj.color }]}
                  onPress={() => setManualSubject(key)}>
                  <Text style={[styles.subjChipText, manualSubject === key && { color: '#fff', fontWeight: '700' }]}>
                    {subj.icon} {subj.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 分钟数（补一段时间的总时长，支持几十小时） */}
            <Text style={styles.mLbl}>分钟数 {manualHourHint}</Text>
            <View style={styles.minRow}>
              <TouchableOpacity onPress={() => setManualMin(p => String(Math.max(1, (parseInt(p) || 0) - 60)))}><Text style={styles.minBtn}>−60</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setManualMin(p => String(Math.max(1, (parseInt(p) || 0) - 10)))}><Text style={styles.minBtn}>−10</Text></TouchableOpacity>
              <TextInput style={styles.minInput} keyboardType="numeric" value={manualMin} onChangeText={setManualMin} />
              <TouchableOpacity onPress={() => setManualMin(p => String((parseInt(p) || 0) + 10))}><Text style={styles.minBtn}>+10</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setManualMin(p => String((parseInt(p) || 0) + 60))}><Text style={styles.minBtn}>+60</Text></TouchableOpacity>
            </View>

            <Text style={styles.mHint}>
              {manualSign === 1 ? '将把 ' : '将从 '}{PERIOD_LABELS[manualPeriod]}「{SUBJECTS[manualSubject]?.name}」
              {manualSign === 1 ? '合计增加 ' : '合计扣减 '}{manualMinNum} 分钟{manualHourHint}
              {'\n'}{manualPeriod === 'week'
                ? '（落在所选那天，柱状图、饼图与合计都会更新）'
                : '（落在区间起点那天，饼图与合计都会更新）'}
            </Text>

            <TouchableOpacity style={[styles.saveManual, manualSign === -1 && { backgroundColor: COLORS.lock }]} onPress={saveManual}>
              <Text style={styles.saveManualText}>{manualSign === 1 ? '确认增加' : '确认扣减'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
              <TouchableOpacity style={{ paddingVertical: 6, paddingHorizontal: 4 }} onPress={() => setShowManual(false)}>
                <Text style={{ color: COLORS.text2 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ paddingVertical: 6, paddingHorizontal: 4 }} onPress={handleClearManual}>
                <Text style={{ color: COLORS.lock, fontSize: 12 }}>🗑 清空全部手动补录</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 编辑某条记录的时长 */}
      <Modal visible={!!editSession} animationType="fade" transparent onRequestClose={() => setEditSession(null)}>
        <View style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditSession(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>✏️ 编辑时长</Text>
            {editSession && (
              <Text style={styles.mLbl}>
                {(SUBJECTS[editSession.subject]?.name) || '记录'} · {editSession.date}
              </Text>
            )}
            <View style={styles.minRow}>
              <TouchableOpacity onPress={() => setEditMin(p => String(Math.max(0, (parseInt(p) || 0) - 10)))}><Text style={styles.minBtn}>−10</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setEditMin(p => String(Math.max(0, (parseInt(p) || 0) - 1)))}><Text style={styles.minBtn}>−1</Text></TouchableOpacity>
              <TextInput style={styles.minInput} keyboardType="numeric" value={editMin} onChangeText={setEditMin} />
              <TouchableOpacity onPress={() => setEditMin(p => String((parseInt(p) || 0) + 1))}><Text style={styles.minBtn}>+1</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setEditMin(p => String((parseInt(p) || 0) + 10))}><Text style={styles.minBtn}>+10</Text></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>改成 {parseInt(editMin) || 0} 分钟（柱状图、饼图会同步更新）</Text>
            <TouchableOpacity style={styles.saveManual} onPress={saveEdit}><Text style={styles.saveManualText}>保存</Text></TouchableOpacity>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
              <TouchableOpacity style={{ paddingVertical: 6, paddingHorizontal: 4 }} onPress={() => setEditSession(null)}>
                <Text style={{ color: COLORS.text2 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ paddingVertical: 6, paddingHorizontal: 4 }} onPress={() => { const id = editSession.id; setEditSession(null); handleDelete(id); }}>
                <Text style={{ color: COLORS.lock, fontSize: 12 }}>🗑 删除这条</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  manualBtn: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18 },
  manualBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
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
  // 手动记录 Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  handle: { width: 36, height: 4, backgroundColor: COLORS.card2, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetT: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  signRow: { flexDirection: 'row', backgroundColor: COLORS.card2, borderRadius: 12, padding: 4, gap: 4, marginBottom: 16 },
  signTab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  signTabAdd: { backgroundColor: COLORS.success },
  signTabSub: { backgroundColor: COLORS.lock },
  signTabText: { fontSize: 14, fontWeight: '700', color: COLORS.text2 },
  mLbl: { fontSize: 13, fontWeight: '600', color: COLORS.text2, marginBottom: 8 },
  periodTabSel: { backgroundColor: COLORS.accent },
  weekDayRow: { flexDirection: 'row', gap: 4, marginBottom: 16 },
  weekDayChip: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center', backgroundColor: COLORS.card2 },
  weekDayChipSel: { backgroundColor: COLORS.accent },
  weekDayLab: { fontSize: 11, fontWeight: '700', color: COLORS.text2 },
  weekDayMd: { fontSize: 9, color: COLORS.text2, marginTop: 1 },
  editIconH: { fontSize: 14, opacity: 0.5, paddingHorizontal: 2 },
  subjGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  subjChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: COLORS.card2, borderWidth: 1.5, borderColor: 'transparent' },
  subjChipText: { fontSize: 13, color: COLORS.text2 },
  minRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 },
  minBtn: { fontSize: 15, fontWeight: '700', color: COLORS.accent, paddingHorizontal: 8, paddingVertical: 6 },
  minInput: { backgroundColor: COLORS.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center', width: 80, borderWidth: 1, borderColor: COLORS.card2 },
  mHint: { fontSize: 12, color: COLORS.text2, textAlign: 'center', marginBottom: 16 },
  saveManual: { backgroundColor: COLORS.success, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveManualText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
