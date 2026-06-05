import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../constants';

const RADIUS = 100;
const STROKE_WIDTH = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE_WIDTH) * 2;

export default function TimerCircle({ timeLeft, totalTime, modeColor, label }) {
  const progress = totalTime > 0 ? 1 - timeLeft / totalTime : 0;
  const strokeDashoffset = CIRCUMFERENCE * progress;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
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
        {/* Progress circle */}
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
      </Svg>
      <View style={styles.content}>
        <Text style={styles.time}>{timeStr}</Text>
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
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
    letterSpacing: 3,
  },
  label: {
    fontSize: 14,
    color: COLORS.text2,
    marginTop: 4,
  },
});
