import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Timer,
  CalendarDays,
  ChartNoAxesCombined,
  Shield,
  ShieldCheck,
  Settings2,
  Play,
  Pause,
  Square,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Minus,
  Pencil,
  Trash2,
  BookOpen,
  Sigma,
  Landmark,
  Cpu,
  Flame,
  ArrowUpRight,
  Check,
  Bell,
  Image,
  Coffee,
  Moon,
  Search,
  Target,
  LockKeyhole,
  CircleHelp,
} from "lucide-react-native";
import { COLORS } from "../constants";

const icons = {
  timer: Timer,
  calendar: CalendarDays,
  chart: ChartNoAxesCombined,
  shield: Shield,
  "shield-check": ShieldCheck,
  settings: Settings2,
  play: Play,
  pause: Pause,
  stop: Square,
  left: ChevronLeft,
  right: ChevronRight,
  close: X,
  plus: Plus,
  minus: Minus,
  edit: Pencil,
  delete: Trash2,
  "book-open": BookOpen,
  sigma: Sigma,
  landmark: Landmark,
  cpu: Cpu,
  flame: Flame,
  arrow: ArrowUpRight,
  check: Check,
  bell: Bell,
  image: Image,
  coffee: Coffee,
  moon: Moon,
  search: Search,
  target: Target,
  lock: LockKeyhole,
  help: CircleHelp,
};
export function Icon({ name, size = 20, color = COLORS.text2, ...props }) {
  const Glyph = icons[name] || CircleHelp;
  return <Glyph size={size} color={color} strokeWidth={1.8} {...props} />;
}
export function IconButton({ name, label, onPress, disabled, style, color }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ui.iconButton,
        style,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}
export function PageHeader({ title, subtitle, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[ui.header, { paddingTop: insets.top + 16 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={ui.title}>{title}</Text>
        {subtitle ? <Text style={ui.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}
export function Section({ title, action, children, style }) {
  return (
    <View style={[ui.section, style]}>
      <View style={ui.sectionHead}>
        <Text style={ui.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}
export function Segmented({ options, value, onChange, disabled = false }) {
  return (
    <View style={ui.segmented}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          style={[
            ui.segment,
            value === option.value && ui.segmentOn,
            disabled && { opacity: 0.6 },
          ]}
        >
          {option.icon && (
            <Icon
              name={option.icon}
              size={16}
              color={value === option.value ? COLORS.text : COLORS.text2}
            />
          )}
          <Text
            style={[
              ui.segmentText,
              value === option.value && { color: COLORS.text },
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function ActionButton({
  title,
  icon,
  onPress,
  disabled,
  secondary = false,
  style,
}) {
  const background =
    StyleSheet.flatten(style)?.backgroundColor || COLORS.accent;
  const rgb = /^#[0-9a-f]{6}$/i.test(background)
    ? [1, 3, 5]
        .map((index) => parseInt(background.slice(index, index + 2), 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        )
    : null;
  const ink = secondary
    ? COLORS.text
    : rgb && 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 0.179
      ? COLORS.text
      : COLORS.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        secondary && ui.secondary,
        style,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      {icon && <Icon name={icon} color={ink} />}
      <Text style={[ui.buttonText, { color: ink }]}>{title}</Text>
    </Pressable>
  );
}
export function Sheet({ visible, onClose, title, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={ui.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="关闭弹窗"
        />
        <View
          style={[ui.sheet, { paddingBottom: Math.max(20, insets.bottom) }]}
        >
          <View style={ui.sheetHead}>
            <Text style={ui.sectionTitle}>{title}</Text>
            <IconButton name="close" label="关闭" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export const ui = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0,
  },
  subtitle: { color: COLORS.text2, fontSize: 12, marginTop: 6, lineHeight: 18 },
  section: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "600" },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  segmented: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    backgroundColor: COLORS.card,
    borderRadius: 8,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    paddingHorizontal: 6,
  },
  segmentOn: { backgroundColor: COLORS.accentSoft },
  segmentText: { fontSize: 13, fontWeight: "600", color: COLORS.text2 },
  button: {
    minHeight: 52,
    borderRadius: 8,
    paddingHorizontal: 20,
    backgroundColor: COLORS.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondary: { backgroundColor: COLORS.card2 },
  buttonText: { color: COLORS.accentText, fontSize: 16, fontWeight: "700" },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(30,35,38,0.3)",
  },
  sheet: {
    maxHeight: "90%",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  muted: { color: COLORS.text2, fontSize: 12, lineHeight: 19 },
});
