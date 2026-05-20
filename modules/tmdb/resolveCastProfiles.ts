/**
 * Cast profile resolution for the TMDB module.
 *
 * Two layers live in this file:
 *
 *   1. Pure `buildCastProfiles` helper — name-matches a parsed source cast
 *      list against a TMDB cast list and returns a `name -> profileUrl` map.
 *      Side-effect-free so it can be exercised directly by property tests.
 *      (Properties 5, 6, 11 in `.kiro/specs/tmdb-cast-images/design.md`.)
 *
 *   2. `resolveCastProfiles` orchestrator — drives identity resolution,
 *      cache lookup (with normalized-title fallback), in-flight request
 *      deduplication, endpoint selection (credits vs aggregate_credits),
 *      cast-name matching, and result caching (both positive and negative).
 *      All errors are caught internally; the function never throws.
 *      (Properties 1, 2, 4, 7, 12, 13, 15, 17, 22 in the same design.)
 */

import { CastCache } from "./cache";
import { getConfig, isTmdbEnabled } from "./config";
import { findMatch, normalizeName } from "./nameMatcher";
import { tmdbClient } from "./clients/tmdbClient";
import type {
  CastCacheEntry,
  ParsedCastEntry,
  ResolveCastParams,
  ResolveCastResult,
  TmdbApiClient,
  TmdbCastEntry,
  TmdbIdentity,
} from "./clients/types";

/**
 * Base URL for all TMDB-hosted images. The full image URL is built by
 * appending the size segment (e.g. `w185`) and the `profile_path` (which
 * already starts with `/`).
 */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";

/**
 * Sort comparator that orders TMDB cast entries by their `order` field
 * ascending (lower `order` == higher billing). Entries without an `order`
 * are sorted to the end so they are only considered when the billing list
 * is shorter than the configured cap.
 */
function compareByOrder(a: TmdbCastEntry, b: TmdbCastEntry): number {
  const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
  return ao - bo;
}

/**
 * Build a `Record<sourceName, profileUrl>` map from a parsed source cast list
 * and a TMDB cast list.
 *
 * Behavior:
 *   - The TMDB cast list is sorted by `order` ascending and truncated to the
 *     configured `maxCastEntries` (default 20). Source cast names are matched
 *     against this top-N slice via {@link findMatch} (Property 6).
 *   - When a match's `profile_path` is `null` or `undefined`, no entry is
 *     produced for that source name (Property 5: null filtering).
 *   - When a source name has no match in the TMDB slice, no entry is
 *     produced (Property 11: disjoint names produce no entries; the source
 *     adapter later fills missing avatars with an empty string per
 *     Requirement 3.5).
 *   - Profile URLs are constructed as
 *     `${TMDB_IMAGE_BASE}${profileSize}${profile_path}` and therefore always
 *     begin with `https://image.tmdb.org/t/p/w185` for the default config
 *     (Property 5: URL shape).
 *
 * Pure function — does not read or mutate any module-level state other than
 * the config snapshot pulled at call time.
 *
 * @param sourceCast Parsed source cast entries (from `detail.casts`).
 * @param tmdbCast   TMDB cast entries (from `/credits` or `/aggregate_credits`).
 * @returns A map from source-cast name to TMDB profile image URL. May be
 *          empty if no source name matches a TMDB entry with a profile path.
 */
export function buildCastProfiles(
  sourceCast: ParsedCastEntry[],
  tmdbCast: TmdbCastEntry[],
): Record<string, string> {
  const result: Record<string, string> = {};
  if (sourceCast.length === 0 || tmdbCast.length === 0) {
    return result;
  }

  const { profileSize, maxCastEntries } = getConfig();
  const cap = Math.max(1, maxCastEntries);

  // Sort by billing order ascending without mutating the caller's array, then
  // truncate to the top-N billed entries we are willing to consider.
  const billed = [...tmdbCast].sort(compareByOrder).slice(0, cap);

  for (const entry of sourceCast) {
    if (!entry.name) continue;
    if (Object.prototype.hasOwnProperty.call(result, entry.name)) continue;

    const matchedIndex = findMatch({ sourceName: entry.name, tmdbCast: billed });
    if (matchedIndex < 0) continue;

    const matched = billed[matchedIndex];
    const profilePath = matched.profile_path;
    // Skip entries with a null/undefined profile_path; per Property 5 they
    // produce no map entry.
    if (!profilePath) continue;

    result[entry.name] = `${TMDB_IMAGE_BASE}${profileSize}${profilePath}`;
  }

  return result;
}


// ---------------------------------------------------------------------------
// Orchestrator: resolveCastProfiles
// ---------------------------------------------------------------------------

