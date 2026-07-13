import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { SUBJECTS, COLORS } from '../constants';
import { formatDuration } from '../storage';

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 86;
const INNER_R = 58;

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutPath(startA, endA) {
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
}

export default function PieChart({ data, totalSec }) {
  const entries = Object.entries(SUBJECTS)
    .map(([key, subj]) => ({
      key,
      ...subj,
      seconds: data[key] || 0,
    }))
    .filter(e => e.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  if (entries.length === 0 || !totalSec) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyText}>暂无数据，开始计时吧</Text>
      </View>
    );
  }

  let currentAngle = 0;
  const slices = entries.map(entry => {
    const angle = (entry.seconds / totalSec) * 360;
    const pct = Math.round((entry.seconds / totalSec) * 100);
    const slice = {
      ...entry,
      pct,
      startAngle: currentAngle,
      endAngle: currentAngle + (angle >= 360 ? 359.999 : Math.max(angle - 1.2, 0.5)),
    };
    currentAngle += angle;
    return slice;
  });

  return (
    <View style={styles.container}>
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Path
            d={donutPath(0, 359.999)}
            fill="rgba(255,255,255,0.08)"
          />
          {slices.map(slice => (
            <Path
              key={slice.key}
              d={donutPath(slice.startAngle, slice.endAngle)}
              fill={slice.color}
              opacity={0.96}
            />
          ))}
          <SvgText
            x={CX} y={CY - 4}
            fill={COLORS.text} fontSize="20" fontWeight="800"
            textAnchor="middle"
          >
            {formatDuration(totalSec)}
          </SvgText>
          <SvgText
            x={CX} y={CY + 17}
            fill={COLORS.text2} fontSize="12" fontWeight="600"
            textAnchor="middle"
          >
            总计
          </SvgText>
        </Svg>
      </View>

      <View style={styles.legend}>
        {slices.map(slice => (
          <View key={`legend-${slice.key}`} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <View style={styles.legendMain}>
              <Text style={styles.legendName} numberOfLines={1}>{slice.icon} {slice.name}</Text>
              <Text style={styles.legendTime}>{formatDuration(slice.seconds)}</Text>
            </View>
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
  chartWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    width: '100%',
    paddingHorizontal: 18,
    marginTop: 2,
    rowGap: 8,
  },
  legendItem: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendMain: {
    flex: 1,
    minWidth: 0,
  },
  legendName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },
  legendTime: {
    color: COLORS.text2,
    fontSize: 10,
    marginTop: 3,
    fontWeight: '700',
  },
  legendPct: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 38,
    textAlign: 'right',
  },
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
