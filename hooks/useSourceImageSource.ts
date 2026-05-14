import { useEffect, useState } from "react";

import { buildRemoteImageSource } from "@/utils/imageSource";

const PHIMAPI_SEARCH_URL = "https://phimapi.com/v1/api/tim-kiem?limit=1&keyword=";

const PROTECTED_DOMAIN_RE = /https?:\/\/(?:www\.)?hoathinh3d\.(?:co|ai)\//i;

const API_CACHE = new Map<string, string | null>();

function guessSourceId(uri: string): string | undefined {
  if (/hoathinh3d/i.test(uri)) return "hh3d";
  return undefined;
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Searches PhimAPI for a movie or TV show by title and returns the poster URL.
 * This bypasses both Cloudflare (which blocks HH3D) and VN ISPs (which block TMDB).
 */
async function searchFallbackPoster(title: string, year?: string | number): Promise<string | null> {
  const cacheKey = `${title}-${year || ""}`;
  if (API_CACHE.has(cacheKey)) {
    return API_CACHE.get(cacheKey)!;
  }

  try {
    const rawTitle = title.replace(/\s*\(.*?\)\s*/g, " ").trim();
    const response = await fetch(`${PHIMAPI_SEARCH_URL}${encodeURIComponent(rawTitle)}`);

    if (!response.ok) return null;

    const data = await response.json();
    const items = data?.data?.items || [];
    const cdnDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || "https://phimimg.com";
    
    // Sort by matching title
    const normalizedTarget = normalizeName(rawTitle);
    const bestMatch = items
      .filter((r: any) => r.poster_url || r.thumb_url)
      .sort((a: any, b: any) => {
        const nameA = normalizeName(a.name || a.origin_name || "");
        const nameB = normalizeName(b.name || b.origin_name || "");
        const scoreA = nameA === normalizedTarget ? 100 : 0;
        const scoreB = nameB === normalizedTarget ? 100 : 0;
        return scoreB - scoreA;
      })[0];

    if (bestMatch) {
      const imgPath = bestMatch.poster_url || bestMatch.thumb_url;
      const fullUrl = imgPath.startsWith("http") ? imgPath : `${cdnDomain}/${imgPath}`;
      API_CACHE.set(cacheKey, fullUrl);
      console.log(`[PhimAPI] Found image for ${title}:`, fullUrl);
      return fullUrl;
    }

    console.log(`[PhimAPI] No match found for ${title}`);
    API_CACHE.set(cacheKey, null);
    return null;
  } catch (error) {
    console.log(`[PhimAPI] Error searching for ${title}:`, error);
    return null;
  }
}

/**
 * Returns a `{ uri, headers }` source that can be passed to `expo-image`.
 * For protected sources (e.g. HH3D behind Cloudflare), the source
 * automatically attempts to look up an alternative high-quality image from TMDB.
 */
export function useSourceImageSource(uri?: string, sourceId?: string, title?: string, year?: string | number) {
  const sid = sourceId ?? (uri ? guessSourceId(uri) : undefined);
  
  // Track the resolved URI (either original or TMDB alternative)
  const [resolvedUri, setResolvedUri] = useState<string | undefined>(
    () => (uri && PROTECTED_DOMAIN_RE.test(uri)) ? undefined : uri
  );

  useEffect(() => {
    let isMounted = true;

    if (!uri) {
      setResolvedUri(undefined);
      return;
    }

    if (!PROTECTED_DOMAIN_RE.test(uri)) {
      setResolvedUri(uri);
      return;
    }

    if (!title) {
      // If we don't have a title to search, we have to fallback to the original URL
      // even if it might be blocked.
      setResolvedUri(uri);
      return;
    }

    // Attempt alternative source replacement
    searchFallbackPoster(title, year).then((fallbackUri) => {
      if (isMounted) {
        console.log(`[useSourceImageSource] Replacing ${uri} with ${fallbackUri || uri}`);
        setResolvedUri(fallbackUri || uri);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [uri, title, year]);

  if (!resolvedUri) {
    return undefined; // Hide expo-image if we don't have a URI yet to prevent 403 caching
  }

  return buildRemoteImageSource(resolvedUri, sid);
}
