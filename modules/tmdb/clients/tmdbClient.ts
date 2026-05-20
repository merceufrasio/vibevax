/**
 * TMDB API client (`modules/tmdb/clients/tmdbClient.ts`).
 *
 * Two layers live in this file:
 *
 *  1. Pure scoring helpers (`scoreTmdbCandidate`, `pickBestCandidate`) used to
 *     pick the best `/search/movie` + `/search/tv` candidate for a movie/show
 *     identity lookup. Pure and synchronous so the Property 3 (highest-scoring
 *     candidate) test can exercise them without spinning up the full client.
 *
 *  2. The network-facing `TmdbClient` class — a thin wrapper around `fetch`
 *     that handles authentication, rate limiting (shared `TokenBucket`),
 *     per-request timeouts (`AbortController`), HTTP 401 → disable-for-session,
 *     and HTTP 429 → backoff-and-retry. All public methods return `null` on
 *     any failure so the orchestrator never has to handle exceptions.
 *
 * See `.kiro/specs/tmdb-cast-images/design.md` § "TmdbClient" and
 * § "Identity Scoring".
 */

import { TokenBucket } from "@/modules/poster/rateLimiter";

import { getConfig } from "../config";
import { normalizeName } from "../nameMatcher";
import type {
  IdentifyInput,
  TmdbApiClient,
  TmdbCreditsResponse,
  TmdbIdentity,
  TmdbSearchResult,
} from "./types";

/**
 * Inputs to the scoring/picking helpers. Caller is responsible for
 * pre-normalizing the target title with the same rules as the candidate
 * (NFD diacritic strip → lowercase → non-alphanumeric runs to single space →
 * trim) so equality and substring checks line up.
 */
export interface ScoreCandidateInput {
  /** Pre-normalized target title (see {@link normalizeForScoring}). */
  normalizedTargetTitle: string;
  /** Expected release year, if known. Missing year disables the year signal. */
  expectedYear?: number;
  /** When true, TV results get a +50 bonus to prefer them over movies. */
  preferTv?: boolean;
}

/**
 * Title normalization used by the scorer. Kept as a private helper so this
 * file remains self-contained ahead of task 3.1 (which introduces a shared
 * `normalizeName` in `modules/tmdb/nameMatcher.ts`). The two implementations
 * intentionally use the same rules so callers get consistent results.
 */
