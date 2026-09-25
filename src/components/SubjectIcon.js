import React from "react";
import { Image, View } from "react-native";
import { COLORS } from "../constants";
import { Icon } from "./UI";

const illustrations = {
  english: require("../../assets/subjects/english.png"),
  math: require("../../assets/subjects/math.png"),
  politics: require("../../assets/subjects/politics.png"),
  automation: require("../../assets/subjects/professional.png"),
};

export default function SubjectIcon({ subject, size = 32 }) {
  const source = illustrations[subject];
  if (source) {
    return (
      <Image
        source={source}
        resizeMode="contain"
        resizeMethod="resize"
        accessible={false}
        fadeDuration={0}
        testID={`subject-illustration-${subject}`}
        style={{ width: size, height: size, flexShrink: 0 }}
      />
    );
  }
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="book-open" size={size * 0.6} color={COLORS.text2} />
    </View>
  );
}
