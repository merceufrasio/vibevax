/**
 * Kitsu API client for the anime poster module.
 *
 * Searches the Kitsu JSON:API for anime posters.
 * Uses token bucket rate limiting and per-request timeout via AbortController.
 */

import { TokenBucket } from "../rateLimiter";
import { PosterApiClient, PosterSearchResult } from "./types";

interface KitsuPosterImage {
  small: string;
  medium: string;
  large: string;
  original: string;
}

interface KitsuAnimeAttributes {
  canonicalTitle: string;
  posterImage: KitsuPosterImage;
}

interface KitsuAnimeEntry {
  id: string;
  attributes: KitsuAnimeAttributes;
}

interface KitsuResponse {
  data: KitsuAnimeEntry[];
}

const KITSU_BASE_URL = "https://kitsu.io/api/edge/anime";
const REQUEST_TIMEOUT_MS = 2500;

export class KitsuClient implements PosterApiClient {
  public readonly name = "kitsu";
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
        const url = `${KITSU_BASE_URL}?filter[text]=${encodeURIComponent(query)}&page[limit]=1`;
        const response = await fetch(url, { signal: controller.signal });

        if (response.status === 429) {
          this.tokenBucket.backoff();
          return null;
        }

        if (!response.ok) {
          return null;
        }

        const json: KitsuResponse = await response.json();

        if (!json.data || json.data.length === 0) {
          return null;
        }

        const first = json.data[0];
        const posterUrl = first.attributes?.posterImage?.large;

        if (!posterUrl) {
          return null;
        }

        return {
          posterUrl,
          title: first.attributes.canonicalTitle,
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