/** Tag used to prefix all `console.warn` output from the orchestrator. */
const LOG_TAG = "[tmdb]";

/**
 * Module-level cache shared across every `resolveCastProfiles` invocation.
 * Keyed by `tmdbId` (preferred) or normalized title (fallback). See
 * {@link CastCache} for the storage contract.
 *
 * One instance per process matches Requirement 4.4 (entries persist for the
 * app session) and Property 12 / 13 (cache-hit short-circuit, negative cache).
 */
const castCache = new CastCache();

/**
 * In-flight request deduplication map. While a resolution for a given key is
 * pending, every concurrent call for the same key returns the same promise
 * (Property 15 / Requirement 4.5).
 *
 * Keys are derived by {@link buildPendingKey} from the chosen cache key plus
 * the optional season — distinct seasons of the same TV id should not share
 * an in-flight promise because their `aggregate_credits` payloads differ.
 */
const pendingRequests = new Map<string, Promise<ResolveCastResult>>();

/**
 * Optional dependency injection bag. Tests pass a mock client here to drive
 * deterministic identity / credits responses without monkey-patching the
 * shared `tmdbClient` singleton.
 */
export interface ResolveCastDependencies {
  client?: TmdbApiClient;
}

/**
 * Parses {@link ResolveCastParams} `detail.casts` into a deduplicated list of
 * {@link ParsedCastEntry} values.
 *
 * Accepts the comma-separated form used by every source plugin and the
 * "linked" form `[Display Name](slug)` used by sources that pre-encode an
 * actor-page slug in the cast list (e.g. MissAV). The slug is preserved on
 * the parsed entry for downstream sibling enrichers, even though the TMDB
 * resolver itself does not use it.
 *
 * Order is preserved (first occurrence wins) so the resulting profile map
 * follows the source's billing order.
 */
function parseCastEntries(value?: string): ParsedCastEntry[] {
  if (!value) return [];

  const seen = new Map<string, ParsedCastEntry>();
  for (const raw of value.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // `[Display Name](slug)` form — used by MissAV sources to encode the
    // actor-page slug alongside the display name.
    const linked = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const entry: ParsedCastEntry = linked
      ? { name: linked[1].trim(), slug: linked[2].trim() }
      : { name: trimmed };

    if (!entry.name) continue;
    if (!seen.has(entry.name)) {
      seen.set(entry.name, entry);
    }
  }
  return Array.from(seen.values());
}

/**
 * Empty result helper. Used for every short-circuit path (disabled module,
 * excluded source id, empty cast list, errors) so callers always get the
 * same shape (Properties 4, 20).
 */
function emptyResult(): ResolveCastResult {
  return { castProfiles: {} };
}

/**
 * Builds a stable lookup key for the cache and the in-flight dedup map.
 * Identity-based keys take precedence; the normalized-title form is used
 * only when the source detail does not carry a `tmdbId` (Requirement 4.1,
 * Property 17 — sourceId is intentionally excluded so two details that
 * differ only in `sourceId` produce identical keys).
 *
 * The optional `season` segment guarantees that two TV resolutions for the
 * same id but different seasons each get their own pending promise and
 * cache entry (Property 7).
 */
function buildPendingKey(
  base: { tmdbId?: string; title?: string },
  season?: number,
): string {
  const seasonSegment = typeof season === "number" ? `:s${season}` : "";
  if (base.tmdbId) {
    return `id:${base.tmdbId}${seasonSegment}`;
  }
  if (base.title) {
    return `title:${normalizeName(base.title)}${seasonSegment}`;
  }
  return `unknown${seasonSegment}`;
}

/**
 * Builds a {@link ResolveCastResult} from a successfully-resolved identity
 * and the matched TMDB cast entries. Centralized so the result-shape
 * invariants (Property 5 profile URL prefix, Property 22 poster URL prefix)
 * stay in one place.
 */
function buildResult(
  identity: TmdbIdentity,
  parsedCast: ParsedCastEntry[],
  tmdbCast: TmdbCastEntry[],
): ResolveCastResult {
  const castProfiles = buildCastProfiles(parsedCast, tmdbCast);

  let posterUrl: string | undefined;
  if (identity.posterPath) {
    posterUrl = `${TMDB_IMAGE_BASE}${getConfig().posterSize}${identity.posterPath}`;
  }

  return { castProfiles, posterUrl, identity };
}

/**
 * Fetches credits for an identity, choosing between the standard `/credits`
 * endpoint and `/aggregate_credits` per Property 7 / Requirement 2.5:
 *
 *   - `aggregate_credits` IFF `tmdbType === "tv"` and `tmdbSeason` is defined.
 *   - `credits` otherwise (movies, and TV without a specified season).
 *
 * Returns an empty array for any failure / empty payload so the caller can
 * still cache a negative result.
 */
