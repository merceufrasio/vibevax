import { useState, useEffect } from "react";
import { buildRemoteImageSource } from "@/utils/imageSource";
import { isCfProtected, resolvePoster } from "@/modules/poster";

function guessSourceId(uri: string): string | undefined {
  if (/hhpanda/i.test(uri)) return "hhpanda";
  return undefined;
}

/**
 * Returns a `{ uri, headers }` source that can be passed to `expo-image`.
 *
 * For CF-protected URLs, triggers async poster resolution at render time
 * and returns the resolved URL once available. Falls back to the original
 * URL while resolution is in progress or if resolution fails.
 */
export function useSourceImageSource(uri?: string, sourceId?: string, title?: string, year?: string | number) {
  const sid = sourceId ?? (uri ? guessSourceId(uri) : undefined);
  const cfProtected = uri ? isCfProtected(uri, sid) : false;

  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(uri);

  useEffect(() => {
    if (!uri || !cfProtected) {
      setResolvedUrl(uri);
      return;
    }

    let cancelled = false;

    resolvePoster({ url: uri, title: title ?? "", sourceId: sid }).then(
      (resolved) => {
        if (!cancelled) {
          setResolvedUrl(resolved);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [uri, cfProtected, title, sid]);

  if (!uri) {
    return undefined;
  }

  // For non-CF URLs, return immediately without waiting for state update
  if (!cfProtected) {
    return buildRemoteImageSource(uri, sid);
  }

  // For CF-protected URLs, return the resolved URL (starts as original, updates async)
  return buildRemoteImageSource(resolvedUrl ?? uri, sid);
}
