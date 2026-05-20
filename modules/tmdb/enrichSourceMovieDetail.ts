/**
 * TMDB enrichment glue.
 *
 * This file owns two layers:
 *
 *   1. The pure {@link mergeCastProfiles} helper (task 11.1) that combines a
 *      plugin-provided cast-profile map with the map resolved from TMDB.
 *      Plugin entries always win — Requirements 5.2 and 5.3 (Property 16).
 *
 *   2. The {@link enrichSourceMovieDetailWithMetadata} orchestrator (task
 *      11.3) that wires {@link resolveCastProfiles} into the source-detail
 *      pipeline. It merges the resolved cast map onto the detail, applies an
 *      optional poster fallback (Requirements 7.1–7.5; Properties 22, 23,
 *      24), and never throws — any internal failure returns the original
 *      detail unchanged so rendering is never blocked (Requirement 5.4 /
 *      Property 4 carried through to the integration boundary).
 */

import type { SourceMovieDetail } from "@/sources/types";

import { TMDB_IMAGE_BASE, resolveCastProfiles } from "./resolveCastProfiles";

/**
 * Tag used for any `console.warn` originating from this glue layer.
 */
const LOG_TAG = "[tmdb]";

/**
 * Heuristic that decides whether an existing source `posterUrl` should be
 * treated as a placeholder and therefore eligible for replacement by the
 * TMDB poster.
 *
 * The current `sources/tmdbMetadata.ts` shim does not perform any poster
 * fallback so there is no canonical project-wide pattern to reuse. We adopt
 * the conservative ruleset documented in the design (Property 24) and the
 * task brief: an empty / undefined value, OR a URL whose path or query
 * mentions one of the well-known placeholder markers (`placeholder`,
 * `no-image`, `no_image`, `noimage`) in any letter case.
 *
 * The check is intentionally narrow — it never matches `picsum.photos`
 * generic seeded URLs because those are produced by the local
 * `imageOrPlaceholder` helper in `sources/adapters.ts` *after* enrichment
 * runs, so they should never reach this function on the `detail.posterUrl`
 * field anyway.
 *
 * @param posterUrl Current `posterUrl` value from the source detail.
 * @returns `true` when the value should be considered missing or placeholder.
 */
function isPlaceholderPoster(posterUrl: string | undefined): boolean {
  if (posterUrl === undefined || posterUrl === null) return true;
  const trimmed = posterUrl.trim();
  if (trimmed.length === 0) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes("placeholder") ||
    lower.includes("no-image") ||
    lower.includes("no_image") ||
    lower.includes("noimage")
  );
}

/**
 * Merge a plugin-provided cast-profile map with a TMDB-resolved map.
 *
 * For every key present in {@link existing}, the existing value is preserved
 * verbatim. For every key in {@link resolved} that is NOT already present in
 * {@link existing}, the resolved value is added. Entries with empty-string
 * values in {@link existing} still count as present and are preserved, so the
 * merge is a strict "existing wins" operation regardless of value content.
 *
 * The function is pure: neither input is mutated and a fresh object is
 * returned.
 *
 * @param existing Plugin-provided cast profiles, or `undefined` when the
 *                 source detail did not include a `castProfiles` map.
 * @param resolved TMDB-resolved cast profiles. Always defined.
 * @returns A new map containing the union of both inputs with `existing`
 *          taking precedence on overlapping keys.
 */
export function mergeCastProfiles(
  existing: Record<string, string> | undefined,
  resolved: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...resolved };
  if (existing) {
    for (const key of Object.keys(existing)) {
      merged[key] = existing[key];
    }
  }
  return merged;
}

/**
 * Enrich a {@link SourceMovieDetail} with TMDB-resolved cast profile images
 * and (when available) a fallback poster URL.
 *
 * Behavior:
 *
 *   - Calls {@link resolveCastProfiles} for the supplied detail. The resolver
 *     handles its own cache, dedup, rate limiting, and error swallowing, so
 *     this function only has to merge the result onto the detail.
 *   - Cast profiles: the resolved map is merged onto the existing
 *     `detail.castProfiles` via {@link mergeCastProfiles}. Plugin entries
 *     always win (Requirements 5.2, 5.3 / Property 16). The merged field is
 *     omitted entirely when both sides are empty so the detail shape stays
 *     identical to the input in the no-op case.
 *   - Poster fallback: only when the source `posterUrl` is empty or matches
 *     {@link isPlaceholderPoster} AND the resolver returned a `posterUrl`,
 *     the field is replaced (Requirements 7.3, 7.4 / Properties 23, 24). A
 *     valid plugin poster is never overwritten.
 *   - Identity: not propagated back onto the detail. Consumers that need
 *     the resolved identity should call {@link resolveCastProfiles}
 *     directly. This keeps the integration boundary narrow.
 *   - Errors: the entire body runs inside `try`/`catch`. The resolver
 *     itself never throws, but defense in depth means any unexpected error
 *     during merging or poster substitution falls back to returning the
 *     original `detail` unchanged so rendering is never blocked
 *     (Requirement 5.4).
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4, 7.5**
 *
 * @param detail Source movie detail straight from `SourceRepository`.
 * @returns A new detail with `castProfiles` (and possibly `posterUrl`)
 *          updated, or the original `detail` reference on any failure.
 */
export async function enrichSourceMovieDetailWithMetadata(
  detail: SourceMovieDetail,
): Promise<SourceMovieDetail> {
  try {
    const result = await resolveCastProfiles({ detail });

    const mergedCastProfiles = mergeCastProfiles(
      detail.castProfiles,
      result.castProfiles,
    );

    // Decide whether the merged map is meaningful — if both sides were
    // empty we leave the field untouched so callers comparing object shape
    // do not see a spurious empty object appear.
    const hasMergedCastProfiles = Object.keys(mergedCastProfiles).length > 0;

    // Poster fallback (Requirements 7.3, 7.4 / Properties 23, 24). A poster
    // candidate is only present when the resolver matched an identity that
    // had a non-null `poster_path` (Property 22 ensures URL shape).
    const tmdbPosterUrl = result.posterUrl;
    const shouldSwapPoster =
      typeof tmdbPosterUrl === "string" &&
      tmdbPosterUrl.length > 0 &&
      tmdbPosterUrl.startsWith(TMDB_IMAGE_BASE) &&
      isPlaceholderPoster(detail.posterUrl);

    // Fast path: nothing changed — return the original reference so
    // identity-equality based memoization downstream is preserved.
    if (!shouldSwapPoster && !hasMergedCastProfiles && !detail.castProfiles) {
      return detail;
    }

    const next: SourceMovieDetail = { ...detail };

    if (hasMergedCastProfiles) {
      next.castProfiles = mergedCastProfiles;
    }

    if (shouldSwapPoster) {
      next.posterUrl = tmdbPosterUrl;
    }

    return next;
  } catch (error) {
    // Defense in depth — `resolveCastProfiles` already swallows its own
    // errors, but if anything in the merge / poster path throws we fall
    // back to the original detail so the caller is never blocked
    // (Requirement 5.4).
    console.warn(`${LOG_TAG} enrichSourceMovieDetailWithMetadata failed:`, error);
    return detail;
  }
}
