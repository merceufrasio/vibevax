import {
  cachePluginScript,
  getCachedPluginScript,
} from "@/sources/pluginRegistry";
import { createPluginRuntime, type LoadedPlugin } from "@/sources/pluginRuntime";
import type {
  PluginHomeSection,
  PluginRegistryItem,
  SourceListResponse,
  SourceMovieDetail,
  SourceMovieItem,
  SourceServer,
  StreamResult,
} from "@/sources/types";

type RawListResponse = {
  items?: RawListItem[];
  pagination?: {
    currentPage?: number;
    totalPages?: number;
    totalItems?: number;
    itemsPerPage?: number;
  };
};

type RawListItem = {
  id?: string;
  title?: string;
  originName?: string;
  posterUrl?: string;
  backdropUrl?: string;
  description?: string;
  year?: number;
  quality?: string;
  episode_current?: string;
  lang?: string;
};

type RawMovieDetail = RawListItem & {
  rating?: number;
  duration?: string;
  category?: string;
  country?: string;
  director?: string;
  casts?: string;
  status?: string;
  servers?: SourceServer[];
};

function normalizeItem(sourceId: string, item: RawListItem) {
  return {
    id: String(item.id ?? ""),
    sourceId,
    title: item.title ?? "",
    originName: item.originName,
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    description: item.description,
    year: item.year,
    quality: item.quality,
    episodeCurrent: item.episode_current,
    lang: item.lang,
  } satisfies SourceMovieItem;
}

function normalizeDetail(
  sourceId: string,
  detail: RawMovieDetail,
): SourceMovieDetail {
  return {
    ...normalizeItem(sourceId, detail),
    rating: detail.rating,
    duration: detail.duration,
    category: detail.category,
    country: detail.country,
    director: detail.director,
    casts: detail.casts,
    status: detail.status,
    servers: Array.isArray(detail.servers) ? detail.servers : [],
  };
}

function isDirectStreamUrl(url: string) {
  return /\.(m3u8|mp4)(\?|#|$)/i.test(url);
}

function isAbsoluteUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function normalizeStreamResult(result: StreamResult): StreamResult {
  const headers = { ...(result.headers ?? {}) };
  const allowedDomains = headers["Allowed-Domains"];
  const injectedJavaScript = headers["Custom-Js"];

  delete headers["Allowed-Domains"];
  delete headers["Custom-Js"];

  return {
    ...result,
    headers,
    webView:
      allowedDomains || injectedJavaScript
        ? {
            allowedDomains: allowedDomains
              ?.split(",")
              .map((domain) => domain.trim())
              .filter(Boolean),
            injectedJavaScript,
          }
        : result.webView,
  };
}

async function fetchText(url: string, options?: RequestInit) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  return response.text();
}

export class SourceRepository {
  readonly pluginItem: PluginRegistryItem;
  readonly plugin: LoadedPlugin;

  private constructor(pluginItem: PluginRegistryItem, plugin: LoadedPlugin) {
    this.pluginItem = pluginItem;
    this.plugin = plugin;
  }

  static async create(pluginItem: PluginRegistryItem, forceRefresh = false) {
    let script = forceRefresh ? null : await getCachedPluginScript(pluginItem);

    if (!script) {
      const response = await fetch(pluginItem.scriptUrl);

      if (!response.ok) {
        const cached = await getCachedPluginScript(pluginItem);
        if (cached) {
          script = cached;
        } else {
          throw new Error(`Cannot download plugin ${pluginItem.name}.`);
        }
      } else {
        script = await response.text();
        await cachePluginScript(pluginItem, script);
      }
    }

    return new SourceRepository(
      pluginItem,
      createPluginRuntime(pluginItem, script),
    );
  }

  getHomeSections() {
    return this.plugin.callJson<PluginHomeSection[]>("getHomeSections");
  }

  async getList(slug: string, filters: Record<string, unknown> = {}) {
    const url = this.plugin.call("getUrlList", slug, JSON.stringify(filters));
    const raw = await fetchText(url);
    const parsed = this.plugin.callJson<RawListResponse>(
      "parseListResponse",
      raw,
      url,
    );

    return {
      items: (parsed.items ?? [])
        .map((item) => normalizeItem(this.pluginItem.id, item))
        .filter((item) => item.id && item.title),
      pagination: {
        currentPage: parsed.pagination?.currentPage ?? 1,
        totalPages: parsed.pagination?.totalPages ?? 1,
        totalItems: parsed.pagination?.totalItems,
        itemsPerPage: parsed.pagination?.itemsPerPage,
      },
    } satisfies SourceListResponse;
  }

  async search(keyword: string, filters: Record<string, unknown> = {}) {
    const url = this.plugin.call("getUrlSearch", keyword, JSON.stringify(filters));
    const raw = await fetchText(url);
    const parsed = this.plugin.callJson<RawListResponse>(
      "parseSearchResponse",
      raw,
      url,
    );

    return {
      items: (parsed.items ?? [])
        .map((item) => normalizeItem(this.pluginItem.id, item))
        .filter((item) => item.id && item.title),
      pagination: {
        currentPage: parsed.pagination?.currentPage ?? 1,
        totalPages: parsed.pagination?.totalPages ?? 1,
        totalItems: parsed.pagination?.totalItems,
        itemsPerPage: parsed.pagination?.itemsPerPage,
      },
    } satisfies SourceListResponse;
  }

  async getMovieDetail(movieId: string) {
    const url = this.plugin.call("getUrlDetail", movieId);
    const raw = await fetchText(url);
    const parsed = this.plugin.callJson<RawMovieDetail | null>(
      "parseMovieDetail",
      raw,
      url,
    );

    if (!parsed) {
      return null;
    }

    return normalizeDetail(this.pluginItem.id, parsed);
  }

  async resolveStream(episodeId: string) {
    if (isAbsoluteUrl(episodeId)) {
      return normalizeStreamResult({
        url: episodeId,
        isEmbed: !isDirectStreamUrl(episodeId),
        sourceId: this.pluginItem.id,
        subtitles: [],
      });
    }

    const detailUrl = this.plugin.call("getUrlDetail", episodeId);
    const raw = await fetchText(detailUrl);
    let stream = normalizeStreamResult(
      this.plugin.callJson<StreamResult>("parseDetailResponse", raw, detailUrl),
    );

    for (let depth = 0; depth < 3; depth += 1) {
      if (!stream.isEmbed || !stream.url || !this.plugin.has("parseEmbedResponse")) {
        break;
      }

      const embedRaw = await fetchText(stream.url, {
        method: stream.postBody ? "POST" : "GET",
        body: stream.postBody,
        headers: stream.headers,
      });

      stream = normalizeStreamResult(
        this.plugin.callJson<StreamResult>(
          "parseEmbedResponse",
          embedRaw,
          stream.url,
        ),
      );
    }

    return {
      ...stream,
      sourceId: this.pluginItem.id,
    };
  }
}
