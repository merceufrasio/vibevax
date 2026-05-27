/**
 * CastInitializer - Provider initialization for real Google Cast.
 *
 * On Android/iOS native builds, this returns the real ChromecastProvider. In
 * Expo Go or any build where react-native-google-cast is not linked, it returns
 * null so the app does not expose the old mock cast flow as if it were real.
 */

import { NativeModules, Platform } from "react-native";

import { CastSessionManager } from "../CastSessionManager";
import { CAST_RECEIVER_URL } from "../config";
import type { CastProvider } from "../types";
import { ChromecastProvider } from "./ChromecastProvider";

/**
 * Attempts to initialize the appropriate CastProvider for the current runtime.
 */
export function initializeCastProvider(): CastProvider | null {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return null;
  }

  try {
    if (!NativeModules.RNGCCastContext) {
      throw new Error("RNGCCastContext native module is not linked.");
    }

    return new ChromecastProvider();
  } catch (error) {
    console.warn(
      "[Cast] react-native-google-cast native module unavailable; real casting is disabled until a native build includes it:",
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
}

/**
 * Initializes the CastSessionManager singleton with the real provider.
 */
export function initializeCastSession(): CastSessionManager | null {
  const existing = CastSessionManager.getInstance();
  if (existing) {
    return existing;
  }

  const provider = initializeCastProvider();
  if (!provider) {
    return null;
  }

  try {
    return CastSessionManager.initialize({
      providers: [provider],
      extractionTimeoutMs: 15000,
      discoveryTimeoutMs: 10000,
      customReceiverUrl: CAST_RECEIVER_URL,
    });
  } catch (error) {
    console.warn("[Cast] CastSessionManager initialization failed:", error);
    return null;
  }
}
