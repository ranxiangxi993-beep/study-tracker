import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Circle } from 'react-native-svg';
import { SUBJECTS, COLORS } from '../constants';
import { formatDuration } from '../storage';

const VB_W = 360;
const VB_H = 260;
const CX = VB_W / 2;
const CY = 122;
const OUTER_R = 76;
const INNER_R = 48;
const LABEL_R = 104;

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

function labelSlot(slice, index, sideIndex, totalOnSide) {
  const isRight = slice.midAngle <= 180;
  const anchor = isRight ? 'start' : 'end';
  const edge = polarToXY(CX, CY, OUTER_R + 2, slice.midAngle);
  const bend = polarToXY(CX, CY, LABEL_R, slice.midAngle);
  const gap = totalOnSide > 4 ? 31 : 36;
  const startY = CY - ((totalOnSide - 1) * gap) / 2;
  const y = Math.max(28, Math.min(220, startY + sideIndex * gap));
  const x = isRight ? 290 : 70;
  const lineEndX = isRight ? x - 8 : x + 8;
  return { ...slice, edge, bend: { x: bend.x, y }, x, y, lineEndX, anchor, index };
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
    const slice = {
      ...entry,
      pct: Math.round((entry.seconds / totalSec) * 100),
      startAngle: currentAngle,
      endAngle: currentAngle + (angle >= 360 ? 359.999 : Math.max(angle - 1.1, 0.5)),
      midAngle: currentAngle + angle / 2,
    };
    currentAngle += angle;
    return slice;
  });

  const rightSlices = slices.filter(s => s.midAngle <= 180).sort((a, b) => a.midAngle - b.midAngle);
  const leftSlices = slices.filter(s => s.midAngle > 180).sort((a, b) => a.midAngle - b.midAngle);
  const labels = [
    ...rightSlices.map((s, i) => labelSlot(s, i, i, rightSlices.length)),
    ...leftSlices.map((s, i) => labelSlot(s, i + rightSlices.length, i, leftSlices.length)),
  ];

  return (
    <View style={styles.container}>
      <Svg width="100%" height={244} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Path d={donutPath(0, 359.999)} fill="rgba(255,255,255,0.08)" />
        {slices.map(slice => (
          <Path
            key={slice.key}
            d={donutPath(slice.startAngle, slice.endAngle)}
            fill={slice.color}
            opacity={0.96}
          />
        ))}

        {labels.map(label => (
          <React.Fragment key={`label-${label.key}`}>
            <Line x1={label.edge.x} y1={label.edge.y} x2={label.bend.x} y2={label.bend.y} stroke={label.color} strokeWidth={1.2} opacity={0.68} />
            <Line x1={label.bend.x} y1={label.bend.y} x2={label.lineEndX} y2={label.y} stroke={label.color} strokeWidth={1.2} opacity={0.68} />
            <Circle cx={label.edge.x} cy={label.edge.y} r={2.8} fill={label.color} />
            <SvgText x={label.x} y={label.y - 5} fill={COLORS.text} fontSize="12" fontWeight="800" textAnchor={label.anchor}>
              {label.icon} {label.name}
            </SvgText>
            <SvgText x={label.x} y={label.y + 11} fill={COLORS.text2} fontSize="10" fontWeight="700" textAnchor={label.anchor}>
              {label.pct}% · {formatDuration(label.seconds)}
            </SvgText>
          </React.Fragment>
        ))}

        <SvgText x={CX} y={CY - 4} fill={COLORS.text} fontSize="18" fontWeight="900" textAnchor="middle">
          {formatDuration(totalSec)}
        </SvgText>
        <SvgText x={CX} y={CY + 16} fill={COLORS.text2} fontSize="11" fontWeight="700" textAnchor="middle">
          总计
        </SvgText>
      </Svg>

      <View style={styles.legend}>
        {slices.map(slice => (
          <View key={`legend-${slice.key}`} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.legendName} numberOfLines={1}>{slice.icon} {slice.name}</Text>
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
    paddingHorizontal: 18,
    marginTop: -2,
    rowGap: 7,
  },
  legendItem: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendName: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },
  legendTime: {
    color: COLORS.text2,
    fontSize: 10,
    fontWeight: '700',
  },
  legendPct: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 34,
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
