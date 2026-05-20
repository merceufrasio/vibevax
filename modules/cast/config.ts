/**
 * Configuration for the Cast to TV module.
 *
 * Provides default configuration values and runtime configuration
 * management for the cast system. Follows the same pattern as
 * `modules/tmdb/config.ts`.
 */

import type { CastConfig, CastProvider } from "./types";

/**
 * Google Cast Application ID registered at cast.google.com/publish
 * This ID links the sender app to the custom receiver hosted on GitHub Pages.
 */
export const CAST_APP_ID = "3C52EDCF";

/**
 * URL of the custom Chromecast receiver hosted on GitHub Pages.
 * The receiver handles HLS playback with custom header injection.
 */
export const CAST_RECEIVER_URL = "https://merceufrasio.github.io/vibevax-cast-receiver/";

const DEFAULT_CONFIG: Omit<CastConfig, "providers"> & { providers: CastProvider[] } = {
  providers: [],
  extractionTimeoutMs: 15000,
  discoveryTimeoutMs: 10000,
  customReceiverUrl: CAST_RECEIVER_URL,
};

let currentConfig: CastConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the cast module at runtime. Merges the provided partial
 * config with the current config. Call this during app initialization
 * to register providers and set timeouts.
 */
export function configureCastModule(config: Partial<CastConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Returns the current cast module configuration.
 */
export function getCastConfig(): CastConfig {
  return currentConfig;
}

/**
 * Reports whether the cast module has any registered providers.
 * When this returns false, cast functionality should not be exposed.
 */
export function isCastEnabled(): boolean {
  return currentConfig.providers.length > 0;
}
