import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SUBJECTS, COLORS } from '../constants';

export default function SubjectSelector({ activeSubject, onSelect }) {
  const entries = Object.entries(SUBJECTS);
  return (
    <View style={styles.grid}>
      {entries.map(([key, subj]) => {
        const isActive = key === activeSubject;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.chip, isActive && { borderColor: subj.color, backgroundColor: subj.color + '22' }]}
            onPress={() => onSelect(key)}
            activeOpacity={0.7}
          >
            <Text style={styles.icon}>{subj.icon}</Text>
            <Text style={[styles.name, isActive && { color: '#fff' }]}>
              {subj.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    marginTop: 16,
    gap: 8,
  },
  chip: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 6,
  },
  icon: { fontSize: 16 },
  name: { fontSize: 13, fontWeight: '600', color: COLORS.text2 },
});
