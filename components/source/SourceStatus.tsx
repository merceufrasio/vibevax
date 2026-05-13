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

export function SourceStatus({
  sourceName,
  isLoading = false,
  error,
  onPress,
}: SourceStatusProps) {
  return (
    <Pressable onPress={onPress} style={styles.container}>
      <View style={styles.leading}>
        <Ionicons
          color={error ? Colors.accent.danger : Colors.accent.primary}
          name={error ? "alert-circle-outline" : "radio-outline"}
          size={18}
        />
        <View>
          <Text style={styles.title}>
            {sourceName ? `Nguồn: ${sourceName}` : "Nguồn phim"}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {error
              ? "Không tải được nguồn, đang dùng dữ liệu mẫu"
              : isLoading
                ? "Đang tải phim từ nguồn"
                : "Đã sẵn sàng lấy dữ liệu thật"}
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

