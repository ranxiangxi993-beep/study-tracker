import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform, StatusBar,
} from 'react-native';
import Svg, { Circle as SvgCircle, Defs, LinearGradient, Stop } from 'react-native-svg';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { getDailyQuote } from '../quotes';

const KAOYAN_TARGET = new Date(2026, 11, 20, 9, 0, 0);

const PHASES = [
  { minDays: 150, label: '基础积累期', color: '#4A90D9' },
  { minDays: 90,  label: '强化提升期', color: '#9B59B6' },
  { minDays: 30,  label: '冲刺备考期', color: '#f39c12' },
  { minDays: 0,   label: '最终决战期', color: '#e74c3c' },
];

export default function CountdownScreen({ navigation }) {
  const [now, setNow] = useState(new Date());
  const [studyStart, setStudyStart] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState(new Date());
  const [quote] = useState(() => getDailyQuote());

  // Android 用命令式 API 打开原生弹窗：它独立于 React 渲染，
  // 不会被每秒刷新（now 更新）重建/冲回今天。iOS 仍用内联组件。
  const openPicker = () => {
    const current = studyStart || new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: new Date(2024, 0, 1),
        maximumDate: KAOYAN_TARGET,
        onChange: (e, date) => {
          if (e.type === 'set' && date) saveStart(date);
        },
      });
    } else {
      setPickerValue(current);
      setShowPicker(true);
    }
  };

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    AsyncStorage.getItem('kaoyan_study_start').then(v => {
      if (v) setStudyStart(new Date(v));
    });
    return () => clearInterval(t);
  }, []);

  const saveStart = (date) => {
    setStudyStart(date);
    AsyncStorage.setItem('kaoyan_study_start', date.toISOString());
  };

  const remainMs   = Math.max(0, KAOYAN_TARGET - now);
  const days       = Math.floor(remainMs / 86400000);
  const hours      = Math.floor((remainMs % 86400000) / 3600000);
  const mins       = Math.floor((remainMs % 3600000) / 60000);
  const secs       = Math.floor((remainMs % 60000) / 1000);
  const phase      = PHASES.find(p => days >= p.minDays) || PHASES[PHASES.length - 1];

  const elapsedMs  = studyStart ? Math.max(0, now - studyStart) : 0;
  const totalMs    = studyStart ? Math.max(1, KAOYAN_TARGET - studyStart) : 1;
  const pct        = studyStart ? Math.min(100, Math.round(elapsedMs / totalMs * 100)) : 0;
  const studiedDays = studyStart ? Math.floor(elapsedMs / 86400000) : 0;

  const SZ = 260, CX = 130, CY = 130, R = 104;
  const FULL = 2 * Math.PI * R;
  const dash = (pct / 100) * FULL;
  const pad  = n => String(n).padStart(2, '0');

  return (
    <View style={s.wrap}>
      <SafeAreaView style={s.safe}>
        {/* 顶栏 */}
        <View style={s.topBar}>
          <View style={[s.phasePill, { borderColor: phase.color + '66', backgroundColor: phase.color + '18' }]}>
            <Text style={[s.phaseText, { color: phase.color }]}>{phase.label}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 大标题 */}
        <Text style={s.title}>🎯 2026 考研倒计时</Text>

        {/* 弧形 + 天数 */}
        <View style={s.arcWrap}>
          <Svg width={SZ} height={SZ}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={phase.color} stopOpacity="1" />
                <Stop offset="100%" stopColor={phase.color} stopOpacity="0.4" />
              </LinearGradient>
            </Defs>
            <SvgCircle cx={CX} cy={CY} r={R}
              stroke="rgba(255,255,255,0.07)" strokeWidth={12} fill="none" />
            {studyStart && (
              <SvgCircle cx={CX} cy={CY} r={R}
                stroke="url(#g)" strokeWidth={12} fill="none"
                strokeDasharray={`${dash} ${FULL}`}
                strokeLinecap="round"
                rotation="-90" origin={`${CX}, ${CY}`} />
            )}
          </Svg>

          <View style={s.daysOverlay}>
            <Text style={s.daysNum}>{days}</Text>
            <Text style={s.daysUnit}>天</Text>
            {studyStart
              ? <Text style={s.pctHint}>已备考 {studiedDays} 天 · {pct}%</Text>
              : <TouchableOpacity onPress={openPicker}>
                  <Text style={[s.pctHint, { color: phase.color }]}>点击设置开始日期</Text>
                </TouchableOpacity>
            }
          </View>
        </View>

        {/* 时分秒 */}
        <View style={s.timeRow}>
          {[{ v: pad(hours), u: '时' }, { v: pad(mins), u: '分' }, { v: pad(secs), u: '秒' }].map(({ v, u }, i) => (
            <React.Fragment key={u}>
              {i > 0 && <Text style={s.sep}>:</Text>}
              <View style={s.timeCell}>
                <Text style={s.timeVal}>{v}</Text>
                <Text style={s.timeUnit}>{u}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* 语录 */}
        <View style={s.quoteBox}>
          <Text style={s.quoteText}>「{quote}」</Text>
        </View>

        {/* 修改开始日期按钮 */}
        {studyStart && (
          <TouchableOpacity style={s.editDateBtn} onPress={openPicker}>
            <Text style={s.editDateText}>
              📅 备考开始：{studyStart.toLocaleDateString('zh-CN')}  修改
            </Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'ios' && showPicker && (
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="default"
            minimumDate={new Date(2024, 0, 1)}
            maximumDate={KAOYAN_TARGET}
            onChange={(e, date) => {
              setShowPicker(false);
              if (e.type !== 'dismissed' && date) {
                setPickerValue(date);
                saveStart(date);
              }
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  safe: {
    flex: 1, alignItems: 'center', paddingHorizontal: 24,
    // Android 的 SafeAreaView 不会自动避开状态栏，手动加状态栏高度，避免顶栏与状态栏重合
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  topBar: {
    width: '100%', flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, paddingBottom: 4,
  },
  phasePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  phaseText: { fontSize: 11, fontWeight: '700' },
  closeBtn: { fontSize: 18, color: COLORS.text2, paddingHorizontal: 4 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text2, marginBottom: 8, marginTop: 4 },
  arcWrap: { alignItems: 'center', justifyContent: 'center' },
  daysOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  daysNum: { fontSize: 88, fontWeight: '900', color: COLORS.text, letterSpacing: -4, lineHeight: 96 },
  daysUnit: { fontSize: 18, color: COLORS.text2, marginTop: -4 },
  pctHint: { fontSize: 12, color: COLORS.text2, marginTop: 6, opacity: 0.85 },
  timeRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    gap: 8, marginTop: 8, marginBottom: 24,
  },
  timeCell: {
    alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minWidth: 68,
  },
  timeVal: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  timeUnit: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  sep: { fontSize: 20, color: COLORS.text2, marginBottom: 14 },
  quoteBox: {
    backgroundColor: COLORS.card, borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 20,
    marginHorizontal: 0, width: '100%',
  },
  quoteText: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 22, fontStyle: 'italic' },
  editDateBtn: { marginTop: 20, paddingVertical: 8 },
  editDateText: { fontSize: 12, color: COLORS.text2, opacity: 0.6 },
});
