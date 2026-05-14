import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";

type SourceStatusProps = {
  sourceName?: string;
  isLoading?: boolean;
  error?: string | null;
  onPress?: () => void;
};

function formatSourceError(error?: string | null) {
  if (!error) {
    return null;
  }

  const sanitized = error
    .replace(/^error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) {
    return "Khong tai duoc nguon phim hien tai.";
  }

  if (sanitized.length <= 140) {
    return sanitized;
  }

  return `${sanitized.slice(0, 137).trimEnd()}...`;
}

export function SourceStatus({
  sourceName,
  isLoading = false,
  error,
  onPress,
}: SourceStatusProps) {
  const errorMessage = formatSourceError(error);

  return (
    <Pressable onPress={onPress} style={styles.container}>
      <View style={styles.leading}>
        <Ionicons
          color={errorMessage ? Colors.accent.danger : Colors.accent.primary}
          name={errorMessage ? "alert-circle-outline" : "radio-outline"}
          size={18}
        />
        <View>
          <Text style={styles.title}>
            {sourceName ? `Nguon: ${sourceName}` : "Nguon phim"}
          </Text>
          <Text numberOfLines={2} style={styles.subtitle}>
            {errorMessage
              ? errorMessage
              : isLoading
                ? "Dang tai phim tu nguon hien tai..."
                : "Da san sang lay du lieu that"}
          </Text>
        </View>
      </View>
      <Ionicons color={Colors.text.secondary} name="settings-outline" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 62,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  title: {
    ...Typography.cardTitle,
    fontSize: 14,
    lineHeight: 19,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
    maxWidth: 280,
  },
});
