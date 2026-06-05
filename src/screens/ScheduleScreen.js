import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, Platform, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUBJECTS, COLORS } from '../constants';
import { useBg } from '../../App';

const STORAGE_KEY = 'daily_plan';

export default function ScheduleScreen() {
  const { bgUri } = useBg();
  const [plan, setPlan] = useState([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(data => {
      if (data) setPlan(JSON.parse(data));
    });
  }, []);

  const savePlan = async (newPlan) => {
    setPlan(newPlan);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newPlan));
  };

  const handleSaveItem = (item) => {
    const next = editing
      ? plan.map(p => p.id === editing.id ? { ...item, id: editing.id } : p)
      : [...plan, { ...item, id: Date.now() }];
    savePlan(next.sort((a, b) => a.start.localeCompare(b.start)));
    setShowEditor(false);
    setEditing(null);
  };

  const handleDelete = (id) => {
    Alert.alert('删除', '确定删除这个时间安排？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => savePlan(plan.filter(p => p.id !== id)) },
    ]);
  };

  // Get today's schedule using this daily plan
  const todayPlan = plan.sort((a, b) => a.start.localeCompare(b.start));

  return (
    <View style={[styles.container, { backgroundColor: bgUri ? 'transparent' : COLORS.bg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>📅 每日安排</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setEditing(null); setShowEditor(true); }}>
          <Text style={styles.addBtnText}>+ 添加</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hint */}
        <View style={styles.hint}>
          <Text style={styles.hintText}>💡 每天自动按此计划执行，修改后新计划长期生效</Text>
        </View>

        {/* Today's schedule */}
        {todayPlan.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>还没有每日计划</Text>
            <Text style={styles.emptySub}>点击右上角「+ 添加」设置你的每日学习安排</Text>
          </View>
        ) : (
          todayPlan.map((item, i) => {
            const subj = item.customName ? { icon: '📝', name: item.customName, color: COLORS.accent } : SUBJECTS[item.subject];
            const now = new Date();
            const [sh, sm] = item.start.split(':').map(Number);
            const [eh, em] = (item.end || '23:59').split(':').map(Number);
            const startMin = sh * 60 + sm;
            const endMin = eh * 60 + em;
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const isNow = nowMin >= startMin && nowMin < endMin;
            const isPast = nowMin >= endMin;

            return (
              <View key={item.id || i} style={[styles.slot, isNow && styles.slotNow, isPast && styles.slotPast]}>
                {/* Time bar */}
                <View style={styles.timeCol}>
                  <Text style={styles.timeStart}>{item.start}</Text>
                  <View style={styles.timeLine} />
                  <Text style={styles.timeEnd}>{item.end || '~'}</Text>
                </View>

                {/* Content */}
                <View style={[styles.slotContent, { borderLeftColor: subj?.color || COLORS.accent }]}>
                  <View style={styles.slotInfo}>
                    <Text style={styles.slotSubject}>{subj?.icon || ''} {subj?.name || ''}</Text>
                    <Text style={styles.slotMeta}>
                      {item.start} - {item.end || '待定'}
                      {isNow && ' · 现在'}
                      {isPast && ' · 已过'}
                    </Text>
                  </View>
                  <View style={styles.slotActions}>
                    {isNow && <View style={styles.nowDot} />}
                    <TouchableOpacity onPress={() => { setEditing(item); setShowEditor(true); }}>
                      <Text style={styles.editIcon}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id)}>
                      <Text style={styles.delIcon}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Editor Modal */}
      <PlanEditor
        visible={showEditor}
        initial={editing}
        onSave={handleSaveItem}
        onClose={() => { setShowEditor(false); setEditing(null); }}
      />
    </View>
  );
}

// Time picker - scrollable hour + minute
const ITEM_H = 44;
const COPIES = 3;

