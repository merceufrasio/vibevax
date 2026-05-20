/**
 * CastErrorDisplay — Error UI component for the Cast to TV feature.
 *
 * Renders different UI based on the current error state:
 * - "No devices found" with troubleshooting suggestions when discovery finds nothing
 * - Retry button for recoverable errors (recoverable: true)
 * - Dismiss-only action for non-recoverable errors (recoverable: false)
 * - Clears error from CastState on dismiss
 *
 * Validates: Requirements 9.4, 9.5, 9.6, 9.7
 */

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/Colors";

import { castStore } from "../state";
import type { CastError } from "../types";

export interface CastErrorDisplayProps {
  /** The current error to display, or null if no error */
  error: CastError | null;
  /** Whether device discovery found no devices (shows troubleshooting tips) */
  noDevicesFound?: boolean;
  /** Callback invoked when the user taps the retry button */
  onRetry?: () => void;
  /** Optional callback invoked after dismiss (in addition to clearing error) */
  onDismiss?: () => void;
}

/**
 * CastErrorDisplay renders contextual error messages for cast failures.
 *
 * Req 9.5: "No devices found" with troubleshooting suggestions
 * Req 9.6: Retry button for recoverable errors
 * Req 9.7: Dismiss-only for non-recoverable errors, clears error on dismiss
 */
export function CastErrorDisplay({
  error,
  noDevicesFound = false,
  onRetry,
  onDismiss,
}: CastErrorDisplayProps) {
  // Req 9.5: Show "No devices found" message with troubleshooting suggestions
  if (noDevicesFound && !error) {
    return (
      <View style={styles.container}>
        <Ionicons
          color={Colors.text.muted}
          name="tv-outline"
          size={40}
          style={styles.icon}
        />
        <Text style={styles.title}>No devices found</Text>
        <Text style={styles.message}>
          Make sure your cast device is on the same Wi-Fi network and powered on.
        </Text>
        <View style={styles.suggestions}>
          <View style={styles.suggestionRow}>
            <Ionicons
              color={Colors.accent.primary}
              name="wifi-outline"
              size={16}
            />
            <Text style={styles.suggestionText}>
              Check that your phone and TV are on the same Wi-Fi network
            </Text>
          </View>
          <View style={styles.suggestionRow}>
            <Ionicons
              color={Colors.accent.primary}
              name="power-outline"
              size={16}
            />
            <Text style={styles.suggestionText}>
              Ensure your cast device is powered on and not in sleep mode
            </Text>
          </View>
        </View>
        {onRetry && (
          <TouchableOpacity
            accessibilityLabel="Retry device discovery"
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={onRetry}
            style={styles.retryButton}
          >
            <Ionicons
              color={Colors.text.primary}
              name="refresh-outline"
              size={16}
            />
            <Text style={styles.retryButtonText}>Scan again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // No error to display
  if (!error) {
    return null;
  }

  const handleDismiss = () => {
    // Req 9.7: Clear error from CastState on dismiss
    castStore.setError(null);
    onDismiss?.();
  };

  const handleRetry = () => {
    // Clear the error before retrying
    castStore.setError(null);
    onRetry?.();
  };

  return (
    <View style={styles.container}>
      <Ionicons
        color={Colors.accent.danger}
        name="alert-circle-outline"
        size={36}
        style={styles.icon}
      />
      <Text style={styles.title}>
        {getErrorTitle(error)}
      </Text>
      <Text style={styles.message}>{error.message}</Text>

      <View style={styles.actions}>
        {/* Req 9.6: Show retry button for recoverable errors */}
        {error.recoverable && onRetry && (
          <TouchableOpacity
            accessibilityLabel="Retry"
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={handleRetry}
            style={styles.retryButton}
          >
            <Ionicons
              color={Colors.text.primary}
              name="refresh-outline"
              size={16}
            />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}

        {/* Req 9.7: Dismiss action (always shown) */}
        <TouchableOpacity
          accessibilityLabel="Dismiss error"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={handleDismiss}
          style={[
            styles.dismissButton,
            !error.recoverable && styles.dismissButtonPrimary,
          ]}
        >
          <Text
            style={[
              styles.dismissButtonText,
              !error.recoverable && styles.dismissButtonTextPrimary,
            ]}
          >
            Dismiss
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a user-friendly title for the given error code.
 */
function getErrorTitle(error: CastError): string {
  switch (error.code) {
    case "CONNECTION_LOST":
      return "Connection Lost";
    case "CONNECTION_FAILED":
      return "Connection Failed";
    case "DRM_PROTECTED":
      return "Protected Content";
    case "HEADERS_REQUIRED":
      return "Unsupported Stream";
    case "MEDIA_LOAD_FAILED":
      return "Playback Error";
    case "EXTRACTION_FAILED":
      return "Stream Extraction Failed";
    case "EXTRACTION_TIMEOUT":
      return "Extraction Timed Out";
    case "COMMAND_FAILED":
      return "Command Failed";
    case "NETWORK_ERROR":
      return "Network Error";
    case "SUBTITLE_FETCH_FAILED":
      return "Subtitle Error";
    case "DISCOVERY_FAILED":
      return "Discovery Failed";
    case "UNSUPPORTED_FORMAT":
      return "Unsupported Format";
    default:
      return "Cast Error";
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background.surface,
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    alignItems: "center",
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text.primary,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  suggestions: {
    width: "100%",
    marginBottom: 16,
    gap: 10,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
  },
  suggestionText: {
    fontSize: 13,
    color: Colors.text.secondary,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.text.primary,
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dismissButtonPrimary: {
    backgroundColor: Colors.background.elevated,
    borderColor: Colors.border,
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.text.muted,
  },
  dismissButtonTextPrimary: {
    color: Colors.text.primary,
  },
});
