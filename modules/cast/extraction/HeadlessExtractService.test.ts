/**
 * Unit tests for HeadlessExtractService.
 *
 * Tests cover:
 * - Stream URL interception (.m3u8 and .mp4)
 * - Timeout behavior with EXTRACTION_TIMEOUT error
 * - Ad-blocking rule application
 * - WebView destruction within deadline
 * - cancel() behavior
 * - needsExtraction() static method
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { CastError } from "../types";

import {
  HeadlessExtractService,
  DEFAULT_TIMEOUT_MS,
  SOURCE_SPECIFIC_BLOCK_RULES,
  type HiddenWebView,
  type HiddenWebViewFactory,
  type ExtractionParams,
} from "./HeadlessExtractService";

// ---------------------------------------------------------------------------
// Mock WebView Factory
// ---------------------------------------------------------------------------

function createMockWebView() {
  let requestCallback: ((url: string) => boolean) | null = null;
  let destroyed = false;
  let loadedUrl: string | null = null;
  let loadedHeaders: Record<string, string> | undefined = undefined;

  const mock: HiddenWebView & {
    simulateRequest: (url: string) => boolean;
    isDestroyed: () => boolean;
    getLoadedUrl: () => string | null;
    getLoadedHeaders: () => Record<string, string> | undefined;
  } = {
    loadUrl(url: string, headers?: Record<string, string>) {
      if (destroyed) return;
      loadedUrl = url;
      loadedHeaders = headers;
    },
    onRequest(callback: (requestUrl: string) => boolean) {
      requestCallback = callback;
    },
    destroy() {
      destroyed = true;
      requestCallback = null;
    },
    simulateRequest(url: string): boolean {
      if (!requestCallback || destroyed) return false;
      return requestCallback(url);
    },
    isDestroyed() {
      return destroyed;
    },
    getLoadedUrl() {
      return loadedUrl;
    },
    getLoadedHeaders() {
      return loadedHeaders;
    },
  };

  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HeadlessExtractService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("extractStream", () => {
    it("resolves with StreamResult when .m3u8 URL is intercepted (Req 6.1, 6.2)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const params: ExtractionParams = {
        embedUrl: "https://embed.example.com/player/123",
        sourceId: "testsource",
      };

      const extractPromise = service.extractStream(params);

      // Simulate the WebView intercepting an m3u8 request
      mockWebView.simulateRequest("https://cdn.example.com/stream/video.m3u8");

      const result = await extractPromise;

      expect(result.url).toBe("https://cdn.example.com/stream/video.m3u8");
      expect(result.isEmbed).toBe(false);
      expect(result.sourceId).toBe("testsource");
    });

    it("resolves with StreamResult when .mp4 URL is intercepted (Req 6.1, 6.2)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const params: ExtractionParams = {
        embedUrl: "https://embed.example.com/player/456",
        sourceId: "testsource",
      };

      const extractPromise = service.extractStream(params);

      mockWebView.simulateRequest("https://cdn.example.com/video/movie.mp4");

      const result = await extractPromise;

      expect(result.url).toBe("https://cdn.example.com/video/movie.mp4");
      expect(result.isEmbed).toBe(false);
    });

    it("resolves with .m3u8 URL that has query parameters (Req 6.1)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
      });

      mockWebView.simulateRequest(
        "https://cdn.example.com/stream/index.m3u8?token=abc123&expire=999",
      );

      const result = await extractPromise;
      expect(result.url).toBe(
        "https://cdn.example.com/stream/index.m3u8?token=abc123&expire=999",
      );
      expect(result.isEmbed).toBe(false);
    });

    it("rejects with EXTRACTION_TIMEOUT when no stream found within timeout (Req 6.3)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const params: ExtractionParams = {
        embedUrl: "https://embed.example.com/player/789",
        sourceId: "testsource",
        timeoutMs: 5000,
      };

      const extractPromise = service.extractStream(params);

      // Simulate non-stream requests (should not resolve)
      mockWebView.simulateRequest("https://cdn.example.com/script.js");
      mockWebView.simulateRequest("https://cdn.example.com/style.css");

      // Advance time past the timeout
      vi.advanceTimersByTime(5001);

      try {
        await extractPromise;
        expect.fail("Should have thrown");
      } catch (error) {
        const castError = error as CastError;
        expect(castError.code).toBe("EXTRACTION_TIMEOUT");
        expect(castError.message).toContain("5000ms");
        expect(castError.recoverable).toBe(true);
      }
    });

    it("uses default timeout of 15000ms when not specified (Req 6.3)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
      });

      // Should not timeout at 14999ms
      vi.advanceTimersByTime(14999);

      // Resolve before actual timeout
      mockWebView.simulateRequest("https://cdn.example.com/video.m3u8");

      const result = await extractPromise;
      expect(result.url).toBe("https://cdn.example.com/video.m3u8");
      expect(DEFAULT_TIMEOUT_MS).toBe(15000);
    });

    it("rejects with EXTRACTION_FAILED when WebView factory throws (Req 6.4)", async () => {
      const factory: HiddenWebViewFactory = () => {
        throw new Error("Native module not available");
      };
      const service = new HeadlessExtractService(factory);

      try {
        await service.extractStream({
          embedUrl: "https://embed.example.com/player",
          sourceId: "test",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const castError = error as CastError;
        expect(castError.code).toBe("EXTRACTION_FAILED");
        expect(castError.message).toContain("Native module not available");
        expect(castError.recoverable).toBe(false);
      }
    });

    it("blocks ad requests based on source-specific rules (Req 6.5)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "nguonc",
      });

      // These should be blocked (nguonc-specific rules)
      const blockedResult1 = mockWebView.simulateRequest(
        "https://raw.githubusercontent.com/hiller1233456/ads/main/vast.xml",
      );
      const blockedResult2 = mockWebView.simulateRequest(
        "https://www.streamc.xyz/12345.mp4",
      );
      const blockedResult3 = mockWebView.simulateRequest(
        "https://6789bet.com/redirect",
      );

      expect(blockedResult1).toBe(false);
      expect(blockedResult2).toBe(false);
      expect(blockedResult3).toBe(false);

      // This should resolve (legitimate stream)
      mockWebView.simulateRequest(
        "https://cdn.legitimate.com/stream/video.m3u8",
      );

      const result = await extractPromise;
      expect(result.url).toBe("https://cdn.legitimate.com/stream/video.m3u8");
    });

    it("blocks generic ad requests for all sources (Req 6.5)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "unknownsource",
      });

      // Generic ad-blocking rules should apply
      const blockedVast = mockWebView.simulateRequest(
        "https://ads.example.com/vast/config",
      );
      const blockedDoubleclick = mockWebView.simulateRequest(
        "https://doubleclick.net/ad",
      );

      expect(blockedVast).toBe(false);
      expect(blockedDoubleclick).toBe(false);

      // Legitimate stream should resolve
      mockWebView.simulateRequest("https://cdn.example.com/video.mp4");

      const result = await extractPromise;
      expect(result.url).toBe("https://cdn.example.com/video.mp4");
    });

    it("destroys WebView after successful extraction (Req 6.6)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
      });

      mockWebView.simulateRequest("https://cdn.example.com/video.m3u8");

      await extractPromise;

      expect(mockWebView.isDestroyed()).toBe(true);
    });

    it("destroys WebView after timeout failure (Req 6.6)", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
        timeoutMs: 1000,
      });

      vi.advanceTimersByTime(1001);

      try {
        await extractPromise;
      } catch {
        // Expected
      }

      expect(mockWebView.isDestroyed()).toBe(true);
    });

    it("loads the embed URL with provided headers", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const headers = { Referer: "https://source.example.com/" };

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player/123",
        sourceId: "test",
        headers,
      });

      // Verify the WebView was loaded with correct URL and headers
      expect(mockWebView.getLoadedUrl()).toBe(
        "https://embed.example.com/player/123",
      );
      expect(mockWebView.getLoadedHeaders()).toEqual(headers);

      // Resolve the promise
      mockWebView.simulateRequest("https://cdn.example.com/video.m3u8");
      await extractPromise;
    });

    it("allows non-stream, non-blocked requests to proceed", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
      });

      // Non-stream, non-blocked requests should return true (allowed)
      const allowed1 = mockWebView.simulateRequest(
        "https://cdn.example.com/player.js",
      );
      const allowed2 = mockWebView.simulateRequest(
        "https://cdn.example.com/styles.css",
      );

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(true);

      // Resolve
      mockWebView.simulateRequest("https://cdn.example.com/video.m3u8");
      await extractPromise;
    });

    it("takes the first matching stream URL and ignores subsequent ones", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
      });

      // First stream URL should be captured
      mockWebView.simulateRequest("https://cdn.example.com/first.m3u8");

      const result = await extractPromise;
      expect(result.url).toBe("https://cdn.example.com/first.m3u8");

      // Subsequent requests after resolution should be blocked (WebView destroyed)
      const afterResolve = mockWebView.simulateRequest(
        "https://cdn.example.com/second.m3u8",
      );
      expect(afterResolve).toBe(false);
    });
  });

  describe("cancel", () => {
    it("destroys WebView and rejects with EXTRACTION_FAILED", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
        timeoutMs: 10000,
      });

      // Cancel the extraction
      service.cancel();

      expect(mockWebView.isDestroyed()).toBe(true);

      try {
        await extractPromise;
        expect.fail("Should have thrown");
      } catch (error) {
        const castError = error as CastError;
        expect(castError.code).toBe("EXTRACTION_FAILED");
        expect(castError.message).toContain("cancelled");
      }
    });

    it("blocks further requests after cancellation", async () => {
      const mockWebView = createMockWebView();
      const factory: HiddenWebViewFactory = () => mockWebView;
      const service = new HeadlessExtractService(factory);

      const extractPromise = service.extractStream({
        embedUrl: "https://embed.example.com/player",
        sourceId: "test",
        timeoutMs: 10000,
      });

      // Cancel the extraction
      service.cancel();

      // After cancel, the WebView should be destroyed
      expect(mockWebView.isDestroyed()).toBe(true);

      // Requests after cancel should be blocked
      const blocked = mockWebView.simulateRequest(
        "https://cdn.example.com/video.m3u8",
      );
      expect(blocked).toBe(false);

      // Consume the rejected promise to avoid unhandled rejection
      await expect(extractPromise).rejects.toMatchObject({
        code: "EXTRACTION_FAILED",
      });
    });
  });

  describe("needsExtraction", () => {
    it("returns true when isEmbed is true", () => {
      expect(
        HeadlessExtractService.needsExtraction({
          url: "https://embed.example.com/player",
          isEmbed: true,
        }),
      ).toBe(true);
    });

    it("returns false when isEmbed is false", () => {
      expect(
        HeadlessExtractService.needsExtraction({
          url: "https://cdn.example.com/video.m3u8",
          isEmbed: false,
        }),
      ).toBe(false);
    });

    it("returns false when isEmbed is undefined and URL is .m3u8", () => {
      expect(
        HeadlessExtractService.needsExtraction({
          url: "https://cdn.example.com/stream/index.m3u8",
        }),
      ).toBe(false);
    });

    it("returns false when isEmbed is undefined and URL is .mp4", () => {
      expect(
        HeadlessExtractService.needsExtraction({
          url: "https://cdn.example.com/video/movie.mp4",
        }),
      ).toBe(false);
    });

    it("returns true when isEmbed is undefined and URL is not a direct stream", () => {
      expect(
        HeadlessExtractService.needsExtraction({
          url: "https://embed.example.com/player/123",
        }),
      ).toBe(true);
    });

    it("returns false for .m3u8 URL with query parameters", () => {
      expect(
        HeadlessExtractService.needsExtraction({
          url: "https://cdn.example.com/stream.m3u8?token=abc",
        }),
      ).toBe(false);
    });

    it("returns false for .mp4 URL with fragment", () => {
      expect(
        HeadlessExtractService.needsExtraction({
          url: "https://cdn.example.com/video.mp4#t=10",
        }),
      ).toBe(false);
    });
  });
});
