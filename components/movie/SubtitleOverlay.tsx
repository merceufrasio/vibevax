/**
 * SubtitleOverlay — Fetches and renders VTT/SRT subtitles over the video player.
 *
 * Features:
 * - Parses both WebVTT (.vtt) and SubRip (.srt) formats
 * - Syncs subtitle display with current playback time
 * - Provides a track selector UI (bottom-right button)
 * - Supports "Off" option to disable subtitles
 */

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";

interface SubtitleTrack {
  lang: string;
  url: string;
}

interface SubtitleCue {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

interface Props {
  subtitles: SubtitleTrack[];
  currentTime: number; // seconds from player
  visible?: boolean;
}

/** Parse timestamp "HH:MM:SS,mmm" or "HH:MM:SS.mmm" to seconds */
function parseTimestamp(raw: string): number {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    return m * 60 + s;
  }
  return 0;
}

/** Parse VTT or SRT content into cues */
function parseCues(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Normalize line endings
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split by double newline (cue blocks)
  const blocks = text.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    // Find the timing line (contains "-->")
    let timingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timingIdx = i;
        break;
      }
    }
    if (timingIdx === -1) continue;

    const timingLine = lines[timingIdx];
    const [startRaw, endRaw] = timingLine.split("-->");
    if (!startRaw || !endRaw) continue;

    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw.split(/\s/)[0]); // Remove position metadata after timestamp

    // Text is everything after the timing line
    const cueText = lines
      .slice(timingIdx + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "") // Strip HTML tags
      .trim();

    if (cueText) {
      cues.push({ start, end, text: cueText });
    }
  }

  return cues;
}

export function SubtitleOverlay({ subtitles, currentTime, visible = true }: Props) {
  const [selectedTrackIdx, setSelectedTrackIdx] = useState<number | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedUrlRef = useRef<string | null>(null);

  // Auto-select first track if available
  useEffect(() => {
    if (subtitles.length > 0 && selectedTrackIdx === null) {
      setSelectedTrackIdx(0);
    }
  }, [subtitles, selectedTrackIdx]);

  // Fetch subtitle file when track changes
  useEffect(() => {
    if (selectedTrackIdx === null || selectedTrackIdx < 0 || !subtitles[selectedTrackIdx]) {
      setCues([]);
      fetchedUrlRef.current = null;
      return;
    }

    const track = subtitles[selectedTrackIdx];
    if (fetchedUrlRef.current === track.url) return;

    setIsLoading(true);
    fetchedUrlRef.current = track.url;

    fetch(track.url)
      .then((res) => res.text())
      .then((text) => {
        const parsed = parseCues(text);
        setCues(parsed);
      })
      .catch(() => {
        setCues([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedTrackIdx, subtitles]);

  // Find current cue based on playback time
  const currentCue = useMemo(() => {
    if (cues.length === 0) return null;
    for (const cue of cues) {
      if (currentTime >= cue.start && currentTime <= cue.end) {
        return cue;
      }
    }
    return null;
  }, [cues, currentTime]);

  const handleSelectTrack = useCallback((idx: number | null) => {
    setSelectedTrackIdx(idx);
    setShowPicker(false);
  }, []);

  if (!visible || subtitles.length === 0) return null;

  return (
    <>
      {/* Subtitle text overlay */}
      {currentCue && selectedTrackIdx !== null && selectedTrackIdx >= 0 && (
        <View style={styles.subtitleContainer} pointerEvents="none">
          <Text style={styles.subtitleText}>{currentCue.text}</Text>
        </View>
      )}

      {/* Subtitle track selector button */}
      <View style={styles.subtitleButton}>
        <Pressable
          onPress={() => setShowPicker(true)}
          style={({ pressed }) => [
            styles.subtitleBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            color={selectedTrackIdx !== null && selectedTrackIdx >= 0 ? Colors.accent.primary : "#FFF"}
            name="text"
            size={18}
          />
        </Pressable>
      </View>

      {/* Track picker modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
        transparent
        visible={showPicker}
      >
        <Pressable onPress={() => setShowPicker(false)} style={styles.modalBackdrop}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Phụ đề</Text>
            <ScrollView style={styles.pickerScroll}>
              {/* Off option */}
              <Pressable
                onPress={() => handleSelectTrack(-1)}
                style={({ pressed }) => [
                  styles.pickerItem,
                  selectedTrackIdx === -1 && styles.pickerItemActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    selectedTrackIdx === -1 && styles.pickerItemTextActive,
                  ]}
                >
                  Tắt
                </Text>
              </Pressable>

              {subtitles.map((track, idx) => (
                <Pressable
                  key={`${track.lang}-${idx}`}
                  onPress={() => handleSelectTrack(idx)}
                  style={({ pressed }) => [
                    styles.pickerItem,
                    selectedTrackIdx === idx && styles.pickerItemActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedTrackIdx === idx && styles.pickerItemTextActive,
                    ]}
                  >
                    {track.lang}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {isLoading && (
              <Text style={styles.loadingText}>Đang tải phụ đề...</Text>
            )}
          </View>
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
    backgroundColor: "rgba(0,0,0,0.7)",
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerContainer: {
    backgroundColor: Colors.background.surface,
    borderRadius: 16,
    padding: 20,
    width: 280,
    maxHeight: 400,
  },
  pickerTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  pickerScroll: {
    maxHeight: 300,
  },
  pickerItem: {
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
    fontSize: 15,
  },
  pickerItemTextActive: {
    color: Colors.accent.primary,
    fontWeight: "600",
  },
  loadingText: {
    color: Colors.text.secondary,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
