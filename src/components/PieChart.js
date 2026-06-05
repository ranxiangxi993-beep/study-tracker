import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Text as SvgText, G } from 'react-native-svg';
import { SUBJECTS, COLORS } from '../constants';
import { formatDuration } from '../storage';

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 90;
const INNER_R = 50; // donut hole
const LABEL_LINE = 20; // leader line length
const LABEL_EXT = 40; // horizontal extension

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToXY(cx, cy, r, endAngle);
  const end = polarToXY(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export default function PieChart({ data, totalSec }) {
  const entries = Object.entries(SUBJECTS)
    .map(([key, subj]) => ({
      key,
      ...subj,
      seconds: data[key] || 0,
    }))
    .filter(e => e.seconds > 0);

  if (entries.length === 0) {
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
    const midAngle = currentAngle + angle / 2;
    const pct = Math.round((entry.seconds / totalSec) * 100);
    const slice = {
      ...entry,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      midAngle,
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

  // Calculate leader line endpoints
  const getLeaderPoints = (midAngle) => {
    // Start from middle of the donut ring
    const midR = (OUTER_R + INNER_R) / 2;
    const start = polarToXY(CX, CY, OUTER_R + 4, midAngle);

    // End point extends outward
    const lineEndR = OUTER_R + LABEL_LINE;
    const lineEnd = polarToXY(CX, CY, lineEndR, midAngle);

    // Horizontal extension
    const isRight = midAngle > 180 ? false : true;
    const extX = isRight ? lineEnd.x + LABEL_EXT : lineEnd.x - LABEL_EXT;

    return {
      lineStart: start,
      lineBend: lineEnd,
      labelX: extX,
      labelY: lineEnd.y,
      textAnchor: isRight ? 'start' : 'end',
      alignment: isRight ? 'left' : 'right',
    };
  };

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Slices */}
        {slices.map(slice => (
          <Path
            key={slice.key}
            d={donutPath(slice.startAngle, slice.endAngle)}
            fill={slice.color}
            opacity={0.85}
          />
        ))}

        {/* Leader lines + labels */}
        {slices.map(slice => {
          const pts = getLeaderPoints(slice.midAngle);
          return (
            <G key={`label-${slice.key}`}>
              {/* Leader line */}
              <Line
                x1={pts.lineStart.x} y1={pts.lineStart.y}
                x2={pts.lineBend.x} y2={pts.lineBend.y}
                stroke={COLORS.text2}
                strokeWidth={1}
                opacity={0.6}
              />
              <Line
                x1={pts.lineBend.x} y1={pts.lineBend.y}
                x2={pts.labelX} y2={pts.labelY}
                stroke={COLORS.text2}
                strokeWidth={1}
                opacity={0.6}
              />
              {/* Dot at slice edge */}
              <Path
                d={`M ${pts.lineStart.x - 3} ${pts.lineStart.y}
                    A 3 3 0 1 1 ${pts.lineStart.x + 3} ${pts.lineStart.y}
                    A 3 3 0 1 1 ${pts.lineStart.x - 3} ${pts.lineStart.y}`}
                fill={slice.color}
              />
              {/* Label text */}
              <SvgText
                x={pts.labelX + (pts.textAnchor === 'start' ? 6 : -6)}
                y={pts.labelY - 6}
                fill={COLORS.text}
                fontSize="11"
                fontWeight="600"
                textAnchor={pts.textAnchor}
              >
                {slice.icon} {slice.name}
              </SvgText>
              <SvgText
                x={pts.labelX + (pts.textAnchor === 'start' ? 6 : -6)}
                y={pts.labelY + 8}
                fill={COLORS.text2}
                fontSize="10"
                textAnchor={pts.textAnchor}
              >
                {formatDuration(slice.seconds)} · {slice.pct}%
              </SvgText>
            </G>
          );
        })}

        {/* Center text */}
        <SvgText
          x={CX} y={CY - 6}
          fill={COLORS.text}
          fontSize="16"
          fontWeight="700"
          textAnchor="middle"
        >
          {formatDuration(totalSec)}
        </SvgText>
        <SvgText
          x={CX} y={CY + 12}
          fill={COLORS.text2}
          fontSize="10"
          textAnchor="middle"
        >
          总计
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
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
