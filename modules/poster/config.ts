/**
 * Configuration for the anime poster module.
 */

export interface PosterModuleConfig {
  /** CDN hostnames that are CF-protected */
  blockedHostnames: string[];
  /** Source IDs that require poster fallback */
  blockedSourceIds: string[];
  /** Overall timeout for resolution in ms (default: 3000) */
  timeoutMs: number;
}

const DEFAULT_CONFIG: PosterModuleConfig = {
  blockedHostnames: ["cdn.animevietsub.site"],
  blockedSourceIds: ["animevietsub"],
  timeoutMs: 3000,
};

let currentConfig: PosterModuleConfig = { ...DEFAULT_CONFIG };

/**
 * Updates the module configuration at runtime.
 * Merges the provided partial config with the current config.
 */
export function configurePosterModule(config: Partial<PosterModuleConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Returns the current module configuration.
 */
export function getConfig(): PosterModuleConfig {
  return currentConfig;
}

/**
 * Checks if a URL is CF-protected based on current config.
 * Returns true if the URL's hostname appears in the blocked hostnames list
 * or the source ID appears in the blocked source IDs list.
 */
export function isCfProtected(url: string, sourceId?: string): boolean {
  if (sourceId && currentConfig.blockedSourceIds.includes(sourceId)) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname;
    return currentConfig.blockedHostnames.includes(hostname);
  } catch {
    return false;
  }
}
