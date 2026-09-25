import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { COLORS, APP_VERSION_NAME, APP_VERSION_CODE } from "../constants";
import {
  Sheet,
  Section,
  ActionButton,
  IconButton,
  Icon,
  Segmented,
  ui,
} from "./UI";
import {
  openNotificationSettings,
  openFullScreenIntentSettings,
} from "../notify";
import { useBg } from "../../App";

export default function StudySettings({
  visible,
  onClose,
  settings,
  onSaved,
  running,
}) {
  const [draft, setDraft] = useState(settings);
  const [goal, setGoal] = useState("2");
  const [saving, setSaving] = useState(false);
  const [colorMode, setColorMode] = useState("work");
  const { bgUri, setBgUri, resetBg } = useBg();
  useEffect(() => {
    if (visible) {
      setDraft(settings);
      setGoal(String(settings.goal / 60));
    }
  }, [visible]);

  const save = async () => {
    const hours = Number(goal.replace(",", "."));
    const values = [draft.work, draft.short, draft.long].map(Number);
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 24)
      return Alert.alert("每日最低需为 0.5 到 24 h");
    if (
      values.some(
        (value) => !Number.isInteger(value) || value < 1 || value > 240,
      )
    )
      return Alert.alert("每段时长需为 1 到 240 分钟");
    setSaving(true);
    try {
      const next = {
        ...draft,
        work: values[0],
        short: values[1],
        long: values[2],
        goal: Math.round(hours * 60),
      };
      await AsyncStorage.multiSet([
        [
          "custom_durations",
          JSON.stringify({
            work: next.work,
            short: next.short,
            long: next.long,
          }),
        ],
        ["daily_goal_minutes", String(next.goal)],
        ["accent_color", next.accent],
        ["break_colors", JSON.stringify(next.breakColors)],
        ["timer_strong_alert", next.strongAlert ? "1" : "0"],
      ]);
      onSaved(next);
      onClose();
    } catch {
      Alert.alert("保存失败", "请重试，原有设置仍保留。");
    } finally {
      setSaving(false);
    }
  };

  const pickBackground = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: true,
        aspect: [9, 16],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const directory = FileSystem.documentDirectory;
      if (!directory) {
        await setBgUri(result.assets[0].uri);
        return;
      }
      const target = directory + "study-background-" + Date.now() + ".jpg";
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: target });
      await setBgUri(target);
    } catch {
      Alert.alert("图片未能载入", "请重新选择一张图片。");
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="学习设置">
      <Section title="每日最低学习时长">
        <View style={s.goalRow}>
          <IconButton
            name="minus"
            label="减少半小时"
            onPress={() =>
              setGoal(String(Math.max(0.5, (Number(goal) || 0.5) - 0.5)))
            }
          />
          <TextInput
            accessibilityLabel="每日最低学习小时数"
            keyboardType="decimal-pad"
            value={goal}
            onChangeText={setGoal}
            style={[ui.input, s.goalInput]}
          />
          <Text style={s.unit}>h</Text>
          <IconButton
            name="plus"
            label="增加半小时"
            onPress={() =>
              setGoal(String(Math.min(24, (Number(goal) || 0) + 0.5)))
            }
          />
        </View>
      </Section>
      <Section title="每段时长">
        {[
          ["work", "学习"],
          ["short", "短休"],
          ["long", "长休"],
        ].map(([key, label]) => (
          <View key={key} style={s.row}>
            <Text style={s.label}>{label}</Text>
            <TextInput
              accessibilityLabel={`${label}分钟数`}
              keyboardType="number-pad"
              value={String(draft[key])}
              onChangeText={(value) => setDraft({ ...draft, [key]: value })}
              style={[ui.input, s.durationInput]}
            />
            <Text style={ui.muted}>min</Text>
          </View>
        ))}
        {running && <Text style={ui.muted}>新时长从下一段开始生效</Text>}
      </Section>
      <Section title="结束提醒">
        <Pressable style={s.row} onPress={openNotificationSettings}>
          <Icon name="bell" />
          <Text style={s.label}>通知与锁屏显示</Text>
          <Icon name="right" />
        </Pressable>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>全屏强提醒</Text>
            <Text style={ui.muted}>需要系统允许全屏通知</Text>
          </View>
          <Switch
            value={draft.strongAlert}
            onValueChange={(strongAlert) => setDraft({ ...draft, strongAlert })}
            trackColor={{ true: COLORS.accent, false: COLORS.card2 }}
          />
        </View>
        {draft.strongAlert && (
          <ActionButton
            secondary
            title="检查全屏提醒权限"
            onPress={openFullScreenIntentSettings}
          />
        )}
      </Section>
      <Section title="外观">
        <Segmented
          options={[
            { value: "work", label: "学习" },
            { value: "short", label: "短休" },
            { value: "long", label: "长休" },
          ]}
          value={colorMode}
          onChange={setColorMode}
        />
        <View style={s.swatches}>
          {[COLORS.accent, "#357B64", "#347D9F", "#9A682B", "#687175"].map(
            (color) => (
              <Pressable
                key={color}
                onPress={() =>
                  setDraft(
                    colorMode === "work"
                      ? { ...draft, accent: color }
                      : {
                          ...draft,
                          breakColors: {
                            ...draft.breakColors,
                            [colorMode]: color,
                          },
                        },
                  )
                }
                accessibilityRole="radio"
                accessibilityLabel={`主题色 ${color}`}
                accessibilityState={{
                  checked:
                    (colorMode === "work"
                      ? draft.accent
                      : draft.breakColors[colorMode]) === color,
                }}
                style={[s.swatch, { backgroundColor: color }]}
              >
                {(colorMode === "work"
                  ? draft.accent
                  : draft.breakColors[colorMode]) === color && (
                  <Icon name="check" color={COLORS.card} />
                )}
              </Pressable>
            ),
          )}
        </View>
        <ActionButton
          secondary
          icon="image"
          title="选择背景图片"
          onPress={pickBackground}
        />
        {bgUri && (
          <Pressable onPress={resetBg} style={s.reset}>
            <Text style={ui.muted}>恢复默认背景</Text>
          </Pressable>
        )}
      </Section>
      <ActionButton
        title={saving ? "正在保存" : "保存设置"}
        onPress={save}
        disabled={saving}
      />
      <Text style={s.version}>
        研途 {APP_VERSION_NAME} ({APP_VERSION_CODE})
      </Text>
    </Sheet>
  );
}
const s = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  label: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 22 },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  goalInput: {
    width: 88,
    textAlign: "center",
    fontSize: 26,
    fontVariant: ["tabular-nums"],
  },
  unit: { color: COLORS.text2, fontSize: 18 },
  durationInput: { width: 76, textAlign: "center" },
  swatches: {
    marginTop: 16,
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  reset: { alignItems: "center", padding: 16 },
  version: {
    color: COLORS.text2,
    textAlign: "center",
    fontSize: 11,
    paddingVertical: 20,
  },
});
