import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ComponentProps } from "react";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";

type ActionItem = {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
};

type MovieActionsProps = {
  actions: ActionItem[];
};

export function MovieActions({ actions }: MovieActionsProps) {
  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <Pressable key={action.label} onPress={action.onPress} style={styles.action}>
          <View style={styles.iconWrap}>
            <Ionicons color={Colors.text.primary} name={action.icon} size={20} />
          </View>
          <Text numberOfLines={1} style={styles.label}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 20,
    marginBottom: 10,
  },
  action: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background.surface,
  },
  label: {
    ...Typography.caption,
    color: Colors.text.primary,
    textAlign: "center",
  },
});

