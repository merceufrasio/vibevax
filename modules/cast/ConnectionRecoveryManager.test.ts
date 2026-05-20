/**
 * Unit tests for ConnectionRecoveryManager.
 *
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { ConnectionRecoveryManager } from "./ConnectionRecoveryManager";
import { castStore } from "./state";
import type { CastDevice, CastProvider, CastSession, CastSessionState } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDevice(overrides?: Partial<CastDevice>): CastDevice {
  return {
    id: "device-1",
    name: "Living Room TV",
    ip: "192.168.1.100",
    port: 8009,
    protocol: "chromecast",
    capabilities: {
      supportsHls: true,
      supportsDash: false,
      supportsMp4: true,
      supportsSubtitles: true,
      supportsCustomHeaders: false,
    },
    ...overrides,
  };
}

function makeMockSession(overrides?: Partial<CastSession>): CastSession {
  return {
    id: "session-1",
    device: makeMockDevice(),
    state: "connected",
    media: null,
    startedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a mock CastProvider with controllable state change and position listeners.
 */
function createMockProvider(): CastProvider & {
  triggerStateChange: (state: CastSessionState) => void;
  triggerPositionUpdate: (position: number, duration: number) => void;
  connectResolve: (() => void) | null;
  connectReject: ((err: Error) => void) | null;
} {
  let stateListener: ((state: CastSessionState) => void) | null = null;
  let positionListener: ((position: number, duration: number) => void) | null = null;
  let connectResolve: (() => void) | null = null;
  let connectReject: ((err: Error) => void) | null = null;

  const provider = {
    protocol: "chromecast" as const,
    connectResolve: null as (() => void) | null,
    connectReject: null as ((err: Error) => void) | null,

    startDiscovery: vi.fn().mockResolvedValue(undefined),
    stopDiscovery: vi.fn(),
    connect: vi.fn().mockImplementation(() => {
      return new Promise<CastSession>((resolve, reject) => {
        connectResolve = () => resolve(makeMockSession());
        connectReject = reject;
        provider.connectResolve = connectResolve;
        provider.connectReject = connectReject;
      });
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    loadMedia: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),

    onStateChange: vi.fn((listener: (state: CastSessionState) => void) => {
      stateListener = listener;
      return () => { stateListener = null; };
    }),
    onPositionUpdate: vi.fn((listener: (position: number, duration: number) => void) => {
      positionListener = listener;
      return () => { positionListener = null; };
    }),

    triggerStateChange(state: CastSessionState) {
      stateListener?.(state);
    },
    triggerPositionUpdate(position: number, duration: number) {
      positionListener?.(position, duration);
    },
  };

  return provider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConnectionRecoveryManager", () => {
  let manager: ConnectionRecoveryManager;
  let provider: ReturnType<typeof createMockProvider>;
  let device: CastDevice;

  beforeEach(() => {
    vi.useFakeTimers();
    castStore.reset();
    manager = new ConnectionRecoveryManager();
    provider = createMockProvider();
    device = makeMockDevice();
  });

  afterEach(() => {
    manager.stopMonitoring();
    vi.useRealTimers();
  });

  describe("startMonitoring", () => {
    it("subscribes to provider state changes and position updates", () => {
      manager.startMonitoring(provider, device);

      expect(provider.onStateChange).toHaveBeenCalledTimes(1);
      expect(provider.onPositionUpdate).toHaveBeenCalledTimes(1);
    });

    it("initializes recovery state to idle", () => {
      manager.startMonitoring(provider, device);

      const state = manager.getRecoveryState();
      expect(state.status).toBe("idle");
      expect(state.attemptsMade).toBe(0);
      expect(state.showPrompt).toBe(false);
    });
  });

  describe("connection loss detection (Req 9.1)", () => {
    it("detects connection loss during playback and transitions to disconnected", () => {
      // Set up an active session
      castStore.setSession(makeMockSession({ state: "playing" }));
      manager.startMonitoring(provider, device);

      // Simulate playback state
      provider.triggerStateChange("playing");
      // Simulate position updates
      provider.triggerPositionUpdate(45, 120);

      // Simulate unexpected disconnection
      provider.triggerStateChange("disconnected");

      const castState = castStore.getState();
      expect(castState.isConnected).toBe(false);
      expect(castState.session).toBeNull();
    });

    it("emits CONNECTION_LOST error with last known playback position", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      manager.startMonitoring(provider, device);

      // Simulate playback
      provider.triggerStateChange("playing");
      provider.triggerPositionUpdate(67.5, 120);

      // Simulate disconnection
      provider.triggerStateChange("disconnected");

      const castState = castStore.getState();
      expect(castState.error).not.toBeNull();
      expect(castState.error!.code).toBe("CONNECTION_LOST");
      expect(castState.error!.message).toContain("67");
      expect(castState.error!.recoverable).toBe(true);
    });

    it("does not trigger recovery when not in playback state", () => {
      castStore.setSession(makeMockSession({ state: "connected" }));
      manager.startMonitoring(provider, device);

      // Simulate idle state then disconnection (normal disconnect)
      provider.triggerStateChange("idle");
      provider.triggerStateChange("disconnected");

      const state = manager.getRecoveryState();
      expect(state.status).toBe("idle");
    });
  });

  describe("auto-reconnect (Req 9.2)", () => {
    it("shows reconnect prompt on connection loss", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      manager.startMonitoring(provider, device);

      provider.triggerStateChange("playing");
      provider.triggerStateChange("disconnected");

      const state = manager.getRecoveryState();
      expect(state.showPrompt).toBe(true);
      expect(state.status).toBe("reconnecting");
    });

    it("attempts reconnection up to 3 times", async () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      manager.startMonitoring(provider, device);

      // Make connect always fail
      provider.connect.mockRejectedValue(new Error("Connection refused"));

      provider.triggerStateChange("playing");
      provider.triggerStateChange("disconnected");

      // Let all reconnection attempts complete (3 attempts × 5s timeout)
      await vi.advanceTimersByTimeAsync(5000); // attempt 1
      await vi.advanceTimersByTimeAsync(5000); // attempt 2
      await vi.advanceTimersByTimeAsync(5000); // attempt 3

      expect(provider.connect).toHaveBeenCalledTimes(3);
    });

    it("restores session on successful reconnection", async () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      manager.startMonitoring(provider, device);

      // Make connect succeed on first attempt
      provider.connect.mockResolvedValue(makeMockSession());

      provider.triggerStateChange("playing");
      provider.triggerPositionUpdate(30, 120);
      provider.triggerStateChange("disconnected");

      // Let the reconnection attempt complete
      await vi.advanceTimersByTimeAsync(100);

      const castState = castStore.getState();
      expect(castState.isConnected).toBe(true);
      expect(castState.session).not.toBeNull();
      expect(castState.error).toBeNull();

      const recoveryState = manager.getRecoveryState();
      expect(recoveryState.status).toBe("idle");
      expect(recoveryState.showPrompt).toBe(false);
    });
  });

  describe("reconnection failure (Req 9.3)", () => {
    it("dismisses prompt and shows error when all attempts fail", async () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      manager.startMonitoring(provider, device);

      // Make connect always fail
      provider.connect.mockRejectedValue(new Error("Connection refused"));

      provider.triggerStateChange("playing");
      provider.triggerStateChange("disconnected");

      // Let all reconnection attempts complete
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      const recoveryState = manager.getRecoveryState();
      expect(recoveryState.status).toBe("failed");
      expect(recoveryState.showPrompt).toBe(false);

      const castState = castStore.getState();
      expect(castState.error).not.toBeNull();
      expect(castState.error!.code).toBe("CONNECTION_LOST");
      expect(castState.error!.recoverable).toBe(false);
      expect(castState.error!.message).toContain("unreachable");
      expect(castState.isConnected).toBe(false);
      expect(castState.session).toBeNull();
    });
  });

  describe("stopMonitoring", () => {
    it("cleans up subscriptions and resets state", () => {
      manager.startMonitoring(provider, device);
      manager.stopMonitoring();

      const state = manager.getRecoveryState();
      expect(state.status).toBe("idle");
      expect(state.showPrompt).toBe(false);
    });
  });

  describe("position tracking", () => {
    it("tracks last known position from position updates", () => {
      manager.startMonitoring(provider, device);

      provider.triggerPositionUpdate(10, 120);
      expect(manager.getLastKnownPosition()).toBe(10);

      provider.triggerPositionUpdate(25.5, 120);
      expect(manager.getLastKnownPosition()).toBe(25.5);
    });
  });

  describe("recovery state listener", () => {
    it("notifies listeners on recovery state changes", () => {
      const listener = vi.fn();
      manager.onRecoveryStateChange(listener);
      manager.startMonitoring(provider, device);

      // Listener called on startMonitoring (sets idle state)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: "idle" }),
      );
    });

    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = manager.onRecoveryStateChange(listener);

      unsubscribe();
      manager.startMonitoring(provider, device);

      // Should not be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
