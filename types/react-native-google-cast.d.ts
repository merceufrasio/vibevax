/**
 * Type declarations for react-native-google-cast.
 *
 * These declarations cover the subset of the API used by ChromecastProvider.
 * The full package provides additional functionality not typed here.
 */

declare module "react-native-google-cast" {
  // ---------------------------------------------------------------------------
  // Enums
  // ---------------------------------------------------------------------------

  export enum MediaPlayerState {
    UNKNOWN = 0,
    IDLE = 1,
    PLAYING = 2,
    PAUSED = 3,
    BUFFERING = 4,
    LOADING = 5,
  }

  export enum MediaStreamType {
    BUFFERED = "buffered",
    LIVE = "live",
    NONE = "none",
  }

  export enum MediaHlsSegmentFormat {
    AAC = "aac",
    AC3 = "ac3",
    E_AC3 = "e_ac3",
    FMP4 = "fmp4",
    MP3 = "mp3",
    TS = "ts",
    TS_AAC = "ts_aac",
  }

  // ---------------------------------------------------------------------------
  // Data Types
  // ---------------------------------------------------------------------------

  export interface MediaImage {
    url: string;
    width?: number;
    height?: number;
  }

  export interface MediaMetadata {
    type: "generic" | "movie" | "tvShow" | "musicTrack" | "photo" | "user";
    title?: string;
    subtitle?: string;
    images?: MediaImage[];
    [key: string]: unknown;
  }

  export interface MediaInfo {
    contentUrl: string;
    contentType: string;
    streamType?: MediaStreamType;
    metadata?: MediaMetadata;
    streamDuration?: number;
    hlsSegmentFormat?: MediaHlsSegmentFormat;
    customData?: Record<string, unknown>;
  }

  export interface MediaLoadRequest {
    mediaInfo: MediaInfo;
    autoplay?: boolean;
    startTime?: number;
    customData?: Record<string, unknown>;
  }

  export interface MediaStatus {
    playerState?: MediaPlayerState;
    streamPosition?: number;
    mediaInfo?: MediaInfo & { streamDuration?: number };
    volume?: number;
    isMuted?: boolean;
    currentItemId?: number;
  }

  export interface Device {
    deviceId: string;
    friendlyName?: string;
    ipAddress?: string;
    servicePort?: number;
    modelName?: string;
  }

  // ---------------------------------------------------------------------------
  // RemoteMediaClient
  // ---------------------------------------------------------------------------

  export interface RemoteMediaClient {
    loadMedia(request: MediaLoadRequest): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    stop(): Promise<void>;
    seek(options: { position: number }): Promise<void>;
    getMediaStatus(): Promise<MediaStatus | null>;
    onMediaStatusUpdated(
      listener: (status: MediaStatus | null) => void,
    ): () => void;
  }

  // ---------------------------------------------------------------------------
  // CastSession (native)
  // ---------------------------------------------------------------------------

  export interface CastSession {
    client: RemoteMediaClient;
    setVolume(level: number): Promise<void>;
  }

  // ---------------------------------------------------------------------------
  // SessionManager
  // ---------------------------------------------------------------------------

  export interface SessionManager {
    getCurrentCastSession(): Promise<CastSession | null>;
    endCurrentSession(stopCasting: boolean): Promise<void>;
    onSessionStarted(listener: (session: CastSession) => void): () => void;
    onSessionStartFailed(
      listener: (error: { message?: string } | null) => void,
    ): () => void;
    onSessionEnded(
      listener: (session: CastSession | null, error: unknown) => void,
    ): () => void;
  }

  // ---------------------------------------------------------------------------
  // DiscoveryManager
  // ---------------------------------------------------------------------------

  export interface DiscoveryManager {
    startDiscovery(): void;
    stopDiscovery(): void;
    onDevicesUpdated(listener: (devices: Device[]) => void): () => void;
  }

  // ---------------------------------------------------------------------------
  // CastContext
  // ---------------------------------------------------------------------------

  export const CastContext: {
    getDiscoveryManager(): DiscoveryManager;
    getSessionManager(): SessionManager;
  };

  // ---------------------------------------------------------------------------
  // Default export (GoogleCast)
  // ---------------------------------------------------------------------------

  const GoogleCast: {
    showCastPicker(): Promise<void>;
    getCastState(): Promise<number>;
  };

  export default GoogleCast;
}
