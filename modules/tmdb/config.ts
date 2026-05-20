/**
 * Configuration for the TMDB module.
 *
 * Mirrors the structure of `modules/poster/config.ts`: a typed config
 * interface, a frozen-style `DEFAULT_CONFIG`, a mutable `currentConfig`,
 * and small accessors. Credentials default to the `EXPO_PUBLIC_TMDB_*`
 * environment variables (Expo's standard pattern for client-readable env
 * values) and can be overridden at runtime via {@link configureTmdbModule}
 * so tests can mutate them without touching `process.env`.
 *
 * See `.kiro/specs/tmdb-cast-images/design.md` for context.
 */

export interface TmdbModuleConfig {
  /** Optional API key (v3) — overrides bearer when both present. */
  apiKey?: string;
  /** Optional bearer token (v4 read access). */
  bearerToken?: string;
  /** Per-request timeout in ms (default 5000). */
  timeoutMs: number;
  /** Image size segment for poster URLs (default "w500"). */
  posterSize: string;
  /** Image size segment for profile URLs (default "w185"). */
  profileSize: string;
  /** Max cast entries returned (default 20). */
  maxCastEntries: number;
  /** Source ids that should be skipped (e.g. adult sources). Empty by default. */
  excludedSourceIds: string[];
  /** Language code passed to TMDB (default "vi-VN"). */
  language: string;
}

/**
 * Reads an `EXPO_PUBLIC_*` environment value, trimming whitespace and
 * collapsing empty strings to `undefined` so consumers can rely on a
 * truthy check to detect absence.
 */
function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const DEFAULT_CONFIG: TmdbModuleConfig = {
  apiKey: readEnv("EXPO_PUBLIC_TMDB_API_KEY"),
  bearerToken: readEnv("EXPO_PUBLIC_TMDB_BEARER_TOKEN"),
  timeoutMs: 5000,
  posterSize: "w500",
  profileSize: "w185",
  maxCastEntries: 20,
  excludedSourceIds: [],
  language: "vi-VN",
};

let currentConfig: TmdbModuleConfig = { ...DEFAULT_CONFIG };

/**
 * Updates the module configuration at runtime. Merges the provided partial
 * config with the current config. Useful for tests and for late-binding
 * credentials that aren't available at module-load time.
 */
export function configureTmdbModule(config: Partial<TmdbModuleConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Returns the current module configuration.
 */
export function getConfig(): TmdbModuleConfig {
  return currentConfig;
}

/**
 * Reports whether the TMDB module has any usable credentials. When this
 * returns `false`, callers (notably the orchestrator) should short-circuit
 * to an empty result without making any network requests.
 */
export function isTmdbEnabled(): boolean {
  const { apiKey, bearerToken } = currentConfig;
  return Boolean((apiKey && apiKey.length > 0) || (bearerToken && bearerToken.length > 0));
}
