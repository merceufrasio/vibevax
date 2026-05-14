export type MovieQuality = "CAM" | "HD" | "Full HD" | "4K";
export type SubtitleType = "PĐ" | "TM" | "VS";
export type AgeRating = "P" | "T13" | "T16" | "T18";
export type MovieRegion = "cn" | "usuk" | "kr" | "jp";
export type DetailTab = "episodes" | "cast" | "recommendations";

export interface CastMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  durationMinutes: number;
  isLocked?: boolean;
  isNew?: boolean;
  availableAt?: string;
}

export interface Movie {
  id: string;
  title: string;
  originalTitle: string;
  tagline: string;
  poster: string;
  backdrop: string;
  year: number;
  quality: MovieQuality;
  subtitleType: SubtitleType;
  imdbRating: number;
  ageRating: AgeRating;
  genres: string[];
  country: string;
  description: string;
  totalEpisodes: number;
  currentEpisode: number;
  parts: number;
  currentPart: number;
  cast: CastMember[];
  episodes: Episode[];
  runtimeMinutes: number;
  categoryIds: string[];
  region: MovieRegion;
  recommendedIds: string[];
  featured: boolean;
  isTrending: boolean;
  releaseNote: string;
  durationLabel: string;
  lastEpisodeLabel: string;
}

export interface MovieCategory {
  id: string;
  title: string;
  subtitle: string;
  colors: readonly [string, string];
}

export interface HomeSection {
  id: string;
  titleKey: string;
  region: MovieRegion;
}

export interface WatchHistoryEntry {
  movieId: string;
  sourceId?: string;
  title: string;
  originalTitle: string;
  poster: string;
  progressLabel: string;
  watchedAt: string;
}
