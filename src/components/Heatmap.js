import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

const CELL = 12;
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

export default function Heatmap({ data }) {
  const { cells, monthLabels } = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Find the first Monday on or before Jan 1
    const firstDay = new Date(yearStart);
    while (firstDay.getDay() !== 1) { // Monday = 1
      firstDay.setDate(firstDay.getDate() - 1);
    }

    const rows = [];
    let currentWeek = [];
    let months = [];
    let lastMonth = -1;
    let weekIndex = 0;

    const d = new Date(firstDay);
    while (d <= now) {
      const dateStr = d.toISOString().slice(0, 10);
      const minutes = Math.floor((data[dateStr] || 0) / 60);

      currentWeek.push({ date: dateStr, minutes, month: d.getMonth() });

      if (d.getMonth() !== lastMonth && d.getDate() <= 7) {
        months.push({ week: weekIndex, month: d.getMonth() });
        lastMonth = d.getMonth();
      }

      if (d.getDay() === 0) { // Sunday → end of week
        rows.push([...currentWeek]);
        currentWeek = [];
        weekIndex++;
      }

      d.setDate(d.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      rows.push(currentWeek);
    }

    return { cells: rows, monthLabels: months };
  }, [data]);

  return (
    <View style={styles.container}>
      <View style={styles.gridRow}>
        {/* Day labels */}
        <View style={styles.labelsCol}>
          {LABELS.map((l, i) => (
            <Text key={i} style={[styles.label, { height: CELL + GAP, lineHeight: CELL + GAP - 2 }]}>
              {l}
            </Text>
          ))}
        </View>

        {/* Heatmap cells */}
        <View style={styles.cells}>
          {cells.map((week, wi) => (
            <View key={wi} style={styles.weekCol}>
              {Array.from({ length: 7 }).map((_, di) => {
                const day = week[di];
                return (
                  <View
                    key={di}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: day ? getColor(day.minutes) : 'transparent',
                        width: CELL, height: CELL, marginBottom: GAP,
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Month labels */}
      <View style={[styles.months, { marginLeft: 24 + GAP }]}>
        {monthLabels.map((m, i) => (
          <Text key={i} style={[styles.monthLabel, { left: m.week * (CELL + GAP) }]}>
            {MONTHS[m.month]}
          </Text>
        ))}
      </View>

      {/* Legend */}
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
  container: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  gridRow: {
    flexDirection: 'row',
  },
  labelsCol: {
    marginRight: 4,
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  label: {
    fontSize: 9,
    color: COLORS.text2,
    width: 14,
    textAlign: 'right',
    marginRight: 4,
  },
  cells: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    flex: 1,
  },
  weekCol: {
    marginRight: GAP,
  },
  cell: {
    borderRadius: 2,
  },
  months: {
    flexDirection: 'row',
    position: 'relative',
    height: 16,
    marginTop: 2,
    marginBottom: 8,
  },
  monthLabel: {
    fontSize: 9,
    color: COLORS.text2,
    position: 'absolute',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 4,
  },
  legendText: {
    fontSize: 9,
    color: COLORS.text2,
    marginHorizontal: 2,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
