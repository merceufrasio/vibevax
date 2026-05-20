/**
 * NowPlaying — Full-screen remote control for cast playback.
 *
 * - Seek bar, volume control, play/pause/stop, subtitle selection
 * - Display media title, poster, and playback progress
 *
 * Validates: Requirements 8.6
 */

import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/constants/Colors";

import { useCastSession } from "../hooks/useCastSession";

export interface NowPlayingProps {
  /** Called when user closes the NowPlaying screen */
  onClose: () => void;
}

/** Format seconds to mm:ss or hh:mm:ss */
function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Simple Slider Component (no external dependency)
// ---------------------------------------------------------------------------

interface SimpleSliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  onSlidingComplete: (value: number) => void;
  minimumTrackTintColor: string;
  maximumTrackTintColor: string;
  thumbTintColor: string;
}

function SimpleSlider({
  value,
  minimumValue,
  maximumValue,
  onSlidingComplete,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
}: SimpleSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  const trackRef = useRef<View>(null);
  const trackXRef = useRef(0);

  const range = maximumValue - minimumValue;
  const currentValue = dragging ? dragValue : value;
  const progress = range > 0 ? (currentValue - minimumValue) / range : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setDragging(true);
        const x = evt.nativeEvent.locationX;
        const newValue =
          minimumValue + (x / (trackWidth || 1)) * range;
        setDragValue(Math.max(minimumValue, Math.min(maximumValue, newValue)));
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        const newValue =
          minimumValue + (x / (trackWidth || 1)) * range;
        setDragValue(Math.max(minimumValue, Math.min(maximumValue, newValue)));
      },
      onPanResponderRelease: () => {
        setDragging(false);
        onSlidingComplete(dragValue);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
      },
    }),
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={handleLayout}
      style={sliderStyles.container}
      {...panResponder.panHandlers}
    >
      <View
        ref={trackRef}
        style={[sliderStyles.track, { backgroundColor: maximumTrackTintColor }]}
      >
        <View
          style={[
            sliderStyles.trackFill,
            {
              backgroundColor: minimumTrackTintColor,
              width: `${progress * 100}%`,
            },
          ]}
        />
      </View>
      <View
        style={[
          sliderStyles.thumb,
          {
            backgroundColor: thumbTintColor,
            left: `${progress * 100}%`,
          },
        ]}
      />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    top: 12,
  },
});

// ---------------------------------------------------------------------------
// NowPlaying Component
// ---------------------------------------------------------------------------

/**
 * NowPlaying full-screen remote control component.
 *
 * Req 8.6: Full-screen remote with seek, volume, play/pause/stop, subtitles
 */
export function NowPlaying({ onClose }: NowPlayingProps) {
  const { state, play, pause, stop, seek, setVolume, disconnect } =
    useCastSession();

  const session = state.session;
  const media = session?.media;
  const isPlaying = session?.state === "playing";
  const isBuffering = session?.state === "buffering";
  const position = state.playbackPosition;
  const duration = state.playbackDuration;
  const volume = state.volume;
  const deviceName = session?.device.name ?? "Unknown Device";

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

  const handleSeek = async (value: number) => {
    await seek(value);
  };

  const handleVolumeChange = async (value: number) => {
    await setVolume(value);
  };

  const handleDisconnect = async () => {
    await disconnect();
    onClose();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Close"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={onClose}
          style={styles.headerButton}
        >
          <Ionicons color={Colors.text.primary} name="chevron-down" size={24} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            Casting to
          </Text>
          <Text numberOfLines={1} style={styles.headerDevice}>
            {deviceName}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Disconnect"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={handleDisconnect}
          style={styles.headerButton}
        >
          <Ionicons color={Colors.accent.danger} name="close-circle-outline" size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {/* Poster */}
        <View style={styles.posterContainer}>
          {media?.posterUrl ? (
            <Image
              resizeMode="cover"
              source={{ uri: media.posterUrl }}
              style={styles.poster}
            />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Ionicons color={Colors.text.muted} name="film-outline" size={64} />
            </View>
          )}
        </View>

        {/* Media info */}
        <View style={styles.mediaInfo}>
          <Text numberOfLines={2} style={styles.mediaTitle}>
            {media?.title ?? "No media"}
          </Text>
          {media?.subtitle ? (
            <Text numberOfLines={1} style={styles.mediaSubtitle}>
              {media.subtitle}
            </Text>
          ) : null}
        </View>

        {/* Seek bar */}
        <View style={styles.seekContainer}>
          <SimpleSlider
            maximumTrackTintColor={Colors.text.muted}
            maximumValue={duration > 0 ? duration : 1}
            minimumTrackTintColor={Colors.accent.primary}
            minimumValue={0}
            onSlidingComplete={handleSeek}
            thumbTintColor={Colors.accent.primary}
            value={position}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Playback controls */}
        <View style={styles.playbackControls}>
          <TouchableOpacity
            accessibilityLabel="Stop"
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={handleStop}
            style={styles.secondaryControl}
          >
            <Ionicons color={Colors.text.secondary} name="stop" size={28} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={handlePlayPause}
            style={styles.primaryControl}
          >
            <Ionicons
              color={Colors.text.primary}
              name={isPlaying || isBuffering ? "pause" : "play"}
              size={36}
            />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Subtitles"
            accessibilityRole="button"
            activeOpacity={0.7}
            style={styles.secondaryControl}
          >
            <Ionicons
              color={Colors.text.secondary}
              name="text-outline"
              size={26}
            />
          </TouchableOpacity>
        </View>

        {/* Volume control */}
        <View style={styles.volumeContainer}>
          <Ionicons
            color={Colors.text.muted}
            name="volume-low"
            size={20}
            style={styles.volumeIcon}
          />
          <View style={styles.volumeSlider}>
            <SimpleSlider
              maximumTrackTintColor={Colors.text.muted}
              maximumValue={1}
              minimumTrackTintColor={Colors.text.secondary}
              minimumValue={0}
              onSlidingComplete={handleVolumeChange}
              thumbTintColor={Colors.text.primary}
              value={volume}
            />
          </View>
          <Ionicons
            color={Colors.text.muted}
            name="volume-high"
            size={20}
            style={styles.volumeIcon}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 12,
    color: Colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerDevice: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.text.primary,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  posterContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  poster: {
    width: 240,
    height: 340,
    borderRadius: 12,
  },
  posterPlaceholder: {
    backgroundColor: Colors.background.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaInfo: {
    alignItems: "center",
    marginBottom: 24,
  },
  mediaTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.text.primary,
    textAlign: "center",
  },
  mediaSubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 6,
  },
  seekContainer: {
    marginBottom: 24,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timeText: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  playbackControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  primaryControl: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.background.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  volumeIcon: {
    marginHorizontal: 4,
  },
  volumeSlider: {
    flex: 1,
  },
});
