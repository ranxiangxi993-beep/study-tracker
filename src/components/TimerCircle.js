import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../constants';

const RADIUS = 100;
const STROKE_WIDTH = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE_WIDTH) * 2;

// progress = 圆环要画多少(0~1)，由父组件按 mode 一致算好传入，避免启动/切换时
// timeLeft 与 totalTime 不同步导致的进度条闪烁。
//  · 倒计时：传入 timeLeft/总时长 → 启动即满圈(1)，随时间排空到 0
//  · 正计时：传入 已计时/总时长 → 启动为空(0)，逐渐填满
export default function TimerCircle({ timeLeft, progress = 0, modeColor, label }) {
  const p = Math.min(1, Math.max(0, progress || 0));
  const strokeDashoffset = CIRCUMFERENCE * (1 - p);

  const safeLeft = Math.max(0, Math.floor(timeLeft || 0));
  const minutes = Math.floor(safeLeft / 60);
  const seconds = safeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        {/* Background circle */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={COLORS.card2}
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        {/* Progress circle（p=0 时完全不画，避免“启动即满圈”） */}
        {p > 0 && (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={modeColor}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
      </Svg>
      <View style={styles.content}>
        {/* 时间数字跟随主题色 */}
        <Text style={[styles.time, { color: modeColor }]}>{timeStr}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svg: {
    transform: [{ rotate: '0deg' }],
  },
  content: {
    position: 'absolute',
    alignItems: 'center',
  },
  time: {
    fontSize: 52,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 3,
  },
  label: {
    fontSize: 14,
    color: COLORS.text2,
    marginTop: 4,
  },
});
