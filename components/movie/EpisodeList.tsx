import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "@/components/ui/Badge";
import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";
import type { Episode, Movie } from "@/types/movie";

type EpisodeListProps = {
  activeEpisodeId?: string;
  movie: Movie;
  onPressEpisode?: (episode: Episode) => void;
};

export function EpisodeList({
  activeEpisodeId,
  movie,
  onPressEpisode,
}: EpisodeListProps) {
  return (
    <View style={styles.container}>
      {movie.episodes.map((episode) => {
        const isCurrent =
          activeEpisodeId != null
            ? episode.id === activeEpisodeId
            : episode.number === movie.currentEpisode;

        return (
          <Pressable
            key={episode.id}
            onPress={() => onPressEpisode?.(episode)}
            style={[styles.row, isCurrent ? styles.rowActive : null]}
          >
            <View style={styles.leading}>
              <View
                style={[
                  styles.numberWrap,
                  isCurrent ? styles.numberWrapActive : null,
                ]}
              >
                <Text style={[styles.number, isCurrent ? styles.numberActive : null]}>
                  {episode.number}
                </Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.title}>{episode.title}</Text>
                <Text style={styles.meta}>{episode.durationMinutes} phút</Text>
              </View>
            </View>

            <View style={styles.trailing}>
              {episode.isNew ? <Badge label="NEW" tone="accent" /> : null}
              {isCurrent ? (
                <Ionicons
                  color={Colors.accent.primary}
                  name="play-circle"
                  size={22}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  row: {
    minHeight: 68,
    borderRadius: 8,
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowActive: {
    borderColor: "rgba(79,209,197,0.28)",
    backgroundColor: "rgba(79,209,197,0.08)",
  },
  leading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  numberWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  numberWrapActive: {
    backgroundColor: Colors.accent.primary,
  },
  number: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  numberActive: {
    color: Colors.text.inverse,
  },
  copy: {
    flex: 1,
  },
  title: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  meta: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
