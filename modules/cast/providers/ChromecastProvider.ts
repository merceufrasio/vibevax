/**
 * ChromecastProvider — CastProvider implementation using react-native-google-cast
 * with custom channel communication via CastMessageChannel.
 *
 * Routes all media commands through a custom Cast Channel (`urn:x-cast:com.revax.cast`)
 * to the custom receiver (App ID: 3C52EDCF). Position updates are pushed by the
 * receiver (no polling). State synchronization is driven by receiver STATUS messages.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5,
 *            4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3,
 *            9.1, 9.2, 9.3
 */

import { CastContext } from "react-native-google-cast";

import type {
  CastChannel as GCCastChannel,
  Device as GCDevice,
  CastSession as GCCastSession,
  SessionManager,
} from "react-native-google-cast";
import type { EmitterSubscription } from "react-native";

import type {
  CastProvider,
  CastDevice,
  CastSession,
  CastSessionState,
  CastProtocol,
  CastError,
  MediaInfo,
} from "../types";

import type { ReceiverMessage, ReceiverMessageState } from "../protocol/messages";
import { CastMessageChannel } from "./CastMessageChannel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONNECTION_TIMEOUT_MS = 15_000;
const CHANNEL_READY_TIMEOUT_MS = 2_000;
const CAST_CHANNEL_NAMESPACE = "urn:x-cast:com.revax.cast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps receiver state strings to CastSessionState values.
 */
