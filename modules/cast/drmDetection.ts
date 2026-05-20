/**
 * DRM Detection — Detects DRM-protected streams before casting.
 *
 * Checks stream metadata for DRM indicators and throws a CastError
 * with code `DRM_PROTECTED` and `recoverable: false` when detected.
 *
 * Validates: Requirement 9.4
 */

import type { StreamResult } from "@/sources/types";

import type { CastError } from "./types";

// ---------------------------------------------------------------------------
// DRM Indicators
// ---------------------------------------------------------------------------

/**
 * Known DRM-related patterns in stream URLs or metadata that indicate
 * the content is protected and cannot be cast to external devices.
 */
const DRM_URL_PATTERNS = [
  /\/drm\//i,
  /widevine/i,
  /playready/i,
  /fairplay/i,
  /clearkey/i,
  /license/i,
  /\.ism\/manifest/i,
  /cenc/i,
  /encrypted/i,
];

/**
 * DRM-related MIME types that indicate protected content.
 */
const DRM_MIME_TYPES = [
  "application/dash+xml", // DASH often uses DRM (check further)
];

/**
 * Header keys that may indicate DRM protection.
 */
const DRM_HEADER_INDICATORS = [
  "x-drm-",
  "x-playready-",
  "x-widevine-",
  "authorization", // Bearer tokens for DRM license servers
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a stream appears to be DRM-protected based on its metadata.
 *
 * Inspects the stream URL, MIME type, and headers for known DRM indicators.
 * Returns true if DRM protection is detected.
 *
 * @param stream - The stream result to check
 * @returns true if the stream appears to be DRM-protected
 */
export function isDrmProtected(stream: StreamResult): boolean {
  // Check URL for DRM patterns
  if (stream.url) {
    for (const pattern of DRM_URL_PATTERNS) {
      if (pattern.test(stream.url)) {
        return true;
      }
    }
  }

  // Check if stream has explicit DRM flag
  if ("drm" in stream && (stream as Record<string, unknown>).drm) {
    return true;
  }

  // Check headers for DRM indicators
  if (stream.headers) {
    const headerKeys = Object.keys(stream.headers).map((k) => k.toLowerCase());
    for (const indicator of DRM_HEADER_INDICATORS) {
      if (headerKeys.some((key) => key.startsWith(indicator))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate that a stream is not DRM-protected before casting.
 * Throws a CastError with code `DRM_PROTECTED` if protection is detected.
 *
 * Req 9.4: Detect DRM-protected streams and throw DRM_PROTECTED error
 *
 * @param stream - The stream result to validate
 * @throws CastError with code `DRM_PROTECTED` and `recoverable: false`
 */
export function assertNotDrmProtected(stream: StreamResult): void {
  if (isDrmProtected(stream)) {
    const error: CastError = {
      code: "DRM_PROTECTED",
      message:
        "This content is DRM-protected and cannot be cast to external devices.",
      recoverable: false,
    };
    throw error;
  }
}
