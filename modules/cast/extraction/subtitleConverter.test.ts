import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertSrtToWebVtt, resolveSubtitleForCast } from "./subtitleConverter";
import type { SubtitleTrack, CastError } from "../types";

describe("convertSrtToWebVtt", () => {
  it("outputs WEBVTT header at the start", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";
    const result = convertSrtToWebVtt(srt);
    expect(result.startsWith("WEBVTT\n")).toBe(true);
  });

  it("has a blank line after the WEBVTT header", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";
    const result = convertSrtToWebVtt(srt);
    expect(result.startsWith("WEBVTT\n\n")).toBe(true);
  });

  it("converts comma to dot in timestamps", () => {
    const srt = "1\n00:01:23,456 --> 00:01:25,789\nText\n";
    const result = convertSrtToWebVtt(srt);
    expect(result).toContain("00:01:23.456 --> 00:01:25.789");
    expect(result).not.toContain(",");
  });

  it("preserves the number of cue blocks", () => {
    const srt = [
      "1",
      "00:00:01,000 --> 00:00:02,000",
      "First cue",
      "",
      "2",
      "00:00:03,000 --> 00:00:04,000",
      "Second cue",
      "",
      "3",
      "00:00:05,000 --> 00:00:06,000",
      "Third cue",
      "",
    ].join("\n");

    const result = convertSrtToWebVtt(srt);
    const cueCount = (result.match(/\d{2}:\d{2}:\d{2}\.\d{3} --> /g) || [])
      .length;
    expect(cueCount).toBe(3);
  });

  it("normalizes CRLF to LF before processing", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n";
    const result = convertSrtToWebVtt(srt);
    expect(result).not.toContain("\r");
    expect(result).toContain("00:00:01.000 --> 00:00:02.000");
    expect(result).toContain("Hello");
  });

  it("handles multi-line cue text", () => {
    const srt = [
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "Line one",
      "Line two",
      "",
    ].join("\n");

    const result = convertSrtToWebVtt(srt);
    expect(result).toContain("Line one\nLine two");
  });

  it("handles empty input gracefully", () => {
    const result = convertSrtToWebVtt("");
    expect(result.startsWith("WEBVTT\n")).toBe(true);
  });
});

describe("resolveSubtitleForCast", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("passes through .vtt URLs unchanged without fetching", async () => {
    const track: SubtitleTrack = {
      lang: "en",
      url: "https://example.com/subs.vtt",
      format: "vtt",
    };

    const result = await resolveSubtitleForCast(track);
    expect(result).toBe("https://example.com/subs.vtt");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches and converts .srt URLs to data URI", async () => {
    const srtContent = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(srtContent),
    });

    const track: SubtitleTrack = {
      lang: "en",
      url: "https://example.com/subs.srt",
      format: "srt",
    };

    const result = await resolveSubtitleForCast(track);
    expect(result.startsWith("data:text/vtt;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(result.replace("data:text/vtt;charset=utf-8,", ""))).toContain("WEBVTT");
    expect(global.fetch).toHaveBeenCalledWith("https://example.com/subs.srt", {
      headers: {},
    });
  });

  it("treats unknown extensions as SRT and attempts conversion", async () => {
    const srtContent = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(srtContent),
    });

    const track: SubtitleTrack = {
      lang: "en",
      url: "https://example.com/subs.txt",
      format: "srt",
    };

    const result = await resolveSubtitleForCast(track);
    expect(result.startsWith("data:text/vtt;charset=utf-8,")).toBe(true);
  });

  it("throws CastError with SUBTITLE_FETCH_FAILED on network error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    const track: SubtitleTrack = {
      lang: "en",
      url: "https://example.com/subs.srt",
      format: "srt",
    };

    try {
      await resolveSubtitleForCast(track);
      expect.fail("Should have thrown");
    } catch (error) {
      const castError = error as CastError;
      expect(castError.code).toBe("SUBTITLE_FETCH_FAILED");
      expect(castError.recoverable).toBe(true);
      expect(castError.message).toContain("Network error");
    }
  });

  it("throws CastError with SUBTITLE_FETCH_FAILED on HTTP error response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const track: SubtitleTrack = {
      lang: "en",
      url: "https://example.com/subs.srt",
      format: "srt",
    };

    try {
      await resolveSubtitleForCast(track);
      expect.fail("Should have thrown");
    } catch (error) {
      const castError = error as CastError;
      expect(castError.code).toBe("SUBTITLE_FETCH_FAILED");
      expect(castError.message).toContain("404");
    }
  });

  it("passes custom headers to fetch request", async () => {
    const srtContent = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(srtContent),
    });

    const track: SubtitleTrack = {
      lang: "en",
      url: "https://example.com/subs.srt",
      format: "srt",
    };

    const headers = { Referer: "https://source.com", "User-Agent": "ReVax" };
    await resolveSubtitleForCast(track, headers);

    expect(global.fetch).toHaveBeenCalledWith("https://example.com/subs.srt", {
      headers,
    });
  });
});
