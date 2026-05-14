import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { MovieCard } from "@/components/shared/MovieCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useSourceSettings } from "@/hooks/useSourceSettings";
import { sourceItemToMovie } from "@/sources/adapters";
import { SourceRepository } from "@/sources/sourceRepository";
import type { PluginRegistryItem, SourceMovieItem } from "@/sources/types";

const RECENT_SEARCHES_KEY = "@revax/search-recent";
const ALL_SOURCES_SCOPE = "__all__";

type SearchGroupResult = {
  source: PluginRegistryItem;
  items: SourceMovieItem[];
  error?: string;
};

async function loadRecentSearches() {
  const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const {
    activeSource,
    activeSourceId,
    registry,
  } = useSourceSettings();
  const [query, setQuery] = useState(params.q ?? "");
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    activeSourceId || ALL_SOURCES_SCOPE,
  );
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [singleSourceResults, setSingleSourceResults] = useState<SourceMovieItem[]>([]);
  const [allSourceResults, setAllSourceResults] = useState<SearchGroupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const plugins = registry?.plugins ?? [];
  const selectedSource = useMemo(
    () => plugins.find((plugin) => plugin.id === selectedSourceId) ?? activeSource ?? null,
    [activeSource, plugins, selectedSourceId],
  );
  const isAllSources = selectedSourceId === ALL_SOURCES_SCOPE;

  useEffect(() => {
    void loadRecentSearches().then(setRecentSearches);
  }, []);

  useEffect(() => {
    if (!selectedSourceId && activeSourceId) {
      setSelectedSourceId(activeSourceId);
    }
  }, [activeSourceId, selectedSourceId]);

  const rememberQuery = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const nextRecent = [
      trimmed,
      ...recentSearches.filter((item) => item !== trimmed),
    ].slice(0, 8);

    setRecentSearches(nextRecent);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecent));
  };

  const clearResults = () => {
    setSingleSourceResults([]);
    setAllSourceResults([]);
    setSearchError(null);
  };

  const runSingleSourceSearch = async (keyword: string, source: PluginRegistryItem) => {
    const repository = await SourceRepository.create(source);
    const response = await repository.search(keyword, { page: 1, limit: 24 });
    return response.items;
  };

  const runAllSourcesSearch = async (keyword: string) => {
    const settled = await Promise.allSettled(
      plugins.map(async (plugin) => ({
        source: plugin,
        items: await runSingleSourceSearch(keyword, plugin),
      })),
    );

    return settled.map((result, index) => {
      const source = plugins[index];

      if (result.status === "fulfilled") {
        return {
          source,
          items: result.value.items,
        } satisfies SearchGroupResult;
      }

      return {
        source,
        items: [],
        error: String(result.reason),
      } satisfies SearchGroupResult;
    });
  };

  const submitSearch = async (rawValue?: string) => {
    const keyword = (rawValue ?? query).trim();

    if (!keyword) {
      clearResults();
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      await rememberQuery(keyword);

      if (isAllSources) {
        setSingleSourceResults([]);
        setAllSourceResults(await runAllSourcesSearch(keyword));
        return;
      }

      if (!selectedSource) {
        throw new Error("Chưa có nguồn phim đang được chọn.");
      }

      setAllSourceResults([]);
      setSingleSourceResults(await runSingleSourceSearch(keyword, selectedSource));
    } catch (error) {
      clearResults();
      setSearchError(String(error));
    } finally {
      setIsSearching(false);
    }
  };

  const hasSingleSourceResults = singleSourceResults.length > 0;
  const hasAllSourceResults = allSourceResults.some(
    (group) => group.items.length || group.error,
  );

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
          <Text style={styles.title}>Tìm kiếm</Text>
          <View style={styles.headerSpacer} />
        </View>

        <SearchBar
          autoFocus
          onChangeText={(value) => {
            setQuery(value);
            if (!value.trim()) {
              clearResults();
            }
          }}
          onSubmit={() => {
            void submitSearch();
          }}
          value={query}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nguồn tìm kiếm</Text>
          <ScrollView
            contentContainerStyle={styles.scopeChips}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <Pressable
              onPress={() => setSelectedSourceId(activeSourceId || ALL_SOURCES_SCOPE)}
              style={[
                styles.scopeChip,
                selectedSourceId === (activeSourceId || ALL_SOURCES_SCOPE)
                  ? styles.scopeChipActive
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.scopeLabel,
                  selectedSourceId === (activeSourceId || ALL_SOURCES_SCOPE)
                    ? styles.scopeLabelActive
                    : styles.scopeLabelInactive,
                ]}
              >
                {activeSource ? `Hiện tại: ${activeSource.name}` : "Nguồn hiện tại"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedSourceId(ALL_SOURCES_SCOPE)}
              style={[
                styles.scopeChip,
                isAllSources ? styles.scopeChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.scopeLabel,
                  isAllSources ? styles.scopeLabelActive : styles.scopeLabelInactive,
                ]}
              >
                Tất cả nguồn
              </Text>
            </Pressable>

            {plugins.map((plugin) => {
              const isActive = selectedSourceId === plugin.id;
              return (
                <Pressable
                  key={plugin.id}
                  onPress={() => setSelectedSourceId(plugin.id)}
                  style={[styles.scopeChip, isActive ? styles.scopeChipActive : null]}
                >
                  <Text
                    style={[
                      styles.scopeLabel,
                      isActive ? styles.scopeLabelActive : styles.scopeLabelInactive,
                    ]}
                  >
                    {plugin.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {recentSearches.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tìm gần đây</Text>
              <Pressable
                onPress={async () => {
                  setRecentSearches([]);
                  await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
                }}
              >
                <Text style={styles.clearText}>Xóa</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.recentRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {recentSearches.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setQuery(item);
                    void submitSearch(item);
                  }}
                  style={styles.recentChip}
                >
                  <Text style={styles.recentLabel}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isAllSources
              ? `Kết quả tất cả nguồn (${allSourceResults.reduce(
                  (total, group) => total + group.items.length,
                  0,
                )})`
              : `Kết quả (${singleSourceResults.length})`}
          </Text>

          {isSearching ? (
            <Text style={styles.searchMeta}>
              {isAllSources
                ? "Đang tìm trên tất cả nguồn..."
                : `Đang tìm trên ${selectedSource?.name ?? "nguồn hiện tại"}...`}
            </Text>
          ) : null}

          {searchError ? (
            <Text style={styles.searchError}>{searchError}</Text>
          ) : null}

          {!isSearching && !hasSingleSourceResults && !hasAllSourceResults && !searchError ? (
            <EmptyState
              body="Nhập từ khóa rồi chọn nguồn để bắt đầu tìm phim."
              icon="search-outline"
              title="Chưa có kết quả"
            />
          ) : null}

          {!isAllSources && hasSingleSourceResults ? (
            <SearchResults
              movies={singleSourceResults.map(sourceItemToMovie)}
              onPressMovie={(movie) => {
                router.push({
                  pathname: "/movie/[id]",
                  params: {
                    id: movie.id,
                    sourceId: selectedSource?.id ?? "",
                  },
                });
              }}
            />
          ) : null}

          {isAllSources && hasAllSourceResults ? (
            <View style={styles.allSourcesList}>
              {allSourceResults.map((group) => {
                if (!group.items.length && !group.error) {
                  return null;
                }

                return (
                  <View key={group.source.id} style={styles.groupCard}>
                    <View style={styles.groupHeader}>
                      <View style={styles.groupTitleWrap}>
                        {group.source.iconUrl ? (
                          <Image
                            contentFit="cover"
                            source={{ uri: group.source.iconUrl }}
                            style={styles.groupIcon}
                          />
                        ) : null}
                        <Text style={styles.groupTitle}>{group.source.name}</Text>
                      </View>
                      <Text style={styles.groupCount}>
                        {group.error ? "Lỗi" : `${group.items.length} phim`}
                      </Text>
                    </View>

                    {group.error ? (
                      <Text style={styles.groupError}>{group.error}</Text>
                    ) : (
                      <ScrollView
                        contentContainerStyle={styles.groupRow}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        {group.items.map((item) => {
                          const movie = sourceItemToMovie(item);
                          return (
                            <MovieCard
                              key={`${group.source.id}:${movie.id}`}
                              movie={movie}
                              onPress={() =>
                                router.push({
                                  pathname: "/movie/[id]",
                                  params: {
                                    id: movie.id,
                                    sourceId: group.source.id,
                                  },
                                })
                              }
                              width={132}
                            />
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerSpacer: {
    width: 42,
    height: 42,
  },
  title: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
    marginBottom: 12,
  },
  clearText: {
    ...Typography.body,
    color: Colors.accent.primary,
  },
  scopeChips: {
    gap: 10,
    paddingRight: 20,
  },
  scopeChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  scopeChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  scopeLabel: {
    ...Typography.body,
  },
  scopeLabelActive: {
    color: Colors.text.inverse,
    fontFamily: "Inter_600SemiBold",
  },
  scopeLabelInactive: {
    color: Colors.text.secondary,
  },
  recentRow: {
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
  searchMeta: {
    ...Typography.caption,
    color: Colors.accent.primary,
    marginBottom: 12,
  },
  searchError: {
    ...Typography.caption,
    color: Colors.accent.danger,
    marginBottom: 12,
  },
  allSourcesList: {
    gap: 16,
  },
  groupCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    padding: 14,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  groupTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  groupIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Colors.background.elevated,
  },
  groupTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
    flex: 1,
  },
  groupCount: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  groupError: {
    ...Typography.caption,
    color: Colors.accent.danger,
  },
  groupRow: {
    gap: 12,
    paddingRight: 8,
  },
});
