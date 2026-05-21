/**
 * SubtitleOverlay — Renders subtitles over the video player.
 *
 * Features:
 * - Parses both WebVTT (.vtt) and SubRip (.srt) formats
 * - Syncs subtitle display with current playback time
 * - Track selector with "Off" option
 * - Search subtitles online via Subdl API (by TMDB ID or movie name)
 * - Manual URL input for custom subtitle files
 */

import { Ionicons } from "@expo/vector-icons";
import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Colors } from "@/constants/Colors";

interface SubtitleTrack {
  lang: string;
  url: string;
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface Props {
  /** Pre-loaded subtitle tracks (from source plugin) */
  subtitles?: SubtitleTrack[];
  /** Current playback time in seconds */
  currentTime: number;
  /** Movie title for online search */
  movieTitle?: string;
  /** TMDB ID for precise search */
  tmdbId?: string;
  /** Season/episode for TV shows */
  season?: number;
  episode?: number;
}

const SUBDL_API_KEY = process.env.EXPO_PUBLIC_SUBDL_API_KEY || "";

/** Parse timestamp "HH:MM:SS,mmm" or "HH:MM:SS.mmm" to seconds */
function parseTimestamp(raw: string): number {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

/** Parse VTT or SRT content into cues */
function parseCues(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = text.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    let timingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timingIdx = i;
        break;
      }
    }
    if (timingIdx === -1) continue;

    const [startRaw, endRaw] = lines[timingIdx].split("-->");
    if (!startRaw || !endRaw) continue;

    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw.split(/\s/)[0]);
    const cueText = lines
      .slice(timingIdx + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .trim();

    if (cueText) {
      cues.push({ start, end, text: cueText });
    }
  }
  return cues;
}

/** Search subtitles from Subdl API */
async function searchSubdl(params: {
  filmName?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  languages?: string;
}): Promise<SubtitleTrack[]> {
  if (!SUBDL_API_KEY) return [];

  const query = new URLSearchParams();
  query.set("api_key", SUBDL_API_KEY);
  if (params.tmdbId) query.set("tmdb_id", params.tmdbId);
  else if (params.filmName) query.set("film_name", params.filmName);
  if (params.season) query.set("season_number", String(params.season));
  if (params.episode) query.set("episode_number", String(params.episode));
  query.set("languages", params.languages || "VI,EN");
  query.set("subs_per_page", "15");

  try {
    const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${query.toString()}`);
    if (!res.ok) return [];
    const data = await res.json() as {
      status: boolean;
      subtitles?: Array<{
        release_name: string;
        name: string;
        lang: string;
        url: string;
        hi: boolean;
      }>;
    };
    if (!data.status || !data.subtitles) return [];

    // Sort: Vietnamese first, then English, then others
    const sorted = [...data.subtitles].sort((a, b) => {
      const langOrder = (lang: string) => {
        const l = lang.toUpperCase();
        if (l === "VI" || l === "VIETNAMESE") return 0;
        if (l === "EN" || l === "ENGLISH") return 1;
        return 2;
      };
      return langOrder(a.language || a.lang) - langOrder(b.language || b.lang);
    });

    return sorted.map((s) => ({
      lang: `${s.lang}${s.hi ? " (HI)" : ""} - ${s.release_name || s.name}`,
      url: `https://dl.subdl.com${s.url}`,
    }));
  } catch {
    return [];
  }
}