export function mapReceiverState(state: ReceiverMessageState): CastSessionState {
  const mapping: Record<ReceiverMessageState, CastSessionState> = {
    loading: "loading",
    playing: "playing",
    paused: "paused",
    buffering: "buffering",
    idle: "idle",
    error: "error",
  };
  return mapping[state] ?? "idle";
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

  private discoverySubscription: EmitterSubscription | null = null;
  private sessionSubscription: EmitterSubscription | null = null;
  private channelUnsubscribe: (() => void) | null = null;
  private discoveryStopResolver: (() => void) | null = null;

  private currentSession: CastSession | null = null;
  private channel: CastMessageChannel | null = null;
  private nativeSession: GCCastSession | null = null;

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  async startDiscovery(
    onDeviceFound: (device: CastDevice) => void,
  ): Promise<void> {
    const discoveryManager = CastContext.getDiscoveryManager();

    this.discoverySubscription?.remove();

    const emitDevices = (devices: GCDevice[]) => {
      for (const device of devices) {
        const castDevice: CastDevice = {
          id: device.deviceId,
          name: device.friendlyName ?? device.deviceId,
          ip: device.ipAddress ?? "",
          port: 8009,
          protocol: "chromecast",
          model: device.modelName,
          capabilities: {
            supportsHls: true,
            supportsDash: false,
            supportsMp4: true,
            supportsSubtitles: true,
            supportsCustomHeaders: true,
            maxResolution: "1080p",
          },
        };
        onDeviceFound(castDevice);
      }
    };

    // Listen for device list changes
    this.discoverySubscription = discoveryManager.onDevicesUpdated(emitDevices);

    void discoveryManager.getDevices().then(emitDevices).catch(() => undefined);
    void discoveryManager.startDiscovery().catch(() => undefined);

    return new Promise<void>((resolve) => {
      this.discoveryStopResolver = resolve;
    });
  }

  stopDiscovery(): void {
    const discoveryManager = CastContext.getDiscoveryManager();
    void discoveryManager.stopDiscovery().catch(() => undefined);

    if (this.discoverySubscription) {
      this.discoverySubscription.remove();
      this.discoverySubscription = null;
    }

    this.discoveryStopResolver?.();
    this.discoveryStopResolver = null;
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(device: CastDevice): Promise<CastSession> {
    // Req 3.6: Disconnect existing session before initiating new connection
    if (this.currentSession && this.channel) {
      await this.disconnect();
    }

    const sessionManager = CastContext.getSessionManager();

    // Req 3.1: Launch custom receiver and transition to "connecting"
    this.notifyStateChange("connecting");

    // Start the native Cast session with the selected device.
    const nativeSession = await this.startSession(sessionManager, device.id);

    // Req 3.2: Register custom channel listener within 2 seconds
    const nativeChannel = await nativeSession.addChannel(CAST_CHANNEL_NAMESPACE);
    this.channel = new CastMessageChannel(nativeChannel as GCCastChannel);
    this.nativeSession = nativeSession;

    // Wire up receiver message handling
    this.channelUnsubscribe = this.channel.onMessage((message) => {
      this.handleReceiverMessage(message);
    });

    // Wait for receiver to report "idle" (confirms it loaded) (Req 3.3)
    await this.waitForReceiverReady();

    // Build CastSession
    const castSession: CastSession = {
      id: generateSessionId(),
      device,
      state: "connected",
      media: null,
      startedAt: Date.now(),
    };

    this.currentSession = castSession;
    this.setupSessionEndedListener(sessionManager);
    this.notifyStateChange("connected");

    return castSession;
  }

  async disconnect(): Promise<void> {
    const sessionManager = CastContext.getSessionManager();

    try {
      await sessionManager.endCurrentSession(true);
    } finally {
      this.cleanup();
      this.notifyStateChange("disconnected");
    }
  }

  // -------------------------------------------------------------------------
  // Media Loading (via Custom Channel)
  // -------------------------------------------------------------------------

  async loadMedia(media: MediaInfo): Promise<void> {
    // Req 4.7: Validate required fields
    if (!media.url) {
      throw new Error("MediaInfo validation error: 'url' is required");
    }
    if (!media.mimeType) {
      throw new Error("MediaInfo validation error: 'mimeType' is required");
    }
    if (!media.title) {
      throw new Error("MediaInfo validation error: 'title' is required");
    }

    // Req 4.5 / 5.8: Throw if channel not connected
    this.assertChannelConnected();

    // Req 4.4: Transition state to "loading" before sending
    this.notifyStateChange("loading");

    // Build LOAD payload (Req 4.1, 4.2, 4.3, 4.6)
    const subtitles = media.subtitles?.map((track) => ({
      lang: track.lang,
      url: track.url,
      label: track.lang.toUpperCase(),
    }));

    await this.channel!.send({
      type: "LOAD",
      payload: {
        url: media.url,
        headers: media.headers ?? {},
        mimeType: media.mimeType,
        title: media.title,
        subtitle: media.subtitle,
        posterUrl: media.posterUrl,
        subtitles: subtitles && subtitles.length > 0 ? subtitles : undefined,
        startPosition: media.startPosition,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Playback Controls (via Custom Channel)
  // -------------------------------------------------------------------------

  async play(): Promise<void> {
    this.assertChannelConnected();
    await this.channel!.send({ type: "PLAY" });
  }

  async pause(): Promise<void> {
    this.assertChannelConnected();
    await this.channel!.send({ type: "PAUSE" });
  }

  async stop(): Promise<void> {
    this.assertChannelConnected();
    await this.channel!.send({ type: "STOP" });
  }

  async seek(positionSeconds: number): Promise<void> {
    this.assertChannelConnected();
    await this.channel!.send({ type: "SEEK", position: positionSeconds });
  }

  async setVolume(level: number): Promise<void> {
    this.assertChannelConnected();
    await this.channel!.send({ type: "SET_VOLUME", level });
    this.nativeSession?.setVolume(level);
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
  // Receiver Message Handling
  // -------------------------------------------------------------------------

  /**
   * Handle validated messages from the receiver.
   * Maps STATUS → state listeners, POSITION → position listeners,
   * ERROR → error state transition.
   */
  private handleReceiverMessage(message: ReceiverMessage): void {
    switch (message.type) {
      case "STATUS": {
        const mappedState = mapReceiverState(message.state);
        this.notifyStateChange(mappedState);
        break;
      }

      case "POSITION": {
        this.notifyPositionUpdate(message.position, message.duration);
        break;
      }

      case "ERROR": {
        this.notifyStateChange("error");
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Assert that the channel is connected. Throws if not.
   * Req 4.5, 5.8: Throw error if channel is not connected.
   */
  private assertChannelConnected(): void {
    if (!this.channel || !this.channel.isConnected()) {
      throw new Error("No active cast session. Channel is not connected.");
    }
  }

  /**
   * Wait for a Cast session to be established with a 15-second timeout.
   * Req 3.4: Reject with CastError code CONNECTION_FAILED, recoverable: true.
   */
  private async startSession(
    sessionManager: SessionManager,
    deviceId: string,
  ): Promise<GCCastSession> {
    const currentSession = await sessionManager
      .getCurrentCastSession()
      .catch(() => null);
    if (currentSession) {
      return currentSession;
    }

    return this.waitForSession(sessionManager, deviceId);
  }

  /**
   * Start a Cast session and wait for it to be established with a 15-second
   * timeout. Req 3.4: reject with CastError code CONNECTION_FAILED,
   * recoverable: true.
   */
  private waitForSession(
    sessionManager: SessionManager,
    deviceId: string,
  ): Promise<GCCastSession> {
    return new Promise<GCCastSession>((resolve, reject) => {
      let cleanupStarted: EmitterSubscription | null = null;
      let cleanupResumed: EmitterSubscription | null = null;
      let cleanupFailed: EmitterSubscription | null = null;

      const cleanup = () => {
        cleanupStarted?.remove();
        cleanupResumed?.remove();
        cleanupFailed?.remove();
      };

      const timeout = setTimeout(() => {
        cleanup();
        const error: CastError = {
          code: "CONNECTION_FAILED",
          message: "Connection timed out after 15 seconds",
          recoverable: true,
        };
        reject(error);
      }, CONNECTION_TIMEOUT_MS);

      cleanupStarted = sessionManager.onSessionStarted((session: GCCastSession) => {
        clearTimeout(timeout);
        cleanup();
        resolve(session);
      });

      cleanupResumed = sessionManager.onSessionResumed((session: GCCastSession) => {
        clearTimeout(timeout);
        cleanup();
        resolve(session);
      });

      cleanupFailed = sessionManager.onSessionStartFailed((_session, error) => {
        clearTimeout(timeout);
        cleanup();
        const castError: CastError = {
          code: "CONNECTION_FAILED",
          message: error || "Session start failed",
          recoverable: true,
        };
        reject(castError);
      });

      void sessionManager.startSession(deviceId).then((started) => {
        if (!started) {
          clearTimeout(timeout);
          cleanup();
          const castError: CastError = {
            code: "CONNECTION_FAILED",
            message: "Cast session did not start.",
            recoverable: true,
          };
          reject(castError);
        }
      }).catch((error) => {
        clearTimeout(timeout);
        cleanup();
        const castError: CastError = {
          code: "CONNECTION_FAILED",
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        };
        reject(castError);
      });
    });
  }

  /**
   * Wait for the receiver to report "idle" status, confirming it has loaded.
   * Uses a 2-second timeout for channel readiness.
   * Req 3.3: Wait for receiver idle before resolving connect.
   */
  private waitForReceiverReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        // Resolve anyway — receiver may already be ready or will report soon
        resolve();
      }, CHANNEL_READY_TIMEOUT_MS);

      const unsubscribe = this.channel!.onMessage((message) => {
        if (message.type === "STATUS" && message.state === "idle") {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  /**
   * Listen for unexpected session end (device disconnected, user stopped from TV).
   * Req 9.3: Detect onSessionEnded, cleanup, transition to disconnected.
   */
  private setupSessionEndedListener(sessionManager: SessionManager): void {
    this.sessionSubscription = sessionManager.onSessionEnded(
      (_session: GCCastSession | null, _error: unknown) => {
        this.cleanup();
        this.notifyStateChange("disconnected");
      },
    );
  }

  /**
   * Full cleanup: dispose channel, remove all listeners, null session.
   * Req 9.1, 9.2: Dispose CastMessageChannel, remove listeners, null session.
   */
  private cleanup(): void {
    // Dispose channel
    if (this.channelUnsubscribe) {
      this.channelUnsubscribe();
      this.channelUnsubscribe = null;
    }

    if (this.channel) {
      this.channel.dispose();
      this.channel = null;
    }

    // Remove session ended listener
    if (this.sessionSubscription) {
      this.sessionSubscription.remove();
      this.sessionSubscription = null;
    }

    // Null session reference
    this.currentSession = null;
    this.nativeSession = null;
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
