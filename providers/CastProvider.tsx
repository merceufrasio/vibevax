/**
 * CastProvider — Initializes the CastSessionManager on app start.
 *
 * Delegates to `initializeCastSession()` from the cast module which handles:
 *   - Platform detection (Android/iOS only)
 *   - Native module availability check (react-native-google-cast)
 *   - No-op initialization when the real native Cast module is unavailable
 *   - Idempotent initialization (safe to call multiple times)
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { useEffect } from "react";

import { CastSessionManager } from "@/modules/cast";
import { initializeCastSession } from "@/modules/cast/providers/CastInitializer";

/**
 * React component that initializes the cast system on mount.
 * Place this inside your AppProviders.
 */
export function CastInitializer() {
  useEffect(() => {
    initializeCastSession();

    return () => {
      CastSessionManager.destroy();
    };
  }, []);

  return null;
}