function normalizeForScoring(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Extracts a 4-digit year from a TMDB date field (e.g., "2014-03-21"). Returns
 * `undefined` when the value is empty or does not start with a year.
 */
function extractYear(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Picks the most descriptive title field from a search result, falling back
 * through the localized/original variants in order of preference.
 */
function getCandidateTitle(candidate: TmdbSearchResult): string {
  return (
    candidate.title ||
    candidate.name ||
    candidate.original_title ||
    candidate.original_name ||
    ""
  );
}

/**
 * Scores a single TMDB search candidate against the target identity. Higher
 * is better. Weights match the design table:
 *
 * | Signal                                       | Weight       |
 * | -------------------------------------------- | ------------ |
 * | Normalized title exact match                 | +120         |
 * | Normalized title substring (either direction) | +80         |
 * | Year delta = 0                                | +30         |
 * | Year delta = 1                                | +12         |
 * | Year delta ≤ 2                                | +4          |
 * | Popularity (capped at 25)                     | +0…+25      |
 *
 * The exact-vs-substring branches are mutually exclusive, so a candidate
 * never gets both +120 and +80.
 *
 * **Validates: Requirements 1.3**
 */
export function scoreTmdbCandidate(
  candidate: TmdbSearchResult,
  input: ScoreCandidateInput,
): number {
  const { normalizedTargetTitle, expectedYear, preferTv } = input;

  let score = 0;

  // Media type preference bonus — when the source title had a season suffix,
  // we strongly prefer TV results (+50) to avoid picking a same-name movie.
  if (preferTv && candidate.media_type === "tv") {
    score += 50;
  }

  // Title signal.
  const normalizedCandidateTitle = normalizeForScoring(getCandidateTitle(candidate));
  if (normalizedTargetTitle && normalizedCandidateTitle === normalizedTargetTitle) {
    score += 120;
  } else if (
    normalizedTargetTitle &&
    normalizedCandidateTitle &&
    (normalizedCandidateTitle.includes(normalizedTargetTitle) ||
      normalizedTargetTitle.includes(normalizedCandidateTitle))
  ) {
    score += 80;
  }

  // Year signal — only contributes when both sides have a year.
  if (typeof expectedYear === "number" && expectedYear > 0) {
    const candidateYear =
      extractYear(candidate.release_date) ?? extractYear(candidate.first_air_date);
    if (typeof candidateYear === "number") {
      const yearDelta = Math.abs(expectedYear - candidateYear);
      if (yearDelta === 0) score += 30;
      else if (yearDelta === 1) score += 12;
      else if (yearDelta <= 2) score += 4;
    }
  }

  // Popularity signal — capped at 25 to prevent runaway weight.
  const popularity = Number(candidate.popularity ?? 0);
  if (Number.isFinite(popularity) && popularity > 0) {
    score += Math.min(popularity, 25);
  }

  return score;
}

/**
 * Picks the highest-scoring candidate from a `/search/movie` + `/search/tv`
 * union. Ties are broken in two stages:
 *
 *  1. `media_type === "movie"` wins over `"tv"` (movies are typically more
 *     specific search hits when the source detail does not specify a type).
 *  2. Higher raw `popularity` wins.
 *
 * Returns `null` when the input is empty so callers can short-circuit to a
 * negative cache entry.
 *
 * **Validates: Requirements 1.3**
 */
export function pickBestCandidate(
  candidates: readonly TmdbSearchResult[],
  input: ScoreCandidateInput,
): TmdbSearchResult | null {
  if (!candidates.length) return null;

  let best: TmdbSearchResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scoreTmdbCandidate(candidate, input);

    if (best === null || score > bestScore) {
      best = candidate;
      bestScore = score;
      continue;
    }

    if (score === bestScore) {
      // Tie-break 1: prefer movie over tv (default) or tv over movie (when preferTv).
      const preferredType = input.preferTv ? "tv" : "movie";
      const bestIsPreferred = best.media_type === preferredType;
      const candidateIsPreferred = candidate.media_type === preferredType;
      if (candidateIsPreferred && !bestIsPreferred) {
        best = candidate;
        continue;
      }
      if (bestIsPreferred && !candidateIsPreferred) {
        continue;
      }

      // Tie-break 2: prefer higher popularity.
      const bestPopularity = Number(best.popularity ?? 0);
      const candidatePopularity = Number(candidate.popularity ?? 0);
      if (candidatePopularity > bestPopularity) {
        best = candidate;
      }
    }
  }

  return best;
}


// ---------------------------------------------------------------------------
// Network-facing client
// ---------------------------------------------------------------------------

/**
 * Strips common season/part suffixes from a title so TMDB search can find
 * the base show. Handles Vietnamese "(Phần X)", English "(Season X)",
 * and other common patterns.
 */
function stripSeasonSuffix(title: string): string {
  return title
    .replace(/\s*[\(\[]\s*(?:Phần|Season|Mùa|Part|S)\s*\d+\s*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:Phần|Season|Mùa|Part)\s*\d+\s*$/gi, "")
    .replace(/\s+(?:Phần|Season|Mùa)\s+\d+\s*$/gi, "")
    .trim();
}

/**
 * Base URL for the TMDB v3 REST API. Both `api_key` (v3) and `Authorization:
 * Bearer` (v4 read access) auth schemes route through this same host.
 */
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

/**
 * Shared token bucket for all TMDB requests. TMDB allows ~40 requests per
 * 10-second window; we model that as `maxTokens=40` with a steady-state
 * refill of 4 tokens/sec, and back off for the full 10 s on a 429 to give
 * the server-side counter time to drain.
 *
 * One bucket is shared across `identify`, `getCredits`, and
 * `getAggregateCredits` so all three draw from the same budget.
 */
const tmdbTokenBucket = new TokenBucket({
  maxTokens: 40,
  refillRate: 4,
  backoffMs: 10_000,
});

/**
 * Tag used to prefix all `console.warn` output from this module so logs are
 * easy to filter.
 */
const LOG_TAG = "[tmdb]";

/**
 * Narrows an unknown {@link IdentifyInput.tmdbType} string to either `"movie"`
 * or `"tv"`. The source plugins use a few synonyms (`"series"`, `"show"`) for
 * TV, so the test is a substring check rather than strict equality. Returns
 * `"movie"` when the input is empty, undefined, or doesn't look TV-shaped.
 */
function normalizeTmdbType(value?: string): "movie" | "tv" {
  const lowered = (value ?? "").toLowerCase();
  if (
    lowered.includes("tv") ||
    lowered.includes("series") ||
    lowered.includes("show")
  ) {
    return "tv";
  }
  return "movie";
}

/**
 * Subset of the `/search/movie` + `/search/tv` response we consume. Both
 * endpoints share `{ results: [...] }` for our purposes.
 */
interface TmdbSearchResponse {
  results?: TmdbSearchResult[];
}

/**
 * Subset of a TMDB movie/tv detail response we consume when an explicit
 * `tmdbId` was provided. We only need `poster_path` for the bonus poster
 * fallback (Requirement 7) and `id` to confirm the entity exists.
 */
interface TmdbDetailResponse {
  id?: number;
  poster_path?: string | null;
}

/**
 * Concrete `TmdbApiClient` implementation. Wraps `fetch` with:
 *
 *   - shared token-bucket rate limiting (40 req / 10 s)
 *   - per-request `AbortController` timeout (default 5000 ms from config)
 *   - `api_key` query param OR `Authorization: Bearer` header auth
 *   - HTTP 429 → `tokenBucket.backoff()` then a single retry after `backoffMs`
 *   - HTTP 401 → flips a session-scoped `disabledForSession` flag so subsequent
 *     calls short-circuit to `null` without further network traffic
 *   - all other failures (network, JSON parse, timeout, non-429/401 errors)
 *     are caught; the relevant method returns `null`
 *
 * Per Requirement 6.4, the orchestrator already short-circuits when neither
 * `apiKey` nor `bearerToken` is set, but this class enforces the same check
 * locally as defense in depth.
 */
export class TmdbClient implements TmdbApiClient {
  /**
   * Token bucket used to throttle outbound requests. Defaults to the shared
   * module-level bucket but is injectable so tests can drive timing.
   */
  private readonly tokenBucket: TokenBucket;

  /**
   * Once true, every public method short-circuits to `null` without hitting
   * the network. Set when the server responds with HTTP 401 (invalid /
   * missing credentials), per Requirement 6.4.
   *
   * Cleared only by re-instantiating the client (or by re-configuring the
   * module via {@link configureTmdbModule}, which the tests can simulate by
   * constructing a fresh instance).
   */
  private disabledForSession = false;

  constructor(tokenBucket: TokenBucket = tmdbTokenBucket) {
    this.tokenBucket = tokenBucket;
  }

  /**
   * Resolves a {@link TmdbIdentity} either from explicit ids (skipping search
   * per Requirement 1.1) or by combining `/search/movie` + `/search/tv`
   * results and picking the highest-scoring candidate (Requirements 1.2,
   * 1.3).
   *
   * Returns `null` when no usable identity can be produced (no credentials,
   * no candidates, search failures, or the explicit id couldn't be confirmed
   * via a detail fetch).
   */
  async identify(input: IdentifyInput): Promise<TmdbIdentity | null> {
    if (!this.canDispatch()) return null;

    // Path 1: explicit ids — skip search entirely (Property 1 / Requirement 1.1).
    if (input.tmdbId) {
      const tmdbType = normalizeTmdbType(input.tmdbType);

      // Best-effort detail fetch so we can pick up the poster_path for the
      // bonus poster fallback. A failure here doesn't invalidate the
      // identity — we still return `{ tmdbId, tmdbType }`.
      const detail = await this.fetchJson<TmdbDetailResponse>(
        `/${tmdbType}/${encodeURIComponent(input.tmdbId)}`,
        { language: getConfig().language },
      );

      return {
        tmdbId: input.tmdbId,
        tmdbType,
        tmdbSeason: input.tmdbSeason,
        posterPath: detail?.poster_path ?? null,
      };
    }

    // Path 2: title-based search across both /search/movie and /search/tv
    // (Property 2 / Requirements 1.2, 1.3).
    // Strategy: try originalTitle first (English/original name), then fall
    // back to localized title if the first search yields no results. This
    // handles sources that only provide Vietnamese titles.
    const primaryTitle = input.originalTitle || input.title;
    const fallbackTitle = input.originalTitle && input.title !== input.originalTitle
      ? input.title
      : null;
    if (!primaryTitle) return null;

    const result = await this.searchByTitle(primaryTitle, input.year);
    if (result) return { ...result, tmdbSeason: input.tmdbSeason };

    // Fallback 1: try with season/part suffix stripped from the title.
    // Sources often append "(Phần X)", "(Season X)", "(Mùa X)" etc.
    // When we detect a season suffix, prefer TV results over movies.
    const cleanedTitle = stripSeasonSuffix(primaryTitle);
    if (cleanedTitle !== primaryTitle) {
      const cleanedResult = await this.searchByTitle(cleanedTitle, input.year, true);
      if (cleanedResult) return { ...cleanedResult, tmdbSeason: input.tmdbSeason };
    }

    // Fallback 2: try the localized title if different from primary
    if (fallbackTitle) {
      const fallbackResult = await this.searchByTitle(fallbackTitle, input.year);
      if (fallbackResult) return { ...fallbackResult, tmdbSeason: input.tmdbSeason };

      // Also try cleaned fallback
      const cleanedFallback = stripSeasonSuffix(fallbackTitle);
      if (cleanedFallback !== fallbackTitle) {
        const cleanedFbResult = await this.searchByTitle(cleanedFallback, input.year, true);
        if (cleanedFbResult) return { ...cleanedFbResult, tmdbSeason: input.tmdbSeason };
      }
    }

    return null;
  }

  /**
   * Searches TMDB by title string, returning the best identity or null.
   * When preferTv is true, TV results are preferred over movies in tie-breaking
   * (used when the source title had a season suffix stripped).
   */
  private async searchByTitle(
    rawTitle: string,
    year?: number,
    preferTv = false,
  ): Promise<Omit<TmdbIdentity, "tmdbSeason"> | null> {
    const searchParams: Record<string, string> = {
      language: getConfig().language,
      query: rawTitle,
      include_adult: "false",
    };
    if (typeof year === "number" && year > 0) {
      const yearStr = String(year);
      searchParams.year = yearStr;
      searchParams.first_air_date_year = yearStr;
    }

    const [movieSearch, tvSearch] = await Promise.all([
      this.fetchJson<TmdbSearchResponse>("/search/movie", searchParams),
      this.fetchJson<TmdbSearchResponse>("/search/tv", searchParams),
    ]);

    const candidates: TmdbSearchResult[] = [
      ...((movieSearch?.results ?? []).map((r) => ({
        ...r,
        media_type: "movie" as const,
      }))),
      ...((tvSearch?.results ?? []).map((r) => ({
        ...r,
        media_type: "tv" as const,
      }))),
    ];

    if (candidates.length === 0) {
      console.log("[tmdb:client] search returned 0 candidates", { query: rawTitle });
      return null;
    }

    console.log("[tmdb:client] search found candidates", { query: rawTitle, count: candidates.length });

    const best = pickBestCandidate(candidates, {
      normalizedTargetTitle: normalizeName(rawTitle),
      expectedYear: year,
      preferTv,
    });

    if (!best || !best.id || !best.media_type) return null;

    return {
      tmdbId: String(best.id),
      tmdbType: best.media_type,
      posterPath: best.poster_path ?? null,
    };
  }

  /**
   * Fetches the standard `/movie/{id}/credits` or `/tv/{id}/credits` payload
   * for an identity. Returns `null` on any failure.
   */
  async getCredits(identity: TmdbIdentity): Promise<TmdbCreditsResponse | null> {
    if (!this.canDispatch()) return null;
    const { tmdbId, tmdbType } = identity;
    if (!tmdbId) return null;

    // Omit language param for credits — we need English names for matching
    // against source cast names. TMDB returns native-language names (e.g.
    // Korean) when language is set to a non-English locale.
    return this.fetchJson<TmdbCreditsResponse>(
      `/${tmdbType}/${encodeURIComponent(tmdbId)}/credits`,
      {},
    );
  }

  /**
   * Fetches `/tv/{id}/aggregate_credits`. Only meaningful for TV identities;
   * callers (the orchestrator) decide when to dispatch this vs the standard
   * credits endpoint based on whether `tmdbSeason` is present (Property 7 /
   * Requirement 2.5).
   */
  async getAggregateCredits(
    identity: TmdbIdentity,
  ): Promise<TmdbCreditsResponse | null> {
    if (!this.canDispatch()) return null;
    const { tmdbId, tmdbType } = identity;
    if (!tmdbId || tmdbType !== "tv") return null;

    // Omit language param — same reason as getCredits above.
    return this.fetchJson<TmdbCreditsResponse>(
      `/tv/${encodeURIComponent(tmdbId)}/aggregate_credits`,
      {},
    );
  }

  /**
   * Reports whether this client may make a network request right now.
   * Returns `false` when the module has been disabled for the session
   * (e.g. via a prior 401) or when no credentials are configured.
   */
  private canDispatch(): boolean {
    if (this.disabledForSession) return false;
    const { apiKey, bearerToken } = getConfig();
    return Boolean(apiKey || bearerToken);
  }

  /**
   * Builds an absolute TMDB URL. Adds the configured query params plus
   * `api_key` when v3 auth is in use. Returns `null` when neither auth
   * scheme is configured (defense in depth — the public methods already
   * gate on `canDispatch`).
   */
  private buildUrl(
    path: string,
    searchParams: Record<string, string> = {},
  ): string | null {
    const { apiKey } = getConfig();
    const url = new URL(`${TMDB_API_BASE_URL}${path}`);

    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    if (apiKey) {
      url.searchParams.set("api_key", apiKey);
    }

    return url.toString();
  }

  /**
   * Builds the `Authorization` header for v4 bearer-token auth. Returns
   * `undefined` when v3 `api_key` auth is in use or when no credentials are
   * configured.
   */
  private buildAuthHeader(): Record<string, string> | undefined {
    const { apiKey, bearerToken } = getConfig();
    if (apiKey) return undefined;
    if (bearerToken) return { Authorization: `Bearer ${bearerToken}` };
    return undefined;
  }

  /**
   * Issues a single GET against TMDB and parses the JSON body. Centralizes:
   *   - rate limiting (`tokenBucket.acquire`)
   *   - per-request timeout via `AbortController`
   *   - 401 → `disabledForSession`
   *   - 429 → `tokenBucket.backoff()` then one retry
   *
   * On any error, returns `null` so callers can map "no result" to an empty
   * cast list without try/catch noise.
   */
  private async fetchJson<T>(
    path: string,
    searchParams: Record<string, string> = {},
  ): Promise<T | null> {
    if (!this.canDispatch()) return null;

    return this.fetchJsonAttempt<T>(path, searchParams, /* allowRetry */ true);
  }

  /**
   * One attempt at a TMDB GET. Extracted so the 429 retry path can reuse the
   * exact same logic without re-checking `disabledForSession` (which was
   * already verified by the caller for the first attempt).
   *
   * Returns `null` for: missing credentials, invalid URL, network/timeout/
   * parse errors, HTTP non-2xx (other than the special-cased 401/429 paths).
   */
  private async fetchJsonAttempt<T>(
    path: string,
    searchParams: Record<string, string>,
    allowRetry: boolean,
  ): Promise<T | null> {
    const url = this.buildUrl(path, searchParams);
    if (!url) return null;

    try {
      // Wait for a token before issuing the request. The bucket also stalls
      // here while a backoff is in effect (see Requirement 6.2).
      await this.tokenBucket.acquire();

      const { timeoutMs } = getConfig();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers = {
          Accept: "application/json",
          ...this.buildAuthHeader(),
        };

        const response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        if (response.status === 401) {
          // Bad credentials — disable for the rest of the session per
          // Requirement 6.4. Subsequent calls short-circuit via canDispatch.
          this.disabledForSession = true;
          console.warn(
            `${LOG_TAG} disabling module for session: HTTP 401 on ${path}`,
          );
          return null;
        }

        if (response.status === 429) {
          // Rate-limited — back off the shared bucket and retry once.
          this.tokenBucket.backoff();
          if (allowRetry) {
            return this.fetchJsonAttempt<T>(path, searchParams, false);
          }
          return null;
        }

        if (!response.ok) {
          return null;
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      // Aborts (timeout), DNS / offline failures, JSON parse errors all
      // collapse to `null`. The orchestrator turns that into an empty cast
      // map and caches a negative entry.
      console.warn("[tmdb:client] fetchJson error", path, err);
      return null;
    }
  }
}

/**
 * Module-level shared client instance. The orchestrator uses this directly;
 * tests can construct their own `TmdbClient` to inject a custom
 * `TokenBucket` or to reset `disabledForSession` between cases.
 */
export const tmdbClient: TmdbApiClient = new TmdbClient();
