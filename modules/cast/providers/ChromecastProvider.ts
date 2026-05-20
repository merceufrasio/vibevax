/**
 * ChromecastProvider — CastProvider implementation using react-native-google-cast.
 *
 * Maps the react-native-google-cast SDK to the unified CastProvider interface.
 * Handles device discovery via DiscoveryManager, session management via
 * SessionManager, and playback controls via RemoteMediaClient.
 *
 * Validates: Requirements 2.1, 2.2, 4.1, 4.2, 4.3, 4.4, 4.5, 14.2
 */

import GoogleCast, {
  CastContext,
  MediaPlayerState,
  MediaStreamType,
  MediaHlsSegmentFormat,
} from "react-native-google-cast";

import type {
  Device as GCDevice,
  RemoteMediaClient,
  MediaInfo as GCMediaInfo,
  MediaMetadata,
  MediaStatus,
  CastSession as GCCastSession,
  SessionManager,
} from "react-native-google-cast";

import type {
  CastProvider,
  CastDevice,
  CastSession,
  CastSessionState,
  CastProtocol,
  MediaInfo,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps react-native-google-cast MediaPlayerState to our CastSessionState.
 */
function mapPlayerState(playerState: MediaPlayerState): CastSessionState {
  switch (playerState) {
    case MediaPlayerState.PLAYING:
      return "playing";
    case MediaPlayerState.PAUSED:
      return "paused";
    case MediaPlayerState.BUFFERING:
      return "buffering";
    case MediaPlayerState.IDLE:
      return "idle";
    case MediaPlayerState.LOADING:
      return "loading";
    default:
      return "idle";
  }
}

/**
 * Generates a unique session ID.
 */
function generateSessionId(): string {
  return `chromecast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// ChromecastProvider
// ---------------------------------------------------------------------------

export class ChromecastProvider implements CastProvider {
  readonly protocol: CastProtocol = "chromecast";

  private stateListeners: Set<(state: CastSessionState) => void> = new Set();
  private positionListeners: Set<
    (position: number, duration: number) => void
  > = new Set();

  private discoverySubscription: (() => void) | null = null;
  private sessionSubscription: (() => void) | null = null;
  private mediaStatusSubscription: (() => void) | null = null;
  private positionInterval: ReturnType<typeof setInterval> | null = null;

  private currentSession: CastSession | null = null;

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  async startDiscovery(
    onDeviceFound: (device: CastDevice) => void,
  ): Promise<void> {
    const discoveryManager = CastContext.getDiscoveryManager();

    // Listen for device list changes
    this.discoverySubscription = discoveryManager.onDevicesUpdated(
      (devices: GCDevice[]) => {
        for (const device of devices) {
          const castDevice: CastDevice = {
            id: device.deviceId,
            name: device.friendlyName ?? device.deviceId,
            ip: device.ipAddress ?? "",
            port: device.servicePort ?? 8009,
            protocol: "chromecast",
            model: device.modelName,
            capabilities: {
              supportsHls: true,
              supportsDash: false,
              supportsMp4: true,
              supportsSubtitles: true,
              // Custom headers only supported with custom receiver (Phase 5)
              supportsCustomHeaders: false,
              maxResolution: "1080p",
            },
          };
          onDeviceFound(castDevice);
        }
      },
    );

    // Start the native discovery process
    discoveryManager.startDiscovery();
  }

  stopDiscovery(): void {
    const discoveryManager = CastContext.getDiscoveryManager();
    discoveryManager.stopDiscovery();

    if (this.discoverySubscription) {
      this.discoverySubscription();
      this.discoverySubscription = null;
    }
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(device: CastDevice): Promise<CastSession> {
    const sessionManager = CastContext.getSessionManager();

    // Request a session with the device
    await GoogleCast.showCastPicker();

    // Wait for session to be established
    const session = await new Promise<GCCastSession>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Connection timeout"));
      }, 15000);

      const cleanup = sessionManager.onSessionStarted((gcSession: GCCastSession) => {
        clearTimeout(timeout);
        resolve(gcSession);
      });

      // Also listen for session start failure
      const failCleanup = sessionManager.onSessionStartFailed((error: { message?: string } | null) => {
        clearTimeout(timeout);
        cleanup();
        failCleanup();
        reject(new Error(error?.message ?? "Session start failed"));
      });
    });

    const castSession: CastSession = {
      id: generateSessionId(),
      device,
      state: "connected",
      media: null,
      startedAt: Date.now(),
    };

    this.currentSession = castSession;
    this.setupSessionListeners(sessionManager);
    this.notifyStateChange("connected");

    return castSession;
  }

  async disconnect(): Promise<void> {
    const sessionManager = CastContext.getSessionManager();

    try {
      await sessionManager.endCurrentSession(true);
    } finally {
      this.cleanupListeners();
      this.currentSession = null;
      this.notifyStateChange("disconnected");
    }
  }

  // -------------------------------------------------------------------------
  // Media Loading
  // -------------------------------------------------------------------------

  async loadMedia(media: MediaInfo): Promise<void> {
    const client = (await CastContext.getSessionManager().getCurrentCastSession())
      ?.client;

    if (!client) {
      throw new Error("No active cast session");
    }

    this.notifyStateChange("loading");

    const mediaInfo: GCMediaInfo = {
      contentUrl: media.url,
      contentType: media.mimeType,
      streamType: MediaStreamType.BUFFERED,
      metadata: {
        type: "generic",
        title: media.title,
        subtitle: media.subtitle,
        images: media.posterUrl
          ? [{ url: media.posterUrl }]
          : undefined,
      } as MediaMetadata,
      hlsSegmentFormat: media.mimeType === "application/x-mpegURL"
        ? MediaHlsSegmentFormat.TS
        : undefined,
    };

    const loadRequest = {
      mediaInfo,
      autoplay: true,
      startTime: media.startPosition ?? 0,
    };

    await client.loadMedia(loadRequest);
    this.startPositionTracking(client);
  }

  // -------------------------------------------------------------------------
  // Playback Controls
  // -------------------------------------------------------------------------

  async play(): Promise<void> {
    const client = await this.getRemoteMediaClient();
    await client.play();
  }

  async pause(): Promise<void> {
    const client = await this.getRemoteMediaClient();
    await client.pause();
  }

  async stop(): Promise<void> {
    const client = await this.getRemoteMediaClient();
    await client.stop();
    this.stopPositionTracking();
  }

  async seek(positionSeconds: number): Promise<void> {
    const client = await this.getRemoteMediaClient();
    await client.seek({ position: positionSeconds });
  }

  async setVolume(level: number): Promise<void> {
    const sessionManager = CastContext.getSessionManager();
    const session = await sessionManager.getCurrentCastSession();

    if (!session) {
      throw new Error("No active cast session");
    }

    // Volume is set on the cast device (session level), not media client
    await session.setVolume(level);
  }

  // -------------------------------------------------------------------------
  // Event Subscriptions
  // -------------------------------------------------------------------------

  onStateChange(listener: (state: CastSessionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onPositionUpdate(
    listener: (position: number, duration: number) => void,
  ): () => void {
    this.positionListeners.add(listener);
    return () => {
      this.positionListeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private async getRemoteMediaClient(): Promise<RemoteMediaClient> {
    const session =
      await CastContext.getSessionManager().getCurrentCastSession();
    const client = session?.client;

    if (!client) {
      throw new Error("No active RemoteMediaClient");
    }

    return client;
  }

  private setupSessionListeners(sessionManager: SessionManager): void {
    // Listen for session end
    this.sessionSubscription = sessionManager.onSessionEnded(
      (_session: GCCastSession | null, _error: unknown) => {
        this.cleanupListeners();
        this.currentSession = null;
        this.notifyStateChange("disconnected");
      },
    );

    // Listen for media status updates
    this.setupMediaStatusListener();
  }

  private async setupMediaStatusListener(): Promise<void> {
    const client = await this.getRemoteMediaClient().catch(() => null);
    if (!client) return;

    this.mediaStatusSubscription = client.onMediaStatusUpdated(
      (mediaStatus: MediaStatus | null) => {
        if (mediaStatus?.playerState != null) {
          const mappedState = mapPlayerState(mediaStatus.playerState);
          this.notifyStateChange(mappedState);
        }
      },
    );
  }

  private startPositionTracking(client: RemoteMediaClient): void {
    this.stopPositionTracking();

    // Poll position every 1 second
    this.positionInterval = setInterval(async () => {
      try {
        const mediaStatus = await client.getMediaStatus();
        if (mediaStatus) {
          const position = mediaStatus.streamPosition ?? 0;
          const duration =
            mediaStatus.mediaInfo?.streamDuration ?? 0;
          this.notifyPositionUpdate(position, duration);
        }
      } catch {
        // Silently ignore polling errors (session may have ended)
      }
    }, 1000);
  }

  private stopPositionTracking(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  private cleanupListeners(): void {
    this.stopPositionTracking();

    if (this.sessionSubscription) {
      this.sessionSubscription();
      this.sessionSubscription = null;
    }

    if (this.mediaStatusSubscription) {
      this.mediaStatusSubscription();
      this.mediaStatusSubscription = null;
    }
  }

  private notifyStateChange(state: CastSessionState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private notifyPositionUpdate(position: number, duration: number): void {
    for (const listener of this.positionListeners) {
      listener(position, duration);
    }
  }
}
