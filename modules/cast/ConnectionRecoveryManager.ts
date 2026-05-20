/**
 * ConnectionRecoveryManager — Handles connection loss detection and auto-reconnect.
 *
 * Monitors the active provider's state change events for unexpected disconnection
 * during playback. When connection loss is detected:
 * - Stores the last known playback position
 * - Transitions state to `disconnected`
 * - Emits a `CONNECTION_LOST` error with the last known position
 * - Attempts automatic reconnection up to 3 times with 5-second timeout per attempt
 * - If all attempts fail, emits a final error indicating the device is unreachable
 *
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import { castStore } from "./state";
import type {
  CastDevice,
  CastError,
  CastProvider,
  CastSession,
  CastSessionState,
} from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Timeout per reconnection attempt in milliseconds */
const RECONNECT_TIMEOUT_MS = 5000;

/** Maximum time to display reconnect prompt after connection loss (ms) */
const RECONNECT_PROMPT_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconnectStatus =
  | "idle"
  | "reconnecting"
  | "failed";

export interface ConnectionRecoveryState {
  /** Current reconnect status */
  status: ReconnectStatus;
  /** Number of reconnection attempts made so far */
  attemptsMade: number;
  /** Whether the reconnect prompt should be visible */
  showPrompt: boolean;
  /** Last known playback position when connection was lost */
  lastPosition: number;
}

export type ConnectionRecoveryListener = (state: ConnectionRecoveryState) => void;

// ---------------------------------------------------------------------------
// ConnectionRecoveryManager
// ---------------------------------------------------------------------------

export class ConnectionRecoveryManager {
  private provider: CastProvider | null = null;
  private device: CastDevice | null = null;
  private unsubscribeStateChange: (() => void) | null = null;
  private unsubscribePositionUpdate: (() => void) | null = null;

  /** Last known playback position in seconds */
  private lastKnownPosition = 0;

  /** Whether we are currently in a playback state (playing, paused, buffering) */
  private isInPlaybackState = false;

  /** Current recovery state */
  private recoveryState: ConnectionRecoveryState = {
    status: "idle",
    attemptsMade: 0,
    showPrompt: false,
    lastPosition: 0,
  };

  /** Listeners for recovery state changes */
  private listeners = new Set<ConnectionRecoveryListener>();

  /** Whether reconnection is currently in progress */
  private isReconnecting = false;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start monitoring a provider for unexpected disconnections.
   * Should be called when a cast session becomes active.
   */
  startMonitoring(provider: CastProvider, device: CastDevice): void {
    // Clean up any existing monitoring
    this.stopMonitoring();

    this.provider = provider;
    this.device = device;
    this.lastKnownPosition = 0;
    this.isInPlaybackState = false;

    // Subscribe to state changes from the provider
    this.unsubscribeStateChange = provider.onStateChange(
      this.handleProviderStateChange.bind(this),
    );

    // Subscribe to position updates to track last known position
    this.unsubscribePositionUpdate = provider.onPositionUpdate(
      this.handlePositionUpdate.bind(this),
    );

    this.setRecoveryState({
      status: "idle",
      attemptsMade: 0,
      showPrompt: false,
      lastPosition: 0,
    });
  }

  /**
   * Stop monitoring the provider. Called when session ends normally.
   */
  stopMonitoring(): void {
    if (this.unsubscribeStateChange) {
      this.unsubscribeStateChange();
      this.unsubscribeStateChange = null;
    }

    if (this.unsubscribePositionUpdate) {
      this.unsubscribePositionUpdate();
      this.unsubscribePositionUpdate = null;
    }

    this.provider = null;
    this.device = null;
    this.isReconnecting = false;

    this.setRecoveryState({
      status: "idle",
      attemptsMade: 0,
      showPrompt: false,
      lastPosition: 0,
    });
  }

