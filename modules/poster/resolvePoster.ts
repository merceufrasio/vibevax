/**
 * Poster Resolution Orchestrator
 *
 * Orchestrates the waterfall API resolution strategy:
 * cache → Jikan → AniList → Kitsu
 *
 * Features:
 * - Promise.race timeout (default 3000ms from config)
 * - Deduplication via pending-request Map (one in-flight chain per normalized title)
 * - Caches both successful and negative results
 * - Never throws to caller; all errors caught internally
 */

import { PosterCache } from "./cache";
import { AniListClient } from "./clients/aniListClient";
import { JikanClient } from "./clients/jikanClient";
import { KitsuClient } from "./clients/kitsuClient";
import { PosterApiClient } from "./clients/types";
import { getConfig, isCfProtected } from "./config";
import { TokenBucket } from "./rateLimiter";
import { normalizeTitle } from "./titleNormalizer";

export interface ResolvePosterParams {
  url: string;
  title: string;
  sourceId?: string;
}

// --- Singleton instances ---

const jikanBucket = new TokenBucket({
  maxTokens: 3,
  refillRate: 3,
  backoffMs: 5000,
});

const aniListBucket = new TokenBucket({
  maxTokens: 90,
  refillRate: 1.5,
  backoffMs: 5000,
});

const kitsuBucket = new TokenBucket({
  maxTokens: 60,
  refillRate: 1,
  backoffMs: 5000,
});

const jikanClient = new JikanClient(jikanBucket);
const aniListClient = new AniListClient(aniListBucket);
const kitsuClient = new KitsuClient(kitsuBucket);

const posterCache = new PosterCache();

/** Waterfall order of API clients */
const clients: PosterApiClient[] = [jikanClient, aniListClient, kitsuClient];

/** Map of in-flight resolution promises keyed by normalized title */
const pendingRequests = new Map<string, Promise<string>>();

/**
 * Resolves an alternative poster URL if the original is CF-protected.
 * Returns the original URL if not blocked or if all APIs fail.
 *
 * - Checks CF protection first; returns original immediately if not protected
 * - Checks cache; returns cached URL on hit
 * - Deduplicates concurrent requests for the same normalized title
 * - Wraps waterfall in Promise.race against configured timeout
 * - Never throws; logs errors via console.warn
 */
export async function resolvePoster(params: ResolvePosterParams): Promise<string> {
  const { url, title, sourceId } = params;

  try {
    // If URL is not CF-protected, return original immediately
    if (!isCfProtected(url, sourceId)) {
      return url;
    }

    const normalizedKey = normalizeTitle(title);

    // Check cache — if hit, return cached URL
    const cached = posterCache.get(title);
    if (cached) {
      return cached.resolvedUrl;
    }

    // Check pending requests — if already in-flight, await existing promise
    const pending = pendingRequests.get(normalizedKey);
    if (pending) {
      return pending;
    }

    // Start waterfall and store promise in pending map
    const resolutionPromise = executeWaterfall(title, url);
    pendingRequests.set(normalizedKey, resolutionPromise);

    // Race waterfall against timeout
    const config = getConfig();
    const result = await Promise.race([
      resolutionPromise,
      createTimeout(config.timeoutMs, url),
    ]);

    return result;
  } catch (error) {
    // Never throw to caller
    console.warn("[poster] Unexpected error in resolvePoster:", error);
    return url;
  }
}

/**
 * Executes the waterfall API resolution: Jikan → AniList → Kitsu.
 * On success, caches the resolved URL.
 * On all-fail, caches the original URL as a negative entry.
 * Always removes from pending map on completion.
 */
async function executeWaterfall(title: string, originalUrl: string): Promise<string> {
  const normalizedKey = normalizeTitle(title);

  try {
    for (const client of clients) {
      try {
        const result = await client.search(title);
        if (result && result.posterUrl) {
          // Success: cache and return
          posterCache.set(title, {
            resolvedUrl: result.posterUrl,
            isNegative: false,
            timestamp: Date.now(),
          });
          return result.posterUrl;
        }
      } catch (error) {
        // Individual client error — continue to next
        console.warn(`[poster] ${client.name} error:`, error);
      }
    }

    // All APIs failed: cache original as negative entry
    posterCache.set(title, {
      resolvedUrl: originalUrl,
      isNegative: true,
      timestamp: Date.now(),
    });
    return originalUrl;
  } finally {
    // Remove from pending map regardless of outcome
    pendingRequests.delete(normalizedKey);
  }
}

/**
 * Creates a timeout promise that resolves with the original URL
 * after the specified duration.
 */
function createTimeout(ms: number, fallbackUrl: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(fallbackUrl), ms);
  });
}
