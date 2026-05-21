import {
  cachePluginScript,
  getCachedPluginScript,
} from "@/sources/pluginRegistry";
import {
  consumeVerifiedSourceHtml,
  createSourceChallenge,
  SourceChallengeRequiredError,
} from "@/sources/sourceChallenge";
import {
  hasSourceBrowserSession,
  requestSourceBrowserFetch,
} from "@/sources/sourceBrowserSession";
import { createPluginRuntime, type LoadedPlugin } from "@/sources/pluginRuntime";
import type {
  PluginHomeSection,
  PluginManifest,
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
  castProfiles?: Record<string, string>;
  status?: string;
  tmdbId?: string;
  tmdbType?: string;
  tmdbSeason?: number;
  servers?: SourceServer[];
  qualityOptions?: Array<{ label: string; value: string }>;
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
    castProfiles: detail.castProfiles,
    status: detail.status,
    tmdbId: detail.tmdbId,
    tmdbType: detail.tmdbType,
    tmdbSeason: detail.tmdbSeason,
    servers: Array.isArray(detail.servers) ? detail.servers : [],
    qualityOptions: Array.isArray(detail.qualityOptions) ? detail.qualityOptions : undefined,
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

function isCloudflareChallengeHtml(html: string) {
  return (
    /cloudflare/i.test(html) &&
    /verify you are human|checking your browser|xác minh/i.test(html)
  );
}

async function fetchText(
  url: string,
  options?: RequestInit,
  challengeInput?: {
    kind: "list" | "search" | "detail" | "stream";
    sourceId: string;
    sourceName?: string;
  },
) {
  const cachedHtml = consumeVerifiedSourceHtml(url);

  if (cachedHtml) {
    if (__DEV__) {
      console.log("[fetchText:cached]", { url: url.substring(0, 80), len: cachedHtml.length });
    }
    return cachedHtml;
  }

  if (
    challengeInput &&
    hasSourceBrowserSession(challengeInput.sourceId)
  ) {
    if (__DEV__) {
      console.log("[fetchText:browserSession:attempt]", { kind: challengeInput.kind, url: url.substring(0, 80), method: options?.method });
    }
    try {
      const browserFetchOptions = options
        ? {
            method: (options as RequestInit).method as string | undefined,
            body: (options as RequestInit).body as string | undefined,
            headers: (options as RequestInit).headers as Record<string, string> | undefined,
          }
        : undefined;

      const browserHtml = await requestSourceBrowserFetch(
        challengeInput.sourceId,
        url,
        browserFetchOptions,
      );

      if (browserHtml && !isCloudflareChallengeHtml(browserHtml)) {
        if (__DEV__) {
          console.log("[fetchText:browserSession:ok]", { url: url.substring(0, 80), len: browserHtml.length });
        }
        return browserHtml;
      }

      if (__DEV__) {
        console.log("[fetchText:browserSession:cfDetected]", {
          url: url.substring(0, 80),
          len: browserHtml?.length ?? 0,
          preview: browserHtml?.substring(0, 200),
        });
      }
    } catch (browserError) {
      if (__DEV__) {
        console.log("[fetchText:browserSession:error]", {
          url: url.substring(0, 80),
          error: String(browserError),
        });
      }
      // Fall back to regular fetch if the browser-backed session fails.
    }
  } else if (__DEV__ && challengeInput) {
    console.log("[fetchText:noBrowserSession]", {
      kind: challengeInput.kind,
      sourceId: challengeInput.sourceId,
      hasSession: hasSourceBrowserSession(challengeInput.sourceId),
      hasOptions: !!options,
      url: url.substring(0, 80),
    });
  }

  if (__DEV__) {
    console.log("[fetchText:regularFetch]", { url: url.substring(0, 80) });
  }

  const response = await fetch(url, options);

  const rawText = await response.text();

  if (__DEV__) {
    console.log("[fetchText:regularFetch:response]", {
      url: url.substring(0, 80),
      status: response.status,
      len: rawText.length,
      isCloudflare: isCloudflareChallengeHtml(rawText),
    });
  }

  if (
    challengeInput &&
    isCloudflareChallengeHtml(rawText) &&
    (!response.ok || /text\/html/i.test(response.headers.get("content-type") ?? ""))
  ) {
    throw new SourceChallengeRequiredError(
      createSourceChallenge({
        ...challengeInput,
        url,
        message: `${challengeInput.sourceName || "Nguồn này"} đang yêu cầu xác minh Cloudflare.`,
      }),
    );
  }

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  return rawText;
}

export class SourceRepository {
  readonly pluginItem: PluginRegistryItem;
  readonly plugin: LoadedPlugin;
  readonly manifest: PluginManifest;

  private constructor(pluginItem: PluginRegistryItem, plugin: LoadedPlugin) {
    this.pluginItem = pluginItem;
    this.plugin = plugin;
    this.manifest = plugin.getManifest();
  }

  static async create(pluginItem: PluginRegistryItem, forceRefresh = false) {
    let script: string | null = null;

    // Always try to fetch the latest script from network first
    try {
      const urlWithCacheBuster = `${pluginItem.scriptUrl}${pluginItem.scriptUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
      const response = await fetch(urlWithCacheBuster);

      if (response.ok) {
        script = await response.text();
        await cachePluginScript(pluginItem, script);
      }
    } catch {
      // Network error — will fallback to cache below
    }

    // Fallback to cached script if network failed
    if (!script) {
      script = await getCachedPluginScript(pluginItem);
    }

    if (!script) {
      throw new Error(`Cannot download plugin ${pluginItem.name}.`);
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
    const raw = await fetchText(url, undefined, {
      kind: "list",
      sourceId: this.pluginItem.id,
      sourceName: this.pluginItem.name,
    });
    const parsed = this.plugin.callJson<RawListResponse>(
      "parseListResponse",
      raw,
      url,
    );

    if (__DEV__ && this.pluginItem.id === "phimpal" && parsed.items?.length) {
      console.log("[SourceRepository:getList:phimpal:posters]", {
        first3: parsed.items.slice(0, 3).map((i) => ({ id: i.id, poster: i.posterUrl })),
      });
    }

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
    const raw = await fetchText(url, undefined, {
      kind: "search",
      sourceId: this.pluginItem.id,
      sourceName: this.pluginItem.name,
    });
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
    const raw = await fetchText(url, undefined, {
      kind: "detail",
      sourceId: this.pluginItem.id,
      sourceName: this.pluginItem.name,
    });
    const parsed = this.plugin.callJson<RawMovieDetail | null>(
      "parseMovieDetail",
      raw,
      url,
    );

    if (!parsed) {
      if (__DEV__) {
        console.log("[SourceRepository:getMovieDetail:null]", {
          sourceId: this.pluginItem.id,
          movieId,
          url,
          htmlLen: raw.length,
          htmlPreview: raw.substring(0, 500),
          htmlTail: raw.substring(raw.length - 300),
          hasTitle: /<h1/i.test(raw),
          hasMovieName: /movie_name/i.test(raw),
          hasHalimCfg: /halim_cfg/i.test(raw),
          hasListEps: /halim-list-eps/i.test(raw),
        });
      }
      return null;
    }

    if (__DEV__) {
      console.log("[SourceRepository:getMovieDetail:parsed]", {
        sourceId: this.pluginItem.id,
        movieId,
        url,
        title: parsed.title,
        posterUrl: parsed.posterUrl,
        serverCount: parsed.servers?.length ?? 0,
      });
    }

    return normalizeDetail(this.pluginItem.id, parsed);
  }

  async resolveStream(episodeId: string) {
    const isReaderSource =
      this.manifest.type === "MANGA" || this.manifest.type === "COMIC";

    if (isAbsoluteUrl(episodeId) && !isReaderSource) {
      const isDirectStream = isDirectStreamUrl(episodeId);

      // If this is an embed URL and plugin can parse embed responses,
      // fetch the embed page and extract the actual stream URL
      if (!isDirectStream && this.plugin.has("parseEmbedResponse")) {
        if (__DEV__) {
          console.log("[SourceRepository:resolveStream:fetchEmbed]", {
            episodeId: episodeId.substring(0, 80),
          });
        }

        const embedRaw = await fetchText(
          episodeId,
          {
            headers: {
              "Referer": this.manifest.baseUrl ? this.manifest.baseUrl + "/" : "",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          },
          {
            kind: "stream",
            sourceId: this.pluginItem.id,
            sourceName: this.pluginItem.name,
          },
        );

        const embedStream = normalizeStreamResult(
          this.plugin.callJson<StreamResult>("parseEmbedResponse", embedRaw, episodeId),
        );

        // If parseEmbedResponse extracted a stream but it needs Referer headers,
        // native player can't send them. Fall through to WebView embed.
        if (embedStream.url && !embedStream.headers?.Referer) {
          return {
            ...embedStream,
            sourceId: this.pluginItem.id,
          };
        }
        // Fall through: use WebView embed with the original embed URL
      }

      // For embed URLs, preserve manifest.baseUrl as Referer so the
      // WebView iframe wrapper uses it as baseUrl. Embed servers (e.g.
      // streamc.xyz) often check Referer and reject requests from
      // unrelated domains. Using the source site's baseUrl as Referer
      // matches what a real browser would send when the embed is loaded
      // from the source site.
      const fallbackHeaders: Record<string, string> | undefined =
        !isDirectStream && this.manifest.baseUrl
          ? { Referer: this.manifest.baseUrl.replace(/\/$/, "") + "/" }
          : undefined;

      const streamResult = normalizeStreamResult({
        url: episodeId,
        isEmbed: !isDirectStream,
        sourceId: this.pluginItem.id,
        subtitles: [],
        headers: fallbackHeaders,
      });

      if (__DEV__) {
        console.log("[SourceRepository:resolveStream:absoluteUrl]", {
          episodeId: episodeId.substring(0, 80),
          isEmbed: streamResult.isEmbed,
          url: streamResult.url?.substring(0, 80),
          referer: fallbackHeaders?.Referer,
        });
      }

      return streamResult;
    }

    const detailUrl = isAbsoluteUrl(episodeId)
      ? episodeId
      : this.plugin.call("getUrlDetail", episodeId);
    const raw = await fetchText(detailUrl, undefined, {
      kind: "stream",
      sourceId: this.pluginItem.id,
      sourceName: this.pluginItem.name,
    });
    let stream = normalizeStreamResult(
      this.plugin.callJson<StreamResult>("parseDetailResponse", raw, detailUrl),
    );

    for (let depth = 0; depth < 3; depth += 1) {
      if (!stream.isEmbed || !stream.url || !this.plugin.has("parseEmbedResponse")) {
        break;
      }

      const embedRaw = await fetchText(
        stream.url,
        {
          method: stream.postBody ? "POST" : "GET",
          body: stream.postBody,
          headers: stream.headers,
        },
        {
          kind: "stream",
          sourceId: this.pluginItem.id,
          sourceName: this.pluginItem.name,
        },
      );

      stream = normalizeStreamResult(
        this.plugin.callJson<StreamResult>(
          "parseEmbedResponse",
          embedRaw,
          stream.url,
        ),
      );

      if (__DEV__) {
        console.log("[SourceRepository:parseEmbedResponse:result]", {
          sourceId: this.pluginItem.id,
          url: stream.url?.substring(0, 80),
          isEmbed: stream.isEmbed,
          subtitles: stream.subtitles,
          subtitleCount: stream.subtitles?.length ?? 0,
          embedRawPreview: embedRaw?.substring(0, 200),
        });
      }
    }

    return {
      ...stream,
      sourceId: this.pluginItem.id,
    };
  }

  /**
   * Fetch available subtitles for a PhimPal episode.
   * Uses the separate GraphQL `Subtitles` query.
   * Returns array of {lang, url} or empty array if not PhimPal or no subs.
   */
  async fetchPhimPalSubtitles(episodeId: string): Promise<Array<{ lang: string; url: string }>> {
    if (this.pluginItem.id !== "phimpal") return [];

    // Extract numeric ID from episodeId (format: "watch/12345")
    const idMatch = episodeId.match(/(\d+)/);
    if (!idMatch) return [];
    const titleId = idMatch[1];

    try {
      const gqlBody = JSON.stringify({
        operationName: "Subtitles",
        variables: { titleId },
        query: `query Subtitles($titleId: String!) { subtitles(titleId: $titleId) { id language files isDefault likes dislikes } }`,
      });

      const response = await fetch("https://legacy.phimpal.com/b/g", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://legacy.phimpal.com",
          "Referer": `https://legacy.phimpal.com/watch/${titleId}`,
        },
        body: gqlBody,
      });

      if (!response.ok) return [];

      const data = await response.json() as {
        data?: {
          subtitles?: Array<{
            id: string;
            language: string;
            files: string[];
            isDefault: boolean;
            likes: number;
            dislikes: number;
          }>;
        };
      };

      const subs = data?.data?.subtitles;
      if (!Array.isArray(subs) || subs.length === 0) return [];

      if (__DEV__) {
        console.log("[PhimPal:fetchSubtitles]", {
          titleId,
          count: subs.length,
          subs: subs.map((s) => ({ lang: s.language, files: s.files, isDefault: s.isDefault })),
        });
      }

      // Sort: default first, then by likes
      const sorted = [...subs].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return (b.likes - b.dislikes) - (a.likes - a.dislikes);
      });

      // Construct subtitle URLs
      // PhimPal subtitle files - try to resolve the actual download URL
      // The file names from API are like "vi-1779160010.srt"
      // Actual URL needs to be discovered - using known patterns
      const SUB_BASE_URLS = [
        "https://legacy.phimpal.com/b/s",
        "https://legacy.phimpal.com/subs",
        "https://sub.katcdn.xyz",
      ];

      // Try first URL to find working base
      const testFile = sorted[0]?.files?.[0];
      let workingBase = SUB_BASE_URLS[0]; // default fallback

      if (testFile) {
        for (const base of SUB_BASE_URLS) {
          try {
            const testResponse = await fetch(`${base}/${testFile}`, {
              method: "HEAD",
              headers: { "Referer": "https://legacy.phimpal.com/" },
            });
            if (testResponse.ok) {
              workingBase = base;
              break;
            }
          } catch {
            // Try next
          }
        }
      }

      if (__DEV__) {
        console.log("[PhimPal:fetchSubtitles:baseUrl]", workingBase);
      }

      return sorted
        .filter((s) => s.files && s.files.length > 0)
        .map((s) => ({
          lang: s.language === "vi" ? "Tiếng Việt" : s.language === "en" ? "English" : s.language,
          url: `${workingBase}/${s.files[0]}`,
        }));
    } catch (err) {
      if (__DEV__) {
        console.log("[PhimPal:fetchSubtitles:error]", String(err));
      }
      return [];
    }
  }
}
