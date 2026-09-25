import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Platform,
  AppState,
  TextInput,
  Switch,
  DeviceEventEmitter,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { COLORS } from "../constants";
import { useBg } from "../../App";
import DefaultBackdrop from "../components/DefaultBackdrop";
import { PageHeader, Icon, IconButton, ui } from "../components/UI";
import {
  getTimerCapabilities,
  openNotificationSettings,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
} from "../notify";
import {
  parseTimer,
  TIMER_STATE_KEY,
  TIMER_INTERRUPT_EVENT,
} from "../timerState";
import {
  isAccessibilityEnabled,
  isAccessibilitySettingOn,
  isIgnoringBatteryOptimizations,
  isLockActive,
  openAccessibilitySettings,
  openWhiteListSettings,
  openBatterySettings,
  lockScreen,
  unlockScreen,
  getInstalledApps,
  saveWhitelist,
} from "../nativeLock";

const LEVELS = [
  { key: "light", label: "轻度", desc: "提醒为主" },
  { key: "medium", label: "中度", desc: "手动拦截" },
  { key: "strong", label: "强力", desc: "学习段绑定" },
];

export default function LockScreen({ navigation }) {
  const { bgUri } = useBg();
  const [accessOn, setAccessOn] = useState(false);
  const [settingOn, setSettingOn] = useState(false);
  const [batteryOk, setBatteryOk] = useState(false);
  const [autostartConfirmed, setAutostartConfirmed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [level, setLevel] = useState("strong");
  const [bindStudy, setBindStudy] = useState(true);
  const [showApps, setShowApps] = useState(false);
  const [apps, setApps] = useState([]);
  const [wlPkgs, setWlPkgs] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [search, setSearch] = useState("");
  const [permissions, setPermissions] = useState({ native: false });
  const [inStudy, setInStudy] = useState(false);

  const refresh = useCallback(async () => {
    const [
      enabled,
      setting,
      active,
      battery,
      savedAuto,
      savedLevel,
      savedBind,
    ] = await Promise.all([
      isAccessibilityEnabled(),
      isAccessibilitySettingOn(),
      isLockActive(),
      isIgnoringBatteryOptimizations(),
      AsyncStorage.getItem("lock_autostart_confirmed"),
      AsyncStorage.getItem("lock_level"),
      AsyncStorage.getItem("lock_bind_study"),
    ]);
    const saved = JSON.parse((await AsyncStorage.getItem("wl_pkgs")) || "[]");
    setAccessOn(!!enabled);
    setSettingOn(!!setting);
    setLocked(!!active);
    setBatteryOk(!!battery);
    setAutostartConfirmed(savedAuto === "1");
    if (savedLevel) setLevel(savedLevel === "normal" ? "medium" : savedLevel);
    if (savedBind !== null) setBindStudy(savedBind === "1");
    setWlPkgs(saved);
    setPermissions(await getTimerCapabilities());
    const timer = parseTimer(await AsyncStorage.getItem(TIMER_STATE_KEY));
    setInStudy(!!timer && !timer.paused && timer.mode === "work");
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => sub.remove();
    }, [refresh]),
  );

  const startLock = async () => {
    if (level === "strong" && bindStudy && !inStudy) {
      navigation.navigate("Timer");
      return;
    }
    const enabled = await isAccessibilityEnabled();
    if (!enabled) {
      Alert.alert(
        settingOn ? "无障碍需重新激活" : "开启专注锁",
        settingOn
          ? "系统开关可能是假开启。请进入无障碍，把「研途专注」关闭再重新打开。"
          : "需要先开启无障碍服务，OPPO 还建议关闭电池优化并允许自启动。",
        [
          { text: "无障碍", onPress: openAccessibilitySettings },
          { text: "电池优化", onPress: openBatterySettings },
          { text: "取消", style: "cancel" },
        ],
      );
      return;
    }
    const result = await lockScreen(level);
    if (["none", "error", "accessibility-required"].includes(result)) {
      Alert.alert("模块未加载", "请安装最新版 APK 后再开启锁机。");
      return;
    }
    setLocked(true);
  };

  const emergencyUnlock = () => {
    Alert.alert(
      "应急解锁",
      "用于误锁或紧急情况。确认后会解除当前锁机，本段学习会被视为中断。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认解锁",
          style: "destructive",
          onPress: async () => {
            if (!(await unlockScreen())) {
              Alert.alert(
                "解锁未完成",
                "请重试，或在系统无障碍设置中关闭研途服务。",
              );
              return;
            }
            const timer = parseTimer(
              await AsyncStorage.getItem(TIMER_STATE_KEY),
            );
            if (timer?.boundLock) {
              await AsyncStorage.setItem(
                "timer_interrupt_requested",
                String(Date.now()),
              );
              DeviceEventEmitter.emit(TIMER_INTERRUPT_EVENT);
            }
            setLocked(false);
            setInStudy(false);
          },
        },
      ],
    );
  };

  const stopLock = async () => {
    if (await unlockScreen()) setLocked(false);
    else
      Alert.alert("解锁未完成", "请重试，或在系统无障碍设置中关闭研途服务。");
  };

  const openApps = async () => {
    setShowApps(true);
    setLoadingApps(true);
    const list = await getInstalledApps();
    setApps(list || []);
    setLoadingApps(false);
  };

  const toggleApp = async (pkg) => {
    const next = wlPkgs.includes(pkg)
      ? wlPkgs.filter((x) => x !== pkg)
      : [...wlPkgs, pkg];
    setWlPkgs(next);
    await saveWhitelist(next);
  };

  const permissionRows = [
    { label: "无障碍服务", ok: accessOn, action: openAccessibilitySettings },
    {
      label: "系统通知",
      ok: permissions.notifications,
      action: openNotificationSettings,
      state: !permissions.native
        ? "仅 APK 可检测"
        : permissions.notifications
          ? "已允许"
          : "未允许",
    },
    {
      label: "精确闹钟",
      ok: permissions.exactAlarm,
      action: openExactAlarmSettings,
      state: !permissions.native
        ? "仅 APK 可检测"
        : permissions.exactAlarm
          ? "已允许"
          : "未允许",
    },
    {
      label: "结束提醒",
      ok: permissions.completionAlert,
      action: openNotificationSettings,
      state: !permissions.native
        ? "仅 APK 可检测"
        : permissions.completionAlert
          ? "已允许"
          : "通知被关闭或静音",
    },
    {
      label: "全屏提醒",
      ok: permissions.fullScreen,
      action: openFullScreenIntentSettings,
      state: !permissions.native
        ? "仅 APK 可检测"
        : permissions.fullScreen
          ? "已允许"
          : "可选权限",
    },
    {
      label: "电池优化",
      ok: batteryOk,
      warn: !batteryOk,
      action: openBatterySettings,
      state: batteryOk ? "已忽略优化" : "建议关闭",
    },
    {
      label: "自启动 / 后台",
      ok: autostartConfirmed,
      warn: !autostartConfirmed,
      action: openWhiteListSettings,
      state: autostartConfirmed ? "已手动确认" : "系统无法自动检测",
    },
  ];
  const activeLevel = LEVELS.find((item) => item.key === level) || LEVELS[2];
  const levelCopy =
    level === "light"
      ? "离开研途时只做低频提醒，不会强制返回。"
      : level === "medium"
        ? "开启后拦截白名单外应用，需要手动关闭。"
        : bindStudy
          ? "随学习段开启，暂停或结束时自动解除。"
          : "手动开启拦截，可随时应急解锁。";
  const stopLabel =
    level === "light"
      ? "停止提醒"
      : level === "medium"
        ? "关闭拦截"
        : "应急解锁";

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      {!bgUri && <DefaultBackdrop />}
      <PageHeader title="专注锁" subtitle="把注意力，留给当下">
        <View style={[styles.statePill, locked && styles.statePillOn]}>
          <Text style={[styles.stateText, locked && styles.stateTextOn]}>
            {locked ? "运行中" : "待开启"}
          </Text>
        </View>
      </PageHeader>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.shield}>
            <Icon
              name={locked ? "shield-check" : "shield"}
              size={42}
              color={locked ? COLORS.success : COLORS.accent}
            />
          </View>
          <Text style={styles.heroTitle}>
            {locked
              ? `${activeLevel.label}模式运行中`
              : bindStudy && level === "strong"
                ? "随学习开启，结束即放松"
                : "留出不被打扰的时间"}
          </Text>
          <Text style={styles.heroCopy}>{levelCopy}</Text>
          <TouchableOpacity
            style={[styles.primary, locked && styles.primaryMuted]}
            onPress={
              locked
                ? level === "strong"
                  ? emergencyUnlock
                  : stopLock
                : startLock
            }
          >
            <Text style={styles.primaryText}>
              {locked
                ? stopLabel
                : level === "strong" && bindStudy && !inStudy
                  ? "去开始学习"
                  : `开启${activeLevel.label}模式`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>锁机强度</Text>
          <View style={styles.levelRow}>
            {LEVELS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.level, level === item.key && styles.levelOn]}
                onPress={async () => {
                  setLevel(item.key);
                  await AsyncStorage.setItem("lock_level", item.key);
                  if (locked) await lockScreen(item.key);
                }}
                disabled={inStudy}
                accessibilityRole="button"
                accessibilityState={{ selected: level === item.key }}
              >
                <Text
                  style={[
                    styles.levelLabel,
                    level === item.key && styles.levelLabelOn,
                  ]}
                >
                  {item.label}
                </Text>
                <Text style={styles.levelDesc}>{item.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>权限体检</Text>
          {permissionRows.map((row) => (
            <TouchableOpacity
              key={row.label}
              style={styles.checkRow}
              onPress={row.action}
            >
              <View
                style={[
                  styles.checkDot,
                  row.ok ? styles.ok : row.warn ? styles.warn : styles.bad,
                ]}
              >
                <Text style={styles.checkMark}>
                  {row.ok ? "✓" : row.warn ? "!" : "×"}
                </Text>
              </View>
              <Text style={styles.checkLabel}>{row.label}</Text>
              <Text style={styles.checkState}>
                {row.state ||
                  (row.ok ? "正常" : row.warn ? "建议设置" : "未开启")}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.confirmAuto}
            onPress={async () => {
              if (autostartConfirmed) {
                openWhiteListSettings();
                return;
              }
              setAutostartConfirmed(true);
              await AsyncStorage.setItem("lock_autostart_confirmed", "1");
            }}
          >
            <Text style={styles.confirmAutoText}>
              {autostartConfirmed
                ? "重新检查自启动设置"
                : "我已在系统里开启自启动/后台运行"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>规则</Text>
          <ToggleRow
            title="绑定学习段"
            desc="仅强力模式：开始学习自动开启，结束后自动解除。"
            value={bindStudy}
            disabled={level !== "strong" || inStudy}
            onPress={async () => {
              const next = !bindStudy;
              setBindStudy(next);
              await AsyncStorage.setItem("lock_bind_study", next ? "1" : "0");
            }}
          />
          <View style={styles.ruleInfo}>
            <Text style={styles.ruleInfoTitle}>学习段结束自动放松</Text>
            <Text style={styles.ruleInfoText}>
              {inStudy
                ? "当前学习段进行中，锁机强度与绑定设置在本段结束后可调整。"
                : "电话、系统设置和输入法始终可用。其他应用按白名单放行。"}
            </Text>
          </View>
          <TouchableOpacity style={styles.manageRow} onPress={openApps}>
            <View>
              <Text style={styles.manageTitle}>白名单应用</Text>
              <Text style={styles.manageDesc}>
                按手机已安装应用选择，当前 {wlPkgs.length} 个
              </Text>
            </View>
            <Icon name="right" />
          </TouchableOpacity>
        </View>

        <View style={styles.unlockBox}>
          <Text style={styles.unlockTitle}>应急解锁规则</Text>
          <Text style={styles.unlockText}>
            随时可解除拦截，已完成的学习时间会保留。
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showApps}
        animationType="slide"
        transparent
        onRequestClose={() => setShowApps(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowApps(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>白名单应用</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              style={[ui.input, { marginBottom: 16 }]}
              placeholder="搜索手机应用"
              placeholderTextColor={COLORS.text2}
              accessibilityLabel="搜索白名单应用"
            />
            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
            >
              {loadingApps ? (
                <Text style={styles.empty}>读取已安装应用...</Text>
              ) : apps.length === 0 ? (
                <Text style={styles.empty}>未获取到应用列表</Text>
              ) : (
                apps
                  .filter((app) =>
                    `${app.name} ${app.pkg}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((app) => (
                    <TouchableOpacity
                      key={app.pkg}
                      style={styles.appRow}
                      onPress={() => toggleApp(app.pkg)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: wlPkgs.includes(app.pkg) }}
                    >
                      <View
                        style={[
                          styles.appCheck,
                          wlPkgs.includes(app.pkg) && styles.appCheckOn,
                        ]}
                      >
                        {wlPkgs.includes(app.pkg) && (
                          <Icon
                            name="check"
                            color={COLORS.accentText}
                            size={16}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.appName}>{app.name}</Text>
                        <Text style={styles.appPkg}>{app.pkg}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ToggleRow({ title, desc, value, disabled = false, onPress }) {
  return (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onPress}
        trackColor={{ false: COLORS.card2, true: COLORS.accent }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 44 : 56,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.text },
  subTitle: { marginTop: 4, fontSize: 12, color: COLORS.text2 },
  statePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statePillOn: {
    backgroundColor: COLORS.success + "33",
    borderColor: COLORS.success,
  },
  stateText: { color: COLORS.text2, fontSize: 12, fontWeight: "700" },
  stateTextOn: { color: COLORS.success },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  hero: {
    alignItems: "center",
    paddingVertical: 16,
  },
  shield: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  shieldIcon: { color: "#fff", fontSize: 42, fontWeight: "900" },
  heroTitle: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  heroCopy: {
    color: COLORS.text2,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  primary: {
    marginTop: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    alignSelf: "stretch",
  },
  primaryMuted: { backgroundColor: COLORS.lock },
  primaryText: { color: COLORS.accentText, fontSize: 15, fontWeight: "700" },
  card: {
    paddingVertical: 24,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  levelRow: { flexDirection: "row", gap: 8 },
  level: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  levelOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + "25",
  },
  levelLabel: { color: COLORS.text2, fontSize: 13, fontWeight: "800" },
  levelLabelOn: { color: COLORS.accent },
  levelDesc: { color: COLORS.text2, fontSize: 9, marginTop: 4 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  ok: { backgroundColor: COLORS.success },
  warn: { backgroundColor: COLORS.warning },
  bad: { backgroundColor: COLORS.lock },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  checkLabel: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: "700" },
  checkState: { color: COLORS.text2, fontSize: 11 },
  confirmAuto: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmAutoText: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleRowDisabled: { opacity: 0.45 },
  toggleTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  toggleDesc: {
    color: COLORS.text2,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  switch: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.card2,
    padding: 3,
  },
  switchOn: { backgroundColor: COLORS.accent },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  knobOn: { marginLeft: 18 },
  ruleInfo: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  ruleInfoTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  ruleInfoText: {
    color: COLORS.text2,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  manageTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  manageDesc: { color: COLORS.text2, fontSize: 11, marginTop: 4 },
  manageArrow: { color: COLORS.text2, fontSize: 24 },
  unlockBox: {
    marginTop: 12,
    backgroundColor: COLORS.warning + "22",
    borderColor: COLORS.warning + "55",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  unlockTitle: { color: COLORS.warning, fontSize: 14, fontWeight: "600" },
  unlockText: {
    color: COLORS.text2,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.card2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  empty: { color: COLORS.text2, textAlign: "center", paddingVertical: 28 },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  appCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.text2,
    alignItems: "center",
    justifyContent: "center",
  },
  appCheckOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  appCheckText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  appName: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  appPkg: { color: COLORS.text2, fontSize: 10, marginTop: 2 },
});
