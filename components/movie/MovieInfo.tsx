import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";
import type { Movie } from "@/types/movie";

type MovieInfoProps = {
  movie: Movie;
  selectedEpisodeNumber?: number;
};

export function MovieInfo({ movie, selectedEpisodeNumber }: MovieInfoProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{movie.title}</Text>
      <Text style={styles.subtitle}>{movie.originalTitle}</Text>

      <View style={styles.badges}>
        <Badge label={`IMDb ${movie.imdbRating.toFixed(1)}`} tone="gold" />
        <Badge label={movie.ageRating} tone="outline" />
        <Badge label={`${movie.year}`} tone="outline" />
        {movie.durationLabel ? (
          <Badge label={movie.durationLabel} tone="outline" />
        ) : null}
        <Badge label={movie.subtitleType} tone="outline" />
        <Badge label={`Phần ${movie.currentPart}`} tone="outline" />
        <Badge
          label={`Tập ${selectedEpisodeNumber ?? movie.currentEpisode}`}
          tone="outline"
        />
      </View>

      <View style={styles.genres}>
        {movie.genres.map((genre, index) => (
          <View key={`${genre}-${index}`} style={styles.genrePill}>
            <Text style={styles.genreLabel}>{genre}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Nội dung</Text>
      <Text numberOfLines={expanded ? undefined : 4} style={styles.description}>
        {movie.description}
      </Text>
      <Pressable onPress={() => setExpanded((current) => !current)}>
        <Text style={styles.expandText}>
          {expanded ? "Thu gọn" : "Mở rộng"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  title: {
    ...Typography.heroTitle,
    color: Colors.text.primary,
    fontSize: 32,
    lineHeight: 38,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 6,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  genres: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  genrePill: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.background.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  genreLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  heading: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
    marginTop: 22,
    marginBottom: 8,
  },
  description: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  expandText: {
    ...Typography.body,
    color: Colors.accent.primary,
    marginTop: 8,
  },
});
