/**
 * HeadlessExtractService — Resolves embed source URLs into castable direct
 * stream URLs using a hidden (off-screen) WebView.
 *
 * The service spawns a WebView programmatically, loads the embed page, and
 * intercepts network requests matching `.m3u8` or `.mp4` patterns. It applies
 * source-specific ad-blocking rules during extraction and enforces a
 * configurable timeout (default 15 000 ms).
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import type { StreamResult } from "@/sources/types";

import type { CastError, CastErrorCode } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionParams {
  /** The embed page URL to load in the hidden WebView. */
  embedUrl: string;
  /** Source plugin identifier — used to look up ad-blocking rules. */
  sourceId: string;
  /** Optional headers to set on the initial WebView request. */
  headers?: Record<string, string>;
  /** Extraction timeout in milliseconds. Default: 15 000. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Ad-Blocking Rules (source-specific)
// ---------------------------------------------------------------------------

interface BlockRule {
  id: string;
  pattern: RegExp;
}

/**
 * Source-specific ad-blocking rules applied during headless extraction.
 * These mirror the rules used in the MoviePlayer WebView but are maintained
 * separately so the extraction service can operate independently.
 */
const SOURCE_SPECIFIC_BLOCK_RULES: Record<string, BlockRule[]> = {
  nguonc: [
    {
      id: "nguonc-hiller-vast-ad",
      pattern: /^https?:\/\/raw\.githubusercontent\.com\/hiller1233456\/.+/i,
    },
    {
      id: "nguonc-ad-tracking",
      pattern: /(?:sharethis\.com|crwdcntrl\.net|dtscout\.com|waust\.at)/i,
    },
    {
      id: "nguonc-ad-video-mp4",
      pattern: /^https?:\/\/(?:www\.)?streamc\.xyz\/\d+\.mp4/i,
    },
    {
      id: "nguonc-ad-redirect",
      pattern:
        /(?:6789x\.site|6789bet|bet88|lucky88|fb88|w88|188bet|fun88|m88|sbobet|bong88)/i,
    },
  ],
  animevietsub: [
    {
      id: "avs-gambling-ads",
      pattern:
        /(?:min88|sin88|yo88|hitclub|gemwin|sunwin|go88|rik88|iwin|b52club|ta88)/i,
    },
  ],
};

/**
 * Generic ad-blocking rules applied to all sources during extraction.
 */