async function fetchCreditsForIdentity(
  client: TmdbApiClient,
  identity: TmdbIdentity,
): Promise<TmdbCastEntry[]> {
  const useAggregate =
    identity.tmdbType === "tv" && typeof identity.tmdbSeason === "number";

  console.log("[tmdb] fetchCredits", { tmdbId: identity.tmdbId, tmdbType: identity.tmdbType, useAggregate, tmdbSeason: identity.tmdbSeason });

  const payload = useAggregate
    ? await client.getAggregateCredits(identity)
    : await client.getCredits(identity);

  console.log("[tmdb] credits result", { castCount: payload?.cast?.length ?? 0, payloadNull: payload === null });

  return payload?.cast ?? [];
}

/**
 * Stores a {@link CastCacheEntry} under the supplied lookup key. Both the
 * tmdbId slot and the title slot are populated when both are provided so a
 * later lookup using either form hits the same entry.
 */
function storeInCache(
  key: { tmdbId?: string; title?: string },
  entry: CastCacheEntry,
): void {
  castCache.set(key, entry);
}

/**
 * Constructs a {@link ResolveCastResult} from a cached entry.
 */
function resultFromCache(entry: CastCacheEntry): ResolveCastResult {
  return {
    castProfiles: entry.castProfiles,
    posterUrl: entry.posterUrl,
    identity: entry.identity,
  };
}

/**
 * Core, error-catching resolution path. Runs once per pending key; the
 * `pendingRequests` map ensures concurrent callers share this promise
 * (Property 15).
 */
async function executeResolution(
  params: ResolveCastParams,
  parsedCast: ParsedCastEntry[],
  cacheKey: { tmdbId?: string; title?: string },
  client: TmdbApiClient,
): Promise<ResolveCastResult> {
  const { detail } = params;

  try {
    // Step 1: identity resolution. Skips search when (tmdbId, tmdbType) are
    // present (Property 1); otherwise searches by title+year (Property 2).
    const identity = await client.identify({
      tmdbId: detail.tmdbId,
      tmdbType: detail.tmdbType,
      tmdbSeason: detail.tmdbSeason,
      title: detail.title ?? "",
      originalTitle: detail.originName,
      year: detail.year,
    });

    if (!identity || !identity.tmdbId) {
      // No identity found — store a negative entry under the lookup key so
      // future calls short-circuit (Property 13 / Requirement 4.3).
      console.log("[tmdb] identity not found", { title: detail.title, originName: detail.originName });
      const negative: CastCacheEntry = {
        castProfiles: {},
        isNegative: true,
        timestamp: Date.now(),
      };
      storeInCache(cacheKey, negative);
      return emptyResult();
    }

    console.log("[tmdb] identity resolved", { tmdbId: identity.tmdbId, tmdbType: identity.tmdbType, posterPath: identity.posterPath });

    // Once we have an identity, also store under the tmdbId slot so any
    // subsequent call carrying the same id (regardless of whether it had a
    // title) hits the cache (Property 12, Requirement 4.2).
    const identityCacheKey = {
      tmdbId: identity.tmdbId,
      title: cacheKey.title,
    };

    // Step 2: fetch credits using the correct endpoint (Property 7).
    const tmdbCast = await fetchCreditsForIdentity(client, identity);

    // Step 3: build the result and cache it (positive or negative).
    if (tmdbCast.length === 0) {
      // No cast payload — still cache the identity + poster so a later call
      // can at least surface the poster fallback without re-hitting search.
      const posterUrl = identity.posterPath
        ? `${TMDB_IMAGE_BASE}${getConfig().posterSize}${identity.posterPath}`
        : undefined;

      const entry: CastCacheEntry = {
        identity,
        castProfiles: {},
        posterUrl,
        isNegative: true,
        timestamp: Date.now(),
      };
      storeInCache(identityCacheKey, entry);
      return { castProfiles: {}, posterUrl, identity };
    }

    const result = buildResult(identity, parsedCast, tmdbCast);
    console.log("[tmdb] buildResult", {
      parsedCastNames: parsedCast.map(c => c.name),
      tmdbCastNames: tmdbCast.slice(0, 5).map(c => c.name + " | " + c.original_name),
      matchedProfiles: Object.keys(result.castProfiles),
    });
    const entry: CastCacheEntry = {
      identity: result.identity,
      castProfiles: result.castProfiles,
      posterUrl: result.posterUrl,
      isNegative: Object.keys(result.castProfiles).length === 0,
      timestamp: Date.now(),
    };
    storeInCache(identityCacheKey, entry);
    return result;
  } catch (error) {
    // Defense in depth: the client already collapses its own failures to
    // `null`. If anything still throws, we swallow it and return empty so
    // the caller never has to handle exceptions (Property 4 / Requirements
    // 1.4, 1.5).
    console.warn(`${LOG_TAG} resolveCastProfiles failed:`, error);
    return emptyResult();
  }
}

