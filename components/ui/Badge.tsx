import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";

type BadgeTone = "default" | "accent" | "gold" | "outline" | "danger";

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
};

const toneStyles: Record<
  BadgeTone,
  { container: ViewStyle; label: TextStyle }
> = {
  default: {
    container: { backgroundColor: Colors.badge, borderColor: "transparent" },
    label: { color: Colors.text.primary },
  },
  accent: {
    container: {
      backgroundColor: Colors.accent.muted,
      borderColor: "rgba(79,209,197,0.3)",
    },
    label: { color: Colors.accent.primary },
  },
  gold: {
    container: {
      backgroundColor: "rgba(245,197,24,0.16)",
      borderColor: "rgba(245,197,24,0.25)",
    },
    label: { color: Colors.accent.gold },
  },
  outline: {
    container: { backgroundColor: "transparent", borderColor: Colors.border },
    label: { color: Colors.text.secondary },
  },
  danger: {
    container: {
      backgroundColor: "rgba(252,129,129,0.16)",
      borderColor: "rgba(252,129,129,0.28)",
    },
    label: { color: Colors.accent.danger },
  },
};

export function Badge({ label, tone = "default", style }: BadgeProps) {
  return (
    <View style={[styles.badge, toneStyles[tone].container, style]}>
      <Text style={[styles.label, toneStyles[tone].label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...Typography.label,
  },
});