const GENERIC_BLOCK_RULES: BlockRule[] = [
  {
    id: "generic-vast",
    pattern:
      /(?:^|[/?#&=_-])(vast|vmap|vastconfig|adtag|adser|preroll|midroll|postroll)(?:[/?#&=._-]|$)/i,
  },
  {
    id: "generic-ad-network",
    pattern:
      /(?:doubleclick|googlesyndication|googletagmanager|imasdk|prebid|adservice|adskeeper)/i,
  },
  {
    id: "generic-click-tracker",
    pattern:
      /(?:clickunder|popunder|tracking|banner|redirect|affiliate|campaign)/i,
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default extraction timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Maximum time allowed to destroy the WebView after extraction (ms). */
const WEBVIEW_DESTROY_DEADLINE_MS = 1_000;

/** Pattern matching direct stream URLs (.m3u8 or .mp4). */
const STREAM_URL_PATTERN = /\.(m3u8|mp4)(\?|#|$)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCastError(code: CastErrorCode, message: string): CastError {
  return {
    code,
    message,
    recoverable: code === "EXTRACTION_TIMEOUT",
  };
}

function getBlockRulesForSource(sourceId: string): BlockRule[] {
  const sourceRules = SOURCE_SPECIFIC_BLOCK_RULES[sourceId] ?? [];
  return [...GENERIC_BLOCK_RULES, ...sourceRules];
}

function isBlockedUrl(url: string, rules: BlockRule[]): boolean {
  return rules.some((rule) => rule.pattern.test(url));
}

function isStreamUrl(url: string): boolean {
  return STREAM_URL_PATTERN.test(url);
}

// ---------------------------------------------------------------------------
// WebView Abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the hidden WebView instance.
 *
 * In a real React Native environment this would be backed by
 * `react-native-webview`'s imperative API or a native module.
 * The abstraction allows unit testing without native dependencies.
 */
export interface HiddenWebView {
  /**
   * Load a URL in the WebView.
   * @param url - The URL to load.
   * @param headers - Optional headers for the request.
   */
  loadUrl(url: string, headers?: Record<string, string>): void;

  /**
   * Register a callback invoked for every network request the WebView
   * attempts. Return `false` from the callback to block the request.
   */
  onRequest(
    callback: (requestUrl: string) => boolean,
  ): void;

  /**
   * Destroy the WebView and release all resources.
   */
  destroy(): void;
}

/**
 * Factory function type for creating hidden WebView instances.
 * Consumers can override this for testing.
 */
export type HiddenWebViewFactory = () => HiddenWebView;

// ---------------------------------------------------------------------------
// Default WebView Factory (React Native)
// ---------------------------------------------------------------------------

/**
 * Default factory that creates a hidden WebView using react-native-webview.
 *
 * In React Native, WebViews are typically rendered in the component tree.
 * For headless extraction we create a minimal off-screen instance via the
 * native module's imperative API. This implementation provides the expected
 * interface; the actual native bridge is handled by the RN WebView library.
 *
 * NOTE: In production, this would use a native module or an off-screen
 * WebView component rendered at a hidden position. The implementation here
 * provides the contract; integration with the actual native layer is done
 * at the app level.
 */
let defaultWebViewFactory: HiddenWebViewFactory = () => {
  // Placeholder: In production this is replaced by the app-level integration
  // that renders an off-screen <WebView /> component and exposes the
  // imperative handle. Tests inject a mock factory.
  let requestCallback: ((url: string) => boolean) | null = null;
  let destroyed = false;

  return {
    loadUrl(_url: string, _headers?: Record<string, string>) {
      if (destroyed) return;
      // Native WebView handles the actual loading
    },
    onRequest(callback: (requestUrl: string) => boolean) {
      requestCallback = callback;
      // In production, this hooks into onShouldStartLoadWithRequest
      void requestCallback; // suppress unused warning in placeholder
    },
    destroy() {
      destroyed = true;
      requestCallback = null;
    },
  };
};

/**
 * Override the default WebView factory. Used for testing and app-level
 * integration where the actual native WebView bridge is configured.
 */
export function setWebViewFactory(factory: HiddenWebViewFactory): void {
  defaultWebViewFactory = factory;
}

// ---------------------------------------------------------------------------
// HeadlessExtractService
// ---------------------------------------------------------------------------

export class HeadlessExtractService {
  private webView: HiddenWebView | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  private webViewFactory: HiddenWebViewFactory;
  private rejectFn: ((error: CastError) => void) | null = null;

  constructor(factory?: HiddenWebViewFactory) {
    this.webViewFactory = factory ?? defaultWebViewFactory;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Extract a direct stream URL from an embed source.
   *
   * Spawns a hidden WebView, loads the embed page, and intercepts network
   * requests to find `.m3u8` or `.mp4` URLs.
   *
   * @param params - Extraction parameters including embed URL and source ID.
   * @returns StreamResult with `isEmbed: false` and a valid direct URL.
   * @throws CastError with `EXTRACTION_TIMEOUT` if no match within timeout.
   * @throws CastError with `EXTRACTION_FAILED` for other failures.
   */
  async extractStream(params: ExtractionParams): Promise<StreamResult> {
    const { embedUrl, sourceId, headers, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

    this.cancelled = false;

    // Req 6.5: Get ad-blocking rules for this source
    const blockRules = getBlockRulesForSource(sourceId);

    return new Promise<StreamResult>((resolve, reject) => {
      this.rejectFn = reject;

      // Req 6.3: Timeout — reject with EXTRACTION_TIMEOUT
      this.timeoutHandle = setTimeout(() => {
        const error = createCastError(
          "EXTRACTION_TIMEOUT",
          `Stream extraction timed out after ${timeoutMs}ms for ${embedUrl}`,
        );
        this.rejectFn = null;
        this.cleanup();
        reject(error);
      }, timeoutMs);

      try {
        // Req 6.1: Spawn hidden WebView
        this.webView = this.webViewFactory();

        // Req 6.1: Intercept network requests matching .m3u8/.mp4
        this.webView.onRequest((requestUrl: string) => {
          if (this.cancelled) {
            return false;
          }

          // Req 6.5: Block ad/tracking requests
          if (isBlockedUrl(requestUrl, blockRules)) {
            return false;
          }

          // Req 6.1: Check if this is a stream URL
          if (isStreamUrl(requestUrl)) {
            // Req 6.2: Return StreamResult with isEmbed: false
            const result: StreamResult = {
              url: requestUrl,
              isEmbed: false,
              sourceId,
            };

            this.rejectFn = null;
            this.cleanup();
            resolve(result);
            return false; // Block further loading after match
          }

          // Allow the request to proceed
          return true;
        });

        // Load the embed page
        this.webView.loadUrl(embedUrl, headers);
      } catch (error) {
        // Req 6.4: Other failures — EXTRACTION_FAILED
        const castError = createCastError(
          "EXTRACTION_FAILED",
          `Stream extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.rejectFn = null;
        this.cleanup();
        reject(castError);
      }
    });
  }

  /**
   * Cancel an in-progress extraction.
   *
   * Marks the extraction as cancelled, destroys the WebView, and rejects
   * the pending promise with EXTRACTION_FAILED.
   */
  cancel(): void {
    this.cancelled = true;

    // Reject the pending promise if one exists
    if (this.rejectFn) {
      const reject = this.rejectFn;
      this.rejectFn = null;
      this.cleanup();
      reject(
        createCastError(
          "EXTRACTION_FAILED",
          "Stream extraction was cancelled",
        ),
      );
    } else {
      this.cleanup();
    }
  }

  // -------------------------------------------------------------------------
  // Static Methods
  // -------------------------------------------------------------------------

  /**
   * Check if a stream requires headless extraction.
   *
   * A stream needs extraction when:
   * - `isEmbed` is explicitly `true`, OR
   * - The URL does not match a direct stream pattern (.m3u8 or .mp4)
   *
   * @param stream - The StreamResult to check.
   * @returns `true` if extraction is needed.
   */
  static needsExtraction(stream: StreamResult): boolean {
    if (stream.isEmbed === true) {
      return true;
    }

    // If isEmbed is explicitly false, no extraction needed
    if (stream.isEmbed === false) {
      return false;
    }

    // If isEmbed is undefined, check if the URL is a direct stream
    return !isStreamUrl(stream.url);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Clean up resources: clear timeout and destroy WebView.
   * Req 6.6: WebView must be destroyed within 1000ms of completion/failure.
   */
  private cleanup(): void {
    // Clear the timeout
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // Req 6.6: Destroy WebView within 1000ms
    if (this.webView !== null) {
      const webViewRef = this.webView;
      this.webView = null;

      // Destroy immediately (well within the 1000ms deadline)
      try {
        webViewRef.destroy();
      } catch {
        // Best-effort destruction — log in dev mode
        if (__DEV__) {
          console.warn("[HeadlessExtractService] Error destroying WebView");
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exported Constants (for testing)
// ---------------------------------------------------------------------------

export { STREAM_URL_PATTERN, DEFAULT_TIMEOUT_MS, WEBVIEW_DESTROY_DEADLINE_MS };
export { SOURCE_SPECIFIC_BLOCK_RULES, GENERIC_BLOCK_RULES };
export type { BlockRule };
