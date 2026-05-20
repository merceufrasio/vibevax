/**
 * Unit tests for DRM detection logic.
 *
 * Validates: Requirement 9.4
 */

import { describe, it, expect } from "vitest";

import { isDrmProtected, assertNotDrmProtected } from "./drmDetection";
import type { StreamResult } from "@/sources/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStream(overrides?: Partial<StreamResult>): StreamResult {
  return {
    url: "https://example.com/video.m3u8",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isDrmProtected", () => {
  describe("URL-based detection", () => {
    it("detects Widevine DRM in URL", () => {
      const stream = makeStream({ url: "https://cdn.example.com/widevine/stream.m3u8" });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("detects PlayReady DRM in URL", () => {
      const stream = makeStream({ url: "https://cdn.example.com/playready/manifest.mpd" });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("detects FairPlay DRM in URL", () => {
      const stream = makeStream({ url: "https://cdn.example.com/fairplay/stream.m3u8" });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("detects /drm/ path segment in URL", () => {
      const stream = makeStream({ url: "https://cdn.example.com/drm/content/video.mp4" });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("detects encrypted keyword in URL", () => {
      const stream = makeStream({ url: "https://cdn.example.com/encrypted/stream.m3u8" });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("detects CENC in URL", () => {
      const stream = makeStream({ url: "https://cdn.example.com/cenc/manifest.mpd" });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("does not flag normal stream URLs", () => {
      const stream = makeStream({ url: "https://cdn.example.com/video/stream.m3u8" });
      expect(isDrmProtected(stream)).toBe(false);
    });

    it("does not flag URLs with unrelated content", () => {
      const stream = makeStream({ url: "https://cdn.example.com/movies/action/hero.mp4" });
      expect(isDrmProtected(stream)).toBe(false);
    });
  });

  describe("header-based detection", () => {
    it("detects x-drm- prefixed headers", () => {
      const stream = makeStream({
        headers: { "X-DRM-Token": "abc123" },
      });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("detects x-widevine- prefixed headers", () => {
      const stream = makeStream({
        headers: { "X-Widevine-License": "token" },
      });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("detects x-playready- prefixed headers", () => {
      const stream = makeStream({
        headers: { "X-PlayReady-Key": "key123" },
      });
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("does not flag normal headers like Referer", () => {
      const stream = makeStream({
        headers: { Referer: "https://example.com", "User-Agent": "Mozilla/5.0" },
      });
      expect(isDrmProtected(stream)).toBe(false);
    });
  });

  describe("drm field detection", () => {
    it("detects explicit drm field set to true", () => {
      const stream = { ...makeStream(), drm: true } as unknown as StreamResult;
      expect(isDrmProtected(stream)).toBe(true);
    });

    it("does not flag when drm field is absent", () => {
      const stream = makeStream();
      expect(isDrmProtected(stream)).toBe(false);
    });
  });
});

describe("assertNotDrmProtected", () => {
  it("does not throw for non-DRM streams", () => {
    const stream = makeStream({ url: "https://cdn.example.com/video.m3u8" });
    expect(() => assertNotDrmProtected(stream)).not.toThrow();
  });

  it("throws CastError with DRM_PROTECTED code for DRM streams", () => {
    const stream = makeStream({ url: "https://cdn.example.com/widevine/stream.m3u8" });

    expect(() => assertNotDrmProtected(stream)).toThrow();

    try {
      assertNotDrmProtected(stream);
    } catch (error: unknown) {
      const castError = error as { code: string; message: string; recoverable: boolean };
      expect(castError.code).toBe("DRM_PROTECTED");
      expect(castError.recoverable).toBe(false);
      expect(castError.message).toContain("DRM-protected");
    }
  });
});
