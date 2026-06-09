import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Vibration, Alert, Platform, Modal, TextInput, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';  // 旧 API（getInfoAsync/copyAsync 等）在 SDK 54 移到 legacy
import TimerCircle from '../components/TimerCircle';
import SubjectSelector from '../components/SubjectSelector';
import { SUBJECTS, TIMER_MODES, COLORS, APP_VERSION_CODE } from '../constants';
import { startSession, stopSession, getActiveSession, deleteSession, getTodayStats, getStreak, formatDuration } from '../storage';
import { useBg } from '../../App';
import { celebrateComplete, remindBreak, scheduleTimerEnd, cancelScheduled, openNotificationSettings } from '../notify';
import { isAccessibilityEnabled, isAccessibilitySettingOn, openAccessibilitySettings, openWhiteListSettings, openBatterySettings, lockScreen, unlockScreen, getInstalledApps, saveWhitelist } from '../nativeLock';
import { nextQuote } from '../quotes';

export default function TimerScreen({ navigation }) {
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
  const [breakColors, setBreakColors] = useState({ short: '#5CB85C', long: '#4A90D9' }); // 短休/长休圆环色（各自可设）
  const [locked, setLocked] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [appsList, setAppsList] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [wlPkgs, setWlPkgs] = useState([]);
  const [quote, setQuote] = useState('');
  const { bgUri, setBgUri, resetBg } = useBg();
  const [customMin, setCustomMin] = useState({ work: 25, short: 5, long: 15 });
  const [editMin, setEditMin] = useState({ work: '25', short: '5', long: '15' });
  const [cdDays, setCdDays] = useState(null);
  const [cdStudied, setCdStudied] = useState(null);

  const modes = {
    work:  { ...TIMER_MODES.work,  minutes: customMin.work },
    short: { ...TIMER_MODES.shortBreak, minutes: customMin.short },
    long:  { ...TIMER_MODES.longBreak,  minutes: customMin.long },
  };
  const cfg = modes[mode];
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedMsRef = useRef(0);
  const notifIdRef = useRef(null); // 预约的"计时结束"系统通知 id

  const getElapsed = useCallback(() => {
    if (!startTimeRef.current) return 0;
    return Math.floor((Date.now() - startTimeRef.current) / 1000);
  }, []);

  // ====== Timer (wall-clock accurate, survives background/app switch) ======
  const updateDisplay = useCallback(() => {
    const elapsed = getElapsed();
    if (countUp) {
      setTimeLeft(elapsed);
    } else {
      const remaining = Math.max(0, modes[mode].minutes * 60 - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) finish();
    }
    setTotalTime(modes[mode].minutes * 60);
  }, [countUp, mode, customMin, getElapsed]);

  const finish = useCallback(async () => {
    Vibration.vibrate([500, 200, 500, 200, 800]);
    cancelScheduled(notifIdRef.current); notifIdRef.current = null; // 前台已触发，撤掉系统通知免重复
    clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
    const actual = getElapsed();
    if (sessionId && mode === 'work') { await stopSession(sessionId); setSessionId(null); }
    setTimeLeft(countUp ? 0 : modes[mode].minutes * 60);
    startTimeRef.current = null;
    if (mode === 'work') celebrateComplete(SUBJECTS[activeSubject]?.name, formatDuration(actual));
    else remindBreak();
    Alert.alert(mode === 'work' ? '🎉 学习完成！' : '⏰ 休息结束', '继续加油', [{ text: '好的' }]);
  }, [mode, sessionId, activeSubject, customMin, countUp, getElapsed]);

  const doStart = useCallback(async () => {
    if (isRunning && !isPaused) return;
    const elapsedAtStart = isPaused ? pausedMsRef.current : 0;
    if (!isPaused) {
      if (mode === 'work') setSessionId(await startSession(activeSubject));
      startTimeRef.current = Date.now();
    } else {
      startTimeRef.current = Date.now() - pausedMsRef.current * 1000;
      pausedMsRef.current = 0;
    }
    setIsRunning(true); setIsPaused(false);
    if (!isPaused) setQuote(nextQuote());
    // 预约"计时结束"系统通知：倒计时模式才有终点；App 退后台/被杀也会响
    cancelScheduled(notifIdRef.current); notifIdRef.current = null;
    if (!countUp) {
      const remaining = modes[mode].minutes * 60 - elapsedAtStart;
      notifIdRef.current = await scheduleTimerEnd(remaining, mode === 'work', SUBJECTS[activeSubject]?.name);
    }
    clearInterval(timerRef.current);
    timerRef.current = setInterval(updateDisplay, 200);
    updateDisplay();
  }, [isRunning, isPaused, mode, activeSubject, countUp, updateDisplay]);

  const doPause = useCallback(() => {
    setIsPaused(true); clearInterval(timerRef.current);
    pausedMsRef.current = getElapsed();
    cancelScheduled(notifIdRef.current); notifIdRef.current = null;
  }, [getElapsed]);
  const doStop = useCallback(async () => {
    clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
    cancelScheduled(notifIdRef.current); notifIdRef.current = null;
    if (sessionId && mode === 'work') { await stopSession(sessionId); setSessionId(null); }
    setTimeLeft(countUp ? 0 : modes[mode].minutes * 60);
    startTimeRef.current = null;
  }, [mode, sessionId, customMin, countUp]);

  const switchMode = useCallback((m) => {
    if (isRunning) { clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
      cancelScheduled(notifIdRef.current); notifIdRef.current = null;
      if (mode === 'work' && sessionId) { stopSession(sessionId); setSessionId(null); }
    }
    setMode(m); setTimeLeft(countUp ? 0 : modes[m].minutes * 60); setTotalTime(modes[m].minutes * 60);
    startTimeRef.current = null;
  }, [isRunning, mode, sessionId, customMin, countUp]);

  const handleSubject = useCallback((key) => {
    if (isRunning && mode === 'work') {
      Alert.alert('切换科目', '会结束当前计时', [{ text: '取消', style: 'cancel' }, {
        text: '确定', onPress: async () => {
          if (sessionId) { await stopSession(sessionId); setSessionId(null); }
          cancelScheduled(notifIdRef.current); notifIdRef.current = null;
          clearInterval(timerRef.current); setIsRunning(false); setIsPaused(false);
          setTimeLeft(countUp ? 0 : modes[mode].minutes * 60); setActiveSubject(key);
          startTimeRef.current = null;
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
    const refreshCd = () => {
      const target = new Date(2026, 11, 20, 9, 0, 0);
      const now = new Date();
      const remain = Math.max(0, target - now);
      setCdDays(Math.floor(remain / 86400000));
      AsyncStorage.getItem('kaoyan_study_start').then(v => {
        if (v) {
          // 按自然日算，含起始当天(第1天)，不受设置时刻影响
          const st = new Date(v);
          const sMid = new Date(st.getFullYear(), st.getMonth(), st.getDate());
          const nMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          setCdStudied(Math.floor((nMid - sMid) / 86400000) + 1);
        }
      });
    };
    refreshCd();
    const cdTimer = setInterval(refreshCd, 60000); // 每分钟更新天数
    AsyncStorage.getItem('custom_durations').then(d => {
      const v = d ? JSON.parse(d) : null;
      if (v) setCustomMin(v);
      const workSec = (v?.work || TIMER_MODES.work.minutes) * 60;
      // 倒计时启动应满圈：先把初始时长摆满
      setTimeLeft(workSec); setTotalTime(workSec);
      // 结算上次遗留的未结束会话，避免"僵尸会话"让圆环停在残缺/冻结状态
      getActiveSession().then(a => {
        if (a) {
          const el = Math.floor((Date.now() - new Date(a.start_time).getTime()) / 1000);
          // 时长内照实结算；明显被遗忘(超过一个学习时长)则丢弃，不污染统计
          if (el > 0 && el <= workSec) stopSession(a.id); else deleteSession(a.id);
        }
        setSessionId(null);
        setTimeLeft(workSec); setTotalTime(workSec);
      });
    });
    AsyncStorage.getItem('accent_color').then(c => { if (c) setAccentColor(c); });
    AsyncStorage.getItem('break_colors').then(d => { if (d) setBreakColors(JSON.parse(d)); });
    AsyncStorage.getItem('wl_pkgs').then(d => { if (d) setWlPkgs(JSON.parse(d)); });
    getStreak().then(setStreak);
    return () => { clearInterval(timerRef.current); clearInterval(cdTimer); };
  }, []);

  const timerColor = mode === 'work' ? accentColor : (breakColors[mode] || COLORS.success);
  const isLight = accentColor.length === 7 && parseInt(accentColor.slice(1,3),16) > 200 && parseInt(accentColor.slice(3,5),16) > 200 && parseInt(accentColor.slice(5,7),16) > 200;
  const btnTextColor = isLight ? '#333' : '#fff';
  const label = !isRunning ? (countUp ? '正计时 · 00:00' : '准备开始') : (isPaused ? '已暂停' : (mode === 'work' ? `${SUBJECTS[activeSubject]?.name}` : '休息中...'));
  // 圆环“要画多少”比例(0~1)，统一为 timeLeft/总时长：
  //  · 倒计时：timeLeft 是剩余 → 一开始满圈(1)，随时间排空(→0)
  //  · 正计时：timeLeft 是已计时 → 一开始空(0)，逐渐填满(封顶1)
  // 单一表达式且只依赖 timeLeft 与当前模式，避免启动/切换时进度条闪烁。
  const cfgSec = cfg.minutes * 60;
  const ringProgress = cfgSec > 0 ? Math.min(1, Math.max(0, timeLeft) / cfgSec) : 0;

  return (
    <View style={[styles.wrap, { backgroundColor: bgUri ? 'transparent' : COLORS.bg }]}>
      <View style={styles.hd}>
        <TouchableOpacity onPress={() => { setEditMin({ work: String(customMin.work), short: String(customMin.short), long: String(customMin.long) }); setShowSettings(true); }}>
          <Text style={styles.gear}>⚙️</Text>
        </TouchableOpacity>
        <Text style={styles.ttl}>📚 研途</Text>
        <View style={styles.sb}><Text style={styles.sbt}>🔥 {streak}天</Text></View>
      </View>

      {cdDays !== null && (
        <TouchableOpacity style={styles.cdBar} onPress={() => navigation.navigate('Countdown')} activeOpacity={0.7}>
          <Text style={styles.cdBarText}>
            🎯 还有 {cdDays} 天
            {cdStudied !== null ? `  ·  已备考 ${cdStudied} 天` : ''}
          </Text>
          <Text style={styles.cdArrow}>›</Text>
        </TouchableOpacity>
      )}

      <View style={styles.body}>
        <View style={styles.timerWrap}>
          <TimerCircle timeLeft={timeLeft} progress={ringProgress} modeColor={timerColor} label={label} />
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
            const hasAcc = await isAccessibilityEnabled();
            if (!hasAcc) {
              // 区分"系统开关假开启（更新后服务被杀）"和"确实没开"
              const sysOn = await isAccessibilitySettingOn();
              if (sysOn) {
                Alert.alert('无障碍需重新激活',
                  '系统显示「研途专注」已开启，但更新 App 后安卓杀掉了服务（开关是"假开")。\n\n请进入无障碍，把「研途专注」开关【关闭再重新打开】，然后回来再点锁机。',
                  [
                    { text: '去无障碍重开', onPress: openAccessibilitySettings },
                    { text: '取消', style: 'cancel' },
                  ]);
              } else {
                Alert.alert('开启专注锁（三步）', '小米/OPPO 用户需完成以下三步，否则锁机会失效：\n\n1️⃣ 无障碍 → 已下载的服务 → 研途专注\n2️⃣ 自启动 → 找到研途 → 允许\n3️⃣ 电池优化 → 选择研途 → 不优化', [
                  { text: '1️⃣ 无障碍', onPress: openAccessibilitySettings },
                  { text: '2️⃣ 自启动', onPress: openWhiteListSettings },
                  { text: '3️⃣ 电池', onPress: openBatterySettings },
                ]);
              }
              return;
            }
            // Accessibility is on, but remind about remaining steps
            Alert.alert('锁机已开启', '为确保小米/OPPO 不杀服务，建议也完成：\n\n🔋 电池优化 → 选研途 → 不优化\n🚀 自启动 → 找到研途 → 允许', [
              { text: '🔋 电池优化', onPress: openBatterySettings },
              { text: '🚀 自启动', onPress: openWhiteListSettings },
              { text: '已全部设置好，开始锁机', onPress: async () => {
                const result = await lockScreen();
                if (result === 'none') { Alert.alert('模块未加载', '请重新安装最新版 APK'); return; }
                setLocked(true); Alert.alert('已锁定', '白名单外的App打开后自动返回桌面');
              }},
            ]);
            return;
            const result = await lockScreen();
            if (result === 'none') { Alert.alert('模块未加载', '请重新安装最新版 APK'); return; }
            setLocked(true); Alert.alert('已锁定', '白名单外的App打开后会立即弹回研途');
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

        {quote && isRunning && <Text style={styles.quoteText}>{quote}</Text>}
        <Text style={styles.hint}>长按模式卡片修改时长 · ⚙️ 设置背景和更多</Text>
      </View>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowSettings(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetT}>⚙️ 设置</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

            <Text style={[styles.lbl, { marginTop: 20 }]}>🎨 学习圆环色</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {[COLORS.accent, '#4A90D9', '#5CB85C', '#9B59B6', '#f39c12', '#1abc9c', '#e91e63', '#00bcd4', '#ff9800', '#607d8b', '#ffffff', '#ff6b9d'].map(c => (
                <TouchableOpacity key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, accentColor === c && { borderWidth: 3, borderColor: '#fff' }]}
                  onPress={() => { setAccentColor(c); AsyncStorage.setItem('accent_color', c); }}
                />
              ))}
            </View>

            {[{ k: 'short', lab: '☕ 短休圆环色' }, { k: 'long', lab: '😴 长休圆环色' }].map(row => (
              <View key={row.k}>
                <Text style={[styles.lbl]}>{row.lab}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {['#5CB85C', '#4A90D9', '#1abc9c', '#00bcd4', '#9B59B6', '#f39c12', '#ff9800', '#607d8b', '#27ae60', '#3498db', '#ffffff', '#ff6b9d'].map(c => (
                    <TouchableOpacity key={c}
                      style={[styles.colorSwatch, { backgroundColor: c }, breakColors[row.k] === c && { borderWidth: 3, borderColor: '#fff' }]}
                      onPress={() => {
                        const next = { ...breakColors, [row.k]: c };
                        setBreakColors(next); AsyncStorage.setItem('break_colors', JSON.stringify(next));
                      }}
                    />
                  ))}
                </View>
              </View>
            ))}

            <Text style={[styles.lbl]}>🔔 提醒</Text>
            <TouchableOpacity style={styles.notifBtn} onPress={openNotificationSettings}>
              <Text style={styles.notifBtnT}>开启横幅/悬浮通知</Text>
              <Text style={styles.notifBtnArrow}>去系统设置 ›</Text>
            </TouchableOpacity>

            <Text style={[styles.lbl, { marginTop: 16 }]}>🖼️ 背景</Text>
            {bgUri ? <Image source={bgUri} style={styles.prev} contentFit="cover" /> : <View style={[styles.prev, { backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: COLORS.text2 }}>未设置</Text></View>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.bgb} onPress={pickBg}><Text style={styles.bgbT}>📁 选择图片</Text></TouchableOpacity>
              {bgUri && <TouchableOpacity style={[styles.bgb, { backgroundColor: COLORS.lock }]} onPress={resetBg}><Text style={styles.bgbT}>↺ 恢复默认</Text></TouchableOpacity>}
            </View>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 14 }} onPress={() => setShowSettings(false)}><Text style={{ color: COLORS.text2 }}>关闭</Text></TouchableOpacity>
            <Text style={{ color: COLORS.text2, textAlign: 'center', fontSize: 11, opacity: 0.6, paddingBottom: 8 }}>研途 · 版本 v{APP_VERSION_CODE}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Whitelist Modal */}
      <Modal visible={showApps} animationType="slide" transparent onRequestClose={() => setShowApps(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowApps(false)}>
          <View style={[styles.sheet, { maxHeight: '80%' }]}>
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
                      await saveWhitelist(next);
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
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { flex: 1, alignItems: 'center', paddingTop: 116, paddingHorizontal: 16 },
  hd: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 8 },
  cdBar: { position: 'absolute', top: Platform.OS === 'android' ? 88 : 100, left: 0, right: 0, zIndex: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 20, backgroundColor: 'rgba(255,107,107,0.08)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,107,107,0.12)' },
  cdBarText: { fontSize: 12, color: 'rgba(255,180,180,0.85)', fontWeight: '600', letterSpacing: 0.3 },
  cdArrow: { fontSize: 14, color: 'rgba(255,180,180,0.5)', marginLeft: 6 },
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
  quoteText: { fontSize: 12, color: COLORS.text2, textAlign: 'center', marginTop: 4, opacity: 0.7, fontStyle: 'italic', paddingHorizontal: 30 },
  ctrls: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, gap: 10 },
  go: { paddingVertical: 14, paddingHorizontal: 44, borderRadius: 30 },
  pause: { backgroundColor: COLORS.warning },
  goT: { color: '#fff', fontSize: 17, fontWeight: '600' },
  end: { backgroundColor: COLORS.card, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 30 },
  endT: { color: COLORS.text2, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
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
  notifBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  notifBtnT: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  notifBtnArrow: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  lockBtn: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.lock, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22 },
  lockBtnOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  lockBtnT: { color: COLORS.lock, fontSize: 13, fontWeight: '600' },
});
