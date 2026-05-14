import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useSourceImageSource } from "@/hooks/useSourceImageSource";
import type { Movie } from "@/types/movie";

type MovieCardProps = {
  movie: Movie;
  onPress?: () => void;
  width?: number;
};

function getEpisodePill(movie: Movie) {
  if (movie.totalEpisodes === 1) {
    return movie.durationLabel || movie.subtitleType;
  }

  return `${movie.subtitleType}.${movie.currentEpisode}`;
}

export function MovieCard({ movie, onPress, width = Layout.posterWidth }: MovieCardProps) {
  const posterHeight = Math.round(width * (Layout.posterHeight / Layout.posterWidth));
  const posterSource = useSourceImageSource(movie.poster, undefined, movie.title, movie.year);

  return (
    <Pressable onPress={onPress} style={[styles.container, { width }]}>
      <View style={styles.posterWrap}>
        <Image
          contentFit="cover"
          source={posterSource}
          style={[
            styles.poster,
            {
              width,
              height: posterHeight,
            },
          ]}
          transition={180}
        />
        <View style={styles.pill}>
          <Text style={styles.pillText}>{getEpisodePill(movie)}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.title}>
        {movie.title}
      </Text>
      <Text numberOfLines={1} style={styles.subtitle}>
        {movie.originalTitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {},
  posterWrap: {
    borderRadius: Layout.cardRadius,
    overflow: "hidden",
    backgroundColor: Colors.background.surface,
    marginBottom: 10,
  },
  poster: {
    borderRadius: Layout.cardRadius,
  },
  pill: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    minHeight: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,24,39,0.88)",
  },
  pillText: {
    ...Typography.label,
    color: Colors.text.primary,
  },
  title: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
});
