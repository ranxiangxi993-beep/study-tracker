import React from "react";
import { Text, View } from "react-native";
import { COLORS, SUBJECTS } from "../constants";

export default function SubjectIcon({ subject, size = 32 }) {
  const value = SUBJECTS[subject];
  return (
    <View
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`subject-symbol-${subject}`}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        accessible={false}
        allowFontScaling={false}
        numberOfLines={1}
        style={{
          color: value?.color || COLORS.text2,
          fontSize: size * 0.62,
          fontWeight: "500",
          lineHeight: size,
          letterSpacing: 0,
          textAlign: "center",
          includeFontPadding: false,
        }}
      >
        {value?.symbol || "学"}
      </Text>
    </View>
  );
}
