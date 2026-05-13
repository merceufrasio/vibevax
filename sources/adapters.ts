import type { Movie, MovieQuality, SubtitleType } from "@/types/movie";
import type { SourceMovieDetail, SourceMovieItem } from "@/sources/types";

const QUALITY_VALUES: MovieQuality[] = ["CAM", "HD", "Full HD", "4K"];

function imageOrPlaceholder(sourceId: string, movieId: string, kind: string) {
  return `https://picsum.photos/seed/${sourceId}-${movieId}-${kind}/600/900`;
}

function normalizeQuality(value?: string): MovieQuality {
  if (!value) {
    return "HD";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("4k")) return "4K";
  if (normalized.includes("full") || normalized.includes("fhd")) return "Full HD";
  if (normalized.includes("cam")) return "CAM";

  return QUALITY_VALUES.includes(value as MovieQuality)
    ? (value as MovieQuality)
    : "HD";
}

function normalizeSubtitle(value?: string): SubtitleType {
  const normalized = (value ?? "").toLowerCase();

  if (
    normalized.includes("thuyet") ||
    normalized.includes("thuyết") ||
    normalized.includes("tm")
  ) {
    return "TM";
  }

  if (
    normalized.includes("voice") ||
    normalized.includes("long tieng") ||
    normalized.includes("lồng tiếng")
  ) {
    return "VS";
  }

  return "PĐ";
}

function parseEpisodeNumber(value?: string) {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function parseDurationMinutes(value?: string) {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function splitNames(value?: string) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function sourceItemToMovie(item: SourceMovieItem): Movie {
  const currentEpisode = parseEpisodeNumber(item.episodeCurrent);

  return {
    id: item.id,
    title: item.title,
    originalTitle: item.originName || item.title,
    tagline: item.description || item.episodeCurrent || "",
    poster:
      item.posterUrl || imageOrPlaceholder(item.sourceId, item.id, "poster"),
    backdrop:
      item.backdropUrl ||
      item.posterUrl ||
      imageOrPlaceholder(item.sourceId, item.id, "backdrop"),
    year: Number(item.year || 0),
    quality: normalizeQuality(item.quality),
    subtitleType: normalizeSubtitle(item.lang),
    imdbRating: 0,
    ageRating: "T13",
    genres: [],
    country: "",
    description: item.description || "",
    totalEpisodes: Math.max(currentEpisode, 1),
    currentEpisode,
    parts: 1,
    currentPart: 1,
    cast: [],
    episodes: [],
    runtimeMinutes: 0,
    categoryIds: [],
    region: "usuk",
    recommendedIds: [],
    featured: false,
    isTrending: false,
    releaseNote: item.episodeCurrent || item.quality || "",
    durationLabel: "",
    lastEpisodeLabel: item.episodeCurrent || "",
  };
}

export function sourceDetailToMovie(detail: SourceMovieDetail): Movie {
  const baseMovie = sourceItemToMovie(detail);
  const flatEpisodes = detail.servers.flatMap((server) =>
    server.episodes.map((episode) => ({
      ...episode,
      serverName: server.name,
    })),
  );
  const derivedEpisodeCount = flatEpisodes.reduce(
    (max, episode) => Math.max(max, parseEpisodeNumber(episode.name)),
    1,
  );
  const currentEpisode = Math.max(
    parseEpisodeNumber(detail.episodeCurrent),
    derivedEpisodeCount,
  );
  const runtimeMinutes = parseDurationMinutes(detail.duration);
  const cast = splitNames(detail.casts).map((name, index) => ({
    id: `${detail.id}-cast-${index}`,
    name,
    role: index === 0 ? "Vai chính" : "Diễn viên",
    avatar: imageOrPlaceholder(detail.sourceId, `${detail.id}-${index}`, "cast"),
  }));

  return {
    ...baseMovie,
    originalTitle: detail.originName || detail.title,
    description: detail.description || "",
    imdbRating: detail.rating || 0,
    genres: splitNames(detail.category),
    country: detail.country || "",
    totalEpisodes: Math.max(derivedEpisodeCount, currentEpisode),
    currentEpisode,
    cast,
    episodes: flatEpisodes.map((episode, index) => ({
      id:
        episode.id ||
        episode.slug ||
        `${detail.sourceId}:${detail.id}:episode:${index + 1}`,
      number: index + 1,
      title: episode.serverName
        ? `${episode.serverName} - ${episode.name || `Tập ${index + 1}`}`
        : episode.name || `Tập ${index + 1}`,
      durationMinutes: runtimeMinutes,
      isNew: index === flatEpisodes.length - 1,
    })),
    runtimeMinutes,
    durationLabel: detail.duration || "",
    lastEpisodeLabel: detail.episodeCurrent || flatEpisodes.at(-1)?.name || "",
  };
}
