/**
 * TMDB Cast Cache
 *
 * In-memory cache for resolved TMDB cast profile maps. Entries are looked up
 * by `tmdbId` first and fall back to a normalized title key when a TMDB id is
 * not available. Both positive results and negative results (no match found,
 * or empty cast list) are cached so repeated lookups for the same key
 * short-circuit without re-hitting the TMDB API.
 *
 * The cache holds entries in memory for the duration of the app session with
 * no expiration and no maximum size, matching the convention established by
 * `modules/poster/cache.ts`.
 */

import { normalizeTitle } from "./titleNormalizer";
import type { CastCacheEntry } from "./clients/types";

/** Key prefix used for entries indexed by TMDB id. */
const ID_PREFIX = "id:";

/** Key prefix used for entries indexed by normalized title. */
const TITLE_PREFIX = "title:";

/**
 * Composite cache key. Either `tmdbId`, `title`, or both may be supplied;
 * when both are supplied, a `set` stores the entry under both keys so a
 * subsequent `get` by either key resolves to the same entry.
 */
export interface CastCacheKey {
  tmdbId?: string;
  title?: string;
}

function makeIdKey(tmdbId: string): string {
  return `${ID_PREFIX}${tmdbId}`;
}

function makeTitleKey(title: string): string {
  return `${TITLE_PREFIX}${normalizeTitle(title)}`;
}

/**
 * In-memory `Map`-backed cache for TMDB cast resolution results.
 *
 * Lookups consult the TMDB-id slot first and fall back to the
 * normalized-title slot, so a `set` performed under both keys can later be
 * retrieved by either lookup form.
 */
export class CastCache {
  private cache: Map<string, CastCacheEntry> = new Map();

  /**
   * Retrieves a cache entry. Tries the TMDB-id key first, then falls back to
   * the normalized-title key. Returns `undefined` when neither matches.
   */
  get(key: CastCacheKey): CastCacheEntry | undefined {
    if (key.tmdbId) {
      const entry = this.cache.get(makeIdKey(key.tmdbId));
      if (entry) {
        return entry;
      }
    }
    if (key.title) {
      const entry = this.cache.get(makeTitleKey(key.title));
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Stores an entry under every key slot present on the supplied lookup key.
   * Storing under both `tmdbId` and `title` simultaneously ensures that a
   * future lookup using either form hits the same entry.
   */
  set(key: CastCacheKey, entry: CastCacheEntry): void {
    if (key.tmdbId) {
      this.cache.set(makeIdKey(key.tmdbId), entry);
    }
    if (key.title) {
      this.cache.set(makeTitleKey(key.title), entry);
    }
  }

  /**
   * Reports whether a cache entry exists for the supplied key, using the
   * same id-first/title-fallback resolution as {@link CastCache.get}.
   */
  has(key: CastCacheKey): boolean {
    return this.get(key) !== undefined;
  }
}
