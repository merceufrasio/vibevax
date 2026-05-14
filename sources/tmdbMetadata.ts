import type { SourceMovieDetail } from "@/sources/types";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w185";
const TMDB_SOURCE_IDS = new Set(["ophim", "kkphim", "nguonc"]);
const MISSAV_SOURCE_BASE_URLS: Record<string, string> = {
  missav: "https://missav123.com",
  missav2: "https://missav.media",
};

type TmdbCastEntry = {
  name?: string;
  original_name?: string;
  profile_path?: string | null;
};

type TmdbSearchResult = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
};

type ParsedCastEntry = {
  name: string;
  slug?: string;
};

function getTmdbCredentials() {
  const apiKey = process.env.EXPO_PUBLIC_TMDB_API_KEY?.trim();
  const bearerToken = process.env.EXPO_PUBLIC_TMDB_BEARER_TOKEN?.trim();

  return {
    apiKey: apiKey || undefined,
    bearerToken: bearerToken || undefined,
  };
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCastEntries(value?: string) {
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

function getCreditsPath(detail: Pick<SourceMovieDetail, "tmdbId" | "tmdbType">) {
  const normalizedType = (detail.tmdbType ?? "").toLowerCase();

  if (
    normalizedType.includes("tv") ||
    normalizedType.includes("series") ||
    normalizedType.includes("show")
  ) {
    return `/tv/${detail.tmdbId}/credits`;
  }

  return `/movie/${detail.tmdbId}/credits`;
}

async function tmdbFetchJson<T>(path: string, searchParams?: Record<string, string>) {
  const { apiKey, bearerToken } = getTmdbCredentials();

  if (!apiKey && !bearerToken) {
    return null;
  }

  const endpoint = new URL(`${TMDB_API_BASE_URL}${path}`);

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    endpoint.searchParams.set(key, value);
  });

  if (apiKey) {
    endpoint.searchParams.set("api_key", apiKey);
  }

  const response = await fetch(endpoint.toString(), {
    headers: bearerToken
      ? {
          Authorization: `Bearer ${bearerToken}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchCredits(detail: Pick<SourceMovieDetail, "tmdbId" | "tmdbType">) {
  if (!detail.tmdbId) {
    return null;
  }

  return tmdbFetchJson<{ cast?: TmdbCastEntry[] }>(getCreditsPath(detail), {
    language: "vi-VN",
  });
}

function getYear(value?: string) {
  const match = value?.match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

function scoreTmdbCandidate(
  result: TmdbSearchResult,
  detail: SourceMovieDetail,
  normalizedTargetTitle: string,
) {
  const candidateName =
    result.title ||
    result.name ||
    result.original_title ||
    result.original_name ||
    "";
  const normalizedCandidateName = normalizeName(candidateName);

  let score = 0;
  if (normalizedCandidateName === normalizedTargetTitle) {
    score += 120;
  } else if (
    normalizedCandidateName.includes(normalizedTargetTitle) ||
    normalizedTargetTitle.includes(normalizedCandidateName)
  ) {
    score += 80;
  }

  const expectedYear = Number(detail.year || 0) || undefined;
  const candidateYear = getYear(result.release_date) ?? getYear(result.first_air_date);

  if (expectedYear && candidateYear) {
    const yearDelta = Math.abs(expectedYear - candidateYear);
    if (yearDelta === 0) score += 30;
    else if (yearDelta === 1) score += 12;
    else if (yearDelta <= 2) score += 4;
  }

  score += Math.min(Number(result.popularity || 0), 25);

  return score;
}

async function resolveTmdbIdentity(detail: SourceMovieDetail) {
  if (detail.tmdbId) {
    return {
      tmdbId: detail.tmdbId,
      tmdbType: detail.tmdbType || "movie",
    };
  }

  if (!TMDB_SOURCE_IDS.has(detail.sourceId)) {
    return null;
  }

  const rawTitle = detail.originName || detail.title;
  if (!rawTitle) {
    return null;
  }

  const normalizedTargetTitle = normalizeName(rawTitle);
  const commonParams = {
    language: "vi-VN",
    query: rawTitle,
  } as Record<string, string>;

  if (detail.year) {
    commonParams.year = String(detail.year);
    commonParams.first_air_date_year = String(detail.year);
  }

  const [movieSearch, tvSearch] = await Promise.all([
    tmdbFetchJson<{ results?: TmdbSearchResult[] }>("/search/movie", commonParams),
    tmdbFetchJson<{ results?: TmdbSearchResult[] }>("/search/tv", commonParams),
  ]);

  const candidates = [
    ...((movieSearch?.results ?? []).map((result) => ({
      ...result,
      media_type: "movie",
    })) as TmdbSearchResult[]),
    ...((tvSearch?.results ?? []).map((result) => ({
      ...result,
      media_type: "tv",
    })) as TmdbSearchResult[]),
  ];

  if (!candidates.length) {
    return null;
  }

  const bestCandidate = [...candidates].sort(
    (left, right) =>
      scoreTmdbCandidate(right, detail, normalizedTargetTitle) -
      scoreTmdbCandidate(left, detail, normalizedTargetTitle),
  )[0];

  if (!bestCandidate?.id || !bestCandidate.media_type) {
    return null;
  }

  return {
    tmdbId: String(bestCandidate.id),
    tmdbType: bestCandidate.media_type,
  };
}

function buildCastProfiles(desiredEntries: ParsedCastEntry[], castEntries: TmdbCastEntry[]) {
  const remainingEntries = [...castEntries];
  const profiles: Record<string, string> = {};

  for (const desiredEntry of desiredEntries) {
    const normalizedDesiredName = normalizeName(desiredEntry.name);

    const entryIndex = remainingEntries.findIndex((entry) => {
      const candidates = [entry.name, entry.original_name]
        .filter(Boolean)
        .map((candidate) => normalizeName(candidate as string));

      return candidates.some(
        (candidate) =>
          candidate === normalizedDesiredName ||
          candidate.includes(normalizedDesiredName) ||
          normalizedDesiredName.includes(candidate),
      );
    });

    if (entryIndex === -1) {
      continue;
    }

    const [matchedEntry] = remainingEntries.splice(entryIndex, 1);
    if (matchedEntry.profile_path) {
      profiles[desiredEntry.name] = `${TMDB_IMAGE_BASE_URL}${matchedEntry.profile_path}`;
    }
  }

  return profiles;
}

async function enrichWithTmdb(detail: SourceMovieDetail, castEntries: ParsedCastEntry[]) {
  const identity = await resolveTmdbIdentity(detail);
  if (!identity?.tmdbId) {
    return detail;
  }

  const payload = await fetchCredits(identity);
  const tmdbCastEntries = payload?.cast ?? [];

  if (!tmdbCastEntries.length) {
    return {
      ...detail,
      tmdbId: identity.tmdbId,
      tmdbType: identity.tmdbType,
    };
  }

  const castProfiles = buildCastProfiles(castEntries, tmdbCastEntries);

  return {
    ...detail,
    tmdbId: identity.tmdbId,
    tmdbType: identity.tmdbType,
    castProfiles:
      Object.keys(castProfiles).length > 0
        ? {
            ...(detail.castProfiles ?? {}),
            ...castProfiles,
          }
        : detail.castProfiles,
  };
}

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

async function enrichWithMissavAvatars(
  detail: SourceMovieDetail,
  castEntries: ParsedCastEntry[],
) {
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

export async function enrichSourceMovieDetailWithMetadata(
  detail: SourceMovieDetail,
) {
  const castEntries = parseCastEntries(detail.casts);
  if (!castEntries.length) {
    return detail;
  }

  let enrichedDetail = detail;

  try {
    if (TMDB_SOURCE_IDS.has(detail.sourceId)) {
      enrichedDetail = await enrichWithTmdb(enrichedDetail, castEntries);
    }
  } catch {
    enrichedDetail = detail;
  }

  try {
    if (detail.sourceId in MISSAV_SOURCE_BASE_URLS) {
      enrichedDetail = await enrichWithMissavAvatars(enrichedDetail, castEntries);
    }
  } catch {
    // Keep prior metadata if MissAV avatar scraping fails.
  }

  return enrichedDetail;
}
