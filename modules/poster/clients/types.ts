/**
 * Poster API client types for the anime poster module.
 */

export interface PosterSearchResult {
  posterUrl: string;
  title: string;
  score?: number;
}

export interface PosterApiClient {
  name: string;
  search(query: string): Promise<PosterSearchResult | null>;
}
