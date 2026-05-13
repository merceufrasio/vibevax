import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CastList } from "@/components/movie/CastList";
import { EpisodeList } from "@/components/movie/EpisodeList";
import { MovieActions } from "@/components/movie/MovieActions";
import { MovieHeader } from "@/components/movie/MovieHeader";
import { MovieInfo } from "@/components/movie/MovieInfo";
import { MoviePlayer } from "@/components/movie/MoviePlayer";
import { RecommendList } from "@/components/movie/RecommendList";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useFavorites } from "@/hooks/useFavorites";
import { useMovies } from "@/hooks/useMovies";
import { useSourceMovieDetail } from "@/hooks/useSourceMovieDetail";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { sourceDetailToMovie } from "@/sources/adapters";
import type { DetailTab } from "@/types/movie";

const tabs: DetailTab[] = ["episodes", "cast", "recommendations"];

export default function MovieDetailScreen() {
  const router = useRouter();
  const { id, sourceId } = useLocalSearchParams<{
    id: string;
    sourceId?: string;
  }>();
  const { t } = useTranslation();
  const { addHistory } = useWatchHistory();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getMovieById, getRecommendedMovies } = useMovies();
  const [activeTab, setActiveTab] = useState<DetailTab>("episodes");
  const {
    clearStream,
    detail: sourceDetail,
    error: sourceError,
    isLoading: isSourceLoading,
    isResolvingStream,
    resolveStream,
    stream,
  } = useSourceMovieDetail(sourceId, id);

  const isSourceMovie = Boolean(sourceId);
  const movie = isSourceMovie
    ? sourceDetail
      ? sourceDetailToMovie(sourceDetail)
      : null
    : getMovieById(id);
  const favoriteId = isSourceMovie ? `${sourceId}:${id}` : id;
  const defaultEpisode =
    movie?.episodes.find((episode) => episode.number === movie.currentEpisode) ??
    movie?.episodes.at(-1) ??
    movie?.episodes[0];
  const defaultEpisodeId = defaultEpisode?.id;
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | undefined>(
    defaultEpisodeId,
  );

  useEffect(() => {
    setSelectedEpisodeId(defaultEpisodeId);
  }, [defaultEpisodeId, movie?.id]);

  const selectedEpisode =
    movie?.episodes.find((episode) => episode.id === selectedEpisodeId) ??
    defaultEpisode;
  const selectedEpisodeNumber = selectedEpisode?.number;
  const selectedEpisodeLabel = selectedEpisodeNumber
    ? `Tập ${selectedEpisodeNumber}`
    : movie?.releaseNote;

  const handleWatch = async (episodeId?: string) => {
    if (!movie) {
      return;
    }

    addHistory(movie.id, movie.lastEpisodeLabel);

    if (isSourceMovie && episodeId) {
      await resolveStream(episodeId);
    }
  };

  if (isSourceMovie && isSourceLoading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.fallback}>
          <EmptyState
            body="ReVax đang lấy dữ liệu từ plugin đã chọn."
            icon="cloud-download-outline"
            title="Đang tải phim"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!movie) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.fallback}>
          <EmptyState
            body={sourceError ?? "Movie data is missing from the current source."}
            icon="film-outline"
            title="Không tìm thấy phim"
          />
          <Button
            label="Quay lại"
            onPress={() => router.back()}
            style={styles.fallbackButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const recommendedMovies = isSourceMovie ? [] : getRecommendedMovies(movie);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {stream ? (
          <MoviePlayer onClose={clearStream} stream={stream} />
        ) : (
          <MovieHeader
            movie={movie}
            onBack={() => router.back()}
            selectedEpisodeLabel={selectedEpisodeLabel}
          />
        )}

        <View style={styles.primaryActions}>
          <Button
            icon={<Ionicons color={Colors.text.inverse} name="play" size={18} />}
            label={isResolvingStream ? "Đang lấy link" : t("actions.watchNow")}
            onPress={() => handleWatch(selectedEpisodeId ?? defaultEpisodeId)}
            style={styles.actionButton}
          />
          <Button
            icon={<Ionicons color={Colors.text.primary} name="list" size={18} />}
            label={t("actions.episodes")}
            onPress={() => setActiveTab("episodes")}
            style={styles.actionButton}
            variant="outline"
          />
        </View>

        <MovieInfo
          movie={movie}
          selectedEpisodeNumber={selectedEpisodeNumber}
        />

        <MovieActions
          actions={[
            {
              icon: isFavorite(favoriteId) ? "heart" : "heart-outline",
              label: t("actions.favorite"),
              onPress: () => toggleFavorite(favoriteId),
            },
            {
              icon: "add",
              label: t("actions.addToList"),
              onPress: () => addHistory(movie.id, movie.lastEpisodeLabel),
            },
            {
              icon: "happy-outline",
              label: t("actions.rate"),
              onPress: () => undefined,
            },
            {
              icon: "chatbubble-ellipses-outline",
              label: t("actions.comment"),
              onPress: () => undefined,
            },
            {
              icon: "paper-plane-outline",
              label: t("actions.share"),
              onPress: () => undefined,
            },
          ]}
        />

        <View style={styles.tabs}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab;

            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, isActive ? styles.tabActive : null]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                  ]}
                >
                  {t(`detail.tabs.${tab}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tabContent}>
          {activeTab === "episodes" ? (
            <EpisodeList
              activeEpisodeId={selectedEpisodeId}
              movie={movie}
              onPressEpisode={(episode) => {
                setSelectedEpisodeId(episode.id);
                void handleWatch(episode.id);
              }}
            />
          ) : null}
          {activeTab === "cast" ? <CastList cast={movie.cast} /> : null}
          {activeTab === "recommendations" && recommendedMovies.length ? (
            <RecommendList
              movies={recommendedMovies}
              onPressMovie={(nextMovie) =>
                router.push({
                  pathname: "/movie/[id]",
                  params: { id: nextMovie.id },
                })
              }
            />
          ) : null}
        </View>
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
    paddingBottom: 40,
  },
  primaryActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: Colors.background.surface,
    borderRadius: 8,
    padding: 4,
    marginTop: 8,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: Colors.accent.primary,
  },
  tabLabel: {
    ...Typography.body,
  },
  tabLabelActive: {
    color: Colors.text.inverse,
    fontFamily: "Inter_600SemiBold",
  },
  tabLabelInactive: {
    color: Colors.text.secondary,
  },
  tabContent: {
    marginTop: 16,
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPadding,
  },
  fallbackButton: {
    marginTop: 24,
    alignSelf: "center",
  },
});
