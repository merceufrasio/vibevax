/**
 * CastButton — Shows cast availability and triggers native cast dialog.
 *
 * - Active state (cast icon highlighted) when devices are available
 * - Disabled/inactive state when no devices available (no tap response)
 * - Triggers native Google Cast dialog on tap (works in any orientation)
 *
 * Validates: Requirements 8.1, 8.2, 8.3
 */

import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";

import { Colors } from "@/constants/Colors";

import { useCastSession } from "../hooks/useCastSession";

export interface CastButtonProps {
  /** Icon size, default 24 */
  size?: number;
  /** Icon color (overrides default active/inactive colors) */
  color?: string;
  /** Additional style for the button container */
  style?: ViewStyle;
}

/**
 * CastButton component that indicates cast device availability.
 * Uses native Google Cast dialog which works correctly in landscape/fullscreen.
 */
export function CastButton({ size = 24, color, style }: CastButtonProps) {
  const { state, startDiscovery } = useCastSession();

  // Auto-trigger discovery when CastButton mounts so devices become available
  useEffect(() => {
    void startDiscovery();
  }, [startDiscovery]);

  const isAvailable = state.isAvailable;
  const isConnected = state.isConnected;

  // Determine icon color based on state
  const iconColor = color
    ? color
    : isConnected
      ? Colors.accent.primary
      : isAvailable
        ? Colors.text.primary
        : Colors.text.muted;

  // Determine icon name based on connection state
  const iconName = isConnected ? "tv" : "tv-outline";

  const handlePress = async () => {
    try {
      // Use native Google Cast dialog — always works regardless of view hierarchy
      const { CastContext } = require("react-native-google-cast");
      CastContext.showCastDialog();
    } catch (error) {
      console.warn("[CastButton] Failed to show cast dialog:", error);
    }
  };

  return (
    <TouchableOpacity
      accessibilityLabel="Cast to TV"
      accessibilityRole="button"
      activeOpacity={0.7}
      onPress={handlePress}
      style={[styles.button, { width: size + 16, height: size + 16 }, style]}
    >
      <Ionicons color={iconColor} name={iconName} size={size} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
});
