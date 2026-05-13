import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

export function EmptyState({ icon, title, body }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons color={Colors.accent.primary} name={icon} size={26} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 52,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.accent.muted,
    marginBottom: 16,
  },
  title: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: "center",
  },
});

