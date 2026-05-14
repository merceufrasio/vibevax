import { getSourceBrowserCookies } from "@/sources/sourceBrowserSession";

type ImageSourceValue = {
  uri: string;
  headers?: Record<string, string>;
  cacheKey?: string;
};

const PROTECTED_DOMAIN_RE =
  /https?:\/\/(?:www\.)?hoathinh3d\.(?:co|ai)\//i;

function needsProtection(uri: string) {
  return PROTECTED_DOMAIN_RE.test(uri);
}

function guessSourceId(uri: string): string | undefined {
  if (/hoathinh3d/i.test(uri)) return "hh3d";
  return undefined;
}

export function buildRemoteImageSource(
  uri?: string,
  sourceId?: string,
): ImageSourceValue | undefined {
  if (!uri) {
    return undefined;
  }

  if (needsProtection(uri)) {
    const sid = sourceId ?? guessSourceId(uri);
    const data = sid ? getSourceBrowserCookies(sid) : null;
    const headers: Record<string, string> = {
      Referer: "https://hoathinh3d.co/",
      Origin: "https://hoathinh3d.co",
      "User-Agent": data?.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    };

    if (data?.cookies) {
      headers["Cookie"] = data.cookies;
    }

    // Use a unique cache key that includes the presence of cookies
    // to prevent expo-image from using a cached 403 error.
    const cacheKey = `${uri}#${data?.cookies ? 'with-cookies' : 'no-cookies'}`;

    return { uri, headers, cacheKey };
  }

  return { uri };
}
