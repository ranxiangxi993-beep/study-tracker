import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Text as SvgText, G } from 'react-native-svg';
import { SUBJECTS, COLORS } from '../constants';
import { formatDuration } from '../storage';

// viewBox 比绘图区更宽，给左右标签留出文字空间（避免引出线标签出屏被裁切）
const VB_W = 460;
const VB_H = 300;
const CX = VB_W / 2;   // 230
const CY = VB_H / 2;   // 150
const OUTER_R = 88;
const INNER_R = 56;    // donut hole
const LABEL_LINE = 22; // 引出线斜段长度（加长，标签离环更远更舒展）
const LABEL_EXT = 34;  // 引出线水平段长度（加长）

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
    const midAngle = currentAngle + angle / 2;
    const pct = Math.round((entry.seconds / totalSec) * 100);
    const slice = {
      ...entry,
      startAngle: currentAngle,
      // 留极小缝隙，避免单科 100% 时首尾相接导致整圈不渲染
      endAngle: currentAngle + (angle >= 360 ? 359.999 : angle),
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

  // 引出线端点（线已缩短，标签靠近圆环，留在 viewBox 内）
  const getLeaderPoints = (midAngle) => {
    const start = polarToXY(CX, CY, OUTER_R + 3, midAngle);
    const lineEnd = polarToXY(CX, CY, OUTER_R + LABEL_LINE, midAngle);
    const isRight = midAngle <= 180;
    const extX = isRight ? lineEnd.x + LABEL_EXT : lineEnd.x - LABEL_EXT;
    return {
      lineStart: start,
      lineBend: lineEnd,
      labelX: extX,
      labelY: lineEnd.y,
      textAnchor: isRight ? 'start' : 'end',
    };
  };

  return (
    <View style={styles.container}>
      <Svg width={340} height={222} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        {/* Slices */}
        {slices.map(slice => (
          <Path
            key={slice.key}
            d={donutPath(slice.startAngle, slice.endAngle)}
            fill={slice.color}
            opacity={0.9}
          />
        ))}

        {/* Leader lines + labels */}
        {slices.map(slice => {
          const pts = getLeaderPoints(slice.midAngle);
          const textX = pts.labelX + (pts.textAnchor === 'start' ? 5 : -5);
          return (
            <G key={`label-${slice.key}`}>
              <Line
                x1={pts.lineStart.x} y1={pts.lineStart.y}
                x2={pts.lineBend.x} y2={pts.lineBend.y}
                stroke={COLORS.text2} strokeWidth={1} opacity={0.6}
              />
              <Line
                x1={pts.lineBend.x} y1={pts.lineBend.y}
                x2={pts.labelX} y2={pts.labelY}
                stroke={COLORS.text2} strokeWidth={1} opacity={0.6}
              />
              {/* 切片边缘小圆点 */}
              <Path
                d={`M ${pts.lineStart.x - 3} ${pts.lineStart.y}
                    A 3 3 0 1 1 ${pts.lineStart.x + 3} ${pts.lineStart.y}
                    A 3 3 0 1 1 ${pts.lineStart.x - 3} ${pts.lineStart.y}`}
                fill={slice.color}
              />
              <SvgText
                x={textX} y={pts.labelY - 5}
                fill={COLORS.text} fontSize="12" fontWeight="600"
                textAnchor={pts.textAnchor}
              >
                {slice.icon} {slice.name}
              </SvgText>
              <SvgText
                x={textX} y={pts.labelY + 9}
                fill={COLORS.text2} fontSize="10"
                textAnchor={pts.textAnchor}
              >
                {formatDuration(slice.seconds)} · {slice.pct}%
              </SvgText>
            </G>
          );
        })}

        {/* Center total */}
        <SvgText
          x={CX} y={CY - 5}
          fill={COLORS.text} fontSize="17" fontWeight="700"
          textAnchor="middle"
        >
          {formatDuration(totalSec)}
        </SvgText>
        <SvgText
          x={CX} y={CY + 13}
          fill={COLORS.text2} fontSize="11"
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
