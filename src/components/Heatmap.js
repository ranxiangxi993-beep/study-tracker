import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../constants';

const CELL = 11;
const GAP = 2;
const LABELS = ['一', '', '三', '', '五', '', '日'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function getColor(minutes) {
  if (minutes === 0) return COLORS.card2;
  if (minutes < 15) return '#2a4a3a';
  if (minutes < 30) return '#1a6b3a';
  if (minutes < 60) return '#1a8b4a';
  if (minutes < 120) return '#2ecc71';
  if (minutes < 180) return '#ff6b6b';
  return '#e74c3c';
}

function buildYearGrid(data, year) {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const isCurrentYear = targetYear === now.getFullYear();
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = isCurrentYear ? now : new Date(targetYear, 11, 31);
  const firstDay = new Date(yearStart);
  while (firstDay.getDay() !== 1) firstDay.setDate(firstDay.getDate() - 1);

  const weeks = [];
  let currentWeek = [];
  let d = new Date(firstDay);
  while (d <= yearEnd) {
    const dateStr = d.toISOString().slice(0, 10);
    currentWeek.push({ date: dateStr, minutes: Math.floor((data[dateStr] || 0) / 60), month: d.getMonth() });
    if (d.getDay() === 0) { weeks.push([...currentWeek]); currentWeek = []; }
    d.setDate(d.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push([...currentWeek]);

  // Split into H1 (Jan-Jun) and H2 (Jul-Dec)
  // Use the first day within the target year to classify, NOT w[0]
  // (w[0] can be Dec of prev year due to calendar padding)
  const h1Weeks = [];
  const h2Weeks = [];
  weeks.forEach(w => {
    const inYear = w.find(d => d.date >= `${targetYear}-01-01` && d.date <= `${targetYear}-12-31`);
    if (inYear && inYear.month >= 6) h2Weeks.push(w);
    else h1Weeks.push(w);
  });

  return { h1: h1Weeks, h2: h2Weeks };
}

function renderRow(weeks) {
  if (weeks.length === 0) return null;
  return (
    <View style={styles.row}>
      <View style={styles.labelsCol}>
        {LABELS.map((l, i) => (
          <Text key={i} style={[styles.label, { height: CELL + GAP }]}>{l}</Text>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.cells}>
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekCol}>
              {Array.from({ length: 7 }).map((_, di) => {
                const day = week[di];
                return (
                  <View key={di} style={[styles.cell, {
                    backgroundColor: day ? getColor(day.minutes) : 'transparent',
                    width: CELL, height: CELL, marginBottom: GAP,
                  }]} />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export default function Heatmap({ data, year }) {
  const { h1, h2 } = useMemo(() => buildYearGrid(data, year), [data, year]);
  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 4 }}>
        <Text style={{ fontSize: 10, color: COLORS.text2 }}>1-6月</Text>
        <Text style={{ fontSize: 10, color: COLORS.text2 }}>7-12月</Text>
      </View>
      {renderRow(h1)}
      {h2.length > 0 && <View style={{ height: 8 }} />}
      {renderRow(h2)}
      <View style={styles.legend}>
        <Text style={styles.legendText}>少</Text>
        {[15, 30, 60, 120, 180].map(m => (
          <View key={m} style={[styles.legendCell, { backgroundColor: getColor(m) }]} />
        ))}
        <Text style={styles.legendText}>多</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 6, marginTop: 10 },
  row: { flexDirection: 'row', paddingLeft: 2 },
  labelsCol: { marginRight: 2 },
  label: { fontSize: 9, color: COLORS.text2, width: 14, textAlign: 'right' },
  cells: { flexDirection: 'row' },
  weekCol: { marginRight: GAP },
  cell: { borderRadius: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 6, paddingRight: 10 },
  legendText: { fontSize: 9, color: COLORS.text2, marginHorizontal: 2 },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
});
