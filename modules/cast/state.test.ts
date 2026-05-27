/**
 * Unit tests for the CastState observable store and state machine logic.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { castStore, transitionState } from "./state";
import type { CastSession, CastDevice, CastSessionState } from "./types";
import { VALID_TRANSITIONS } from "./types";

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

// ---------------------------------------------------------------------------
// transitionState function tests
// ---------------------------------------------------------------------------

describe("transitionState", () => {
  it("allows valid transitions", () => {
    expect(transitionState("disconnected", "connecting")).toBe("connecting");
    expect(transitionState("connecting", "connected")).toBe("connected");
    expect(transitionState("connected", "loading")).toBe("loading");
    expect(transitionState("loading", "playing")).toBe("playing");
    expect(transitionState("playing", "paused")).toBe("paused");
    expect(transitionState("paused", "playing")).toBe("playing");
    expect(transitionState("playing", "buffering")).toBe("buffering");
    expect(transitionState("buffering", "playing")).toBe("playing");
    expect(transitionState("playing", "idle")).toBe("idle");
    expect(transitionState("idle", "loading")).toBe("loading");
    expect(transitionState("error", "connecting")).toBe("connecting");
  });

  it("rejects invalid transitions and returns current state", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(transitionState("disconnected", "playing")).toBe("disconnected");
    expect(transitionState("playing", "connecting")).toBe("playing");
    expect(transitionState("idle", "playing")).toBe("idle");
    expect(transitionState("connected", "playing")).toBe("connected");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("logs a warning for invalid transitions", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    transitionState("disconnected", "playing");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid transition: disconnected → playing"),
    );
    warnSpy.mockRestore();
  });

  it("validates all transitions in VALID_TRANSITIONS map", () => {
    const allStates: CastSessionState[] = Object.keys(
      VALID_TRANSITIONS,
    ) as CastSessionState[];

    for (const from of allStates) {
      for (const to of VALID_TRANSITIONS[from]) {
        expect(transitionState(from, to)).toBe(to);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// castStore tests
// ---------------------------------------------------------------------------

describe("castStore", () => {
  beforeEach(() => {
    castStore.reset();
  });

  describe("initial state", () => {
    it("starts with correct defaults", () => {
      const state = castStore.getState();
      expect(state.isAvailable).toBe(false);
      expect(state.isConnected).toBe(false);
      expect(state.session).toBeNull();
      expect(state.devices).toEqual([]);
      expect(state.playbackPosition).toBe(0);
      expect(state.playbackDuration).toBe(0);
      expect(state.volume).toBe(1.0);
      expect(state.isMuted).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("subscribe", () => {
    it("notifies listeners on state change", () => {
      const listener = vi.fn();
      castStore.subscribe(listener);

      castStore.setDevices([makeMockDevice()]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isAvailable: true }),
      );
    });

    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = castStore.subscribe(listener);

      unsubscribe();
      castStore.setDevices([makeMockDevice()]);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("setDevices", () => {
    it("updates devices and sets isAvailable to true when devices exist", () => {
      const devices = [makeMockDevice()];
      castStore.setDevices(devices);

      const state = castStore.getState();
      expect(state.devices).toEqual(devices);
      expect(state.isAvailable).toBe(true);
    });

    it("sets isAvailable to false when devices array is empty", () => {
      castStore.setDevices([makeMockDevice()]);
      castStore.setDevices([]);

      const state = castStore.getState();
      expect(state.devices).toEqual([]);
      expect(state.isAvailable).toBe(false);
    });
  });

  describe("setSession", () => {
    it("sets session and marks isConnected true", () => {
      const session = makeMockSession();
      castStore.setSession(session);

      const state = castStore.getState();
      expect(state.session).toEqual(session);
      expect(state.isConnected).toBe(true);
    });

    it("clears session and marks isConnected false when set to null", () => {
      castStore.setSession(makeMockSession());
      castStore.setSession(null);

      const state = castStore.getState();
      expect(state.session).toBeNull();
      expect(state.isConnected).toBe(false);
    });
  });

  describe("transitionSessionState", () => {
    it("applies valid transitions", () => {
      castStore.setSession(makeMockSession({ state: "connected" }));

      const result = castStore.transitionSessionState("loading");
      expect(result).toBe(true);
      expect(castStore.getState().session?.state).toBe("loading");
    });

    it("rejects invalid transitions", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      castStore.setSession(makeMockSession({ state: "connected" }));

      const result = castStore.transitionSessionState("playing");
      expect(result).toBe(false);
      expect(castStore.getState().session?.state).toBe("connected");

      warnSpy.mockRestore();
    });

    it("returns false when no session exists", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = castStore.transitionSessionState("connecting");
      expect(result).toBe(false);

      warnSpy.mockRestore();
    });

    it("clears session when transitioning to disconnected", () => {
      castStore.setSession(makeMockSession({ state: "connected" }));
      castStore.transitionSessionState("disconnected");

      const state = castStore.getState();
      expect(state.session).toBeNull();
      expect(state.isConnected).toBe(false);
    });
  });

  describe("invariant: session is null when isConnected is false (Req 5.4)", () => {
    it("forces session to null when isConnected is set to false", () => {
      castStore.setSession(makeMockSession());
      castStore.setState({ isConnected: false });

      expect(castStore.getState().session).toBeNull();
    });

    it("session remains null after reset", () => {
      castStore.setSession(makeMockSession());
      castStore.reset();

      const state = castStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.session).toBeNull();
    });
  });

  describe("setPlaybackPosition", () => {
    it("updates position and duration", () => {
      castStore.setPlaybackPosition(30, 120);

      const state = castStore.getState();
      expect(state.playbackPosition).toBe(30);
      expect(state.playbackDuration).toBe(120);
    });
  });

  describe("setVolume", () => {
    it("updates volume", () => {
      castStore.setVolume(0.5);
      expect(castStore.getState().volume).toBe(0.5);
    });

    it("updates volume and muted state together", () => {
      castStore.setVolume(0, true);

      const state = castStore.getState();
      expect(state.volume).toBe(0);
      expect(state.isMuted).toBe(true);
    });
  });

  describe("setError", () => {
    it("sets error", () => {
      const error = {
        code: "CONNECTION_FAILED" as const,
        message: "Timed out",
        recoverable: true,
      };
      castStore.setError(error);
      expect(castStore.getState().error).toEqual(error);
    });

    it("clears error when set to null", () => {
      castStore.setError({
        code: "CONNECTION_FAILED",
        message: "Timed out",
        recoverable: true,
      });
      castStore.setError(null);
      expect(castStore.getState().error).toBeNull();
    });
  });

  describe("position preservation on session loss (Req 9.4, 9.5)", () => {
    it("preserves position when session is disconnected via setSession(null)", () => {
      // Set up an active session with playback position
      castStore.setSession(makeMockSession({ state: "connected" }));
      castStore.setPlaybackPosition(45, 120);

      // Disconnect
      castStore.setSession(null);

      // Position should be preserved in lastCastPosition
      const state = castStore.getState();
      expect(state.lastCastPosition).toEqual({ position: 45, duration: 120 });
    });

    it("preserves position when transitioning to disconnected state", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      castStore.setPlaybackPosition(90, 200);

      // Transition to disconnected
      castStore.transitionSessionState("disconnected");

      const state = castStore.getState();
      expect(state.lastCastPosition).toEqual({ position: 90, duration: 200 });
    });

    it("preserves position on unexpected disconnect (setState isConnected: false)", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      castStore.setPlaybackPosition(60, 180);

      // Simulate unexpected disconnect
      castStore.setState({ isConnected: false });

      const state = castStore.getState();
      expect(state.lastCastPosition).toEqual({ position: 60, duration: 180 });
    });

    it("does not preserve position when there was no meaningful playback", () => {
      castStore.setSession(makeMockSession({ state: "connected" }));
      // Position stays at 0, duration stays at 0

      castStore.setSession(null);

      const state = castStore.getState();
      expect(state.lastCastPosition).toBeNull();
    });

    it("does not reset playbackPosition and playbackDuration on disconnect", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      castStore.setPlaybackPosition(75, 300);

      castStore.setSession(null);

      const state = castStore.getState();
      // The raw position/duration fields remain unchanged
      expect(state.playbackPosition).toBe(75);
      expect(state.playbackDuration).toBe(300);
    });

    it("getLastCastPosition returns the preserved position", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      castStore.setPlaybackPosition(30, 100);

      castStore.setSession(null);

      expect(castStore.getLastCastPosition()).toEqual({ position: 30, duration: 100 });
    });

    it("getLastCastPosition returns null when no session has ended", () => {
      expect(castStore.getLastCastPosition()).toBeNull();
    });

    it("clearLastCastPosition clears the preserved position", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      castStore.setPlaybackPosition(50, 150);
      castStore.setSession(null);

      expect(castStore.getLastCastPosition()).not.toBeNull();

      castStore.clearLastCastPosition();

      expect(castStore.getLastCastPosition()).toBeNull();
      expect(castStore.getState().lastCastPosition).toBeNull();
    });

    it("lastCastPosition is null in initial state", () => {
      expect(castStore.getState().lastCastPosition).toBeNull();
    });

    it("lastCastPosition is null after reset", () => {
      castStore.setSession(makeMockSession({ state: "playing" }));
      castStore.setPlaybackPosition(50, 150);
      castStore.setSession(null);

      castStore.reset();

      expect(castStore.getState().lastCastPosition).toBeNull();
    });
  });
});