/**
 * Resolves TMDB cast profile images (and a bonus poster URL) for a single
 * source movie detail.
 *
 * The orchestrator never throws to its caller. Every short-circuit path
 * returns an empty {@link ResolveCastResult} (cast map only, no identity, no
 * poster):
 *
 *   - {@link isTmdbEnabled} returns `false` (Property 20 / Requirement 6.4).
 *   - The detail's `sourceId` is in `excludedSourceIds`.
 *   - The detail has no usable cast string AND no `tmdbId`.
 *   - Identity resolution fails (no candidates, network error, timeout).
 *
 * On success, caches both the cast-profile map and the resolved identity so
 * subsequent calls for the same key short-circuit without further network
 * traffic (Properties 12, 13, 14).
 *
 * Concurrent calls for the same key share a single in-flight promise via the
 * {@link pendingRequests} map (Property 15 / Requirement 4.5).
 *
 * @param params Resolution input — only the fields actually consumed are
 *               required (see {@link ResolveCastParams}).
 * @param deps   Optional dependency overrides; tests typically inject a
 *               mocked {@link TmdbApiClient} via `deps.client`. Defaults to
 *               the shared module-level {@link tmdbClient}.
 *
 * **Validates: Requirements 1.1, 1.2, 1.4, 1.5, 2.5, 4.1, 4.2, 4.3, 4.5, 5.5**
 */
export async function resolveCastProfiles(
  params: ResolveCastParams,
  deps?: ResolveCastDependencies,
): Promise<ResolveCastResult> {
  try {
    // Short-circuit 1: module disabled (no creds).
    if (!isTmdbEnabled()) {
      console.log("[tmdb] disabled — no credentials found", {
        apiKey: !!getConfig().apiKey,
        bearerToken: !!getConfig().bearerToken,
      });
      return emptyResult();
    }

    const { detail } = params;

    console.log("[tmdb] resolveCastProfiles called", {
      sourceId: detail.sourceId,
      title: detail.title,
      hasCasts: !!detail.casts,
      tmdbId: detail.tmdbId,
    });

    // Short-circuit 2: excluded source id (e.g. adult sources).
    if (detail.sourceId && getConfig().excludedSourceIds.includes(detail.sourceId)) {
      return emptyResult();
    }

    const parsedCast = parseCastEntries(detail.casts);

    // Short-circuit 3: no cast to resolve and no explicit tmdbId. We could
    // still resolve a poster from a tmdbId-only detail, so we only bail when
    // both are missing.
    if (parsedCast.length === 0 && !detail.tmdbId) {
      console.log("[tmdb] no cast and no tmdbId, skipping");
      return emptyResult();
    }

    // Build the lookup key. We prefer (tmdbId, season) when available; we
    // fall back to (title, season) otherwise. Using `title` (not
    // `originName`) keeps the key stable across different originName values
    // for the same localized title — Property 17 demands sourceId-invariance
    // and we extend that to other source-internal fields.
    const lookupTitle = detail.title || detail.originName || "";
    const cacheKey = {
      tmdbId: detail.tmdbId,
      title: lookupTitle || undefined,
    };

    // Cache lookup (Properties 12, 13).
    const cached = castCache.get(cacheKey);
    if (cached) {
      return resultFromCache(cached);
    }

    // In-flight dedup (Property 15). Concurrent callers for the same key
    // share the same promise.
    const pendingKey = buildPendingKey(cacheKey, detail.tmdbSeason);
    const pending = pendingRequests.get(pendingKey);
    if (pending) {
      return pending;
    }

    const client = deps?.client ?? tmdbClient;
    const work = executeResolution(params, parsedCast, cacheKey, client).finally(
      () => {
        pendingRequests.delete(pendingKey);
      },
    );
    pendingRequests.set(pendingKey, work);
    return work;
  } catch (error) {
    // Outer catch — should never trigger because every awaited path is
    // guarded internally, but keeps the contract that the resolver never
    // throws (Property 4 / Requirements 1.4, 1.5).
    console.warn(`${LOG_TAG} resolveCastProfiles outer error:`, error);
    return emptyResult();
  }
}
