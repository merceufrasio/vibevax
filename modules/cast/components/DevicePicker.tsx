/**
 * DevicePicker — Modal/bottom-sheet listing available cast devices.
 *
 * - Lists all discovered devices with name (truncated single line) and protocol icon
 * - Calls `onDeviceSelected` callback when user selects a device
 *
 * Validates: Requirements 8.3, 8.9
 */

import { Ionicons } from "@expo/vector-icons";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/constants/Colors";

import { useCastSession } from "../hooks/useCastSession";
import type { CastDevice, CastProtocol } from "../types";

export interface DevicePickerProps {
  /** Whether the picker is visible */
  visible: boolean;
  /** Called when the picker should close */
  onClose: () => void;
  /** Called when the user selects a device */
  onDeviceSelected: (device: CastDevice) => void;
}

/** Map protocol to an Ionicons icon name */
function getProtocolIcon(protocol: CastProtocol): keyof typeof Ionicons.glyphMap {
  switch (protocol) {
    case "chromecast":
      return "tv-outline";
    case "airplay":
      return "logo-apple";
    case "dlna":
      return "desktop-outline";
    default:
      return "tv-outline";
  }
}

/**
 * DevicePicker component displayed as a modal bottom-sheet.
 *
 * Req 8.3: Lists all currently discovered devices
 * Req 8.9: Each device shows name (truncated single line) and protocol icon
 */
export function DevicePicker({
  visible,
  onClose,
  onDeviceSelected,
}: DevicePickerProps) {
  const { state } = useCastSession();
  const devices = state.devices;

  const renderDevice = ({ item }: { item: CastDevice }) => (
    <TouchableOpacity
      accessibilityLabel={`Connect to ${item.name}`}
      accessibilityRole="button"
      activeOpacity={0.7}
      onPress={() => onDeviceSelected(item)}
      style={styles.deviceItem}
    >
      <Ionicons
        color={Colors.text.secondary}
        name={getProtocolIcon(item.protocol)}
        size={22}
        style={styles.deviceIcon}
      />
      <Text numberOfLines={1} style={styles.deviceName}>
        {item.name}
      </Text>
      {item.model ? (
        <Text numberOfLines={1} style={styles.deviceModel}>
          {item.model}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Title */}
          <Text style={styles.title}>Cast to Device</Text>

          {/* Device list */}
          {devices.length > 0 ? (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={renderDevice}
              style={styles.list}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons
                color={Colors.text.muted}
                name="search-outline"
                size={32}
              />
              <Text style={styles.emptyText}>No devices found</Text>
              <Text style={styles.emptyHint}>
                Make sure your TV is on the same Wi-Fi network
              </Text>
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity
            accessibilityLabel="Close device picker"
            activeOpacity={0.7}
            onPress={onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    justifyContent: "flex-end",
    zIndex: 100,
  },
  sheet: {
    backgroundColor: Colors.background.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: "70%",
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.text.muted,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text.primary,
    marginBottom: 16,
  },
  list: {
    flexGrow: 0,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.background.elevated,
    marginBottom: 8,
  },
  deviceIcon: {
    marginRight: 12,
  },
  deviceName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: Colors.text.primary,
  },
  deviceModel: {
    fontSize: 13,
    color: Colors.text.muted,
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: Colors.text.muted,
    marginTop: 6,
    textAlign: "center",
  },
  closeButton: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: Colors.background.elevated,
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.text.secondary,
  },
});
