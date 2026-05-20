/**
 * MiniController — Persistent mini-bar showing current cast media.
 *
 * - Displays above tab navigation when cast session is active
 * - Shows current media title (truncated single line with ellipsis)
 * - Includes play/pause and stop controls
 * - Navigates to NowPlaying on tap outside controls
 *
 * Validates: Requirements 8.4, 8.5, 8.6
 */

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/Colors";

import { useCastSession } from "../hooks/useCastSession";

export interface MiniControllerProps {
  /** Called when user taps outside controls to expand to NowPlaying */
  onExpand: () => void;
}

/**
 * MiniController component displayed as a persistent bar above tab navigation.
 *
 * Req 8.4: Display above tab navigation when cast session is active
 * Req 8.5: Play/pause toggles remote playback between playing and paused
 * Req 8.6: Tap outside controls navigates to NowPlaying
 */
export function MiniController({ onExpand }: MiniControllerProps) {
  const { state, play, pause, stop } = useCastSession();

  // Only render when a cast session is active
  if (!state.isConnected || !state.session) {
    return null;
  }

  const isPlaying = state.session.state === "playing";
  const isPaused = state.session.state === "paused";
  const isBuffering = state.session.state === "buffering";
  const mediaTitle = state.session.media?.title ?? "Casting...";
  const deviceName = state.session.device.name;

  const handlePlayPause = async () => {
    if (isPlaying || isBuffering) {
      await pause();
    } else {
      await play();
    }
  };

  const handleStop = async () => {
    await stop();
  };

  return (
    <View style={styles.container}>
      {/* Tappable area for expanding to NowPlaying */}
      <TouchableOpacity
        accessibilityLabel="Open full cast controls"
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={onExpand}
        style={styles.content}
      >
        {/* Cast icon indicator */}
        <Ionicons
          color={Colors.accent.primary}
          name="tv"
          size={18}
          style={styles.castIcon}
        />

        {/* Media info */}
        <View style={styles.info}>
          <Text numberOfLines={1} style={styles.title}>
            {mediaTitle}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {deviceName}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Playback controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={handlePlayPause}
          style={styles.controlButton}
        >
          <Ionicons
            color={Colors.text.primary}
            name={isPlaying || isBuffering ? "pause" : "play"}
            size={22}
          />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityLabel="Stop casting"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={handleStop}
          style={styles.controlButton}
        >
          <Ionicons color={Colors.text.primary} name="stop" size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background.elevated,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 56,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  castIcon: {
    marginRight: 10,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
  },
  controlButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
});
