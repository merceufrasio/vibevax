import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/shared/EmptyState";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { genreFilters } from "@/data/genres";
import { useMovies } from "@/hooks/useMovies";
import { useSourceSettings } from "@/hooks/useSourceSettings";
import { sourceItemToMovie } from "@/sources/adapters";
import { SourceRepository } from "@/sources/sourceRepository";
import type { SourceMovieItem } from "@/sources/types";

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; genre?: string }>();
  const { t } = useTranslation();
  const { searchMovies } = useMovies();
  const { activeSource } = useSourceSettings();
  const [query, setQuery] = useState(params.q ?? "");
  const [activeGenre, setActiveGenre] = useState<string>(
    params.genre ?? "Tất cả",
  );
  const [sourceResults, setSourceResults] = useState<SourceMovieItem[]>([]);
  const [isSourceSearching, setIsSourceSearching] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    "Thanh Tra Bí Mật",
    "Project Aurora",
    "Anime",
  ]);

  const results = useMemo(
    () => searchMovies(query, activeGenre),
    [activeGenre, query, searchMovies],
  );

  const handleSelectRecent = (value: string) => {
    setQuery(value);
    void runSourceSearch(value);
  };

  const runSourceSearch = async (value: string) => {
    const keyword = value.trim();

    if (!activeSource || !keyword) {
      setSourceResults([]);
      return;
    }

    setIsSourceSearching(true);
    setSourceSearchError(null);

    try {
      const repository = await SourceRepository.create(activeSource);
      const response = await repository.search(keyword, { page: 1, limit: 24 });
      setSourceResults(response.items);
    } catch (error) {
      setSourceResults([]);
      setSourceSearchError(String(error));
    } finally {
      setIsSourceSearching(false);
    }
  };

  const rememberQuery = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    setRecentSearches((current) => [
      trimmed,
      ...current.filter((item) => item !== trimmed),
    ].slice(0, 6));
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconButton
            icon={
              <Ionicons
                color={Colors.text.primary}
                name="chevron-back"
                size={20}
              />
            }
            onPress={() => router.back()}
          />
          <Text style={styles.title}>{t("search.title")}</Text>
          <LanguageToggle />
        </View>

        <SearchBar
          autoFocus
          onChangeText={(value) => {
            setQuery(value);
            if (!value.trim()) {
              setSourceResults([]);
            }
          }}
          onSubmit={() => {
            rememberQuery(query);
            void runSourceSearch(query);
          }}
          value={query}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("sections.recentSearches")}</Text>
          <ScrollView
            contentContainerStyle={styles.chips}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {recentSearches.map((item) => (
              <Pressable
                key={item}
                onPress={() => handleSelectRecent(item)}
                style={styles.recentChip}
              >
                <Text style={styles.recentLabel}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("search.genres")}</Text>
          <ScrollView
            contentContainerStyle={styles.chips}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {genreFilters.map((genre) => {
              const isActive = activeGenre === genre;

              return (
                <Pressable
                  key={genre}
                  onPress={() => setActiveGenre(genre)}
                  style={[
                    styles.filterChip,
                    isActive ? styles.filterChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      isActive
                        ? styles.filterLabelActive
                        : styles.filterLabelInactive,
                    ]}
                  >
                    {genre}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("search.results")} (
            {sourceResults.length || results.length}
            )
          </Text>
          {isSourceSearching ? (
            <Text style={styles.sourceMeta}>Đang tìm trên {activeSource?.name}</Text>
          ) : null}
          {sourceSearchError ? (
            <Text style={styles.sourceError}>{sourceSearchError}</Text>
          ) : null}
          {sourceResults.length ? (
            <SearchResults
              movies={sourceResults.map(sourceItemToMovie)}
              onPressMovie={(movie) => {
                rememberQuery(query || movie.title);
                router.push({
                  pathname: "/movie/[id]",
                  params: { id: movie.id, sourceId: activeSource?.id ?? "" },
                });
              }}
            />
          ) : results.length ? (
            <SearchResults
              movies={results}
              onPressMovie={(movie) => {
                rememberQuery(query || movie.title);
                router.push({
                  pathname: "/movie/[id]",
                  params: { id: movie.id },
                });
              }}
            />
          ) : (
            <EmptyState
              body={t("search.emptyBody")}
              icon="search-outline"
              title={t("search.emptyTitle")}
            />
          )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
    marginBottom: 12,
  },
  sourceMeta: {
    ...Typography.caption,
    color: Colors.accent.primary,
    marginBottom: 12,
  },
  sourceError: {
    ...Typography.caption,
    color: Colors.accent.danger,
    marginBottom: 12,
  },
  chips: {
    gap: 10,
    paddingRight: 20,
  },
  recentChip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background.surface,
  },
  recentLabel: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  filterLabel: {
    ...Typography.body,
  },
  filterLabelActive: {
    color: Colors.text.inverse,
    fontFamily: "Inter_600SemiBold",
  },
  filterLabelInactive: {
    color: Colors.text.secondary,
  },
});
