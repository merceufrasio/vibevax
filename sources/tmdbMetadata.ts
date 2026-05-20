/**
 * Source-detail metadata enrichment shim.
 *
 * Historically this file owned a self-contained TMDB lookup pipeline gated
 * behind an `ophim/kkphim/nguonc` allow-list. That pipeline now lives in
 * `modules/tmdb/` and runs universally for all sources (Requirements 5.1,
 * 5.5). This shim is kept so existing callers — notably
 * {@link "@/hooks/useSourceMovieDetail"} — can continue importing from
 * `@/sources/tmdbMetadata` without changes.
 *
 * Responsibilities of this shim:
 *
 *   1. Delegate the TMDB enrichment step to the centralized
 *      `modules/tmdb` enricher. The inner enricher already swallows its
 *      own errors and returns the original detail on any failure
 *      (Requirement 5.4), so a missed TMDB lookup never blocks rendering.
 *   2. After TMDB enrichment, run the MissAV-specific avatar scraping
 *      pass for MissAV sources only. The MissAV pass uses the parsed
 *      `[name](slug)` cast entries to fetch each actress page and pull
 *      the `og:image` / avatar URL out of the rendered HTML. This is
 *      MissAV-only because the slugs come straight from the MissAV
 *      plugin output.
 *
 * **Validates: Requirements 5.1, 5.4, 5.5**
 */

import { enrichSourceMovieDetailWithMetadata as enrichWithTmdb } from "@/modules/tmdb";
import type { SourceMovieDetail } from "@/sources/types";

/**
 * Source-id → MissAV base URL. Used to resolve actress slug links into
 * absolute URLs for the avatar scraping pass.
 */
const MISSAV_SOURCE_BASE_URLS: Record<string, string> = {
  missav: "https://missav123.com",
  missav2: "https://missav.media",
};

/**
 * Internal shape produced by {@link parseCastEntries}. The `slug` field is
 * only populated when the source plugin emits cast entries in the linked
 * `[name](slug)` form (currently only the MissAV plugins).
 */
type ParsedCastEntry = {
  name: string;
  slug?: string;
};

/**
 * Parse a comma-separated cast string into structured entries.
 *
 * Accepts both bare names (`"Alice, Bob"`) and the linked form
 * (`"[Alice](alice-slug), [Bob](bob-slug)"`). Duplicate names are de-duped
 * by collapsing to the first occurrence.
 *
 * Kept in this file because the MissAV avatar scraper still needs the
 * `slug` field. The TMDB pipeline parses cast separately inside
 * `modules/tmdb`.
 */
function parseCastEntries(value?: string): ParsedCastEntry[] {
  return Array.from(
    new Map(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const linkedNameMatch = item.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

          return linkedNameMatch
            ? {
                name: linkedNameMatch[1].trim(),
                slug: linkedNameMatch[2].trim(),
              }
            : {
                name: item,
              };
        })
        .map((entry) => [entry.name, entry] satisfies [string, ParsedCastEntry]),
    ).values(),
  );
}

/**
 * Resolve a MissAV actress slug to an absolute actress page URL using the
 * source-specific base URL. Returns `null` when the slug is missing or the
 * source is not a MissAV source.
 */
function getMissavActressUrl(sourceId: string, slug?: string) {
  if (!slug) {
    return null;
  }

  const baseUrl = MISSAV_SOURCE_BASE_URLS[sourceId];
  if (!baseUrl) {
    return null;
  }

  if (slug.startsWith("http://") || slug.startsWith("https://")) {
    return slug;
  }

  if (slug.startsWith("/")) {
    return `${baseUrl}${slug}`;
  }

  return `${baseUrl}/${slug}`;
}

/**
 * Extract the avatar image URL from a MissAV actress page HTML. Tries
 * `<meta property="og:image">` first, then `<meta name="twitter:image">`,
 * then falls back to the first `<img>` tag inside the actress card.
 */
