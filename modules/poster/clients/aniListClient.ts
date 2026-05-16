/**
 * AniList API client for the anime poster module.
 *
 * Searches the AniList GraphQL API for anime posters.
 * Selects the best match by highest string similarity (Dice coefficient)
 * between the normalized query and result titles (romaji, english, native).
 * Uses token bucket rate limiting and per-request timeout via AbortController.
 */

import { TokenBucket } from "../rateLimiter";
import { normalizeTitle } from "../titleNormalizer";
import { PosterApiClient, PosterSearchResult } from "./types";

interface AniListMedia {
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { large: string; extraLarge: string };
}

interface AniListResponse {
  data: {
    Page: {
      media: AniListMedia[];
    };
  };
}

const ANILIST_URL = "https://graphql.anilist.co";
const REQUEST_TIMEOUT_MS = 2500;

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 5) {
    media(search: $search, type: ANIME) {
      title { romaji english native }
      coverImage { large extraLarge }
    }
  }
}
`;

/**
 * Computes the Dice coefficient between two strings.
 * Returns a value between 0 (no similarity) and 1 (identical).
 * Uses character bigrams for comparison.
 */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) || 0) + 1);
  }

  let intersectionSize = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    const count = bigramsA.get(bigram);
    if (count && count > 0) {
      bigramsA.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2 * intersectionSize) / (a.length - 1 + (b.length - 1));
}

export class AniListClient implements PosterApiClient {
  public readonly name = "anilist";
  private readonly tokenBucket: TokenBucket;

  constructor(tokenBucket: TokenBucket) {
    this.tokenBucket = tokenBucket;
  }

  async search(query: string): Promise<PosterSearchResult | null> {
    try {
      await this.tokenBucket.acquire();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(ANILIST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: SEARCH_QUERY,
            variables: { search: query },
          }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          this.tokenBucket.backoff();
          return null;
        }

        if (!response.ok) {
          return null;
        }

        const json: AniListResponse = await response.json();
        const media = json.data?.Page?.media;

        if (!media || media.length === 0) {
          return null;
        }

        // Select best match by highest string similarity
        const normalizedQuery = normalizeTitle(query);
        let bestMatch: AniListMedia | null = null;
        let bestScore = -1;

        for (const entry of media) {
          const titles = [
            entry.title.romaji,
            entry.title.english,
            entry.title.native,
          ].filter((t): t is string => t != null);

          for (const title of titles) {
            const score = diceSimilarity(normalizedQuery, normalizeTitle(title));
            if (score > bestScore) {
              bestScore = score;
              bestMatch = entry;
            }
          }
        }

        if (!bestMatch) {
          return null;
        }

        const posterUrl =
          bestMatch.coverImage.extraLarge || bestMatch.coverImage.large;

        if (!posterUrl) {
          return null;
        }

        // Use the best matching title for the result
        const resultTitle =
          bestMatch.title.english ||
          bestMatch.title.romaji ||
          bestMatch.title.native ||
          query;

        return {
          posterUrl,
          title: resultTitle,
          score: bestScore,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      // Network errors, timeouts, JSON parse errors — all return null
      return null;
    }
  }
}
