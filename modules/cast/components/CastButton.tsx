/**
 * CastButton — Shows cast availability and triggers device picker.
 *
 * - Active state (cast icon highlighted) when devices are available
 * - Disabled/inactive state when no devices available (no tap response)
 * - Triggers DevicePicker on tap when devices are available
 *
 * Validates: Requirements 8.1, 8.2, 8.3
 */

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";

import { Colors } from "@/constants/Colors";

import { useCastSession } from "../hooks/useCastSession";
import type { CastDevice } from "../types";

import { DevicePicker } from "./DevicePicker";

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
 *
 * Req 8.1: Active state when devices are available
 * Req 8.2: Disabled/inactive state when no devices available
 * Req 8.3: Triggers DevicePicker on tap when devices are available
 */
export function CastButton({ size = 24, color, style }: CastButtonProps) {
  const { state, connect, startDiscovery } = useCastSession();
  const [pickerVisible, setPickerVisible] = useState(false);

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

  const handlePress = () => {
    if (isAvailable) {
      setPickerVisible(true);
    }
  };

  const handleDeviceSelected = async (device: CastDevice) => {
    setPickerVisible(false);
    await connect(device);
  };

  return (
    <>
      <TouchableOpacity
        accessibilityLabel="Cast to TV"
        accessibilityRole="button"
        accessibilityState={{ disabled: !isAvailable }}
        activeOpacity={isAvailable ? 0.7 : 1}
        disabled={!isAvailable}
        onPress={handlePress}
        style={[styles.button, { width: size + 16, height: size + 16 }, style]}
      >
        <Ionicons color={iconColor} name={iconName} size={size} />
      </TouchableOpacity>

      <DevicePicker
        onClose={() => setPickerVisible(false)}
        onDeviceSelected={handleDeviceSelected}
        visible={pickerVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
});
