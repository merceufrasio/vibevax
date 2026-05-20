/**
 * MockCastProvider — Fake cast provider for development/testing.
 *
 * Simulates a Chromecast device on the local network so you can test
 * the entire cast UI flow (discovery → connect → cast → playback controls)
 * without a real TV or native build.
 *
 * Usage: Automatically injected when __DEV__ is true.
 */

import type {
  CastDevice,
  CastProvider,
  CastProtocol,
  CastSession,
  CastSessionState,
  MediaInfo,
} from "../types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MOCK_DEVICES: CastDevice[] = [
  {
    id: "mock-chromecast-1",
    name: "Living Room TV (Mock)",
    ip: "192.168.1.100",
    port: 8009,
    protocol: "chromecast",
    model: "Chromecast Ultra",
    capabilities: {
      supportsHls: true,
      supportsDash: false,
      supportsMp4: true,
      supportsSubtitles: true,
      supportsCustomHeaders: true,
      maxResolution: "4k",
    },
  },
  {
    id: "mock-chromecast-2",
    name: "Bedroom TV (Mock)",
    ip: "192.168.1.101",
    port: 8009,
    protocol: "chromecast",
    model: "Chromecast with Google TV",
    capabilities: {
      supportsHls: true,
      supportsDash: true,
      supportsMp4: true,
      supportsSubtitles: true,
      supportsCustomHeaders: false,
      maxResolution: "1080p",
    },
  },
];

/** Simulated playback speed — position advances this many seconds per real second */
const PLAYBACK_SPEED = 1;

// ---------------------------------------------------------------------------
// MockCastProvider
// ---------------------------------------------------------------------------

export class MockCastProvider implements CastProvider {
  readonly protocol: CastProtocol = "chromecast";

  private stateListeners = new Set<(state: CastSessionState) => void>();
  private positionListeners = new Set<
    (position: number, duration: number) => void
  >();

  private connected = false;
  private playing = false;
  private position = 0;
  private duration = 0;
  private volume = 1.0;
  private positionInterval: ReturnType<typeof setInterval> | null = null;
  private currentMedia: MediaInfo | null = null;

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  async startDiscovery(
    onDeviceFound: (device: CastDevice) => void,
  ): Promise<void> {
    // Simulate network delay then emit mock devices
    await new Promise((resolve) => setTimeout(resolve, 800));

    for (const device of MOCK_DEVICES) {
      onDeviceFound(device);
    }
  }

  stopDiscovery(): void {
    // No-op for mock
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(device: CastDevice): Promise<CastSession> {
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.connected = true;
    this.notifyState("connected");

    console.log(`[MockCast] Connected to "${device.name}"`);

    return {
      id: `mock-session-${Date.now()}`,
      device,
      state: "connected",
      media: null,
      startedAt: Date.now(),
    };
  }

  async disconnect(): Promise<void> {
    this.stopPlayback();
    this.connected = false;
    this.currentMedia = null;
    this.notifyState("disconnected");
    console.log("[MockCast] Disconnected");
  }

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  async loadMedia(media: MediaInfo): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected");
    }

    this.notifyState("loading");
    console.log(`[MockCast] Loading: "${media.title}" — ${media.url}`);

    // Simulate loading delay
    await new Promise((resolve) => setTimeout(resolve, 1200));

    this.currentMedia = media;
    this.position = media.startPosition ?? 0;
    this.duration = media.duration ?? 3600; // Default 1 hour if unknown
    this.playing = true;

    this.startPositionTracking();
    this.notifyState("playing");

    console.log(
      `[MockCast] Playing: "${media.title}" from ${this.position}s / ${this.duration}s`,
    );
  }

  // -------------------------------------------------------------------------
  // Playback Controls
  // -------------------------------------------------------------------------

  async play(): Promise<void> {
    if (!this.connected) throw new Error("Not connected");
    this.playing = true;
    this.startPositionTracking();
    this.notifyState("playing");
    console.log("[MockCast] Play");
  }

  async pause(): Promise<void> {
    if (!this.connected) throw new Error("Not connected");
    this.playing = false;
    this.stopPositionTracking();
    this.notifyState("paused");
    console.log("[MockCast] Pause");
  }

  async stop(): Promise<void> {
    if (!this.connected) throw new Error("Not connected");
    this.stopPlayback();
    this.notifyState("idle");
    console.log("[MockCast] Stop");
  }

  async seek(positionSeconds: number): Promise<void> {
    if (!this.connected) throw new Error("Not connected");
    this.position = Math.max(0, Math.min(positionSeconds, this.duration));
    this.notifyPosition();
    console.log(`[MockCast] Seek to ${this.position}s`);
  }

  async setVolume(level: number): Promise<void> {
    if (!this.connected) throw new Error("Not connected");
    this.volume = Math.max(0, Math.min(1, level));
    console.log(`[MockCast] Volume: ${Math.round(this.volume * 100)}%`);
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
  // Private
  // -------------------------------------------------------------------------

  private startPositionTracking(): void {
    this.stopPositionTracking();
    this.positionInterval = setInterval(() => {
      if (this.playing) {
        this.position += PLAYBACK_SPEED;
        if (this.position >= this.duration) {
          this.position = this.duration;
          this.playing = false;
          this.stopPositionTracking();
          this.notifyState("idle");
        }
        this.notifyPosition();
      }
    }, 1000);
  }

  private stopPositionTracking(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  private stopPlayback(): void {
    this.playing = false;
    this.position = 0;
    this.stopPositionTracking();
  }

  private notifyState(state: CastSessionState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private notifyPosition(): void {
    for (const listener of this.positionListeners) {
      listener(this.position, this.duration);
    }
  }
}
