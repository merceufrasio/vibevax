import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { MovieCardLarge } from "@/components/shared/MovieCardLarge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { useSourceImageSource } from "@/hooks/useSourceImageSource";
import type { Movie } from "@/types/movie";

type HeroCarouselProps = {
  movies: Movie[];
  sourceId?: string;
};

type LoopMovie = {
  key: string;
  movie: Movie;
};

export function HeroCarousel({ movies, sourceId }: HeroCarouselProps) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const slideWidth = Layout.heroCardWidth + 24;
  const [activeIndex, setActiveIndex] = useState(0);

  const loopedMovies = useMemo<LoopMovie[]>(() => {
    if (!movies.length) {
      return [];
    }

    if (movies.length === 1) {
      return [{ key: `${movies[0].id}-only`, movie: movies[0] }];
    }

    const firstMovie = movies[0];
    const lastMovie = movies[movies.length - 1];

    return [
      { key: `${lastMovie.id}-sentinel-start`, movie: lastMovie },
      ...movies.map((movie, index) => ({
        key: `${movie.id}-${index}`,
        movie,
      })),
      { key: `${firstMovie.id}-sentinel-end`, movie: firstMovie },
    ];
  }, [movies]);

  const activeMovie = movies[activeIndex] ?? movies[0];
  const backdropSource = useSourceImageSource(activeMovie?.backdrop, sourceId, activeMovie?.title, activeMovie?.year);

  useEffect(() => {
    if (!movies.length) {
      return;
    }

    setActiveIndex(0);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: movies.length > 1 ? slideWidth : 0,
        animated: false,
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [movies, slideWidth]);

  const getPageFromOffset = (offsetX: number) =>
    Math.max(0, Math.round(offsetX / slideWidth));

  const syncActiveIndex = (offsetX: number) => {
    if (!movies.length) {
      return 0;
    }

    if (movies.length === 1) {
      setActiveIndex(0);
      return 0;
    }

    const rawPage = Math.min(
      getPageFromOffset(offsetX),
      loopedMovies.length - 1,
    );

    if (rawPage === 0) {
      setActiveIndex(movies.length - 1);
      return rawPage;
    }

    if (rawPage === loopedMovies.length - 1) {
      setActiveIndex(0);
      return rawPage;
    }

    setActiveIndex(rawPage - 1);
    return rawPage;
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    syncActiveIndex(event.nativeEvent.contentOffset.x);
  };

  const handleScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (!movies.length || movies.length === 1) {
      setActiveIndex(0);
      return;
    }

    const rawPage = syncActiveIndex(event.nativeEvent.contentOffset.x);

    if (rawPage === 0) {
      scrollRef.current?.scrollTo({
        x: movies.length * slideWidth,
        animated: false,
      });
      return;
    }

    if (rawPage === loopedMovies.length - 1) {
      scrollRef.current?.scrollTo({
        x: slideWidth,
        animated: false,
      });
    }
  };

  if (!activeMovie) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Image
        contentFit="cover"
        source={backdropSource}
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
          ref={scrollRef}
          contentContainerStyle={styles.webCarouselContent}
          decelerationRate="fast"
          horizontal
          onMomentumScrollEnd={handleScrollEnd}
          onScroll={handleScroll}
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={slideWidth}
          scrollEventThrottle={16}
        >
          {loopedMovies.map(({ key, movie: item }) => (
            <View key={key} style={styles.slide}>
              <MovieCardLarge
                movie={item}
                onPress={() =>
                  router.push({
                    pathname: "/movie/[id]",
                    params: {
                      id: item.id,
                      ...(sourceId ? { sourceId } : {}),
                    },
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
            label="Xem phim"
            onPress={() =>
              router.push({
                pathname: "/movie/[id]",
                params: {
                  id: activeMovie.id,
                  ...(sourceId ? { sourceId } : {}),
                },
              })
            }
            style={styles.primaryButton}
          />
        </View>

        <Text numberOfLines={2} style={styles.description}>
          {activeMovie.description}
        </Text>

        <View style={styles.pagination}>
          {movies.map((_, index) => (
            <View
              key={index}
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
    paddingTop: 88,
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
