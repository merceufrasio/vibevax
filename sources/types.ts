import type { Movie } from "@/types/movie";

export type PluginRegistry = {
  version: number;
  plugins: PluginRegistryItem[];
};

export type PluginRegistryItem = {
  id: string;
  name: string;
  version: string;
  scriptUrl: string;
  iconUrl?: string;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  baseUrl?: string;
  iconUrl?: string;
  isEnabled?: boolean;
  isAdult?: boolean;
  type?: "MOVIE" | "COMIC" | "VIDEO" | string;
  layoutType?: "VERTICAL" | "HORIZONTAL" | string;
  playerType?: "exoplayer" | "embed" | "auto" | string;
};

export type PluginHomeSection = {
  slug: string;
  title: string;
  type?: "Horizontal" | "Grid" | string;
  path?: string;
};

export type PluginFilterOption = {
  name: string;
  value: string;
};

export type PluginFilterConfig = {
  sort?: PluginFilterOption[];
  category?: PluginFilterOption[];
  country?: PluginFilterOption[];
  year?: PluginFilterOption[];
};

export type SourceMovieItem = {
  id: string;
  sourceId: string;
  title: string;
  originName?: string;
  posterUrl?: string;
  backdropUrl?: string;
  description?: string;
  year?: number;
  quality?: string;
  episodeCurrent?: string;
  lang?: string;
};

export type SourceEpisode = {
  id: string;
  name: string;
  slug?: string;
};

export type SourceServer = {
  name: string;
  episodes: SourceEpisode[];
};

export type SourceMovieDetail = SourceMovieItem & {
  rating?: number;
  duration?: string;
  category?: string;
  country?: string;
  director?: string;
  casts?: string;
  status?: string;
  servers: SourceServer[];
};

export type SourceListResponse = {
  items: SourceMovieItem[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems?: number;
    itemsPerPage?: number;
  };
};

export type SourceHomeSection = PluginHomeSection & {
  movies: SourceMovieItem[];
};

export type StreamResult = {
  url: string;
  headers?: Record<string, string>;
  subtitles?: Array<{ lang: string; url: string }>;
  isEmbed?: boolean;
  postBody?: string;
  mimeType?: string;
  webView?: {
    allowedDomains?: string[];
    injectedJavaScript?: string;
  };
};

export type PluginFunctionName =
  | "getManifest"
  | "getHomeSections"
  | "getPrimaryCategories"
  | "getFilterConfig"
  | "getUrlList"
  | "getUrlSearch"
  | "getUrlDetail"
  | "getUrlCategories"
  | "getUrlCountries"
  | "getUrlYears"
  | "parseListResponse"
  | "parseSearchResponse"
  | "parseMovieDetail"
  | "parseDetailResponse"
  | "parseEmbedResponse"
  | "parseCategoriesResponse"
  | "parseCountriesResponse"
  | "parseYearsResponse";

export type SourceMovieAdapter = (item: SourceMovieItem) => Movie;

