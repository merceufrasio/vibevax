/**
 * Poster Cache
 *
 * In-memory cache for resolved poster URLs, keyed by normalized anime title.
 * Stores both successful resolutions and negative entries (all APIs failed).
 * Persists for the duration of the app session with no maximum size limit.
 */

import { normalizeTitle } from "./titleNormalizer";

/**
 * Represents a cached poster resolution result.
 */
export interface CacheEntry {
  /** The resolved poster URL (or original URL for negative entries) */
  resolvedUrl: string;
  /** True if all APIs failed and this stores the original URL */
  isNegative: boolean;
  /** Timestamp (Date.now()) when the entry was cached */
  timestamp: number;
}

/**
 * In-memory Map-based cache for poster URL resolutions.
 * Keys are normalized titles produced by `normalizeTitle`.
 */
export class PosterCache {
  private cache: Map<string, CacheEntry> = new Map();

  /**
   * Retrieves a cache entry by title.
   * The key is normalized before lookup.
   */
  get(key: string): CacheEntry | undefined {
    const normalizedKey = normalizeTitle(key);
    return this.cache.get(normalizedKey);
  }

  /**
   * Stores a cache entry keyed by normalized title.
   */
  set(key: string, entry: CacheEntry): void {
    const normalizedKey = normalizeTitle(key);
    this.cache.set(normalizedKey, entry);
  }

  /**
   * Checks if a cache entry exists for the given title.
   * The key is normalized before lookup.
   */
  has(key: string): boolean {
    const normalizedKey = normalizeTitle(key);
    return this.cache.has(normalizedKey);
  }
}
