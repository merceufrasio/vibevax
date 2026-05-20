/**
 * useCastSession — React hook for binding UI components to the CastSessionManager.
 *
 * Subscribes to CastState changes and triggers re-renders.
 * All methods delegate to the CastSessionManager singleton.
 *
 * Validates: Requirements 8.4, 8.5
 */

import { useCallback, useEffect, useState } from "react";

import { CastSessionManager } from "../CastSessionManager";
import { castStore } from "../state";
import type { CastDevice, CastMediaParams, CastState } from "../types";

export interface UseCastSessionReturn {
  /** Current cast state (reactive — triggers re-render on change) */
  state: CastState;
  /** Start device discovery across all registered providers */
  startDiscovery: () => Promise<void>;
  /** Stop active discovery and clear discovered devices */
  stopDiscovery: () => void;
  /** Connect to a discovered device */
  connect: (device: CastDevice) => Promise<void>;
  /** Disconnect from the current device */
  disconnect: () => Promise<void>;
  /** Cast media to the connected device */
  castMedia: (params: CastMediaParams) => Promise<void>;
  /** Resume playback */
  play: () => Promise<void>;
  /** Pause playback */
  pause: () => Promise<void>;
  /** Stop playback */
  stop: () => Promise<void>;
  /** Seek to position in seconds */
  seek: (position: number) => Promise<void>;
  /** Set volume level (0.0 - 1.0) */
  setVolume: (level: number) => Promise<void>;
}

/**
 * React hook that provides reactive access to the cast state and
 * exposes all CastSessionManager operations.
 *
 * Preconditions:
 * - Must be called within a React component tree
 * - CastSessionManager should be initialized before using action methods
 *
 * Postconditions:
 * - `state` always reflects the latest CastState from the store
 * - All methods delegate to CastSessionManager singleton
 * - Re-renders component on any state change
 */
export function useCastSession(): UseCastSessionReturn {
  const [state, setState] = useState<CastState>(castStore.getState());

  useEffect(() => {
    // Subscribe to state changes and update local state
    const unsubscribe = castStore.subscribe((newState) => {
      setState(newState);
    });

    // Sync with current state in case it changed between render and effect
    setState(castStore.getState());

    return unsubscribe;
  }, []);

  const startDiscovery = useCallback(async () => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.startDiscovery();
    }
  }, []);

  const stopDiscovery = useCallback(() => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      manager.stopDiscovery();
    }
  }, []);

  const connect = useCallback(async (device: CastDevice) => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.connect(device);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.disconnect();
    }
  }, []);

  const castMedia = useCallback(async (params: CastMediaParams) => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.castMedia(params);
    }
  }, []);

  const play = useCallback(async () => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.play();
    }
  }, []);

  const pause = useCallback(async () => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.pause();
    }
  }, []);

  const stop = useCallback(async () => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.stop();
    }
  }, []);

  const seek = useCallback(async (position: number) => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.seek(position);
    }
  }, []);

  const setVolume = useCallback(async (level: number) => {
    const manager = CastSessionManager.getInstance();
    if (manager) {
      await manager.setVolume(level);
    }
  }, []);

  return {
    state,
    startDiscovery,
    stopDiscovery,
    connect,
    disconnect,
    castMedia,
    play,
    pause,
    stop,
    seek,
    setVolume,
  };
}
