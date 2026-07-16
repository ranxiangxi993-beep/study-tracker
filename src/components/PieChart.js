import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line, Text as SvgText, Circle } from "react-native-svg";
import { SUBJECTS, COLORS } from "../constants";
import { formatDuration } from "../storage";

const VB_W = 360;
const VB_H = 276;
const CX = VB_W / 2;
const CY = 136;
const OUTER_R = 68;
const INNER_R = 43;
const ELBOW_R = 91;
const LABEL_TOP = 32;
const LABEL_BOTTOM = 240;
const LABEL_GAP = 48;

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
    "Z",
  ].join(" ");
}

function placeSideLabels(sideSlices, isRight) {
  if (!sideSlices.length) return [];

  const sorted = [...sideSlices]
    .map((slice) => ({
      ...slice,
      edge: polarToXY(CX, CY, OUTER_R + 3, slice.midAngle),
      elbow: polarToXY(CX, CY, ELBOW_R, slice.midAngle),
    }))
    .sort((a, b) => a.elbow.y - b.elbow.y);

  const available = LABEL_BOTTOM - LABEL_TOP;
  const gap =
    sorted.length > 1
      ? Math.min(LABEL_GAP, available / (sorted.length - 1))
      : 0;
  const naturalStart =
    sorted.length > 1
      ? Math.max(
          LABEL_TOP,
          Math.min(sorted[0].elbow.y, LABEL_BOTTOM - gap * (sorted.length - 1)),
        )
      : Math.max(LABEL_TOP, Math.min(sorted[0].elbow.y, LABEL_BOTTOM));

  const positions = sorted.map((slice, index) =>
    Math.max(
      naturalStart + index * gap,
      Math.min(slice.elbow.y, LABEL_BOTTOM - (sorted.length - 1 - index) * gap),
    ),
  );

  for (let i = 1; i < positions.length; i += 1) {
    positions[i] = Math.max(positions[i], positions[i - 1] + gap);
  }
  for (let i = positions.length - 2; i >= 0; i -= 1) {
    positions[i] = Math.min(positions[i], positions[i + 1] - gap);
  }

  return sorted.map((slice, index) => ({
    ...slice,
    labelY: positions[index],
    textX: isRight ? 280 : 80,
    lineEndX: isRight ? 271 : 89,
    anchor: isRight ? "start" : "end",
  }));
}

export default function PieChart({ data, totalSec }) {
  const entries = Object.entries(SUBJECTS)
    .map(([key, subj]) => ({ key, ...subj, seconds: data[key] || 0 }))
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  if (entries.length === 0 || !totalSec) {
    return (
      <View style={styles.empty} accessibilityRole="text">
        <Text style={styles.emptyTitle}>还没有科目数据</Text>
        <Text style={styles.emptyText}>
          完成一个学习段后，这里会显示科目占比。
        </Text>
      </View>
    );
  }

  let currentAngle = 0;
  const slices = entries.map((entry) => {
    const angle = (entry.seconds / totalSec) * 360;
    const slice = {
      ...entry,
      pct: Math.round((entry.seconds / totalSec) * 100),
      startAngle: currentAngle,
      endAngle:
        currentAngle + (angle >= 360 ? 359.999 : Math.max(angle - 1.1, 0.5)),
      midAngle: currentAngle + angle / 2,
    };
    currentAngle += angle;
    return slice;
  });

  const labels = [
    ...placeSideLabels(
      slices.filter((slice) => slice.midAngle <= 180),
      true,
    ),
    ...placeSideLabels(
      slices.filter((slice) => slice.midAngle > 180),
      false,
    ),
  ];

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`科目占比，总学习时长 ${formatDuration(totalSec)}`}
    >
      <Svg width="100%" height={VB_H} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Path d={donutPath(0, 359.999)} fill="rgba(255,255,255,0.08)" />
        {slices.map((slice) => (
          <Path
            key={slice.key}
            d={donutPath(slice.startAngle, slice.endAngle)}
            fill={slice.color}
            opacity={0.96}
          />
        ))}

        {labels.map((label) => (
          <React.Fragment key={`label-${label.key}`}>
            <Line
              x1={label.edge.x}
              y1={label.edge.y}
              x2={label.elbow.x}
              y2={label.labelY}
              stroke={label.color}
              strokeWidth={1.4}
              opacity={0.88}
            />
            <Line
              x1={label.elbow.x}
              y1={label.labelY}
              x2={label.lineEndX}
              y2={label.labelY}
              stroke={label.color}
              strokeWidth={1.4}
              opacity={0.88}
            />
            <Circle
              cx={label.edge.x}
              cy={label.edge.y}
              r={2.6}
              fill={label.color}
            />
            <SvgText
              x={label.textX}
              y={label.labelY - 4}
              fill={COLORS.text}
              fontSize="11"
              fontWeight="800"
              textAnchor={label.anchor}
            >
              {label.name} {label.pct}%
            </SvgText>
            <SvgText
              x={label.textX}
              y={label.labelY + 13}
              fill={COLORS.text2}
              fontSize="9.5"
              fontWeight="700"
              textAnchor={label.anchor}
            >
              {formatDuration(label.seconds)}
            </SvgText>
          </React.Fragment>
        ))}

        <SvgText
          x={CX}
          y={CY - 3}
          fill={COLORS.text}
          fontSize="17"
          fontWeight="900"
          textAnchor="middle"
        >
          {formatDuration(totalSec)}
        </SvgText>
        <SvgText
          x={CX}
          y={CY + 17}
          fill={COLORS.text2}
          fontSize="10"
          fontWeight="700"
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
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  empty: {
    width: "100%",
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 6,
    color: COLORS.text2,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
