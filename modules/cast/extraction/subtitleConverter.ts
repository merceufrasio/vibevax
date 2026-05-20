/**
 * SRT to WebVTT subtitle converter and subtitle resolution for casting.
 *
 * Chromecast requires WebVTT format, but many sources provide SRT subtitles.
 * This module handles:
 * - Converting SRT content to WebVTT format
 * - Fetching and resolving subtitle tracks for cast playback
 * - Detecting subtitle format by URL extension
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
 */

import type { SubtitleTrack, CastError } from "../types";

// ---------------------------------------------------------------------------
// SRT → WebVTT Conversion
// ---------------------------------------------------------------------------

/**
 * Convert SRT subtitle content to WebVTT format.
 *
 * Performs the following transformations:
 * - Normalizes CRLF line endings to LF
 * - Prepends the "WEBVTT" header followed by a blank line
 * - Converts all timestamp millisecond separators from comma to dot
 * - Preserves the number of cue blocks from input to output
 *
 * @param srtContent - Raw SRT subtitle content
 * @returns WebVTT formatted subtitle content
 */
export function convertSrtToWebVtt(srtContent: string): string {
  // Normalize CRLF to LF (Requirement 7.5)
  const normalized = srtContent.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  // Output starts with WEBVTT header (Requirement 7.2)
  const output: string[] = ["WEBVTT", ""];

  let i = 0;
  while (i < lines.length) {
    // Skip blank lines
    if (lines[i].trim() === "") {
      i++;
      continue;
    }

    // Skip cue number lines (purely numeric)
    if (/^\d+$/.test(lines[i].trim())) {
      i++;
      continue;
    }

    // Timestamp line: "00:01:23,456 --> 00:01:25,789"
    // Convert comma to dot for WebVTT (Requirement 7.3)
    const timestampMatch = lines[i].match(
      /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/,
    );

    if (timestampMatch) {
      output.push(
        `${timestampMatch[1]}.${timestampMatch[2]} --> ${timestampMatch[3]}.${timestampMatch[4]}`,
      );
      i++;

      // Collect text lines until blank line or end of file
      while (i < lines.length && lines[i].trim() !== "") {
        output.push(lines[i]);
        i++;
      }
      // Blank line between cues
      output.push("");
    } else {
      i++;
    }
  }

  return output.join("\n");
}

// ---------------------------------------------------------------------------
// Subtitle Resolution for Casting
// ---------------------------------------------------------------------------

/**
 * Detect the subtitle format based on the URL file extension.
 * Returns 'srt' for .srt URLs, 'vtt' for .vtt URLs, and 'srt' for unknown.
 */
function detectFormatByExtension(url: string): "srt" | "vtt" {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".vtt") || lowerUrl.includes(".vtt?")) {
    return "vtt";
  }
  if (lowerUrl.endsWith(".srt") || lowerUrl.includes(".srt?")) {
    return "srt";
  }
  // Unknown extensions: treat as SRT (Requirement 7.8)
  return "srt";
}

/**
 * Fetch a subtitle track, detect its format, convert to WebVTT if needed,
 * and return a data URI or pass-through URL suitable for casting.
 *
 * - `.srt` URLs: fetch content, convert to WebVTT, return as data URI
 * - `.vtt` URLs: pass through the URL unchanged
 * - Unknown extensions: treat as SRT and attempt conversion
 *
 * @param track - The subtitle track to resolve
 * @param headers - Optional headers to include in the fetch request
 * @returns A URL loadable by the Chromecast receiver (data URI or original URL)
 * @throws CastError with code SUBTITLE_FETCH_FAILED on network errors
 */
export async function resolveSubtitleForCast(
  track: SubtitleTrack,
  headers?: Record<string, string>,
): Promise<string> {
  const format = detectFormatByExtension(track.url);

  // VTT files can be passed through unchanged (Requirement 7.7)
  if (format === "vtt") {
    return track.url;
  }

  // SRT or unknown: fetch and convert (Requirements 7.6, 7.8)
  let srtContent: string;
  try {
    const response = await fetch(track.url, {
      headers: headers ?? {},
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    srtContent = await response.text();
  } catch (error) {
    // Network errors: throw CastError with SUBTITLE_FETCH_FAILED (Requirement 7.9)
    const castError: CastError = {
      code: "SUBTITLE_FETCH_FAILED",
      message: `Failed to fetch subtitle: ${error instanceof Error ? error.message : String(error)}`,
      recoverable: true,
    };
    throw castError;
  }

  const webvttContent = convertSrtToWebVtt(srtContent);

  // Return as data URI so the Chromecast receiver can load it directly
  const encoded = encodeURIComponent(webvttContent);
  return `data:text/vtt;charset=utf-8,${encoded}`;
}
