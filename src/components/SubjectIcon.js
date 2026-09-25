import React from "react";
import { View } from "react-native";
import { COLORS, SUBJECTS } from "../constants";
import { Icon } from "./UI";

export default function SubjectIcon({ subject, size = 32 }) {
  const value = SUBJECTS[subject];
  const color = value?.color || COLORS.accent;
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 8,
        backgroundColor: color + "12",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={value?.glyph || "book-open"} size={size * 0.6} color={color} />
    </View>
  );
}