function extractMissavAvatar(html: string) {
  const metaMatch =
    html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
    html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i);

  if (metaMatch?.[1]) {
    return metaMatch[1];
  }

  const imgMatch =
    html.match(/<img[^>]+alt="[^"]*"[^>]+src="([^"]+)"/i) ||
    html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*(?:object-cover|rounded-full)[^"]*"/i);

  return imgMatch?.[1] || null;
}

/**
 * Fetch each MissAV actress page and merge the resolved avatar URLs into
 * `detail.castProfiles`. Existing entries (from the plugin or from the
 * upstream TMDB pass) are preserved. Errors on any individual fetch are
 * swallowed — best-effort enrichment.
 */
async function enrichWithMissavAvatars(
  detail: SourceMovieDetail,
  castEntries: ParsedCastEntry[],
): Promise<SourceMovieDetail> {
  if (!(detail.sourceId in MISSAV_SOURCE_BASE_URLS)) {
    return detail;
  }

  const entriesWithSlug = castEntries.filter((entry) => entry.slug);
  if (!entriesWithSlug.length) {
    return detail;
  }

  const avatarResults = await Promise.allSettled(
    entriesWithSlug.map(async (entry) => {
      const url = getMissavActressUrl(detail.sourceId, entry.slug);
      if (!url) {
        return null;
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const avatarUrl = extractMissavAvatar(html);

      return avatarUrl
        ? {
            name: entry.name,
            avatarUrl,
          }
        : null;
    }),
  );

  const castProfiles: Record<string, string> = {};

  avatarResults.forEach((result) => {
    if (result.status === "fulfilled" && result.value?.avatarUrl) {
      castProfiles[result.value.name] = result.value.avatarUrl;
    }
  });

  if (!Object.keys(castProfiles).length) {
    return detail;
  }

  return {
    ...detail,
    castProfiles: {
      ...(detail.castProfiles ?? {}),
      ...castProfiles,
    },
  };
}

/**
 * Enrich a {@link SourceMovieDetail} with TMDB metadata followed by
 * MissAV-specific avatar scraping.
 *
 * Step 1 — TMDB: delegated to {@link "@/modules/tmdb"}. The new module
 * runs for every source (the legacy `ophim/kkphim/nguonc` allow-list is
 * gone) and handles its own caching, rate limiting, and error swallowing.
 *
 * Step 2 — MissAV avatars: only runs for MissAV sources. Any failure here
 * is caught and the prior (TMDB-enriched) detail is returned unchanged so
 * rendering is never blocked.
 *
 * **Validates: Requirements 5.1, 5.4, 5.5**
 *
 * @param detail Source movie detail straight from `SourceRepository`.
 * @returns A new detail with merged metadata, or the original `detail`
 *          reference when no enrichment applies.
 */
export async function enrichSourceMovieDetailWithMetadata(
  detail: SourceMovieDetail,
): Promise<SourceMovieDetail> {
  let enrichedDetail = detail;

  try {
    enrichedDetail = await enrichWithTmdb(enrichedDetail);
    if (enrichedDetail !== detail) {
      console.log("[tmdb:enrich] enriched", {
        sourceId: detail.sourceId,
        title: detail.title,
        hasCastProfiles: !!enrichedDetail.castProfiles && Object.keys(enrichedDetail.castProfiles).length > 0,
        posterChanged: enrichedDetail.posterUrl !== detail.posterUrl,
      });
    } else {
      console.log("[tmdb:enrich] no change", { sourceId: detail.sourceId, title: detail.title });
    }
  } catch {
    // Defensive: the inner enricher already swallows its own errors, but
    // we keep this guard so any future regression cannot break the host
    // app (Requirement 5.4).
    enrichedDetail = detail;
  }

  if (detail.sourceId in MISSAV_SOURCE_BASE_URLS) {
    try {
      const castEntries = parseCastEntries(detail.casts);
      if (castEntries.length) {
        enrichedDetail = await enrichWithMissavAvatars(enrichedDetail, castEntries);
      }
    } catch {
      // Keep prior metadata if MissAV avatar scraping fails.
    }
  }

  return enrichedDetail;
}
