import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useMovies } from "@/hooks/useMovies";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { formatRelativeTime } from "@/utils/format";

export default function HistoryScreen() {
  const router = useRouter();
  const { getMovieById } = useMovies();
  const { clearHistory, history } = useWatchHistory();

  const locale = "vi";

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Lịch sử xem</Text>
            <Text style={styles.subtitle}>
              Tiếp tục xem nhanh từ những phim bạn đã mở gần đây.
            </Text>
          </View>
          {history.length ? (
            <IconButton
              icon={
                <Ionicons
                  color={Colors.text.primary}
                  name="trash-outline"
                  size={18}
                />
              }
              onPress={clearHistory}
            />
          ) : null}
        </View>

        {history.length ? (
          <View style={styles.list}>
            {history.map((entry) => {
              const movie = getMovieById(entry.movieId);

              if (!movie) {
                return null;
              }

              return (
                <Pressable
                  key={entry.movieId}
                  onPress={() =>
                    router.push({
                      pathname: "/movie/[id]",
                      params: { id: movie.id },
                    })
                  }
                  style={styles.row}
                >
                  <Image
                    contentFit="cover"
                    source={{ uri: movie.poster }}
                    style={styles.poster}
                    transition={120}
                  />
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={styles.movieTitle}>
                      {movie.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.movieSubtitle}>
                      {movie.originalTitle}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.progress}>{entry.progressLabel}</Text>
                      <Text style={styles.time}>
                        {formatRelativeTime(entry.watchedAt, locale)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState
            body="Chưa có phim nào trong lịch sử xem."
            icon="time-outline"
            title="Lịch sử đang trống"
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Layout.tabBarHeight + 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    ...Typography.heroTitle,
    color: Colors.text.primary,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 6,
    maxWidth: 260,
  },
  list: {
    gap: 12,
  },
  row: {
    borderRadius: 8,
    backgroundColor: Colors.background.surface,
    padding: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  poster: {
    width: 74,
    height: 110,
    borderRadius: 8,
    backgroundColor: Colors.background.elevated,
  },
  copy: {
    flex: 1,
  },
  movieTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  movieSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 3,
  },
  metaRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progress: {
    ...Typography.body,
    color: Colors.accent.primary,
  },
  time: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
