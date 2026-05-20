import { describe, it, expect } from "vitest";
import { inferMimeType } from "./utils";

describe("inferMimeType", () => {
  describe("HLS (.m3u8)", () => {
    it("returns application/x-mpegURL for .m3u8 extension", () => {
      expect(inferMimeType("https://example.com/stream.m3u8")).toBe(
        "application/x-mpegURL",
      );
    });

    it("handles .m3u8 with query string", () => {
      expect(
        inferMimeType("https://example.com/stream.m3u8?token=abc123"),
      ).toBe("application/x-mpegURL");
    });

    it("handles .m3u8 with fragment", () => {
      expect(inferMimeType("https://example.com/stream.m3u8#t=10")).toBe(
        "application/x-mpegURL",
      );
    });

    it("is case-insensitive for .M3U8", () => {
      expect(inferMimeType("https://example.com/stream.M3U8")).toBe(
        "application/x-mpegURL",
      );
    });

    it("is case-insensitive for .M3u8", () => {
      expect(inferMimeType("https://example.com/stream.M3u8?key=val")).toBe(
        "application/x-mpegURL",
      );
    });
  });

  describe("MP4 (.mp4)", () => {
    it("returns video/mp4 for .mp4 extension", () => {
      expect(inferMimeType("https://example.com/video.mp4")).toBe("video/mp4");
    });

    it("handles .mp4 with query string", () => {
      expect(inferMimeType("https://example.com/video.mp4?quality=hd")).toBe(
        "video/mp4",
      );
    });

    it("handles .mp4 with fragment", () => {
      expect(inferMimeType("https://example.com/video.mp4#section")).toBe(
        "video/mp4",
      );
    });

    it("is case-insensitive for .MP4", () => {
      expect(inferMimeType("https://example.com/video.MP4")).toBe("video/mp4");
    });
  });

  describe("DASH (.mpd)", () => {
    it("returns application/dash+xml for .mpd extension", () => {
      expect(inferMimeType("https://example.com/manifest.mpd")).toBe(
        "application/dash+xml",
      );
    });

    it("handles .mpd with query string", () => {
      expect(inferMimeType("https://example.com/manifest.mpd?v=2")).toBe(
        "application/dash+xml",
      );
    });

    it("handles .mpd with fragment", () => {
      expect(inferMimeType("https://example.com/manifest.mpd#start")).toBe(
        "application/dash+xml",
      );
    });

    it("is case-insensitive for .MPD", () => {
      expect(inferMimeType("https://example.com/manifest.MPD")).toBe(
        "application/dash+xml",
      );
    });
  });

  describe("default (unrecognized extensions)", () => {
    it("returns application/x-mpegURL for unrecognized extension", () => {
      expect(inferMimeType("https://example.com/stream.webm")).toBe(
        "application/x-mpegURL",
      );
    });

    it("returns application/x-mpegURL for URL with no extension", () => {
      expect(inferMimeType("https://example.com/stream")).toBe(
        "application/x-mpegURL",
      );
    });

    it("returns application/x-mpegURL for empty string", () => {
      expect(inferMimeType("")).toBe("application/x-mpegURL");
    });

    it("returns application/x-mpegURL for URL with path but no extension", () => {
      expect(inferMimeType("https://example.com/api/v1/stream/12345")).toBe(
        "application/x-mpegURL",
      );
    });
  });
});
