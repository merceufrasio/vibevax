/**
 * SubtitleOverlay — Renders subtitles over the video player.
 *
 * Subtitle sources:
 * 1. PhimPal: auto-fetch via GraphQL Subtitles query + direct SRT download
 * 2. Subdl: online search by movie name / TMDB ID
 * 3. Manual URL input
 */

import { Ionicons } from "@expo/vector-icons";
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
  subtitles?: SubtitleTrack[];
  currentTime: number;
  movieTitle?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  /** PhimPal episode ID for auto-fetching subtitles (e.g. "watch/68919") */
  sourceId?: string;
  episodeId?: string;
}

const SUBDL_API_KEY = process.env.EXPO_PUBLIC_SUBDL_API_KEY || "";

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

function parseCues(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Standard SRT/VTT parsing
  const blocks = text.split(/\n\n+/);

  if (__DEV__ && blocks.length < 5) {
    console.log("[parseCues:debug]", {
      blockCount: blocks.length,
      textLen: text.length,
      first100chars: JSON.stringify(text.substring(0, 100)),
      hasLF: text.includes("\n"),
      hasCRLF: text.includes("\r\n"),
      hasCR: text.includes("\r"),
    });
  }

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

    const timingParts = lines[timingIdx].split("-->");
    const startRaw = timingParts[0];
    const endRaw = timingParts[1];
    if (!startRaw || !endRaw) continue;

    const start = parseTimestamp(startRaw.trim());
    const end = parseTimestamp(endRaw.trim().split(/\s/)[0]);
    const cueText = lines
      .slice(timingIdx + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .trim();

    if (cueText && end > start) {
      cues.push({ start, end, text: cueText });
    }
  }

  // If standard parsing failed, try single-newline separated format
  if (cues.length === 0 && text.includes("-->")) {
    if (__DEV__) {
      console.log("[parseCues:fallback]", { blockCount: blocks.length, trying: "line-by-line" });
    }
    const allLines = text.split("\n");
    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];
      if (line.includes("-->")) {
        const parts = line.split("-->");
        const start = parseTimestamp(parts[0].trim());
        const end = parseTimestamp(parts[1].trim().split(/\s/)[0]);
        // Collect text lines until next timing or sequence number
        const textLines: string[] = [];
        i++;
        while (i < allLines.length && !allLines[i].includes("-->") && !/^\d+$/.test(allLines[i].trim())) {
          const tl = allLines[i].replace(/<[^>]*>/g, "").trim();
          if (tl) textLines.push(tl);
          i++;
        }
        const cueText = textLines.join("\n");
        if (cueText && end > start) {
          cues.push({ start, end, text: cueText });
        }
      } else {
        i++;
      }
    }
  }

  return cues;
}

/** Fetch PhimPal subtitles via GraphQL + build direct SRT URLs */
async function fetchPhimPalSubs(episodeId: string): Promise<SubtitleTrack[]> {
  const idMatch = episodeId.match(/(\d+)/);
  if (!idMatch) return [];
  const titleId = idMatch[1];

  try {
    const gqlBody = JSON.stringify({
      operationName: "Subtitles",
      variables: { titleId },
      query: `query Subtitles($titleId: String!) { subtitles(titleId: $titleId) { id subsceneId language files isDefault likes dislikes } }`,
    });

    const res = await fetch("https://legacy.phimpal.com/b/g", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://legacy.phimpal.com",
        "Referer": `https://legacy.phimpal.com/watch/${titleId}`,
      },
      body: gqlBody,
    });

    if (!res.ok) return [];
    const data = await res.json() as {
      data?: {
        subtitles?: Array<{
          id: string;
          subsceneId: string;
          language: string;
          files: string[];
          isDefault: boolean;
          likes: number;
          dislikes: number;
        }>;
      };
    };

    const subs = data?.data?.subtitles;
    if (!Array.isArray(subs) || subs.length === 0) return [];

    // Sort: Vietnamese first, default first, then by likes
    const sorted = [...subs].sort((a, b) => {
      if (a.language === "vi" && b.language !== "vi") return -1;
      if (a.language !== "vi" && b.language === "vi") return 1;
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (b.likes - b.dislikes) - (a.likes - a.dislikes);
    });

    // Build direct SRT URLs using pattern:
    // /b/subtitle/{subsceneId}/{filename}/srt.css
    return sorted
      .filter((s) => s.files?.length > 0 && s.subsceneId)
      .map((s) => ({
        lang: s.language === "vi" ? "Tiếng Việt" : s.language === "en" ? "English" : s.language,
        url: `https://legacy.phimpal.com/b/subtitle/${s.subsceneId}/${encodeURI(s.files[0])}/srt.css`,
      }));
  } catch {
    return [];
  }
}