function TimeWheel({ value, onChange }) {
  const [h, m] = (value || '08:00').split(':').map(Number);
  const baseHours = Array.from({ length: 24 }, (_, i) => i);
  const baseMins = Array.from({ length: 12 }, (_, i) => i * 5);

  // Duplicate items for infinite scroll effect
  const hours = Array.from({ length: COPIES }, () => baseHours).flat();
  const mins = Array.from({ length: COPIES }, () => baseMins).flat();
  const midH = Math.floor(COPIES / 2) * 24 + baseHours.indexOf(h);
  const midM = Math.floor(COPIES / 2) * 12 + baseMins.indexOf(m);

  const hRef = useRef(null);
  const mRef = useRef(null);
  const hVal = useRef(h);
  const mVal = useRef(m);
  const initialH = useRef(midH);
  const initialM = useRef(midM);

  const [hCenter, setHCenter] = useState(midH);
  const [mCenter, setMCenter] = useState(midM);

  const onHScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    setHCenter(idx);
  };
  const onMScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    setMCenter(idx);
  };
  const onHEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const real = baseHours[idx % 24];
    hVal.current = real;
    setTime(real, mVal.current);
  };
  const onMEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const real = baseMins[idx % 12];
    mVal.current = real;
    setTime(hVal.current, real);
  };

  const setTime = (hh, mm) => {
    onChange(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  };

  // Sync external value changes
  useEffect(() => { hVal.current = h; }, [h]);
  useEffect(() => { mVal.current = m; }, [m]);

  const renderWheel = (ref, items, initOffset, centerIdx, onScroll, onEnd) => (
    <View style={{ width: 64, height: ITEM_H * 3, overflow: 'hidden' }}>
      {/* Fixed selection box */}
      <View style={{ position: 'absolute', top: ITEM_H, left: 0, right: 0, height: ITEM_H, backgroundColor: COLORS.accent + '25', borderRadius: 8 }} />
      <View style={{ position: 'absolute', top: ITEM_H, left: 6, right: 6, height: 1, backgroundColor: COLORS.accent + '60' }} />
      <View style={{ position: 'absolute', top: ITEM_H * 2, left: 6, right: 6, height: 1, backgroundColor: COLORS.accent + '60' }} />

      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        decelerationRate={0.94}
        snapToInterval={ITEM_H}
        disableIntervalMomentum={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onEnd}
        contentOffset={{ x: 0, y: initOffset * ITEM_H }}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
      >
        {items.map((val, i) => {
          const sel = i === centerIdx;
          return (
            <View key={i} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: sel ? 20 : 15, fontWeight: sel ? '700' : '400', color: sel ? '#fff' : COLORS.text2 }}>
                {String(val).padStart(2, '0')}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 10, color: COLORS.text2 }}>时</Text>
      {renderWheel(hRef, hours, midH, hCenter, onHScroll, onHEnd)}
      <Text style={{ fontSize: 20, color: COLORS.text, fontWeight: '700' }}>:</Text>
      {renderWheel(mRef, mins, midM, mCenter, onMScroll, onMEnd)}
      <Text style={{ fontSize: 10, color: COLORS.text2 }}>分</Text>
    </View>
  );
}