export function SubtitleOverlay({
  subtitles = [],
  currentTime,
  movieTitle,
  tmdbId,
  season,
  episode,
}: Props) {
  const [allTracks, setAllTracks] = useState<SubtitleTrack[]>(subtitles);
  const [selectedTrackIdx, setSelectedTrackIdx] = useState<number>(-1); // -1 = off
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SubtitleTrack[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [tab, setTab] = useState<"tracks" | "search" | "url">("tracks");
  const fetchedUrlRef = useRef<string | null>(null);

  // Sync external subtitles prop
  useEffect(() => {
    if (subtitles.length > 0) {
      setAllTracks((prev) => {
        const existingUrls = new Set(prev.map((t) => t.url));
        const newTracks = subtitles.filter((s) => !existingUrls.has(s.url));
        return newTracks.length > 0 ? [...prev, ...newTracks] : prev;
      });
    }
  }, [subtitles]);

  // Fetch subtitle file when track changes
  useEffect(() => {
    if (selectedTrackIdx < 0 || !allTracks[selectedTrackIdx]) {
      setCues([]);
      fetchedUrlRef.current = null;
      return;
    }

    const track = allTracks[selectedTrackIdx];
    if (fetchedUrlRef.current === track.url) return;

    setIsLoading(true);
    fetchedUrlRef.current = track.url;

    (async () => {
      try {
        const res = await fetch(track.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const contentType = res.headers.get("content-type") || "";
        let srtContent = "";

        if (contentType.includes("zip") || track.url.endsWith(".zip")) {
          // Unzip and find .srt or .vtt file inside
          const arrayBuffer = await res.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);
          const subFile = Object.keys(zip.files).find(
            (name) => /\.(srt|vtt|ass)$/i.test(name) && !zip.files[name].dir,
          );
          if (!subFile) throw new Error("No subtitle file found in ZIP");
          srtContent = await zip.files[subFile].async("string");
        } else {
          srtContent = await res.text();
        }

        const parsed = parseCues(srtContent);
        if (parsed.length === 0) throw new Error("Could not parse subtitle file");

        if (__DEV__) {
          console.log("[SubtitleOverlay:parsed]", {
            cueCount: parsed.length,
            firstCue: parsed[0],
            lastCue: parsed[parsed.length - 1],
            sampleRaw: srtContent.substring(0, 300),
          });
        }

        setCues(parsed);
      } catch (err) {
        setCues([]);
        if (__DEV__) console.log("[SubtitleOverlay:fetchError]", (err as Error).message, track.url);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [selectedTrackIdx, allTracks]);

  // Find current cue
  const currentCue = useMemo(() => {
    for (const cue of cues) {
      if (currentTime >= cue.start && currentTime <= cue.end) return cue;
    }
    return null;
  }, [cues, currentTime]);

  // Debug: log subtitle state periodically
  useEffect(() => {
    if (__DEV__ && selectedTrackIdx >= 0) {
      console.log("[SubtitleOverlay:state]", {
        selectedTrackIdx,
        cueCount: cues.length,
        currentTime: Math.round(currentTime),
        currentCueText: currentCue?.text?.substring(0, 40),
        isLoading,
        trackUrl: allTracks[selectedTrackIdx]?.url?.substring(0, 60),
      });
    }
  }, [Math.floor(currentTime / 5)]); // log every 5 seconds

  // Search online
  const handleSearch = useCallback(async () => {
    setIsSearching(true);

    // Clean title for search: remove year/season suffixes, prefer English name
    let searchTitle = movieTitle || "";
    // Remove Vietnamese parenthetical info like "(phần 1)" or "(2026)"
    searchTitle = searchTitle.replace(/\s*\((?:phần|phan|mùa|season)\s*\d+\)\s*/gi, "");
    searchTitle = searchTitle.replace(/\s*\(\d{4}\)\s*/g, "");
    searchTitle = searchTitle.trim();

    if (__DEV__) {
      console.log("[SubtitleOverlay:search]", { movieTitle, searchTitle, tmdbId, season, episode });
    }

    // Prefer TMDB ID for precise results, fallback to movie title
    const results = await searchSubdl({
      filmName: tmdbId ? undefined : searchTitle,
      tmdbId,
      season,
      episode,
      languages: "VI,EN",
    });
    setSearchResults(results);
    setIsSearching(false);
  }, [movieTitle, tmdbId, season, episode]);

  // Add track from search results
  const handleAddTrack = useCallback((track: SubtitleTrack) => {
    setAllTracks((prev) => [...prev, track]);
    setSelectedTrackIdx(allTracks.length); // select the newly added track
    setShowPicker(false);
  }, [allTracks.length]);

  // Add custom URL
  const handleAddCustomUrl = useCallback(() => {
    const url = customUrl.trim();
    if (!url) return;
    const track: SubtitleTrack = { lang: "Custom: " + url.split("/").pop(), url };
    setAllTracks((prev) => [...prev, track]);
    setSelectedTrackIdx(allTracks.length);
    setCustomUrl("");
    setShowPicker(false);
  }, [customUrl, allTracks.length]);

  return (
    <>
      {/* Subtitle text overlay */}
      {currentCue && selectedTrackIdx >= 0 && (
        <View style={styles.subtitleContainer} pointerEvents="none">
          <Text style={styles.subtitleText}>{currentCue.text}</Text>
        </View>
      )}

      {/* Subtitle button (always visible) */}
      <View style={styles.subtitleButton}>
        <Pressable
          onPress={() => { setTab("tracks"); setShowPicker(true); }}
          style={({ pressed }) => [styles.subtitleBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons
            color={selectedTrackIdx >= 0 ? Colors.accent.primary : "#FFF"}
            name="text"
            size={18}
          />
        </Pressable>
      </View>

      {/* Picker modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
        transparent
        visible={showPicker}
      >
        <Pressable onPress={() => setShowPicker(false)} style={styles.modalBackdrop}>
          <Pressable style={styles.pickerContainer} onPress={(e) => e.stopPropagation()}>
            {/* Tabs */}
            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setTab("tracks")}
                style={[styles.tab, tab === "tracks" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "tracks" && styles.tabTextActive]}>
                  Phụ đề
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setTab("search"); if (searchResults.length === 0) handleSearch(); }}
                style={[styles.tab, tab === "search" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "search" && styles.tabTextActive]}>
                  Tìm online
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab("url")}
                style={[styles.tab, tab === "url" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "url" && styles.tabTextActive]}>
                  Nhập URL
                </Text>
              </Pressable>
            </View>

            {/* Tab content */}
            {tab === "tracks" && (
              <ScrollView style={styles.pickerScroll}>
                <Pressable
                  onPress={() => { setSelectedTrackIdx(-1); setShowPicker(false); }}
                  style={[styles.pickerItem, selectedTrackIdx === -1 && styles.pickerItemActive]}
                >
                  <Text style={[styles.pickerItemText, selectedTrackIdx === -1 && styles.pickerItemTextActive]}>
                    Tắt phụ đề
                  </Text>
                </Pressable>
                {allTracks.map((track, idx) => (
                  <Pressable
                    key={`${track.url}-${idx}`}
                    onPress={() => { setSelectedTrackIdx(idx); setShowPicker(false); }}
                    style={[styles.pickerItem, selectedTrackIdx === idx && styles.pickerItemActive]}
                  >
                    <Text
                      style={[styles.pickerItemText, selectedTrackIdx === idx && styles.pickerItemTextActive]}
                      numberOfLines={2}
                    >
                      {track.lang}
                    </Text>
                    {isLoading && selectedTrackIdx === idx && (
                      <ActivityIndicator size="small" color={Colors.accent.primary} />
                    )}
                  </Pressable>
                ))}
                {allTracks.length === 0 && (
                  <Text style={styles.emptyText}>
                    Chưa có phụ đề. Dùng tab "Tìm online" hoặc "Nhập URL" để thêm.
                  </Text>
                )}
              </ScrollView>
            )}

            {tab === "search" && (
              <View style={styles.searchContainer}>
                {!SUBDL_API_KEY ? (
                  <Text style={styles.emptyText}>
                    Cần cấu hình EXPO_PUBLIC_SUBDL_API_KEY trong .env để tìm phụ đề online.
                    {"\n\n"}Đăng ký miễn phí tại subdl.com/panel/register
                  </Text>
                ) : isSearching ? (
                  <View style={styles.searchLoading}>
                    <ActivityIndicator color={Colors.accent.primary} />
                    <Text style={styles.searchLoadingText}>
                      Đang tìm phụ đề cho "{movieTitle}"...
                    </Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.emptyText}>Không tìm thấy phụ đề.</Text>
                    <Pressable onPress={handleSearch} style={styles.retryBtn}>
                      <Text style={styles.retryBtnText}>Thử lại</Text>
                    </Pressable>
                  </View>
                ) : (
                  <ScrollView style={styles.pickerScroll}>
                    {searchResults.map((result, idx) => (
                      <Pressable
                        key={`search-${idx}`}
                        onPress={() => handleAddTrack(result)}
                        style={styles.pickerItem}
                      >
                        <Text style={styles.pickerItemText} numberOfLines={2}>
                          {result.lang}
                        </Text>
                        <Ionicons color={Colors.accent.primary} name="add-circle-outline" size={20} />
                      </Pressable>
                    ))}
                    <Text style={styles.noteText}>
                      Chọn subtitle để thêm vào player. File ZIP sẽ tự động giải nén.
                    </Text>
                  </ScrollView>
                )}
              </View>
            )}

            {tab === "url" && (
              <View style={styles.urlContainer}>
                <Text style={styles.urlLabel}>
                  Nhập URL file phụ đề (.srt hoặc .vtt):
                </Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setCustomUrl}
                  placeholder="https://example.com/subtitle.srt"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={styles.urlInput}
                  value={customUrl}
                />
                <Pressable
                  onPress={handleAddCustomUrl}
                  style={({ pressed }) => [styles.urlBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.urlBtnText}>Thêm phụ đề</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  subtitleContainer: {
    position: "absolute",
    bottom: 50,
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 5,
  },
  subtitleText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    overflow: "hidden",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  subtitleButton: {
    position: "absolute",
    right: 60,
    top: 16,
    zIndex: 10,
  },
  subtitleBtn: {
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerContainer: {
    backgroundColor: Colors.background.surface,
    borderRadius: 16,
    padding: 16,
    width: 320,
    maxHeight: 480,
  },
  tabRow: {
    flexDirection: "row",
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "rgba(99,102,241,0.2)",
  },
  tabText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.accent.primary,
    fontWeight: "700",
  },
  pickerScroll: {
    maxHeight: 350,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerItemActive: {
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  pickerItemText: {
    color: Colors.text.secondary,
    fontSize: 14,
    flex: 1,
  },
  pickerItemTextActive: {
    color: Colors.accent.primary,
    fontWeight: "600",
  },
  emptyText: {
    color: Colors.text.secondary,
    fontSize: 13,
    textAlign: "center",
    padding: 20,
    lineHeight: 20,
  },
  noteText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    textAlign: "center",
    padding: 12,
  },
  searchContainer: {
    minHeight: 120,
  },
  searchLoading: {
    alignItems: "center",
    padding: 30,
    gap: 12,
  },
  searchLoadingText: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  searchEmpty: {
    alignItems: "center",
    padding: 20,
    gap: 12,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(99,102,241,0.2)",
  },
  retryBtnText: {
    color: Colors.accent.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  urlContainer: {
    padding: 8,
    gap: 12,
  },
  urlLabel: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  urlInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  urlBtn: {
    backgroundColor: Colors.accent.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  urlBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
