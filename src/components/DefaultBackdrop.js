import React from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { COLORS } from "../constants";

export default function DefaultBackdrop() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.bg }]}
    >
      <Image
        source={require("../../assets/paper-rose.png")}
        style={[StyleSheet.absoluteFill, { opacity: 0.44 }]}
        contentFit="cover"
        accessible={false}
      />
    </View>
  );
}
