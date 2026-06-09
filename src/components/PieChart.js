import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { SUBJECTS, COLORS } from '../constants';
import { formatDuration } from '../storage';

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 88;
const INNER_R = 52; // donut hole

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function PieChart({ data, totalSec }) {
  const entries = Object.entries(SUBJECTS)
    .map(([key, subj]) => ({
      key,
      ...subj,
      seconds: data[key] || 0,
    }))
    .filter(e => e.seconds > 0);

  if (entries.length === 0 || !totalSec) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyText}>暂无数据，开始计时吧</Text>
      </View>
    );
  }

  // Build arcs
  let currentAngle = 0;
  const slices = entries.map(entry => {
    const angle = (entry.seconds / totalSec) * 360;
    const pct = Math.round((entry.seconds / totalSec) * 100);
    const slice = {
      ...entry,
      startAngle: currentAngle,
      // 留一点缝隙，避免单科占满时首尾相接导致整圈不渲染
      endAngle: currentAngle + (angle >= 360 ? 359.999 : angle),
      pct,
    };
    currentAngle += angle;
    return slice;
  });

  // Donut path: outer arc + line to inner arc + inner arc reverse
  const donutPath = (startA, endA) => {
    const outerStart = polarToXY(CX, CY, OUTER_R, endA);
    const outerEnd = polarToXY(CX, CY, OUTER_R, startA);
    const innerStart = polarToXY(CX, CY, INNER_R, endA);
    const innerEnd = polarToXY(CX, CY, INNER_R, startA);
    const large = endA - startA > 180 ? 1 : 0;
    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${OUTER_R} ${OUTER_R} 0 ${large} 0 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${INNER_R} ${INNER_R} 0 ${large} 1 ${innerStart.x} ${innerStart.y}`,
      'Z',
    ].join(' ');
  };

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {slices.map(slice => (
          <Path
            key={slice.key}
            d={donutPath(slice.startAngle, slice.endAngle)}
            fill={slice.color}
            opacity={0.9}
          />
        ))}

        {/* Center total */}
        <SvgText
          x={CX} y={CY - 4}
          fill={COLORS.text}
          fontSize="18"
          fontWeight="700"
          textAnchor="middle"
        >
          {formatDuration(totalSec)}
        </SvgText>
        <SvgText
          x={CX} y={CY + 14}
          fill={COLORS.text2}
          fontSize="11"
          textAnchor="middle"
        >
          总计
        </SvgText>
      </Svg>

      {/* Legend below — always on screen, never clipped */}
      <View style={styles.legend}>
        {slices.map(slice => (
          <View key={slice.key} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.legendName} numberOfLines={1}>
              {slice.icon} {slice.name}
            </Text>
            <Text style={styles.legendTime}>{formatDuration(slice.seconds)}</Text>
            <Text style={styles.legendPct}>{slice.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  legend: {
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 10,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 14, color: COLORS.text },
  legendTime: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  legendPct: { fontSize: 12, color: COLORS.text2, width: 40, textAlign: 'right' },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.text2,
  },
});
