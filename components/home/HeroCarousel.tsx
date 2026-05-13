import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";

import { MovieCardLarge } from "@/components/shared/MovieCardLarge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { useFavorites } from "@/hooks/useFavorites";
import type { Movie } from "@/types/movie";

type HeroCarouselProps = {
  movies: Movie[];
};

export function HeroCarousel({ movies }: HeroCarouselProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [activeIndex, setActiveIndex] = useState(0);
  const slideWidth = Layout.heroCardWidth + 24;

  const activeMovie = useMemo(
    () => movies[activeIndex] ?? movies[0],
    [activeIndex, movies],
  );

  const handleWebScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / slideWidth,
    );
    setActiveIndex(Math.max(0, Math.min(nextIndex, movies.length - 1)));
  };

  if (!activeMovie) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Image
        contentFit="cover"
        source={{ uri: activeMovie.backdrop }}
        style={styles.backdrop}
        transition={220}
      />
      <LinearGradient
        colors={[
          "rgba(10,14,23,0.2)",
          "rgba(10,14,23,0.78)",
          Colors.background.primary,
        ]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.carouselWrap}>
        <ScrollView
          contentContainerStyle={styles.webCarouselContent}
          decelerationRate="fast"
          horizontal
          onMomentumScrollEnd={handleWebScrollEnd}
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={slideWidth}
        >
          {movies.map((item) => (
            <View key={item.id} style={styles.slide}>
              <MovieCardLarge
                movie={item}
                onPress={() =>
                  router.push({
                    pathname: "/movie/[id]",
                    params: { id: item.id },
                  })
                }
              />
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.meta}>
        <View style={styles.badges}>
          <Badge label={`IMDb ${activeMovie.imdbRating.toFixed(1)}`} tone="gold" />
          <Badge label={`${activeMovie.year}`} tone="outline" />
          <Badge label={activeMovie.quality} tone="accent" />
        </View>

        <Text style={styles.title}>{activeMovie.title}</Text>
        <Text style={styles.subtitle}>{activeMovie.originalTitle}</Text>

        <View style={styles.actions}>
          <Button
            icon={
              <Ionicons color={Colors.text.inverse} name="play" size={18} />
            }
            label={t("actions.watchNow")}
            onPress={() =>
              router.push({
                pathname: "/movie/[id]",
                params: { id: activeMovie.id },
              })
            }
            style={styles.primaryButton}
          />
          <Button
            icon={
              <Ionicons
                color={Colors.text.primary}
                name={isFavorite(activeMovie.id) ? "heart" : "heart-outline"}
                size={18}
              />
            }
            label={t("actions.favorite")}
            onPress={() => toggleFavorite(activeMovie.id)}
            style={styles.secondaryButton}
            variant="secondary"
          />
        </View>

        <Text numberOfLines={2} style={styles.description}>
          {activeMovie.description}
        </Text>

        <View style={styles.pagination}>
          {movies.map((movie, index) => (
            <View
              key={movie.id}
              style={[
                styles.dot,
                index === activeIndex ? styles.dotActive : null,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 690,
    marginHorizontal: -Layout.screenPadding,
    paddingTop: 12,
    paddingBottom: 26,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  carouselWrap: {
    marginBottom: 24,
  },
  webCarouselContent: {
    paddingHorizontal: Math.max(
      (Layout.window.width - (Layout.heroCardWidth + 24)) / 2,
      12,
    ),
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    width: Layout.heroCardWidth + 24,
  },
  meta: {
    paddingHorizontal: Layout.screenPadding,
    alignItems: "center",
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: {
    color: Colors.text.primary,
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    lineHeight: 36,
    textAlign: "center",
  },
  subtitle: {
    color: Colors.text.secondary,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 18,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
  },
  secondaryButton: {
    flex: 1,
  },
  description: {
    color: Colors.text.secondary,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 18,
    maxWidth: 520,
  },
  pagination: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.accent.primary,
  },
});
