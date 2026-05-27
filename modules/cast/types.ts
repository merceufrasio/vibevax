/**
 * Type definitions for the Cast to TV module.
 *
 * Defines all interfaces and types used across the cast system including
 * device representation, session state, media info, error handling,
 * and the state machine transitions map.
 *
 * Validates: Requirements 5.1, 10.1–10.5, 12.1, 12.2
 */

import type { StreamResult } from "@/sources/types";

// ---------------------------------------------------------------------------
// Protocol & Capabilities
// ---------------------------------------------------------------------------

export type CastProtocol = "chromecast" | "airplay" | "dlna";

export interface DeviceCapabilities {
  supportsHls: boolean;
  supportsDash: boolean;
  supportsMp4: boolean;
  supportsSubtitles: boolean;
  /** true only with custom receiver (Phase 5) */
  supportsCustomHeaders: boolean;
  maxResolution?: "720p" | "1080p" | "4k";
}

// ---------------------------------------------------------------------------
// Device & Session
// ---------------------------------------------------------------------------

export interface CastDevice {
  /** Unique device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** IP address on local network */
  ip: string;
  /** Service port */
  port: number;
  /** Protocol used by this device */
  protocol: CastProtocol;
  /** Device model (e.g., "Chromecast Ultra") */
  model?: string;
  /** What the device supports */
  capabilities: DeviceCapabilities;
}

export type CastSessionState =
  | "connecting"
  | "connected"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "idle"
  | "disconnected"
  | "error";

export interface CastSession {
  /** Session identifier */
  id: string;
  /** Connected device */
  device: CastDevice;
  /** Current session state */
  state: CastSessionState;
  /** Currently loaded media */
  media: MediaInfo | null;
  /** Timestamp session started */
  startedAt: number;
}

// ---------------------------------------------------------------------------
// State Machine Transitions
// ---------------------------------------------------------------------------

/**
 * Valid state transitions for CastSessionState.
 * Each key maps to the set of states it can transition to.
 */
export const VALID_TRANSITIONS: Record<CastSessionState, CastSessionState[]> = {
  disconnected: ["connecting"],
  connecting: ["connected", "error", "disconnected"],
  connected: ["loading", "idle", "disconnected"],
  loading: ["playing", "error", "disconnected"],
  playing: ["paused", "buffering", "idle", "error", "disconnected"],
  paused: ["playing", "buffering", "idle", "error", "disconnected"],
  buffering: ["playing", "paused", "error", "disconnected"],
  idle: ["loading", "disconnected"],
  error: ["connecting", "disconnected", "idle"],
};

// ---------------------------------------------------------------------------
// Media & Subtitles
// ---------------------------------------------------------------------------

export interface SubtitleTrack {
  /** Language code */
  lang: string;
  /** Subtitle file URL */
  url: string;
  /** Original format */
  format: "vtt" | "srt";
}

export interface MediaInfo {
  /** Stream URL to cast */
  url: string;
  /** Media title for display */
  title: string;
  /** Episode name or source info */
  subtitle?: string;
  /** Thumbnail/poster for receiver UI */
  posterUrl?: string;
  /** MIME type: 'application/x-mpegURL' | 'video/mp4' | 'application/dash+xml' */
  mimeType: string;
  /** Custom headers (requires custom receiver) */
  headers?: Record<string, string>;
  /** Available subtitle tracks */
  subtitles?: SubtitleTrack[];
  /** Resume position in seconds */
  startPosition?: number;
  /** Total duration if known */
  duration?: number;
  /** Source plugin ID for context */
  sourceId?: string;
}

// ---------------------------------------------------------------------------
// Global Cast State
// ---------------------------------------------------------------------------

export interface CastState {
  /** Any cast device discovered */
  isAvailable: boolean;
  /** Currently connected to a device */
  isConnected: boolean;
  /** Active session */
  session: CastSession | null;
  /** All discovered devices */
  devices: CastDevice[];
  /** Current position in seconds */
  playbackPosition: number;
  /** Total duration in seconds */
  playbackDuration: number;
  /** Volume level 0.0 - 1.0 */
  volume: number;
  /** Whether audio is muted */
  isMuted: boolean;
  /** Current error, if any */
  error: CastError | null;
  /**
   * Last known cast position preserved after session ends.
   * Available as a startPosition for local playback resumption.
   * Null when no cast session has ended with a valid position.
   * Validates: Requirements 9.4, 9.5
   */
  lastCastPosition: { position: number; duration: number } | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CastErrorCode =
  | "DISCOVERY_FAILED"
  | "CONNECTION_FAILED"
  | "CONNECTION_LOST"
  | "MEDIA_LOAD_FAILED"
  | "EXTRACTION_FAILED"
  | "EXTRACTION_TIMEOUT"
  | "UNSUPPORTED_FORMAT"
  | "HEADERS_REQUIRED"
  | "DRM_PROTECTED"
  | "NETWORK_ERROR"
  | "COMMAND_FAILED"
  | "SUBTITLE_FETCH_FAILED";

export interface CastError {
  code: CastErrorCode;
  message: string;
  recoverable: boolean;
}

// ---------------------------------------------------------------------------
// Cast Media Params
// ---------------------------------------------------------------------------

export interface CastMediaParams {
  /** Stream result from sourceRepository.resolveStream() */
  stream: StreamResult;
  /** Media title */
  title: string;
  /** Episode name or source info */
  subtitle?: string;
  /** Poster image URL */
  posterUrl?: string;
  /** Episode identifier */
  episodeId: string;
  /** Source plugin identifier */
  sourceId: string;
  /** Resume position in seconds */
  startPosition?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CastConfig {
  /** Registered cast providers */
  providers: CastProvider[];
  /** Timeout for headless extraction in ms (default: 15000) */
  extractionTimeoutMs: number;
  /** GitHub Pages URL for custom receiver (Phase 5) */
  customReceiverUrl?: string;
  /** Timeout for device discovery in ms (default: 10000) */
  discoveryTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Provider Interface (re-exported from providers/types.ts)
// ---------------------------------------------------------------------------

export interface CastProvider {
  readonly protocol: CastProtocol;

  /**
   * Start discovering devices on the local network.
   * Emits devices as they are found via the callback.
   */
  startDiscovery(onDeviceFound: (device: CastDevice) => void): Promise<void>;

  /** Stop active discovery scan. */
  stopDiscovery(): void;

  /** Connect to a specific device. */
  connect(device: CastDevice): Promise<CastSession>;

  /** Disconnect from the current device. */
  disconnect(): Promise<void>;

  /** Load and play media on the connected device. */
  loadMedia(media: MediaInfo): Promise<void>;

  /** Resume playback. */
  play(): Promise<void>;

  /** Pause playback. */
  pause(): Promise<void>;

  /** Stop playback. */
  stop(): Promise<void>;

  /** Seek to a position in seconds. */
  seek(positionSeconds: number): Promise<void>;

  /** Set volume level (0.0 - 1.0). */
  setVolume(level: number): Promise<void>;

  /** Subscribe to state changes from the provider. Returns unsubscribe function. */
  onStateChange(listener: (state: CastSessionState) => void): () => void;

  /** Subscribe to playback position updates. Returns unsubscribe function. */
  onPositionUpdate(
    listener: (position: number, duration: number) => void,
  ): () => void;
}