/** Search subtitles from Subdl API */
async function searchSubdl(params: {
  filmName?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
}): Promise<SubtitleTrack[]> {
  if (!SUBDL_API_KEY) return [];

  const query = new URLSearchParams();
  query.set("api_key", SUBDL_API_KEY);
  if (params.tmdbId) query.set("tmdb_id", params.tmdbId);
  else if (params.filmName) query.set("film_name", params.filmName);
  if (params.season) query.set("season_number", String(params.season));
  if (params.episode) query.set("episode_number", String(params.episode));
  query.set("languages", "VI,EN");
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
        language: string;
        url: string;
        hi: boolean;
      }>;
    };
    if (!data.status || !data.subtitles) return [];

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
      lang: `[Subdl] ${s.lang}${s.hi ? " (HI)" : ""} - ${s.release_name || s.name}`,
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
  sourceId,
  episodeId,
}: Props) {
  const [allTracks, setAllTracks] = useState<SubtitleTrack[]>(subtitles);
  const [selectedTrackIdx, setSelectedTrackIdx] = useState<number>(-1);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SubtitleTrack[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [tab, setTab] = useState<"tracks" | "search" | "url">("tracks");
  const fetchedUrlRef = useRef<string | null>(null);
  const phimpalFetchedRef = useRef(false);

  // Auto-fetch PhimPal subtitles on mount
  useEffect(() => {
    if (sourceId !== "phimpal" || !episodeId || phimpalFetchedRef.current) return;
    phimpalFetchedRef.current = true;

    fetchPhimPalSubs(episodeId).then((tracks) => {
      if (tracks.length > 0) {
        setAllTracks((prev) => [...tracks, ...prev]);
        // Auto-select first Vietnamese subtitle
        setSelectedTrackIdx(0);
        if (__DEV__) {
          console.log("[SubtitleOverlay:phimpal]", { count: tracks.length, first: tracks[0] });
        }
      }
    });
  }, [sourceId, episodeId]);

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

    fetch(track.url, {
      headers: { "Referer": "https://legacy.phimpal.com/" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (__DEV__) {
          console.log("[SubtitleOverlay:rawResponse]", {
            len: text.length,
            first200: text.substring(0, 200),
            hasNewlines: text.includes("\n"),
            hasArrow: text.includes("-->"),
            hasDoubleNewline: text.includes("\n\n"),
            charCodes20: Array.from(text.substring(0, 50)).map((c) => c.charCodeAt(0)),
          });
        }
        const parsed = parseCues(text);
        if (__DEV__) {
          console.log("[SubtitleOverlay:parsed]", {
            cueCount: parsed.length,
            firstCue: parsed[0],
            lastCue: parsed[parsed.length - 1],
          });
        }
        if (parsed.length === 0) throw new Error("Could not parse subtitle file");
        setCues(parsed);
      })
      .catch((err) => {
        setCues([]);
        if (__DEV__) console.log("[SubtitleOverlay:fetchError]", (err as Error).message, track.url);
      })
      .finally(() => setIsLoading(false));
  }, [selectedTrackIdx, allTracks]);

  // Find current cue
  const currentCue = useMemo(() => {
    for (const cue of cues) {
      if (currentTime >= cue.start && currentTime <= cue.end) return cue;
    }
    return null;
  }, [cues, currentTime]);

  // Search online (Subdl)
  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    let searchTitle = movieTitle || "";
    searchTitle = searchTitle.replace(/\s*\((?:phần|phan|mùa|season)\s*\d+\)\s*/gi, "");
    searchTitle = searchTitle.replace(/\s*\(\d{4}\)\s*/g, "");
    searchTitle = searchTitle.trim();

    const results = await searchSubdl({
      filmName: tmdbId ? undefined : searchTitle,
      tmdbId,
      season,
      episode,
    });
    setSearchResults(results);
    setIsSearching(false);
  }, [movieTitle, tmdbId, season, episode]);

  const handleAddTrack = useCallback((track: SubtitleTrack) => {
    setAllTracks((prev) => [...prev, track]);
    setSelectedTrackIdx(allTracks.length);
    setShowPicker(false);
  }, [allTracks.length]);

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

      {/* Subtitle button */}
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
            <View style={styles.tabRow}>
              <Pressable onPress={() => setTab("tracks")} style={[styles.tab, tab === "tracks" && styles.tabActive]}>
                <Text style={[styles.tabText, tab === "tracks" && styles.tabTextActive]}>Phụ đề</Text>
              </Pressable>
              <Pressable onPress={() => { setTab("search"); if (searchResults.length === 0) handleSearch(); }} style={[styles.tab, tab === "search" && styles.tabActive]}>
                <Text style={[styles.tabText, tab === "search" && styles.tabTextActive]}>Tìm online</Text>
              </Pressable>
              <Pressable onPress={() => setTab("url")} style={[styles.tab, tab === "url" && styles.tabActive]}>
                <Text style={[styles.tabText, tab === "url" && styles.tabTextActive]}>Nhập URL</Text>
              </Pressable>
            </View>

            {tab === "tracks" && (
              <ScrollView style={styles.pickerScroll}>
                <Pressable
                  onPress={() => { setSelectedTrackIdx(-1); setShowPicker(false); }}
                  style={[styles.pickerItem, selectedTrackIdx === -1 && styles.pickerItemActive]}
                >
                  <Text style={[styles.pickerItemText, selectedTrackIdx === -1 && styles.pickerItemTextActive]}>Tắt phụ đề</Text>
                </Pressable>
                {allTracks.map((track, idx) => (
                  <Pressable
                    key={`${track.url}-${idx}`}
                    onPress={() => { setSelectedTrackIdx(idx); setShowPicker(false); }}
                    style={[styles.pickerItem, selectedTrackIdx === idx && styles.pickerItemActive]}
                  >
                    <Text style={[styles.pickerItemText, selectedTrackIdx === idx && styles.pickerItemTextActive]} numberOfLines={2}>
                      {track.lang}
                    </Text>
                    {isLoading && selectedTrackIdx === idx && <ActivityIndicator size="small" color={Colors.accent.primary} />}
                  </Pressable>
                ))}
                {allTracks.length === 0 && (
                  <Text style={styles.emptyText}>Chưa có phụ đề. Dùng tab "Tìm online" hoặc "Nhập URL".</Text>
                )}
              </ScrollView>
            )}

            {tab === "search" && (
              <View style={styles.searchContainer}>
                {isSearching ? (
                  <View style={styles.searchLoading}>
                    <ActivityIndicator color={Colors.accent.primary} />
                    <Text style={styles.searchLoadingText}>Đang tìm "{movieTitle}"...</Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.emptyText}>Không tìm thấy phụ đề từ Subdl.</Text>
                    <Pressable onPress={handleSearch} style={styles.retryBtn}>
                      <Text style={styles.retryBtnText}>Thử lại</Text>
                    </Pressable>
                  </View>
                ) : (
                  <ScrollView style={styles.pickerScroll}>
                    {searchResults.map((result, idx) => (
                      <Pressable key={`search-${idx}`} onPress={() => handleAddTrack(result)} style={styles.pickerItem}>
                        <Text style={styles.pickerItemText} numberOfLines={2}>{result.lang}</Text>
                        <Ionicons color={Colors.accent.primary} name="add-circle-outline" size={20} />
                      </Pressable>
                    ))}
                    <Text style={styles.noteText}>Lưu ý: File .zip từ Subdl cần giải nén thủ công.</Text>
                  </ScrollView>
                )}
              </View>
            )}

            {tab === "url" && (
              <View style={styles.urlContainer}>
                <Text style={styles.urlLabel}>Nhập URL file phụ đề (.srt hoặc .vtt):</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setCustomUrl}
                  placeholder="https://example.com/subtitle.srt"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={styles.urlInput}
                  value={customUrl}
                />
                <Pressable onPress={handleAddCustomUrl} style={({ pressed }) => [styles.urlBtn, pressed && { opacity: 0.7 }]}>
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
    bottom: 80,
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