  /**
   * Subscribe to recovery state changes.
   */
  onRecoveryStateChange(listener: ConnectionRecoveryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get the current recovery state.
   */
  getRecoveryState(): ConnectionRecoveryState {
    return { ...this.recoveryState };
  }

  /**
   * Get the last known playback position.
   */
  getLastKnownPosition(): number {
    return this.lastKnownPosition;
  }

  /**
   * Cancel an in-progress reconnection attempt.
   */
  cancelReconnection(): void {
    this.isReconnecting = false;
    this.setRecoveryState({
      status: "failed",
      attemptsMade: this.recoveryState.attemptsMade,
      showPrompt: false,
      lastPosition: this.lastKnownPosition,
    });
  }

  // -------------------------------------------------------------------------
  // Private — Event Handlers
  // -------------------------------------------------------------------------

  private handleProviderStateChange(state: CastSessionState): void {
    // Track whether we're in a playback state
    const playbackStates: CastSessionState[] = [
      "playing",
      "paused",
      "buffering",
      "loading",
    ];
    const wasInPlayback = this.isInPlaybackState;
    this.isInPlaybackState = playbackStates.includes(state);

    // Detect unexpected disconnection during playback
    if (
      state === "disconnected" &&
      wasInPlayback &&
      !this.isReconnecting
    ) {
      this.handleConnectionLoss();
    }
  }

  private handlePositionUpdate(position: number, _duration: number): void {
    this.lastKnownPosition = position;
  }

  // -------------------------------------------------------------------------
  // Private — Connection Loss & Recovery
  // -------------------------------------------------------------------------

  /**
   * Handle an unexpected connection loss during playback.
   *
   * Req 9.1: Transition to disconnected, emit CONNECTION_LOST with last position
   * Req 9.2: Display reconnect prompt within 2 seconds, attempt auto-reconnect
   */
  private handleConnectionLoss(): void {
    // Req 9.1: Transition state to disconnected
    castStore.setState({
      isConnected: false,
      session: null,
    });

    // Req 9.1: Emit CONNECTION_LOST error with last known playback position
    const connectionLostError: CastError = {
      code: "CONNECTION_LOST",
      message: `Connection lost. Last playback position: ${Math.floor(this.lastKnownPosition)}s.`,
      recoverable: true,
    };
    castStore.setError(connectionLostError);

    // Req 9.2: Show reconnect prompt within 2 seconds and begin auto-reconnect
    this.setRecoveryState({
      status: "reconnecting",
      attemptsMade: 0,
      showPrompt: true,
      lastPosition: this.lastKnownPosition,
    });

    // Begin automatic reconnection attempts
    this.attemptReconnection();
  }

  /**
   * Attempt automatic reconnection up to MAX_RECONNECT_ATTEMPTS times.
   *
   * Req 9.2: Up to 3 attempts with 5-second timeout per attempt
   * Req 9.3: If all fail, dismiss prompt and show error message
   */
  private async attemptReconnection(): Promise<void> {
    if (!this.provider || !this.device) {
      this.handleReconnectionFailed();
      return;
    }

    this.isReconnecting = true;

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      // Check if reconnection was cancelled
      if (!this.isReconnecting) {
        return;
      }

      this.setRecoveryState({
        ...this.recoveryState,
        attemptsMade: attempt,
      });

      try {
        // Attempt connection with timeout
        const connected = await this.tryConnect(this.provider, this.device);

        if (connected && this.isReconnecting) {
          // Reconnection successful
          this.isReconnecting = false;

          // Restore session state
          const session: CastSession = {
            id: `session-${Date.now()}`,
            device: this.device,
            state: "connected",
            media: null,
            startedAt: Date.now(),
          };
          castStore.setSession(session);
          castStore.setError(null);

          this.setRecoveryState({
            status: "idle",
            attemptsMade: attempt,
            showPrompt: false,
            lastPosition: this.lastKnownPosition,
          });

          return;
        }
      } catch {
        // Attempt failed, continue to next attempt
      }
    }

    // All attempts failed
    if (this.isReconnecting) {
      this.handleReconnectionFailed();
    }
  }

  /**
   * Try to connect to the device with a timeout.
   * Returns true if connection succeeds within RECONNECT_TIMEOUT_MS.
   */
  private async tryConnect(
    provider: CastProvider,
    device: CastDevice,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, RECONNECT_TIMEOUT_MS);

      provider
        .connect(device)
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
    });
  }

  /**
   * Handle the case where all reconnection attempts have failed.
   *
   * Req 9.3: Dismiss reconnect prompt, show error indicating device unreachable,
   * transition to disconnected with session: null
   */
  private handleReconnectionFailed(): void {
    this.isReconnecting = false;

    // Req 9.3: Dismiss prompt and show error
    this.setRecoveryState({
      status: "failed",
      attemptsMade: MAX_RECONNECT_ATTEMPTS,
      showPrompt: false,
      lastPosition: this.lastKnownPosition,
    });

    // Req 9.3: Show error indicating device is unreachable
    const unreachableError: CastError = {
      code: "CONNECTION_LOST",
      message: `Device is unreachable after ${MAX_RECONNECT_ATTEMPTS} reconnection attempts. Last position: ${Math.floor(this.lastKnownPosition)}s.`,
      recoverable: false,
    };
    castStore.setError(unreachableError);

    // Ensure state is disconnected with null session
    castStore.setState({
      isConnected: false,
      session: null,
    });
  }

  // -------------------------------------------------------------------------
  // Private — State Management
  // -------------------------------------------------------------------------

  private setRecoveryState(newState: ConnectionRecoveryState): void {
    this.recoveryState = newState;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.recoveryState);
    }
  }
}
