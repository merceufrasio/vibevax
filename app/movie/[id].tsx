import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CastList } from "@/components/movie/CastList";
import { MovieHeader } from "@/components/movie/MovieHeader";
import { MovieInfo } from "@/components/movie/MovieInfo";
import { MoviePlayer } from "@/components/movie/MoviePlayer";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useMovies } from "@/hooks/useMovies";
import { useSourceMovieDetail } from "@/hooks/useSourceMovieDetail";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { sourceDetailToMovie } from "@/sources/adapters";

type EpisodeGroup = {
  label: string;
  items: Array<{
    id: string;
    title: string;
  }>;
};

function splitEpisodeTitle(rawTitle: string) {
  const [groupLabel, ...rest] = rawTitle.split(" - ");

  return {
    groupLabel: groupLabel?.trim() || "Bản xem",
    itemTitle: rest.join(" - ").trim() || rawTitle,
  };
}

export default function MovieDetailScreen() {
  const router = useRouter();
  const { id, sourceId } = useLocalSearchParams<{
    id: string;
    sourceId?: string;
  }>();
  const { addHistory } = useWatchHistory();
  const { getMovieById } = useMovies();
  const {
    challenge,
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

  const defaultEpisode =
    movie?.episodes.find((episode) => episode.number === movie.currentEpisode) ??
    movie?.episodes.at(-1) ??
    movie?.episodes[0];
  const defaultEpisodeId = defaultEpisode?.id;
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | undefined>(
    defaultEpisodeId,
  );

  // Quality selector state (for plugins that provide qualityOptions)
  const qualityOptions = sourceDetail?.qualityOptions;
  const [selectedQuality, setSelectedQuality] = useState<string>(
    qualityOptions?.[0]?.value ?? "",
  );

  useEffect(() => {
    if (qualityOptions?.length && !selectedQuality) {
      setSelectedQuality(qualityOptions[0].value);
    }
  }, [qualityOptions, selectedQuality]);

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

  const groupedEpisodes: EpisodeGroup[] = movie
    ? movie.episodes.reduce<EpisodeGroup[]>((groups, episode) => {
        const { groupLabel, itemTitle } = splitEpisodeTitle(episode.title);
        const existingGroup = groups.find((group) => group.label === groupLabel);
        const item = {
          id: episode.id,
          title: itemTitle,
        };

        if (existingGroup) {
          existingGroup.items.push(item);
        } else {
          groups.push({
            label: groupLabel,
            items: [item],
          });
        }

        return groups;
      }, [])
    : [];

  const openChallenge = () => {
    if (!challenge) {
      return;
    }

    router.push({
      pathname: "/source-verify",
      params: { challengeId: challenge.id },
    });
  };

  const handleWatch = async (episodeId?: string) => {
    if (!movie) {
      return;
    }

    addHistory(movie, selectedEpisodeLabel || movie.lastEpisodeLabel || "Đã xem", sourceId);

    if (isSourceMovie && episodeId) {
      // Swap quality type in the episode ID (4th segment: slug|postId|svId|type)
      let resolvedId = episodeId;
      if (selectedQuality) {
        const parts = episodeId.split("|");
        if (parts.length >= 4) {
          parts[3] = selectedQuality;
          resolvedId = parts.join("|");
        }
      }
      await resolveStream(resolvedId);
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
            body={sourceError ?? "Thiếu dữ liệu phim từ nguồn hiện tại."}
            icon="film-outline"
            title="Không tìm thấy phim"
          />
          {challenge ? (
            <Button
              label="Xác minh nguồn"
              onPress={openChallenge}
              style={styles.fallbackButton}
            />
          ) : null}
          <Button
            label="Quay lại"
            onPress={() => router.back()}
            style={styles.fallbackButton}
          />
        </View>
      </SafeAreaView>
    );
  }

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

        {challenge ? (
          <View style={styles.challengePanel}>
            <Text style={styles.challengeTitle}>Nguồn cần xác minh Cloudflare</Text>
            <Text style={styles.challengeBody}>
              Hoàn tất bước xác minh để tiếp tục tải dữ liệu hoặc phát phim từ nguồn
              này.
            </Text>
            <Button label="Mở xác minh" onPress={openChallenge} size="md" />
          </View>
        ) : null}

        {groupedEpisodes.length ? (
          <View style={styles.selectorSection}>
            <Text style={styles.selectorTitle}>Chọn bản xem</Text>

            {qualityOptions && qualityOptions.length > 1 ? (
              <ScrollView
                contentContainerStyle={styles.qualityRow}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.qualityScroll}
              >
                {qualityOptions.map((opt) => {
                  const isQActive = opt.value === selectedQuality;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSelectedQuality(opt.value)}
                      style={[
                        styles.qualityChip,
                        isQActive ? styles.qualityChipActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.qualityChipText,
                          isQActive ? styles.qualityChipTextActive : null,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            <View style={styles.selectorGroups}>
              {groupedEpisodes.map((group) => (
                <View key={group.label} style={styles.selectorGroup}>
                  <Text style={styles.selectorGroupTitle}>{group.label}</Text>
                  <ScrollView
                    contentContainerStyle={styles.selectorRow}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {group.items.map((item, index) => {
                      const isActive = item.id === selectedEpisodeId;

                      return (
                        <Pressable
                          key={`${item.id}-${index}`}
                          onPress={() => {
                            setSelectedEpisodeId(item.id);
                            void handleWatch(item.id);
                          }}
                          style={[
                            styles.selectorCard,
                            isActive ? styles.selectorCardActive : null,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.selectorCardTitle,
                              isActive ? styles.selectorCardTitleActive : null,
                            ]}
                          >
                            {item.title}
                          </Text>
                          {isResolvingStream && isActive ? (
                            <Text style={styles.selectorCardStatus}>Đang lấy link...</Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <MovieInfo movie={movie} selectedEpisodeNumber={selectedEpisodeNumber} />

        {movie.cast.length ? (
          <View style={styles.castSection}>
            <Text style={styles.castHeading}>Diễn viên</Text>
            <CastList cast={movie.cast} />
          </View>
        ) : null}
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
  selectorSection: {
    marginBottom: 18,
  },
  selectorTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  selectorGroups: {
    gap: 12,
    marginTop: 14,
  },
  selectorGroup: {
    gap: 8,
  },
  selectorGroupTitle: {
    ...Typography.body,
    color: Colors.accent.primary,
    fontFamily: "Inter_600SemiBold",
  },
  selectorRow: {
    gap: 10,
    paddingRight: 12,
  },
  selectorCard: {
    minWidth: 148,
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
  },
  selectorCardActive: {
    backgroundColor: "rgba(79,209,197,0.12)",
    borderColor: "rgba(79,209,197,0.42)",
  },
  selectorCardTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  selectorCardTitleActive: {
    color: Colors.accent.primary,
  },
  selectorCardStatus: {
    ...Typography.caption,
    color: Colors.text.primary,
    marginTop: 4,
  },
  challengePanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(79,209,197,0.3)",
    backgroundColor: "rgba(79,209,197,0.08)",
    padding: 14,
    marginBottom: 18,
  },
  challengeTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  challengeBody: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 8,
    marginBottom: 12,
  },
  castSection: {
    marginTop: 8,
  },
  castHeading: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
    marginBottom: 12,
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
  qualityScroll: {
    marginTop: 10,
    marginBottom: 4,
  },
  qualityRow: {
    gap: 8,
    paddingRight: 12,
  },
  qualityChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qualityChipActive: {
    backgroundColor: "rgba(79,209,197,0.15)",
    borderColor: Colors.accent.primary,
  },
  qualityChipText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontFamily: "Inter_600SemiBold",
  },
  qualityChipTextActive: {
    color: Colors.accent.primary,
  },
});
