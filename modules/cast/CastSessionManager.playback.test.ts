/**
 * Unit tests for CastSessionManager playback controls.
 *
 * Tests play(), pause(), seek(), setVolume(), and stop() methods.
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { castStore } from "./state";
import { CastSessionManager } from "./CastSessionManager";
import type {
  CastDevice,
  CastError,
  CastProvider,
  CastSession,
  CastSessionState,
  MediaInfo,
} from "./types";

// ---------------------------------------------------------------------------
// Mock react-native Platform
// ---------------------------------------------------------------------------

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockDevice(
  protocol: "chromecast" | "airplay" | "dlna" = "chromecast",
): CastDevice {
  return {
    id: "device-1",
    name: "Living Room TV",
    ip: "192.168.1.100",
    port: 8009,
    protocol,
    capabilities: {
      supportsHls: true,
      supportsDash: false,
      supportsMp4: true,
      supportsSubtitles: true,
      supportsCustomHeaders: false,
    },
  };
}

function createMockProvider(
  protocol: "chromecast" | "airplay" | "dlna" = "chromecast",
): CastProvider {
  return {
    protocol,
    startDiscovery: vi.fn().mockResolvedValue(undefined),
    stopDiscovery: vi.fn(),
    connect: vi.fn().mockResolvedValue({
      id: "session-1",
      device: createMockDevice(protocol),
      state: "connected" as CastSessionState,
      media: null,
      startedAt: Date.now(),
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    loadMedia: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),
    onStateChange: vi.fn().mockReturnValue(() => {}),
    onPositionUpdate: vi.fn().mockReturnValue(() => {}),
  };
}

function setupConnectedSession(
  protocol: "chromecast" | "airplay" | "dlna" = "chromecast",
): void {
  const device = createMockDevice(protocol);
  const session: CastSession = {
    id: "session-1",
    device,
    state: "playing",
    media: null,
    startedAt: Date.now(),
  };
  castStore.setSession(session);
  castStore.setPlaybackPosition(30, 120);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CastSessionManager - Playback Controls", () => {
  let manager: CastSessionManager;
  let mockProvider: CastProvider;

  beforeEach(() => {
    CastSessionManager.destroy();
    castStore.reset();

    mockProvider = createMockProvider("chromecast");

    manager = CastSessionManager.initialize({
      providers: [mockProvider],
      extractionTimeoutMs: 15000,
      discoveryTimeoutMs: 10000,
    });
  });

  afterEach(() => {
    CastSessionManager.destroy();
    castStore.reset();
  });

  // -------------------------------------------------------------------------
  // Req 4.6: Reject commands when no active session
  // -------------------------------------------------------------------------

  describe("No active session (Req 4.6)", () => {
    it("play() throws CastError when no session is active", async () => {
      await expect(manager.play()).rejects.toMatchObject({
        code: "COMMAND_FAILED",
        message: expect.stringContaining("No active cast session"),
      });
    });

    it("pause() throws CastError when no session is active", async () => {
      await expect(manager.pause()).rejects.toMatchObject({
        code: "COMMAND_FAILED",
        message: expect.stringContaining("No active cast session"),
      });
    });

    it("seek() throws CastError when no session is active", async () => {
      await expect(manager.seek(10)).rejects.toMatchObject({
        code: "COMMAND_FAILED",
        message: expect.stringContaining("No active cast session"),
      });
    });

    it("setVolume() throws CastError when no session is active", async () => {
      await expect(manager.setVolume(0.5)).rejects.toMatchObject({
        code: "COMMAND_FAILED",
        message: expect.stringContaining("No active cast session"),
      });
    });

    it("stop() throws CastError when no session is active", async () => {
      await expect(manager.stop()).rejects.toMatchObject({
        code: "COMMAND_FAILED",
        message: expect.stringContaining("No active cast session"),
      });
    });

    it("sets error in castStore when no session", async () => {
      try {
        await manager.play();
      } catch {
        // expected
      }
      const state = castStore.getState();
      expect(state.error).not.toBeNull();
      expect(state.error!.code).toBe("COMMAND_FAILED");
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.1: play() delegates and transitions to playing
  // -------------------------------------------------------------------------

  describe("play() (Req 4.1)", () => {
    beforeEach(() => {
      setupConnectedSession();
      // Set state to paused so transition to playing is valid
      castStore.transitionSessionState("paused");
    });

    it("delegates to the active provider", async () => {
      await manager.play();
      expect(mockProvider.play).toHaveBeenCalledOnce();
    });

    it("transitions session state to playing", async () => {
      await manager.play();
      const state = castStore.getState();
      expect(state.session!.state).toBe("playing");
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.2: pause() delegates and transitions to paused
  // -------------------------------------------------------------------------

  describe("pause() (Req 4.2)", () => {
    beforeEach(() => {
      setupConnectedSession();
    });

    it("delegates to the active provider", async () => {
      await manager.pause();
      expect(mockProvider.pause).toHaveBeenCalledOnce();
    });

    it("transitions session state to paused", async () => {
      await manager.pause();
      const state = castStore.getState();
      expect(state.session!.state).toBe("paused");
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.3: seek() clamps and delegates
  // -------------------------------------------------------------------------

  describe("seek() (Req 4.3)", () => {
    beforeEach(() => {
      setupConnectedSession();
    });

    it("delegates to the active provider with clamped position", async () => {
      await manager.seek(60);
      expect(mockProvider.seek).toHaveBeenCalledWith(60);
    });

    it("clamps position to 0 when negative", async () => {
      await manager.seek(-10);
      expect(mockProvider.seek).toHaveBeenCalledWith(0);
    });

    it("clamps position to playbackDuration when exceeding", async () => {
      // Duration is 120 (set in setupConnectedSession)
      await manager.seek(200);
      expect(mockProvider.seek).toHaveBeenCalledWith(120);
    });

    it("updates playback position in state", async () => {
      await manager.seek(60);
      const state = castStore.getState();
      expect(state.playbackPosition).toBe(60);
    });

    it("preserves duration when updating position", async () => {
      await manager.seek(60);
      const state = castStore.getState();
      expect(state.playbackDuration).toBe(120);
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.4: setVolume() clamps and delegates
  // -------------------------------------------------------------------------

  describe("setVolume() (Req 4.4)", () => {
    beforeEach(() => {
      setupConnectedSession();
    });

    it("delegates to the active provider with clamped level", async () => {
      await manager.setVolume(0.7);
      expect(mockProvider.setVolume).toHaveBeenCalledWith(0.7);
    });

    it("clamps volume to 0.0 when negative", async () => {
      await manager.setVolume(-0.5);
      expect(mockProvider.setVolume).toHaveBeenCalledWith(0.0);
    });

    it("clamps volume to 1.0 when exceeding", async () => {
      await manager.setVolume(1.5);
      expect(mockProvider.setVolume).toHaveBeenCalledWith(1.0);
    });

    it("updates volume in state", async () => {
      await manager.setVolume(0.3);
      const state = castStore.getState();
      expect(state.volume).toBe(0.3);
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.5: stop() delegates, resets position, transitions to idle
  // -------------------------------------------------------------------------

  describe("stop() (Req 4.5)", () => {
    beforeEach(() => {
      setupConnectedSession();
    });

    it("delegates to the active provider", async () => {
      await manager.stop();
      expect(mockProvider.stop).toHaveBeenCalledOnce();
    });

    it("resets playback position to 0", async () => {
      await manager.stop();
      const state = castStore.getState();
      expect(state.playbackPosition).toBe(0);
    });

    it("transitions session state to idle", async () => {
      await manager.stop();
      const state = castStore.getState();
      expect(state.session!.state).toBe("idle");
    });

    it("preserves duration after stop", async () => {
      await manager.stop();
      const state = castStore.getState();
      expect(state.playbackDuration).toBe(120);
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.7: Provider command failures emit COMMAND_FAILED
  // -------------------------------------------------------------------------

  describe("Provider failures (Req 4.7)", () => {
    beforeEach(() => {
      setupConnectedSession();
    });

    it("play() emits COMMAND_FAILED on provider error", async () => {
      (mockProvider.play as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(manager.play()).rejects.toMatchObject({
        code: "COMMAND_FAILED",
        message: expect.stringContaining("Network timeout"),
        recoverable: true,
      });
    });

    it("pause() emits COMMAND_FAILED on provider error", async () => {
      (mockProvider.pause as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Device unreachable"),
      );

      await expect(manager.pause()).rejects.toMatchObject({
        code: "COMMAND_FAILED",
        recoverable: true,
      });
    });

    it("seek() emits COMMAND_FAILED on provider error", async () => {
      (mockProvider.seek as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Seek failed"),
      );

      await expect(manager.seek(30)).rejects.toMatchObject({
        code: "COMMAND_FAILED",
      });
    });

    it("setVolume() emits COMMAND_FAILED on provider error", async () => {
      (mockProvider.setVolume as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Volume control unavailable"),
      );

      await expect(manager.setVolume(0.5)).rejects.toMatchObject({
        code: "COMMAND_FAILED",
      });
    });

    it("stop() emits COMMAND_FAILED on provider error", async () => {
      (mockProvider.stop as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Stop failed"),
      );

      await expect(manager.stop()).rejects.toMatchObject({
        code: "COMMAND_FAILED",
      });
    });

    it("remains in current state on provider failure", async () => {
      (mockProvider.play as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("fail"),
      );

      // Session starts in "playing" state
      const stateBefore = castStore.getState().session!.state;

      try {
        await manager.play();
      } catch {
        // expected
      }

      const stateAfter = castStore.getState().session!.state;
      expect(stateAfter).toBe(stateBefore);
    });

    it("sets error in castStore on provider failure", async () => {
      (mockProvider.pause as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("fail"),
      );

      try {
        await manager.pause();
      } catch {
        // expected
      }

      const state = castStore.getState();
      expect(state.error).not.toBeNull();
      expect(state.error!.code).toBe("COMMAND_FAILED");
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.8: State updates within 500ms (synchronous after await)
  // -------------------------------------------------------------------------

  describe("State update timing (Req 4.8)", () => {
    beforeEach(() => {
      setupConnectedSession();
      castStore.transitionSessionState("paused");
    });

    it("play() updates state synchronously after provider resolves", async () => {
      const start = Date.now();
      await manager.play();
      const elapsed = Date.now() - start;

      const state = castStore.getState();
      expect(state.session!.state).toBe("playing");
      // State update is synchronous after await, so well within 500ms
      expect(elapsed).toBeLessThan(500);
    });
  });
});
