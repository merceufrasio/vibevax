/**
 * CastProvider — Initializes the CastSessionManager on app start.
 *
 * In __DEV__ mode, uses MockCastProvider so you can test the full cast
 * UI flow without a real Chromecast device or native build.
 *
 * In production, uses the real ChromecastProvider (requires native build).
 * The ChromecastProvider is NOT imported here to avoid Metro bundling
 * react-native-google-cast in Expo Go (which would crash).
 */

import { useEffect } from "react";
import { Platform } from "react-native";

import { CastSessionManager } from "@/modules/cast";
import type { CastProvider as CastProviderInterface } from "@/modules/cast";
import { CAST_RECEIVER_URL } from "@/modules/cast/config";
import { MockCastProvider } from "@/modules/cast/providers/MockCastProvider";

/**
 * Initialize the cast system. Call this once at app startup.
 */
function initializeCast(): void {
  // Don't re-initialize if already done
  if (CastSessionManager.getInstance()) {
    return;
  }

  const providers: CastProviderInterface[] = [];

  if (__DEV__) {
    // Dev mode: use mock provider — works in Expo Go, no native build needed
    console.log("[Cast] Using MockCastProvider (dev mode)");
    providers.push(new MockCastProvider());
  } else {
    // Production: use real ChromecastProvider
    // This code path only runs in native builds where react-native-google-cast is available
    if (Platform.OS === "android" || Platform.OS === "ios") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { ChromecastProvider } = require("@/modules/cast/providers/ChromecastProvider");
        providers.push(new ChromecastProvider());
        console.log("[Cast] Using ChromecastProvider (production)");
      } catch (e) {
        console.warn("[Cast] ChromecastProvider not available, falling back to mock:", e);
        providers.push(new MockCastProvider());
      }
    }
  }

  if (providers.length === 0) {
    console.log("[Cast] No providers available — cast disabled");
    return;
  }

  try {
    CastSessionManager.initialize({
      providers,
      extractionTimeoutMs: 15000,
      discoveryTimeoutMs: 10000,
      customReceiverUrl: CAST_RECEIVER_URL,
    });
    console.log("[Cast] Initialized with", providers.length, "provider(s)");
  } catch (e) {
    console.warn("[Cast] Initialization failed:", e);
  }
}

/**
 * React component that initializes the cast system on mount.
 * Place this inside your AppProviders.
 */
export function CastInitializer() {
  useEffect(() => {
    initializeCast();

    return () => {
      CastSessionManager.destroy();
    };
  }, []);

  return null;
}
