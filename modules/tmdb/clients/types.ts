/**
 * TMDB module internal types.
 *
 * These are shared across the TMDB client, the resolver/orchestrator, the
 * cache, and the enrichment glue layer. They are intentionally narrow shapes
 * derived from TMDB API responses rather than full DTOs because the module
 * only consumes a small slice of each response.
 *
 * See `.kiro/specs/tmdb-cast-images/design.md` for context.
 */

import type { SourceMovieDetail } from "@/sources/types";

/**
 * Identifies a TMDB entity (movie or TV show), optionally narrowed to a
 * specific season for TV. Used both as the result of identity resolution and
 * as the input key for credits/cache lookups.
 */
export interface TmdbIdentity {
  tmdbId: string;
  tmdbType: "movie" | "tv";
  tmdbSeason?: number;
  /** TMDB poster_path returned alongside identity, used for the bonus poster fallback. */
  posterPath?: string | null;
}

/**
 * Input to {@link TmdbApiClient.identify}. Either provide a `tmdbId` (with
 * optional `tmdbType`) to skip search, or provide `title`/`year` to perform a
 * search-based lookup.
 */
export interface IdentifyInput {
  tmdbId?: string;
  tmdbType?: string;
  tmdbSeason?: number;
  title: string;
  originalTitle?: string;
  year?: number;
}

/**
 * A single cast entry from a TMDB credits response. Field names match the
 * TMDB API verbatim (snake_case) so the wire format can be parsed without
 * additional remapping.
 */
export interface TmdbCastEntry {
  name?: string;
  original_name?: string;
  profile_path?: string | null;
  order?: number;
  /** Present on aggregate_credits responses; ignored for plain credits. */
  total_episode_count?: number;
}

/**
 * Subset of the TMDB credits response we care about. Both `/credits` and
 * `/aggregate_credits` endpoints share this shape for our purposes.
 */
export interface TmdbCreditsResponse {
  cast?: TmdbCastEntry[];
}

/**
 * A single search result from `/search/movie` or `/search/tv`. The `media_type`
 * field is only present on `/search/multi` but we keep it optional so callers
 * that combine results from both endpoints can tag entries themselves.
 */
export interface TmdbSearchResult {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  popularity?: number;
}

/**
 * The TMDB API client surface used by the resolver. Implementations are
 * responsible for rate limiting, timeouts, retries, and authentication; all
 * methods should return `null` (rather than throwing) on failure so the
 * orchestrator never has to handle exceptions.
 */
export interface TmdbApiClient {
  /** Identify a TMDB entry from explicit ids or by title+year search. */
  identify(input: IdentifyInput): Promise<TmdbIdentity | null>;

  /** Standard `/movie|/tv/{id}/credits` endpoint. */
  getCredits(identity: TmdbIdentity): Promise<TmdbCreditsResponse | null>;

  /** `/tv/{id}/aggregate_credits` endpoint, used for TV with a season. */
  getAggregateCredits(identity: TmdbIdentity): Promise<TmdbCreditsResponse | null>;
}

/**
 * A parsed entry from {@link SourceMovieDetail.casts}. The optional `slug` is
 * preserved for sibling enrichers (e.g. MissAV avatar scraping) that need the
 * source-specific link target.
 */
export interface ParsedCastEntry {
  name: string;
  /** Optional source-specific slug, used by sibling enrichers like MissAV. */
  slug?: string;
}

/**
 * Input to the `resolveCastProfiles` orchestrator. Only the fields actually
 * consumed by the resolver are picked from {@link SourceMovieDetail} so that
 * tests can construct minimal fixtures.
 */
export interface ResolveCastParams {
  detail: Pick<
    SourceMovieDetail,
    | "sourceId"
    | "title"
    | "originName"
    | "year"
    | "casts"
    | "castProfiles"
    | "tmdbId"
    | "tmdbType"
    | "tmdbSeason"
    | "posterUrl"
  >;
}

/**
 * Result of a cast-profile resolution attempt. `castProfiles` is always
 * defined (empty on miss). `posterUrl` and `identity` are present only when
 * a TMDB match was found.
 */
export interface ResolveCastResult {
  /** Map of source-cast-name -> TMDB profile image URL. Empty on miss. */
  castProfiles: Record<string, string>;
  /** TMDB poster URL (default size w500), present when an identity was resolved. */
  posterUrl?: string;
  /** TMDB identity used; absent when no match was found. */
  identity?: TmdbIdentity;
}

/**
 * A cached resolution result. Negative entries (`isNegative === true`) record
 * the absence of a match so repeated lookups for the same key short-circuit
 * without re-hitting the TMDB API.
 */
export interface CastCacheEntry {
  identity?: TmdbIdentity;
  castProfiles: Record<string, string>;
  posterUrl?: string;
  isNegative: boolean;
  timestamp: number;
}
