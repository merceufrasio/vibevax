/**
 * Observable CastState store with state machine logic.
 *
 * Uses an EventEmitter-based pattern to provide reactive state updates.
 * Enforces the VALID_TRANSITIONS map so that only legal session state
 * transitions are applied. Invalid transitions are logged as warnings
 * and silently rejected.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */

import type {
  CastState,
  CastSessionState,
  CastSession,
  CastDevice,
  CastError,
} from "./types";
import { VALID_TRANSITIONS } from "./types";

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

const INITIAL_STATE: CastState = {
  isAvailable: false,
  isConnected: false,
  session: null,
  devices: [],
  playbackPosition: 0,
  playbackDuration: 0,
  volume: 1.0,
  isMuted: false,
  error: null,
  lastCastPosition: null,
};

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

/**
 * Attempt a state transition. Returns the new state if the transition is
 * valid according to VALID_TRANSITIONS, otherwise returns the current state
 * and logs a warning.
 *
 * @param current - The current session state
 * @param next - The desired target state
 * @returns The resulting state after the transition attempt
 */
export function transitionState(
  current: CastSessionState,
  next: CastSessionState,
): CastSessionState {
  const allowed = VALID_TRANSITIONS[current];
  if (allowed.includes(next)) {
    return next;
  }

  console.warn(`[CastState] Invalid transition: ${current} → ${next}`);
  return current;
}

// ---------------------------------------------------------------------------
// Observable Store
// ---------------------------------------------------------------------------

export type CastStateListener = (state: CastState) => void;

/**
 * Creates and returns the singleton CastState store.
 * Provides methods to read, update, and subscribe to state changes.
 */
function createCastStore() {
  let state: CastState = { ...INITIAL_STATE };
  const listeners = new Set<CastStateListener>();

  function getState(): CastState {
    return state;
  }

  function setState(partial: Partial<CastState>): void {
    const previousState = state;
    state = { ...state, ...partial };

    // Invariant: session must be null when not connected (Requirement 5.4)
    if (!state.isConnected) {
      state = { ...state, session: null };
    }

    // Req 9.4, 9.5: Preserve last cast position when session ends
    // Snapshot position when transitioning from connected to disconnected
    if (previousState.isConnected && !state.isConnected) {
      const position = previousState.playbackPosition;
      const duration = previousState.playbackDuration;
      // Only preserve if there was meaningful playback (position > 0 or duration > 0)
      if (position > 0 || duration > 0) {
        state = {
          ...state,
          lastCastPosition: { position, duration },
        };
      }
    }

    notify();
  }

  function subscribe(listener: CastStateListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function notify(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function reset(): void {
    state = { ...INITIAL_STATE };
    notify();
  }

  // -------------------------------------------------------------------------
  // State update methods with transition validation
  // -------------------------------------------------------------------------

  /**
   * Transition the session state, enforcing the valid transitions map.
   * If the transition is invalid, the state remains unchanged and a
   * warning is logged.
   *
   * @returns true if the transition was applied, false otherwise
   */
  function transitionSessionState(next: CastSessionState): boolean {
    if (!state.session) {
      // No active session — only allow creating one via setSession
      console.warn(
        `[CastState] Cannot transition session state: no active session`,
      );
      return false;
    }

    const current = state.session.state;
    const result = transitionState(current, next);

    if (result === current && result !== next) {
      // Transition was rejected
      return false;
    }

    const updatedSession: CastSession = { ...state.session, state: result };

    // If transitioning to disconnected, clear the session and connection
    if (result === "disconnected") {
      setState({
        isConnected: false,
        session: null,
      });
    } else {
      setState({ session: updatedSession });
    }

    return true;
  }

  /**
   * Set the active session. Validates that the transition from the current
   * state (or from disconnected if no session exists) is valid.
   */
  function setSession(session: CastSession | null): void {
    if (session === null) {
      setState({
        isConnected: false,
        session: null,
      });
      return;
    }

    // If there's an existing session, validate the transition
    if (state.session) {
      const result = transitionState(state.session.state, session.state);
      if (result !== session.state) {
        // Invalid transition
        return;
      }
    }

    setState({
      isConnected: true,
      session,
    });
  }

  /**
   * Update discovered devices and availability flag.
   */
  function setDevices(devices: CastDevice[]): void {
    setState({
      devices,
      isAvailable: devices.length > 0,
    });
  }

  /**
   * Update playback position and duration.
   */
  function setPlaybackPosition(position: number, duration: number): void {
    setState({
      playbackPosition: position,
      playbackDuration: duration,
    });
  }

  /**
   * Update volume level.
   */
  function setVolume(volume: number, isMuted?: boolean): void {
    const update: Partial<CastState> = { volume };
    if (isMuted !== undefined) {
      update.isMuted = isMuted;
    }
    setState(update);
  }

  /**
   * Set or clear the current error.
   */
  function setError(error: CastError | null): void {
    setState({ error });
  }

  /**
   * Get the last cast position preserved after session loss.
   * Returns the position/duration snapshot, or null if no session has ended
   * with a valid position.
   * Req 9.4, 9.5: Expose last cast position as startPosition for local playback resumption.
   */
  function getLastCastPosition(): { position: number; duration: number } | null {
    return state.lastCastPosition;
  }

  /**
   * Clear the last cast position (e.g., after local playback has resumed from it).
   */
  function clearLastCastPosition(): void {
    setState({ lastCastPosition: null });
  }

  return {
    getState,
    setState,
    subscribe,
    reset,
    transitionSessionState,
    setSession,
    setDevices,
    setPlaybackPosition,
    setVolume,
    setError,
    getLastCastPosition,
    clearLastCastPosition,
  };
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

export const castStore = createCastStore();
