import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { Badge } from "@/components/ui/Badge";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { formatRating } from "@/utils/format";
import type { Movie } from "@/types/movie";

type MovieCardLargeProps = {
  movie: Movie;
  onPress?: () => void;
};

export function MovieCardLarge({ movie, onPress }: MovieCardLargeProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Image
        contentFit="cover"
        source={{ uri: movie.poster }}
        style={styles.poster}
        transition={180}
      />
      <LinearGradient
        colors={Colors.heroGradient}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.topRow}>
        <Badge label={`${movie.year}`} tone="outline" />
        <Badge label={movie.quality} tone="default" />
      </View>
      <View style={styles.bottomRow}>
        <Text numberOfLines={2} style={styles.title}>
          {movie.title}
        </Text>
        <Badge label={`IMDb ${formatRating(movie.imdbRating)}`} tone="gold" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: Layout.heroCardWidth,
    height: Layout.heroCardHeight,
    borderRadius: Layout.cardRadius,
    overflow: "hidden",
    justifyContent: "space-between",
    backgroundColor: Colors.background.surface,
    padding: 14,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bottomRow: {
    gap: 12,
  },
  title: {
    ...Typography.heroTitle,
    color: Colors.text.primary,
    fontSize: 24,
    lineHeight: 30,
    maxWidth: "82%",
  },
});

