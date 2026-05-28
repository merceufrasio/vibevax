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
import {
  createSourceLoginRequest,
  detectLoginRedirect,
  isLoginPageHtml,
  SourceLoginRequiredError,
} from "@/sources/sourceLogin";
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

  // If source has persisted cookies AND a browser session, let the browser session
  // path handle it (below). iOS strips custom Cookie headers from fetch(), so we
  // must use the hidden WebView which has sharedCookiesEnabled.
  // The cookie auth path via fetch headers does NOT work on iOS.

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

      // Check if browser session response is a login page (session expired)
      if (browserHtml && isLoginPageHtml(browserHtml)) {
        throw new SourceLoginRequiredError(
          createSourceLoginRequest({
            sourceId: challengeInput.sourceId,
            sourceName: challengeInput.sourceName,
            loginUrl: `https://${new URL(url).hostname}/wp-login.php`,
            originalUrl: url,
          }),
        );
      }

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
      // Re-throw login-required errors — they should not be swallowed
      if (browserError instanceof SourceLoginRequiredError) {
        throw browserError;
      }
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

  // Detect 302 redirect to wp-login.php (login required)
  if (challengeInput && (response.status === 302 || response.redirected)) {
    const locationHeader = response.headers.get("location");
    const loginUrl = detectLoginRedirect(locationHeader ?? response.url);
    if (loginUrl) {
      throw new SourceLoginRequiredError(
        createSourceLoginRequest({
          sourceId: challengeInput.sourceId,
          sourceName: challengeInput.sourceName,
          loginUrl,
          originalUrl: url,
        }),
      );
    }
  }

  // Detect login page HTML in response body (fetch auto-followed redirect to wp-login.php)
  if (challengeInput && isLoginPageHtml(rawText) && (response.url.includes("/wp-login.php") || response.redirected)) {
    const loginUrl = detectLoginRedirect(response.url) ?? `https://${new URL(url).hostname}/wp-login.php`;
    throw new SourceLoginRequiredError(
      createSourceLoginRequest({
        sourceId: challengeInput.sourceId,
        sourceName: challengeInput.sourceName,
        loginUrl,
        originalUrl: url,
      }),
    );
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
    }

    return {
      ...stream,
      sourceId: this.pluginItem.id,
    };
  }
}
