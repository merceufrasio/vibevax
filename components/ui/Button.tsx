import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "md" | "lg";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  icon,
  variant = "primary",
  size = "lg",
  style,
  disabled = false,
}: ButtonProps) {
  const content = (
    <View
      style={[
        styles.content,
        size === "lg" ? styles.contentLarge : styles.contentMedium,
      ]}
    >
      {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
      <Text
        style={[
          styles.label,
          variant === "primary" ? styles.primaryLabel : styles.secondaryLabel,
        ]}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {variant === "primary" ? (
        <LinearGradient
          colors={Colors.buttonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primaryFill}
        >
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.secondaryFill,
            variant === "secondary" ? styles.secondaryVariant : null,
            variant === "outline" ? styles.outlineVariant : null,
            variant === "ghost" ? styles.ghostVariant : null,
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Layout.cardRadius,
    overflow: "hidden",
  },
  primaryFill: {
    borderRadius: Layout.cardRadius,
  },
  secondaryFill: {
    borderRadius: Layout.cardRadius,
    borderWidth: 1,
  },
  secondaryVariant: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  outlineVariant: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: Colors.border,
  },
  ghostVariant: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  content: {
    minWidth: 132,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  contentLarge: {
    minHeight: 52,
    paddingHorizontal: 20,
  },
  contentMedium: {
    minHeight: 44,
    paddingHorizontal: 16,
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...Typography.button,
  },
  primaryLabel: {
    color: Colors.text.inverse,
  },
  secondaryLabel: {
    color: Colors.text.primary,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.55,
  },
});
