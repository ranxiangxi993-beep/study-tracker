import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Vibration, Alert, Platform, Modal, TextInput, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import TimerCircle from '../components/TimerCircle';
import SubjectSelector from '../components/SubjectSelector';
import { SUBJECTS, TIMER_MODES, COLORS } from '../constants';
import { startSession, stopSession, getActiveSession, getTodayStats, getStreak, formatDuration } from '../storage';
import { useBg } from '../../App';
import { celebrateComplete, remindBreak } from '../notify';
import { isDeviceAdminActive, requestDeviceAdmin, lockScreen, unlockScreen, getInstalledApps, setLockTaskWhitelist } from '../nativeLock';

export default function TimerScreen() {
  const [mode, setMode] = useState('work');
  const [activeSubject, setActiveSubject] = useState('english');
  const [timeLeft, setTimeLeft] = useState(TIMER_MODES.work.minutes * 60);
  const [totalTime, setTotalTime] = useState(TIMER_MODES.work.minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [streak, setStreak] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [countUp, setCountUp] = useState(false);
  const [accentColor, setAccentColor] = useState(COLORS.accent);
  const [locked, setLocked] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [appsList, setAppsList] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [wlPkgs, setWlPkgs] = useState([]);
  const { bgUri, setBgUri, resetBg } = useBg();
  const [customMin, setCustomMin] = useState({ work: 25, short: 5, long: 15 });
  const [editMin, setEditMin] = useState({ work: '25', short: '5', long: '15' });

  const modes = {
    work:  { ...TIMER_MODES.work,  minutes: customMin.work },
    short: { ...TIMER_MODES.shortBreak, minutes: customMin.short },
    long:  { ...TIMER_MODES.longBreak,  minutes: customMin.long },
  };
  const cfg = modes[mode];
  const timerRef = useRef(null);
  const timeRef = useRef(timeLeft);

  // Keep ref in sync
  useEffect(() => { timeRef.current = timeLeft; }, [timeLeft]);

  // ====== Timer ======
  const finish = useCallback(async () => {
    Vibration.vibrate([500, 200, 500, 200, 800]);
    clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
    const elapsed = countUp ? timeRef.current : modes[mode].minutes * 60;
    if (sessionId && mode === 'work') { await stopSession(sessionId); setSessionId(null); }
    setTimeLeft(countUp ? 0 : modes[mode].minutes * 60);
    if (mode === 'work') celebrateComplete(SUBJECTS[activeSubject]?.name, formatDuration(elapsed));
    else remindBreak();
    Alert.alert(mode === 'work' ? '🎉 学习完成！' : '⏰ 休息结束', '继续加油 🔥', [{ text: '好的' }]);
  }, [mode, sessionId, activeSubject, customMin, countUp]);

  const tick = useCallback(() => {
    if (countUp) setTimeLeft(t => t + 1);
    else setTimeLeft(t => t <= 1 ? (finish(), 0) : t - 1);
  }, [countUp, finish]);

  const doStart = useCallback(async () => {
    if (isRunning && !isPaused) return;
    if (!isPaused && mode === 'work') setSessionId(await startSession(activeSubject));
    if (!isPaused && countUp) setTimeLeft(0);
    setIsRunning(true); setIsPaused(false);
    clearInterval(timerRef.current); timerRef.current = setInterval(tick, 1000);
  }, [isRunning, isPaused, mode, activeSubject, tick, countUp]);

  const doPause = useCallback(() => { setIsPaused(true); clearInterval(timerRef.current); }, []);
  const doStop = useCallback(async () => {
    clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
    setTimeLeft(countUp ? 0 : modes[mode].minutes * 60);
    if (sessionId && mode === 'work') { await stopSession(sessionId); setSessionId(null); }
  }, [mode, sessionId, customMin, countUp]);

  const switchMode = useCallback((m) => {
    if (isRunning) { clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
      if (mode === 'work' && sessionId) { stopSession(sessionId); setSessionId(null); }
    }
    setMode(m); setTimeLeft(countUp ? 0 : modes[m].minutes * 60); setTotalTime(modes[m].minutes * 60);
  }, [isRunning, mode, sessionId, customMin, countUp]);

  const handleSubject = useCallback((key) => {
    if (isRunning && mode === 'work') {
      Alert.alert('切换科目', '会结束当前计时', [{ text: '取消', style: 'cancel' }, {
        text: '确定', onPress: async () => {
          if (sessionId) { await stopSession(sessionId); setSessionId(null); }
          clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
          setTimeLeft(countUp ? 0 : modes[mode].minutes * 60); setActiveSubject(key);
        }
      }]);
      return;
    }
    setActiveSubject(key);
  }, [isRunning, mode, sessionId, customMin, countUp]);

  // ====== Settings ======
  const saveDurations = async () => {
    const w = Math.max(1, parseInt(editMin.work) || 25);
    const s = Math.max(1, parseInt(editMin.short) || 5);
    const l = Math.max(1, parseInt(editMin.long) || 15);
    setCustomMin({ work: w, short: s, long: l });
    await AsyncStorage.setItem('custom_durations', JSON.stringify({ work: w, short: s, long: l }));
    if (!isRunning) { setTimeLeft(countUp ? 0 : w * 60); setTotalTime(w * 60); }
  };

  const pickBg = async () => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { Alert.alert('需要相册权限'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: [9, 16] });
    if (r.canceled || !r.assets[0]) return;
    try {
      const dir = FileSystem.documentDirectory + 'bg/';
      if (!(await FileSystem.getInfoAsync(dir)).exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const dest = dir + 'bg_' + Date.now() + '.jpg';
      await FileSystem.copyAsync({ from: r.assets[0].uri, to: dest });
      setBgUri(dest);
    } catch (e) { setBgUri(r.assets[0].uri); }
  };

  // Init
  useEffect(() => {
    AsyncStorage.getItem('custom_durations').then(d => { if (d) setCustomMin(JSON.parse(d)); });
    AsyncStorage.getItem('accent_color').then(c => { if (c) setAccentColor(c); });
    getActiveSession().then(a => {
      if (a) { setActiveSubject(a.subject); setSessionId(a.id);
        const el = Math.floor((Date.now() - new Date(a.start_time).getTime()) / 1000);
        setTimeLeft(Math.max(0, TIMER_MODES.work.minutes * 60 - el)); setTotalTime(TIMER_MODES.work.minutes * 60); }
    });
    getStreak().then(setStreak);
    return () => clearInterval(timerRef.current);
  }, []);

  const timerColor = mode === 'work' ? accentColor : cfg.color;
  const isLight = accentColor.length === 7 && parseInt(accentColor.slice(1,3),16) > 200 && parseInt(accentColor.slice(3,5),16) > 200 && parseInt(accentColor.slice(5,7),16) > 200;
  const btnTextColor = isLight ? '#333' : '#fff';
  const label = !isRunning ? (countUp ? '正计时 · 00:00' : '准备开始') : (isPaused ? '已暂停' : (mode === 'work' ? `${SUBJECTS[activeSubject]?.name}` : '休息中...'));
  const displayTotal = countUp ? 86400 : cfg.minutes * 60;

  return (
    <View style={[styles.wrap, { backgroundColor: bgUri ? 'transparent' : COLORS.bg }]}>
      <View style={styles.hd}>
        <TouchableOpacity onPress={() => { setEditMin({ work: String(customMin.work), short: String(customMin.short), long: String(customMin.long) }); setShowSettings(true); }}>
          <Text style={styles.gear}>⚙️</Text>
        </TouchableOpacity>
        <Text style={styles.ttl}>📚 考研计时器</Text>
        <View style={styles.sb}><Text style={styles.sbt}>🔥 {streak}天</Text></View>
      </View>

      <View style={styles.body}>
        <View style={styles.timerWrap}>
          <TimerCircle timeLeft={timeLeft} totalTime={displayTotal} modeColor={timerColor} label={label} />
        </View>

        {/* Count direction */}
        <TouchableOpacity style={styles.toggle} onPress={() => { if (isRunning) return; setCountUp(!countUp); setTimeLeft(!countUp ? 0 : modes[mode].minutes * 60); setTotalTime(modes[mode].minutes * 60); }}>
          <Text style={styles.toggleT}>{countUp ? '⏫ 正计时' : '⏬ 倒计时'}</Text>
        </TouchableOpacity>

        {/* Mode tabs */}
        <View style={styles.modes}>
          {Object.entries(modes).map(([k, c]) => (
            <TouchableOpacity key={k} style={[styles.mtab, mode === k && { backgroundColor: k === 'work' ? accentColor + '33' : COLORS.card2 }]}
              onPress={() => switchMode(k)}
              onLongPress={() => { setEditMin({ work: String(customMin.work), short: String(customMin.short), long: String(customMin.long) }); setShowSettings(true); }}>
              <Text style={[styles.mt, mode === k && { color: '#fff' }]}>{c.label} · {c.minutes}′</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SubjectSelector activeSubject={activeSubject} onSelect={handleSubject} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10 }}>
          <TouchableOpacity style={[styles.lockBtn, locked && styles.lockBtnOn]} onPress={async () => {
            if (locked) { await unlockScreen(); setLocked(false); return; }
            const admin = await isDeviceAdminActive();
            if (!admin) { Alert.alert('激活设备管理器', '先去 设置→安全→设备管理器→考研计时器专注锁 激活', [{ text: '去激活', onPress: requestDeviceAdmin }]); return; }
            const result = await lockScreen();
            if (result === 'none') { Alert.alert('模块未加载', '请重新安装最新版 APK'); return; }
            if (result === 'error') { Alert.alert('锁机失败', '请确认已开启：\n\n1. 设置→安全→设备管理器→激活考研计时器\n2. 设置→安全→画面固定→开启'); return; }
            setLocked(true); Alert.alert('已锁定', result === 'kiosk' ? 'Kiosk模式：白名单外的App全部禁用' : '基础锁屏：长按返回+概览退出');
          }}>
            <Text style={[styles.lockBtnT, locked && { color: '#fff' }]}>{locked ? '🔓 解锁' : '🔒 锁机'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.lockBtn} onPress={async () => {
            setAppsLoading(true); setShowApps(true);
            const apps = await getInstalledApps();
            setAppsList(apps || []); setAppsLoading(false);
          }}>
            <Text style={styles.lockBtnT}>📋 白名单</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.ctrls}>
          <TouchableOpacity style={[styles.go, { backgroundColor: accentColor }, isRunning && !isPaused && { backgroundColor: COLORS.warning }]} onPress={() => { if (!isRunning || isPaused) doStart(); else doPause(); }}>
            <Text style={[styles.goT, { color: btnTextColor }]}>{!isRunning ? '▶ 开始学习' : (isPaused ? '▶ 继续' : '⏸ 暂停')}</Text>
          </TouchableOpacity>
          {isRunning && <TouchableOpacity style={styles.end} onPress={doStop}><Text style={styles.endT}>↺ 结束</Text></TouchableOpacity>}
        </View>

        <Text style={styles.hint}>长按模式卡片修改时长 · ⚙️ 设置背景和更多</Text>
      </View>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowSettings(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>⚙️ 设置</Text>

            <Text style={styles.lbl}>⏱️ 时长（分钟）</Text>
            {[{ k: 'work', lab: '📖', name: '学习', f: 'work' },{ k: 'short', lab: '☕', name: '短休', f: 'short' },{ k: 'long', lab: '😴', name: '长休', f: 'long' }].map(item => (
              <View key={item.k} style={styles.dr}>
                <Text style={styles.dl}>{item.lab} {item.name}</Text>
                <TouchableOpacity onPress={() => setEditMin(p => ({ ...p, [item.f]: String(Math.max(1, (parseInt(p[item.f])||1)-5)) }))}><Text style={styles.db}>−5</Text></TouchableOpacity>
                <TextInput style={styles.di} keyboardType="numeric" value={editMin[item.f]} onChangeText={t => setEditMin(p => ({ ...p, [item.f]: t }))} />
                <TouchableOpacity onPress={() => setEditMin(p => ({ ...p, [item.f]: String((parseInt(p[item.f])||1)+5) }))}><Text style={styles.db}>+5</Text></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.sv} onPress={() => { saveDurations(); setShowSettings(false); }}><Text style={styles.svT}>保存时长</Text></TouchableOpacity>

            <Text style={[styles.lbl, { marginTop: 20 }]}>🎨 主题色</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {[COLORS.accent, '#4A90D9', '#5CB85C', '#9B59B6', '#f39c12', '#1abc9c', '#e91e63', '#00bcd4', '#ff9800', '#607d8b', '#ffffff', '#ff6b9d'].map(c => (
                <TouchableOpacity key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, accentColor === c && { borderWidth: 3, borderColor: '#fff' }]}
                  onPress={() => { setAccentColor(c); AsyncStorage.setItem('accent_color', c); }}
                />
              ))}
            </View>

            <Text style={[styles.lbl]}>🖼️ 背景</Text>
            {bgUri ? <Image source={bgUri} style={styles.prev} contentFit="cover" /> : <View style={[styles.prev, { backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: COLORS.text2 }}>未设置</Text></View>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.bgb} onPress={pickBg}><Text style={styles.bgbT}>📁 选择图片</Text></TouchableOpacity>
              {bgUri && <TouchableOpacity style={[styles.bgb, { backgroundColor: COLORS.lock }]} onPress={resetBg}><Text style={styles.bgbT}>↺ 恢复默认</Text></TouchableOpacity>}
            </View>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 14 }} onPress={() => setShowSettings(false)}><Text style={{ color: COLORS.text2 }}>关闭</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Whitelist Modal */}
      <Modal visible={showApps} animationType="slide" transparent onRequestClose={() => setShowApps(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowApps(false)}>
          <Pressable style={[styles.sheet, { maxHeight: '80%' }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>📋 白名单 App</Text>
            <ScrollView style={{ maxHeight: 350 }}>
              {appsLoading ? <Text style={{ color: COLORS.text2, textAlign: 'center', padding: 20 }}>⏳ 读取已安装应用...</Text> :
               appsList.length === 0 ? <Text style={{ color: COLORS.text2, textAlign: 'center', padding: 20 }}>未获取到应用列表</Text> :
                appsList.map((a, i) => (
                  <TouchableOpacity key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 }}
                    onPress={async () => {
                      const next = wlPkgs.includes(a.pkg) ? wlPkgs.filter(x => x !== a.pkg) : [...wlPkgs, a.pkg];
                      setWlPkgs(next);
                      await setLockTaskWhitelist(next);
                    }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: wlPkgs.includes(a.pkg) ? accentColor : COLORS.text2, backgroundColor: wlPkgs.includes(a.pkg) ? accentColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {wlPkgs.includes(a.pkg) && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{a.name}</Text>
                  </TouchableOpacity>
                ))
              }
            </ScrollView>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setShowApps(false)}>
              <Text style={{ color: COLORS.text2 }}>关闭</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { flex: 1, alignItems: 'center', paddingTop: 90, paddingHorizontal: 16 },
  hd: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 8 },
  timerWrap: { marginBottom: 8 },
  gear: { fontSize: 22, color: COLORS.text2 },
  ttl: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  sb: { backgroundColor: '#e74c3c', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  sbt: { color: '#fff', fontSize: 11, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: COLORS.card, borderRadius: 16 },
  toggleT: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  toggleHint: { fontSize: 11, color: COLORS.text2 },
  modes: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 3, gap: 2, marginTop: 12 },
  mtab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  mtabOn: { backgroundColor: COLORS.card2 },
  mt: { fontSize: 11, fontWeight: '600', color: COLORS.text2 },
  mtMin: { fontSize: 18, fontWeight: '800', color: COLORS.text2, marginTop: 2 },
  mtOn: { color: '#fff' },
  hint: { fontSize: 11, color: COLORS.text2, textAlign: 'center', marginTop: 16, opacity: 0.6 },
  ctrls: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, gap: 10 },
  go: { paddingVertical: 14, paddingHorizontal: 44, borderRadius: 30 },
  pause: { backgroundColor: COLORS.warning },
  goT: { color: '#fff', fontSize: 17, fontWeight: '600' },
  end: { backgroundColor: COLORS.card, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 30 },
  endT: { color: COLORS.text2, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, backgroundColor: COLORS.card2, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetT: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  lbl: { fontSize: 13, fontWeight: '600', color: COLORS.text2, marginBottom: 8 },
  dr: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  dl: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  db: { fontSize: 16, fontWeight: '700', color: COLORS.accent, paddingHorizontal: 8 },
  di: { backgroundColor: COLORS.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center', width: 60, borderWidth: 1, borderColor: COLORS.card2 },
  sv: { backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  svT: { color: '#fff', fontSize: 14, fontWeight: '600' },
  prev: { width: '100%', height: 120, borderRadius: 12, marginBottom: 8 },
  bgb: { flex: 1, backgroundColor: COLORS.card2, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  bgbT: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  lockBtn: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.lock, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22 },
  lockBtnOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  lockBtnT: { color: COLORS.lock, fontSize: 13, fontWeight: '600' },
});
