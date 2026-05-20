/**
 * Utility functions for the Cast to TV module.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

/**
 * Infer the MIME type of a stream URL based on its path extension.
 *
 * Checks the URL's path component (before any query string or fragment)
 * for known video streaming extensions. Matching is case-insensitive.
 *
 * Supported extensions:
 * - `.m3u8` → `application/x-mpegURL` (HLS)
 * - `.mp4`  → `video/mp4`
 * - `.mpd`  → `application/dash+xml` (DASH)
 *
 * Returns `application/x-mpegURL` as default for unrecognized extensions
 * or empty/invalid URLs.
 *
 * @param url - The stream URL to inspect
 * @returns The inferred MIME type string
 */
export function inferMimeType(url: string): string {
  if (!url) return "application/x-mpegURL";

  if (/\.m3u8(\?|#|$)/i.test(url)) return "application/x-mpegURL";
  if (/\.mp4(\?|#|$)/i.test(url)) return "video/mp4";
  if (/\.mpd(\?|#|$)/i.test(url)) return "application/dash+xml";

  return "application/x-mpegURL";
}
