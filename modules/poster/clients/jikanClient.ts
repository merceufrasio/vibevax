/**
 * Jikan API client for the anime poster module.
 *
 * Searches the Jikan v4 API (unofficial MyAnimeList API) for anime posters.
 * Uses token bucket rate limiting and per-request timeout via AbortController.
 */

import { TokenBucket } from "../rateLimiter";
import { PosterApiClient, PosterSearchResult } from "./types";

interface JikanAnimeEntry {
  mal_id: number;
  title: string;
  images: {
    jpg: { large_image_url: string };
    webp: { large_image_url: string };
  };
}

interface JikanResponse {
  data: JikanAnimeEntry[];
}

const JIKAN_BASE_URL = "https://api.jikan.moe/v4/anime";
const REQUEST_TIMEOUT_MS = 2500;

export class JikanClient implements PosterApiClient {
  public readonly name = "jikan";
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
        const url = `${JIKAN_BASE_URL}?q=${encodeURIComponent(query)}&limit=1`;
        const response = await fetch(url, { signal: controller.signal });

        if (response.status === 429) {
          this.tokenBucket.backoff();
          return null;
        }

        if (!response.ok) {
          return null;
        }

        const json: JikanResponse = await response.json();

        if (!json.data || json.data.length === 0) {
          return null;
        }

        const first = json.data[0];
        const posterUrl = first.images?.jpg?.large_image_url;

        if (!posterUrl) {
          return null;
        }

        return {
          posterUrl,
          title: first.title,
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