// Inline editor
function PlanEditor({ visible, initial, onSave, onClose }) {
  const [subject, setSubject] = useState(initial?.subject || 'english');
  const [start, setStart] = useState(initial?.start || '08:00');
  const [end, setEnd] = useState(initial?.end || '10:00');
  const [customName, setCustomName] = useState(initial?.customName || '');

  useEffect(() => {
    if (initial) { setSubject(initial.subject || 'custom'); setStart(initial.start); setEnd(initial.end || '10:00'); setCustomName(initial.customName || ''); }
    else {
      AsyncStorage.getItem('last_schedule').then(d => {
        if (d) { const v = JSON.parse(d); setStart(v.start); setEnd(v.end); setSubject(v.subject || 'english'); setCustomName(v.customName || ''); }
        else { setStart('08:00'); setEnd('10:00'); setSubject('english'); setCustomName(''); }
      });
    }
  }, [initial, visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.editorOverlay}>
        <ScrollView style={styles.editorSheet} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.editorHandle} />
          <Text style={styles.editorTitle}>{initial ? '编辑安排' : '添加安排'}</Text>

          <Text style={styles.fieldLabel}>科目</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Object.entries(SUBJECTS).map(([key, subj]) => (
                <TouchableOpacity key={key}
                  style={[styles.pickChip, subject === key && !customName && { backgroundColor: subj.color + '33', borderColor: subj.color }]}
                  onPress={() => { setSubject(key); setCustomName(''); }}>
                  <Text style={[styles.pickChipText, subject === key && !customName && { color: '#fff', fontWeight: '700' }]}>
                    {subj.icon} {subj.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <TextInput
            style={styles.customInput}
            placeholder="或输入自定义项目名（如：复习线代、背单词...）"
            placeholderTextColor={COLORS.text2}
            value={customName}
            onChangeText={t => { setCustomName(t); if (t) setSubject('custom'); }}
          />

          <Text style={styles.fieldLabel}>开始时间</Text>
          <TimeWheel value={start} onChange={setStart} />

          <Text style={styles.fieldLabel}>结束时间</Text>
          <TimeWheel value={end} onChange={setEnd} />

          <View style={styles.editorActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => {
              AsyncStorage.setItem('last_schedule', JSON.stringify({ start, end, subject, customName }));
              onClose();
            }}>
              <Text style={styles.cancelTxt}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => {
              AsyncStorage.setItem('last_schedule', JSON.stringify({ start, end, subject, customName }));
              onSave({
                subject: customName ? 'custom' : subject,
                customName: customName || undefined,
                start, end,
              });
            }}>
              <Text style={styles.saveTxt}>保存</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  addBtn: { backgroundColor: COLORS.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1, paddingHorizontal: 20 },
  hint: { backgroundColor: 'rgba(255,107,107,0.1)', borderRadius: 8, padding: 8, marginBottom: 10 },
  hintText: { fontSize: 12, color: COLORS.text2, textAlign: 'center', lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  emptySub: { fontSize: 11, color: COLORS.text2, textAlign: 'center', lineHeight: 16 },
  // Time slots
  slot: { flexDirection: 'row', marginBottom: 6 },
  slotNow: { opacity: 1 },
  slotPast: { opacity: 0.45 },
  timeCol: { width: 40, alignItems: 'center', paddingTop: 6 },
  timeStart: { fontSize: 10, fontWeight: '700', color: COLORS.text },
  timeLine: { flex: 1, width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 2, minHeight: 12 },
  timeEnd: { fontSize: 9, color: COLORS.text2 },
  slotContent: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 8, padding: 8,
    borderLeftWidth: 2, marginLeft: 6,
  },
  slotInfo: { flex: 1 },
  slotSubject: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  slotMeta: { fontSize: 10, color: COLORS.text2, marginTop: 1 },
  slotActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  editIcon: { fontSize: 14, opacity: 0.5 },
  delIcon: { fontSize: 14, opacity: 0.5 },
  // Editor
  editorOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  editorSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  editorHandle: { width: 36, height: 4, backgroundColor: COLORS.card2, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  editorTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  customInput: { backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.card2, marginTop: 8, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text2, marginBottom: 6, marginTop: 4 },
  pickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: COLORS.card2, borderWidth: 1.5, borderColor: 'transparent' },
  pickChipText: { fontSize: 13, color: COLORS.text2 },
  timePick: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: COLORS.card2, marginBottom: 4 },
  timePickActive: { backgroundColor: COLORS.accent },
  timePickText: { fontSize: 11, color: COLORS.text2 },
  timePickTActive: { color: '#fff', fontWeight: '700' },
  editorActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, backgroundColor: COLORS.card2, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelTxt: { color: COLORS.text2, fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

// Time wheel mini-styles
const stl = StyleSheet.create({
  tw: { height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 10, marginVertical: 1 },
  twOn: { backgroundColor: COLORS.accent + '40' },
  twT: { fontSize: 16, color: COLORS.text2 },
  twTOn: { color: '#fff', fontWeight: '700', fontSize: 18 },
});
