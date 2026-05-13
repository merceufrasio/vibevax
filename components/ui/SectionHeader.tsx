import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";

type SectionHeaderProps = {
  title: string;
  onPressMore?: () => void;
  moreLabel?: string;
};

export function SectionHeader({
  title,
  onPressMore,
  moreLabel,
}: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onPressMore ? (
        <Pressable onPress={onPressMore} style={styles.moreButton}>
          <Text style={styles.moreLabel}>{moreLabel}</Text>
          <Ionicons
            color={Colors.text.secondary}
            name="chevron-forward"
            size={16}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
  },
  moreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  moreLabel: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
});

