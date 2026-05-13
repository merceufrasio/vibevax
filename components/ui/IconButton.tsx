import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";

type IconButtonProps = {
  icon: ReactNode;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  solid?: boolean;
};

export function IconButton({
  icon,
  onPress,
  size = 44,
  style,
  solid = false,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: solid
            ? Colors.background.surface
            : "rgba(17,24,39,0.72)",
        },
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.icon}>{icon}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.88,
  },
});
