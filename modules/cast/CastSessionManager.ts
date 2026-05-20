/**
 * CastSessionManager — Central orchestrator for the Cast to TV feature.
 *
 * Manages device discovery, session lifecycle, and media playback commands.
 * Implemented as a singleton initialized via `CastSessionManager.initialize()`.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { Platform } from "react-native";

import { ConnectionRecoveryManager } from "./ConnectionRecoveryManager";
import { assertNotDrmProtected } from "./drmDetection";
import { HeadlessExtractService } from "./extraction/HeadlessExtractService";
import { castStore } from "./state";
import type {
  CastConfig,
  CastDevice,
  CastError,
  CastMediaParams,
  CastProvider,
  CastSession,
  MediaInfo,
} from "./types";
import { inferMimeType } from "./utils";

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: CastSessionManager | null = null;

/**
 * CastSessionManager is the single entry point for all cast operations.
 * UI components and hooks interact exclusively with this manager.
 */
export class CastSessionManager {
  private readonly providers: CastProvider[];
  private readonly config: CastConfig;

  /** Tracks whether a discovery scan is currently in progress. */
  private isDiscovering = false;

  /** Timeout handle for the discovery timeout, used to cancel on stopDiscovery. */
  private discoveryTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /** Connection recovery manager for auto-reconnect on connection loss (Req 9.1, 9.2, 9.3). */
  private readonly connectionRecovery: ConnectionRecoveryManager;

  // -------------------------------------------------------------------------
  // Private constructor — use static initialize()
  // -------------------------------------------------------------------------

  private constructor(config: CastConfig, providers: CastProvider[]) {
    this.config = config;
    this.providers = providers;
    this.connectionRecovery = new ConnectionRecoveryManager();
  }

  // -------------------------------------------------------------------------
  // Static Initialization
  // -------------------------------------------------------------------------

  /**
   * Initialize the CastSessionManager singleton.
   *
   * Validates that at least one provider is supplied (Req 14.1).
   * Filters providers based on the current platform:
   *   - Android: only chromecast (Req 14.2)
   *   - iOS: chromecast + airplay (Req 14.3)
   *   - Other: no providers registered (Req 14.4)
   *
   * @throws Error if zero providers are supplied in config
   */
  static initialize(config: CastConfig): CastSessionManager {
    // Req 14.1: reject if zero providers supplied
    if (!config.providers || config.providers.length === 0) {
      throw new Error(
        "[CastSessionManager] Initialization failed: at least one provider is required.",
      );
    }

    // Filter providers based on platform capabilities
    const registeredProviders = filterProvidersByPlatform(config.providers);

    instance = new CastSessionManager(config, registeredProviders);
    return instance;
  }

  /**
   * Returns the current singleton instance, or null if not initialized.
   */
  static getInstance(): CastSessionManager | null {
    return instance;
  }

