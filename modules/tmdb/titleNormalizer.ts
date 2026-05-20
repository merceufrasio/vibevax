/**
 * TMDB Title Normalizer
 *
 * Re-exports the shared title normalization helper from the poster module so
 * the TMDB module can use the same canonical form for cache keys and lookups
 * without duplicating the implementation.
 */

export { normalizeTitle } from "@/modules/poster/titleNormalizer";
