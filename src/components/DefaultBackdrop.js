import React from 'react';
import { View, StyleSheet } from 'react-native';

const verticals = [8, 22, 36, 50, 64, 78, 92];
const horizontals = [10, 23, 36, 49, 62, 75, 88];

export default function DefaultBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />
      <View style={styles.topBand} />
      <View style={styles.sideBand} />
      <View style={styles.field}>
        {verticals.map(left => <View key={`v-${left}`} style={[styles.vLine, { left: `${left}%` }]} />)}
        {horizontals.map(top => <View key={`h-${top}`} style={[styles.hLine, { top: `${top}%` }]} />)}
      </View>
      <View style={styles.blockA} />
      <View style={styles.blockB} />
      <View style={styles.blockC} />
      <View style={styles.lineA} />
      <View style={styles.lineB} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b0d16' },
  topBand: {
    position: 'absolute',
    top: -80,
    left: -60,
    right: -40,
    height: 260,
    transform: [{ rotate: '-8deg' }],
    backgroundColor: 'rgba(255,98,95,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sideBand: {
    position: 'absolute',
    top: 150,
    right: -100,
    width: 220,
    height: 560,
    transform: [{ rotate: '13deg' }],
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.05)',
  },
  field: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.34,
  },
  vLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  blockA: {
    position: 'absolute',
    top: 112,
    left: 24,
    width: 110,
    height: 76,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    transform: [{ rotate: '-5deg' }],
  },
  blockB: {
    position: 'absolute',
    top: 430,
    right: 18,
    width: 150,
    height: 96,
    borderRadius: 20,
    backgroundColor: 'rgba(255,174,66,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.045)',
    transform: [{ rotate: '6deg' }],
  },
  blockC: {
    position: 'absolute',
    bottom: 96,
    left: -34,
    width: 170,
    height: 120,
    borderRadius: 24,
    backgroundColor: 'rgba(39,174,96,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    transform: [{ rotate: '9deg' }],
  },
  lineA: {
    position: 'absolute',
    top: 245,
    left: 28,
    right: 74,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '-10deg' }],
  },
  lineB: {
    position: 'absolute',
    bottom: 150,
    left: 92,
    right: 18,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    transform: [{ rotate: '8deg' }],
  },
});