  /**
   * Destroy the singleton instance. Useful for testing and cleanup.
   */
  static destroy(): void {
    instance = null;
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /**
   * Returns the list of registered (platform-filtered) providers.
   */
  getProviders(): ReadonlyArray<CastProvider> {
    return this.providers;
  }

  /**
   * Returns the current configuration.
   */
  getConfig(): CastConfig {
    return this.config;
  }

  /**
   * Returns the ConnectionRecoveryManager instance for monitoring reconnection state.
   */
  getConnectionRecovery(): ConnectionRecoveryManager {
    return this.connectionRecovery;
  }

  // -------------------------------------------------------------------------
  // Device Discovery
  // -------------------------------------------------------------------------

  /**
   * Start parallel discovery across all registered providers.
   *
   * - Clears previously discovered devices before scanning (Req 1.6)
   * - Runs all providers in parallel (Req 1.1)
   * - Deduplicates by composite key of IP + device name, first-discovered wins (Req 1.2)
   * - Stops all scans after timeout (default 10s) and returns found devices (Req 1.5)
   * - Logs provider errors and continues with remaining providers (Req 1.7)
   * - Updates CastState.isAvailable based on device count (Req 1.3, 1.4)
   */
  async startDiscovery(): Promise<void> {
    // Req 1.6: Clear previously discovered devices on restart
    castStore.setDevices([]);
    this.isDiscovering = true;

    // Map to deduplicate by composite key: `${ip}:${name}`
    const deviceMap = new Map<string, CastDevice>();

    const onDeviceFound = (device: CastDevice): void => {
      // Req 1.2: Deduplicate by IP + name, first-discovered wins
      const key = `${device.ip}:${device.name}`;
      if (!deviceMap.has(key)) {
        deviceMap.set(key, device);
      }
    };

    // Req 1.1: Scan all registered providers in parallel
    const discoveryPromises = this.providers.map((provider) =>
      provider.startDiscovery(onDeviceFound).catch((error) => {
        // Req 1.7: Log provider errors and continue with remaining providers
        console.warn(
          `[CastSessionManager] Provider "${provider.protocol}" discovery failed:`,
          error,
        );
      }),
    );

    // Req 1.5: Stop all scans after timeout and return found devices
    const timeoutPromise = new Promise<void>((resolve) => {
      this.discoveryTimeoutHandle = setTimeout(() => {
        resolve();
      }, this.config.discoveryTimeoutMs);
    });

    // Wait for either all providers to finish or the timeout to fire
    await Promise.race([Promise.all(discoveryPromises), timeoutPromise]);

    // Stop all provider scans
    this.stopProviderScans();

    // Clear the timeout if providers finished before it fired
    if (this.discoveryTimeoutHandle !== null) {
      clearTimeout(this.discoveryTimeoutHandle);
      this.discoveryTimeoutHandle = null;
    }

    this.isDiscovering = false;

    // Update state with discovered devices
    // Req 1.3: isAvailable = true when devices found
    // Req 1.4: isAvailable = false (no error) when zero devices found
    const devices = Array.from(deviceMap.values());
    castStore.setDevices(devices);
  }

  /**
   * Stop all active discovery scans and clear previously discovered devices.
   *
   * Req 1.6: Clear previously discovered devices so no stale devices remain.
   */
  stopDiscovery(): void {
    this.stopProviderScans();

    if (this.discoveryTimeoutHandle !== null) {
      clearTimeout(this.discoveryTimeoutHandle);
      this.discoveryTimeoutHandle = null;
    }

    this.isDiscovering = false;

    // Req 1.6: Clear all previously discovered devices
    castStore.setDevices([]);
  }

  /**
   * Returns whether a discovery scan is currently in progress.
   */
  getIsDiscovering(): boolean {
    return this.isDiscovering;
  }

  // -------------------------------------------------------------------------
  // Device Connection
  // -------------------------------------------------------------------------

  /** Connection timeout in milliseconds (Req 2.3). */
  private static readonly CONNECTION_TIMEOUT_MS = 15000;

  /**
   * Connect to a discovered device.
   *
   * - Routes to the provider matching `device.protocol` (Req 2.1, 2.5)
   * - Transitions state to `connecting` then `connected` on success (Req 2.1, 2.2)
   * - 15-second timeout → CastError with `CONNECTION_FAILED`, recoverable (Req 2.3)
   * - If already connected, disconnects first before new connection (Req 2.6)
   * - Rejects if device not in current discovered list (Req 2.7)
   *
   * @throws CastError with code `CONNECTION_FAILED` on timeout or invalid device
   */
  async connect(device: CastDevice): Promise<void> {
    // Req 2.7: Reject if device not in current discovered devices list
    const state = castStore.getState();
    const isDiscovered = state.devices.some((d) => d.id === device.id);
    if (!isDiscovered) {
      const error: CastError = {
        code: "CONNECTION_FAILED",
        message: `Device "${device.name}" is not in the current discovered devices list.`,
        recoverable: true,
      };
      castStore.setError(error);
      throw error;
    }

    // Req 2.6: If already connected, disconnect first
    if (state.isConnected) {
      await this.disconnect();
    }

    // Find the provider matching the device protocol (Req 2.1, 2.5)
    const provider = this.providers.find((p) => p.protocol === device.protocol);
    if (!provider) {
      const error: CastError = {
        code: "CONNECTION_FAILED",
        message: `No provider registered for protocol "${device.protocol}".`,
        recoverable: false,
      };
      castStore.setError(error);
      throw error;
    }

    // Transition to connecting (Req 2.1)
    // Create a temporary session in "connecting" state
    const connectingSession: CastSession = {
      id: `session-${Date.now()}`,
      device,
      state: "connecting",
      media: null,
      startedAt: Date.now(),
    };
    castStore.setSession(connectingSession);

    // Attempt connection with 15-second timeout (Req 2.3)
    try {
      const session = await Promise.race<CastSession>([
        provider.connect(device),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              createConnectionTimeoutError(device.name),
            );
          }, CastSessionManager.CONNECTION_TIMEOUT_MS);
        }),
      ]);

      // Req 2.2: Transition to connected on success
      const connectedSession: CastSession = {
        ...session,
        state: "connected",
      };
      castStore.setSession(connectedSession);

      // Start monitoring for connection loss (Req 9.1, 9.2, 9.3)
      this.connectionRecovery.startMonitoring(provider, device);
    } catch (error) {
      // Connection failed — reset state
      castStore.setState({
        isConnected: false,
        session: null,
      });

      // If it's already a CastError, re-throw; otherwise wrap it
      if (isCastError(error)) {
        castStore.setError(error);
        throw error;
      }

      const castError: CastError = {
        code: "CONNECTION_FAILED",
        message: `Connection to "${device.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        recoverable: true,
      };
      castStore.setError(castError);
      throw castError;
    }
  }

  /**
   * Disconnect from the current device and clean up session.
   *
   * - Calls provider.disconnect() on the active provider (Req 2.4)
   * - Transitions state to `isConnected: false`, `session: null` (Req 2.4)
   */
  async disconnect(): Promise<void> {
    const state = castStore.getState();

    if (!state.isConnected || !state.session) {
      // Already disconnected — no-op
      return;
    }

    const device = state.session.device;

    // Find the provider matching the session device protocol (Req 2.5)
    const provider = this.providers.find((p) => p.protocol === device.protocol);

    if (provider) {
      try {
        await provider.disconnect();
      } catch (error) {
        console.warn(
          `[CastSessionManager] Error during disconnect from "${device.name}":`,
          error,
        );
      }
    }

    // Stop connection recovery monitoring on normal disconnect
    this.connectionRecovery.stopMonitoring();

    // Req 2.4: Reset state
    castStore.setState({
      isConnected: false,
      session: null,
    });
    castStore.setError(null);
  }

  // -------------------------------------------------------------------------
  // Playback Controls
  // -------------------------------------------------------------------------

  /**
   * Resume playback on the connected device.
   *
   * - Delegates to the active provider's play() method (Req 4.1)
   * - Transitions session state to `playing` on success (Req 4.1)
   * - Rejects with CastError if no active session (Req 4.6)
   * - Emits COMMAND_FAILED error on provider failure (Req 4.7)
   * - Updates CastState within 500ms of provider confirmation (Req 4.8)
   */
  async play(): Promise<void> {
    const provider = this.getActiveProvider();

    try {
      await provider.play();

      // Req 4.1, 4.8: Transition to playing within 500ms of confirmation
      castStore.transitionSessionState("playing");
    } catch (error) {
      this.handleCommandFailure("play", error);
    }
  }

  /**
   * Pause playback on the connected device.
   *
   * - Delegates to the active provider's pause() method (Req 4.2)
   * - Transitions session state to `paused` on success (Req 4.2)
   * - Rejects with CastError if no active session (Req 4.6)
   * - Emits COMMAND_FAILED error on provider failure (Req 4.7)
   * - Updates CastState within 500ms of provider confirmation (Req 4.8)
   */
  async pause(): Promise<void> {
    const provider = this.getActiveProvider();

    try {
      await provider.pause();

      // Req 4.2, 4.8: Transition to paused within 500ms of confirmation
      castStore.transitionSessionState("paused");
    } catch (error) {
      this.handleCommandFailure("pause", error);
    }
  }

  /**
   * Seek to a position on the connected device.
   *
   * - Clamps positionSeconds to [0, playbackDuration] (Req 4.3)
   * - Delegates to the active provider's seek() method (Req 4.3)
   * - Updates playback position on success (Req 4.3, 4.8)
   * - Rejects with CastError if no active session (Req 4.6)
   * - Emits COMMAND_FAILED error on provider failure (Req 4.7)
   */
  async seek(positionSeconds: number): Promise<void> {
    const provider = this.getActiveProvider();

    // Req 4.3: Clamp position to [0, playbackDuration]
    const state = castStore.getState();
    const duration = state.playbackDuration;
    const clampedPosition = Math.max(0, Math.min(positionSeconds, duration));

    try {
      await provider.seek(clampedPosition);

      // Req 4.3, 4.8: Update playback position within 500ms of confirmation
      castStore.setPlaybackPosition(clampedPosition, duration);
    } catch (error) {
      this.handleCommandFailure("seek", error);
    }
  }

  /**
   * Set volume on the connected device.
   *
   * - Clamps level to [0.0, 1.0] (Req 4.4)
   * - Delegates to the active provider's setVolume() method (Req 4.4)
   * - Updates volume in CastState on success (Req 4.4, 4.8)
   * - Rejects with CastError if no active session (Req 4.6)
   * - Emits COMMAND_FAILED error on provider failure (Req 4.7)
   */
  async setVolume(level: number): Promise<void> {
    const provider = this.getActiveProvider();

    // Req 4.4: Clamp volume to [0.0, 1.0]
    const clampedLevel = Math.max(0.0, Math.min(level, 1.0));

    try {
      await provider.setVolume(clampedLevel);

      // Req 4.4, 4.8: Update volume within 500ms of confirmation
      castStore.setVolume(clampedLevel);
    } catch (error) {
      this.handleCommandFailure("setVolume", error);
    }
  }

  /**
   * Stop playback on the connected device.
   *
   * - Delegates to the active provider's stop() method (Req 4.5)
   * - Resets playback position to 0 (Req 4.5)
   * - Transitions session state to `idle` (Req 4.5)
   * - Rejects with CastError if no active session (Req 4.6)
   * - Emits COMMAND_FAILED error on provider failure (Req 4.7)
   * - Updates CastState within 500ms of provider confirmation (Req 4.8)
   */
  async stop(): Promise<void> {
    const provider = this.getActiveProvider();

    try {
      await provider.stop();

      // Req 4.5, 4.8: Reset position to 0 and transition to idle
      const state = castStore.getState();
      castStore.setPlaybackPosition(0, state.playbackDuration);
      castStore.transitionSessionState("idle");
    } catch (error) {
      this.handleCommandFailure("stop", error);
    }
  }

  // -------------------------------------------------------------------------
  // Media Casting
  // -------------------------------------------------------------------------

  /**
   * Cast media to the connected device.
   * Handles stream resolution (direct vs embed) transparently.
   *
   * - Req 3.5: If `params.stream` is null/undefined, throw CastError before any network operation
   * - Req 3.6: If `CastState.isConnected` is false, throw CastError with `CONNECTION_FAILED`
   * - Req 3.7: Transition session to `loading` before stream resolution begins
   * - Req 3.2: If stream `isEmbed`, use HeadlessExtractService to resolve direct URL
   * - Req 3.4: If resolved stream has headers and device `supportsCustomHeaders` is false, throw `HEADERS_REQUIRED`
   * - Req 3.1: Load stream URL, title, MIME type, poster on device via provider.loadMedia()
   * - Req 3.3: Transition from `loading` to `playing` when media loaded successfully
   *
   * @throws CastError with appropriate code on failure
   */
  async castMedia(params: CastMediaParams): Promise<void> {
    // Req 3.5: Validate stream parameter before any network operation
    if (!params.stream) {
      const error: CastError = {
        code: "MEDIA_LOAD_FAILED",
        message: "Cannot cast media: stream parameter is null or undefined.",
        recoverable: false,
      };
      castStore.setError(error);
      throw error;
    }

    // Req 3.6: Validate connection state
    const state = castStore.getState();
    if (!state.isConnected || !state.session) {
      const error: CastError = {
        code: "CONNECTION_FAILED",
        message:
          "Cannot cast media: not connected to a device. Connect to a device first.",
        recoverable: true,
      };
      castStore.setError(error);
      throw error;
    }

    // Req 3.7: Transition session to `loading` before stream resolution begins
    castStore.transitionSessionState("loading");

    // Req 9.4: Detect DRM-protected streams before attempting to cast
    try {
      if (params.stream.url) {
        assertNotDrmProtected(params.stream);
      }
    } catch (drmError) {
      castStore.setError(drmError as CastError);
      castStore.transitionSessionState("error");
      throw drmError;
    }

    // Get the active provider for the connected device
    const provider = this.providers.find(
      (p) => p.protocol === state.session!.device.protocol,
    );

    if (!provider) {
      const error: CastError = {
        code: "COMMAND_FAILED",
        message: `No provider registered for protocol "${state.session!.device.protocol}".`,
        recoverable: false,
      };
      castStore.setError(error);
      throw error;
    }

    try {
      let resolvedStream = params.stream;

      // Req 3.2: If stream is embed, use HeadlessExtractService to resolve direct URL
      if (HeadlessExtractService.needsExtraction(params.stream)) {
        // In dev mode with MockCastProvider, headless extraction won't work
        // because there's no real WebView. Skip extraction and use the URL as-is.
        if (__DEV__) {
          console.warn(
            "[CastSessionManager] Embed stream detected in dev mode — skipping extraction, using URL directly:",
            params.stream.url,
          );
          resolvedStream = {
            ...params.stream,
            isEmbed: false,
          };
        } else {
          const extractService = new HeadlessExtractService();
          resolvedStream = await extractService.extractStream({
            embedUrl: params.stream.url,
            sourceId: params.sourceId,
            headers: params.stream.headers,
            timeoutMs: this.config.extractionTimeoutMs,
          });
        }
      }

      // Req 3.4: Check if stream requires custom headers and device doesn't support them
      const needsHeaders =
        resolvedStream.headers &&
        Object.keys(resolvedStream.headers).length > 0;
      const deviceSupportsHeaders =
        state.session!.device.capabilities.supportsCustomHeaders;

      if (needsHeaders && !deviceSupportsHeaders) {
        const error: CastError = {
          code: "HEADERS_REQUIRED",
          message:
            "This stream requires custom headers but the connected device does not support them.",
          recoverable: false,
        };
        castStore.setError(error);
        throw error;
      }

      // Infer MIME type from the resolved stream URL
      const mimeType =
        resolvedStream.mimeType ?? inferMimeType(resolvedStream.url);

      // Build MediaInfo for the provider
      const mediaInfo: MediaInfo = {
        url: resolvedStream.url,
        title: params.title,
        subtitle: params.subtitle,
        posterUrl: params.posterUrl,
        mimeType,
        headers: needsHeaders ? resolvedStream.headers : undefined,
        startPosition: params.startPosition,
        sourceId: params.sourceId,
      };

      // Req 3.1: Load media on the connected device via provider
      await provider.loadMedia(mediaInfo);

      // Req 3.3: Transition from `loading` to `playing` when media loaded successfully
      castStore.transitionSessionState("playing");
    } catch (error) {
      // If it's already a CastError, re-throw
      if (isCastError(error)) {
        throw error;
      }

      // Wrap unknown errors
      const castError: CastError = {
        code: "MEDIA_LOAD_FAILED",
        message: `Failed to cast media: ${error instanceof Error ? error.message : String(error)}`,
        recoverable: true,
      };
      castStore.setError(castError);
      throw castError;
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Get the active provider for the current session.
   *
   * Req 4.6: Rejects with CastError if no active session exists.
   * Req 2.5: Routes to provider matching session.device.protocol.
   *
   * @throws CastError if no active session or no matching provider
   */
  private getActiveProvider(): CastProvider {
    const state = castStore.getState();

    if (!state.isConnected || !state.session) {
      const error: CastError = {
        code: "COMMAND_FAILED",
        message: "No active cast session. Connect to a device first.",
        recoverable: false,
      };
      castStore.setError(error);
      throw error;
    }

    const provider = this.providers.find(
      (p) => p.protocol === state.session!.device.protocol,
    );

    if (!provider) {
      const error: CastError = {
        code: "COMMAND_FAILED",
        message: `No provider registered for protocol "${state.session.device.protocol}".`,
        recoverable: false,
      };
      castStore.setError(error);
      throw error;
    }

    return provider;
  }

  /**
   * Handle a provider command failure.
   *
   * Req 4.7: Emit CastError with code COMMAND_FAILED, remain in current state.
   */
  private handleCommandFailure(command: string, error: unknown): void {
    const castError: CastError = {
      code: "COMMAND_FAILED",
      message: `Command "${command}" failed: ${error instanceof Error ? error.message : String(error)}`,
      recoverable: true,
    };
    castStore.setError(castError);
    throw castError;
  }

  /**
   * Stop all provider scans. Called internally by both startDiscovery
   * (after timeout) and stopDiscovery.
   */
  private stopProviderScans(): void {
    for (const provider of this.providers) {
      try {
        provider.stopDiscovery();
      } catch (error) {
        console.warn(
          `[CastSessionManager] Error stopping provider "${provider.protocol}":`,
          error,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Platform-based Provider Filtering
// ---------------------------------------------------------------------------

/**
 * Filters the supplied providers based on the current platform.
 *
 * - Android: only providers with protocol "chromecast" (Req 14.2)
 * - iOS: only providers with protocol "chromecast" or "airplay" (Req 14.3)
 * - Other platforms: no providers registered (Req 14.4)
 */
function filterProvidersByPlatform(providers: CastProvider[]): CastProvider[] {
  const platform = Platform.OS;

  switch (platform) {
    case "android":
      // Req 14.2: Android registers ChromecastProvider only
      return providers.filter((p) => p.protocol === "chromecast");

    case "ios":
      // Req 14.3: iOS registers ChromecastProvider + AirPlayProvider
      return providers.filter(
        (p) => p.protocol === "chromecast" || p.protocol === "airplay",
      );

    default:
      // Req 14.4: Other platforms — no providers, no cast functionality
      return [];
  }
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

/**
 * Type guard to check if an unknown value is a CastError.
 */
function isCastError(value: unknown): value is CastError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    "recoverable" in value
  );
}

/**
 * Create a connection timeout CastError (Req 2.3).
 */
function createConnectionTimeoutError(deviceName: string): CastError {
  return {
    code: "CONNECTION_FAILED",
    message: `Connection to "${deviceName}" timed out after 15 seconds.`,
    recoverable: true,
  };
}
