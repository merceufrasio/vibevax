/**
 * Public surface of the TMDB module.
 *
 * This is the only entry point that consumers outside `modules/tmdb/` should
 * import from. It exposes:
 *
 *   - The enrichment glue used by the source-detail pipeline
 *     ({@link enrichSourceMovieDetailWithMetadata}) and the lower-level
 *     orchestrator ({@link resolveCastProfiles}) for callers that need the
 *     resolved identity / poster URL alongside the cast-profile map.
 *   - Configuration accessors so the host app can late-bind credentials and
 *     toggle the module on or off ({@link configureTmdbModule},
 *     {@link getConfig}, {@link isTmdbEnabled}).
 *   - The shared types used across the module so callers can type their
 *     own parameters/results without reaching into `clients/types`.
 *
 * **Validates: Requirements 5.1, 5.5**
 */

export { enrichSourceMovieDetailWithMetadata } from "./enrichSourceMovieDetail";
export { resolveCastProfiles } from "./resolveCastProfiles";
export {
  configureTmdbModule,
  getConfig,
  isTmdbEnabled,
  type TmdbModuleConfig,
} from "./config";

export type {
  CastCacheEntry,
  IdentifyInput,
  ParsedCastEntry,
  ResolveCastParams,
  ResolveCastResult,
  TmdbApiClient,
  TmdbCastEntry,
  TmdbCreditsResponse,
  TmdbIdentity,
  TmdbSearchResult,
} from "./clients/types";
