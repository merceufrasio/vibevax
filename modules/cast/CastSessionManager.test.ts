/**
 * Unit tests for CastSessionManager initialization and provider registration.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CastSessionManager } from "./CastSessionManager";
import { HeadlessExtractService } from "./extraction/HeadlessExtractService";
import { castStore } from "./state";
import type { CastConfig, CastDevice, CastError, CastMediaParams, CastProvider, CastProtocol, CastSession } from "./types";
import type { StreamResult } from "@/sources/types";

// ---------------------------------------------------------------------------
// Mock react-native Platform
// ---------------------------------------------------------------------------

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

// We need to dynamically change Platform.OS in tests, so we import it
// after mocking and mutate the object directly.
import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProvider(protocol: CastProtocol): CastProvider {
  return {
    protocol,
    startDiscovery: vi.fn(),
    stopDiscovery: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    loadMedia: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    onStateChange: vi.fn(() => () => {}),
    onPositionUpdate: vi.fn(() => () => {}),
  };
}

function makeConfig(providers: CastProvider[]): CastConfig {
  return {
    providers,
    extractionTimeoutMs: 15000,
    discoveryTimeoutMs: 10000,
  };
}

function makeMockDevice(overrides: Partial<CastDevice> = {}): CastDevice {
  return {
    id: overrides.id ?? "device-1",
    name: overrides.name ?? "Living Room TV",
    ip: overrides.ip ?? "192.168.1.100",
    port: overrides.port ?? 8009,
    protocol: overrides.protocol ?? "chromecast",
    capabilities: overrides.capabilities ?? {
      supportsHls: true,
      supportsDash: false,
      supportsMp4: true,
      supportsSubtitles: true,
      supportsCustomHeaders: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CastSessionManager", () => {
  beforeEach(() => {
    CastSessionManager.destroy();
    (Platform as any).OS = "android";
  });

  describe("initialize — Req 14.1: reject zero providers", () => {
    it("throws an error when providers array is empty", () => {
      expect(() => CastSessionManager.initialize(makeConfig([]))).toThrow(
        "at least one provider is required",
      );
    });

    it("throws an error when providers is undefined-like (empty array)", () => {
      const config = { ...makeConfig([]), providers: [] };
      expect(() => CastSessionManager.initialize(config)).toThrow(
        "at least one provider is required",
      );
    });
  });

  describe("initialize — Req 14.2: Android registers Chromecast only", () => {
    it("registers only chromecast provider on Android", () => {
      (Platform as any).OS = "android";

      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");
      const dlna = makeMockProvider("dlna");

      const manager = CastSessionManager.initialize(
        makeConfig([chromecast, airplay, dlna]),
      );

      const registered = manager.getProviders();
      expect(registered).toHaveLength(1);
      expect(registered[0].protocol).toBe("chromecast");
    });

    it("excludes airplay and dlna providers on Android", () => {
      (Platform as any).OS = "android";

      const airplay = makeMockProvider("airplay");
      const dlna = makeMockProvider("dlna");
      const chromecast = makeMockProvider("chromecast");

      const manager = CastSessionManager.initialize(
        makeConfig([airplay, dlna, chromecast]),
      );

      const protocols = manager.getProviders().map((p) => p.protocol);
      expect(protocols).not.toContain("airplay");
      expect(protocols).not.toContain("dlna");
    });
  });

  describe("initialize — Req 14.3: iOS registers Chromecast + AirPlay", () => {
    it("registers chromecast and airplay providers on iOS", () => {
      (Platform as any).OS = "ios";

      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");
      const dlna = makeMockProvider("dlna");

      const manager = CastSessionManager.initialize(
        makeConfig([chromecast, airplay, dlna]),
      );

      const registered = manager.getProviders();
      expect(registered).toHaveLength(2);

      const protocols = registered.map((p) => p.protocol);
      expect(protocols).toContain("chromecast");
      expect(protocols).toContain("airplay");
    });

    it("excludes dlna provider on iOS", () => {
      (Platform as any).OS = "ios";

      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");
      const dlna = makeMockProvider("dlna");

      const manager = CastSessionManager.initialize(
        makeConfig([chromecast, airplay, dlna]),
      );

      const protocols = manager.getProviders().map((p) => p.protocol);
      expect(protocols).not.toContain("dlna");
    });
  });

  describe("initialize — Req 14.4: unsupported platform registers no providers", () => {
    it("registers no providers on web platform", () => {
      (Platform as any).OS = "web";

      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");

      const manager = CastSessionManager.initialize(
        makeConfig([chromecast, airplay]),
      );

      expect(manager.getProviders()).toHaveLength(0);
    });

    it("registers no providers on unknown platform", () => {
      (Platform as any).OS = "windows";

      const chromecast = makeMockProvider("chromecast");

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      expect(manager.getProviders()).toHaveLength(0);
    });
  });

  describe("singleton behavior", () => {
    it("returns the instance via getInstance after initialization", () => {
      (Platform as any).OS = "android";
      const chromecast = makeMockProvider("chromecast");

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      expect(CastSessionManager.getInstance()).toBe(manager);
    });

    it("getInstance returns null before initialization", () => {
      expect(CastSessionManager.getInstance()).toBeNull();
    });

    it("destroy clears the singleton instance", () => {
      (Platform as any).OS = "android";
      const chromecast = makeMockProvider("chromecast");

      CastSessionManager.initialize(makeConfig([chromecast]));
      CastSessionManager.destroy();

      expect(CastSessionManager.getInstance()).toBeNull();
    });
  });

  describe("getConfig", () => {
    it("returns the configuration passed during initialization", () => {
      (Platform as any).OS = "android";
      const chromecast = makeMockProvider("chromecast");
      const config = makeConfig([chromecast]);

      const manager = CastSessionManager.initialize(config);

      expect(manager.getConfig()).toEqual(config);
    });
  });

  describe("startDiscovery — Req 1.1: parallel scanning", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("calls startDiscovery on all registered providers in parallel", async () => {
      (Platform as any).OS = "ios";
      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");

      // Providers resolve immediately
      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (airplay.startDiscovery as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast, airplay]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      expect(chromecast.startDiscovery).toHaveBeenCalledTimes(1);
      expect(airplay.startDiscovery).toHaveBeenCalledTimes(1);
    });
  });

  describe("startDiscovery — Req 1.2: deduplication by IP + name", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("deduplicates devices with same IP and name, first-discovered wins", async () => {
      const chromecast = makeMockProvider("chromecast");

      const device1 = makeMockDevice({ id: "d1", ip: "192.168.1.10", name: "TV", port: 8009 });
      const device2 = makeMockDevice({ id: "d2", ip: "192.168.1.10", name: "TV", port: 9000 });

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device1);
          onDeviceFound(device2);
          return Promise.resolve();
        },
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      const state = castStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].id).toBe("d1"); // first-discovered wins
    });

    it("keeps devices with same IP but different names", async () => {
      const chromecast = makeMockProvider("chromecast");

      const device1 = makeMockDevice({ id: "d1", ip: "192.168.1.10", name: "TV A" });
      const device2 = makeMockDevice({ id: "d2", ip: "192.168.1.10", name: "TV B" });

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device1);
          onDeviceFound(device2);
          return Promise.resolve();
        },
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      const state = castStore.getState();
      expect(state.devices).toHaveLength(2);
    });

    it("keeps devices with same name but different IPs", async () => {
      const chromecast = makeMockProvider("chromecast");

      const device1 = makeMockDevice({ id: "d1", ip: "192.168.1.10", name: "TV" });
      const device2 = makeMockDevice({ id: "d2", ip: "192.168.1.20", name: "TV" });

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device1);
          onDeviceFound(device2);
          return Promise.resolve();
        },
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      const state = castStore.getState();
      expect(state.devices).toHaveLength(2);
    });
  });

  describe("startDiscovery — Req 1.3, 1.4: isAvailable reflects device count", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sets isAvailable to true when devices are found", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device);
          return Promise.resolve();
        },
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      expect(castStore.getState().isAvailable).toBe(true);
    });

    it("sets isAvailable to false when no devices are found (no error)", async () => {
      const chromecast = makeMockProvider("chromecast");

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      const state = castStore.getState();
      expect(state.isAvailable).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("startDiscovery — Req 1.5: discovery timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stops all scans after timeout and returns devices found so far", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      // Provider never resolves (simulates slow scan)
      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        (onDeviceFound: (device: CastDevice) => void) => {
          // Emit a device immediately
          onDeviceFound(device);
          // Never resolve — simulates ongoing scan
          return new Promise(() => {});
        },
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const discoveryPromise = manager.startDiscovery();

      // Advance past the timeout
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      // Provider's stopDiscovery should have been called
      expect(chromecast.stopDiscovery).toHaveBeenCalled();

      // Device found before timeout should be in state
      const state = castStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.isAvailable).toBe(true);
    });

    it("uses the configured discoveryTimeoutMs value", async () => {
      const chromecast = makeMockProvider("chromecast");

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const config = makeConfig([chromecast]);
      config.discoveryTimeoutMs = 5000; // custom timeout

      const manager = CastSessionManager.initialize(config);

      const discoveryPromise = manager.startDiscovery();

      // At 4999ms, should still be discovering
      vi.advanceTimersByTime(4999);
      expect(manager.getIsDiscovering()).toBe(true);

      // At 5000ms, timeout fires
      vi.advanceTimersByTime(1);
      await discoveryPromise;

      expect(manager.getIsDiscovering()).toBe(false);
      expect(chromecast.stopDiscovery).toHaveBeenCalled();
    });
  });

  describe("startDiscovery — Req 1.6: clear previously discovered devices", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("clears previously discovered devices before starting new scan", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device1 = makeMockDevice({ id: "d1", ip: "192.168.1.10", name: "TV A" });
      const device2 = makeMockDevice({ id: "d2", ip: "192.168.1.20", name: "TV B" });

      // First discovery finds device1
      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device1);
          return Promise.resolve();
        },
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      let discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      expect(castStore.getState().devices).toHaveLength(1);
      expect(castStore.getState().devices[0].id).toBe("d1");

      // Second discovery finds device2 only
      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device2);
          return Promise.resolve();
        },
      );

      discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      // Should only have device2, not device1 from previous scan
      const state = castStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].id).toBe("d2");
    });
  });

  describe("startDiscovery — Req 1.7: handle provider errors gracefully", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "ios";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("logs error and continues with remaining providers when one fails", async () => {
      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");
      const device = makeMockDevice({ protocol: "airplay" });

      // Chromecast provider throws
      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      // AirPlay provider succeeds
      (airplay.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device);
          return Promise.resolve();
        },
      );

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const manager = CastSessionManager.initialize(makeConfig([chromecast, airplay]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      // Should have logged the error
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("chromecast"),
        expect.any(Error),
      );

      // Should still have the device from the working provider
      const state = castStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.isAvailable).toBe(true);

      warnSpy.mockRestore();
    });

    it("does not throw when all providers fail", async () => {
      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Error 1"),
      );
      (airplay.startDiscovery as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Error 2"),
      );

      vi.spyOn(console, "warn").mockImplementation(() => {});

      const manager = CastSessionManager.initialize(makeConfig([chromecast, airplay]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);

      // Should not throw
      await expect(discoveryPromise).resolves.toBeUndefined();

      // isAvailable should be false, no error thrown
      const state = castStore.getState();
      expect(state.isAvailable).toBe(false);
      expect(state.error).toBeNull();

      vi.restoreAllMocks();
    });
  });

  describe("stopDiscovery — Req 1.6: clear devices", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("clears all discovered devices when called", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockImplementation(
        (onDeviceFound: (device: CastDevice) => void) => {
          onDeviceFound(device);
          return Promise.resolve();
        },
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const discoveryPromise = manager.startDiscovery();
      vi.advanceTimersByTime(10000);
      await discoveryPromise;

      expect(castStore.getState().devices).toHaveLength(1);

      manager.stopDiscovery();

      expect(castStore.getState().devices).toHaveLength(0);
      expect(castStore.getState().isAvailable).toBe(false);
    });

    it("calls stopDiscovery on all providers", () => {
      const chromecast = makeMockProvider("chromecast");

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      manager.stopDiscovery();

      expect(chromecast.stopDiscovery).toHaveBeenCalled();
    });

    it("sets isDiscovering to false", () => {
      const chromecast = makeMockProvider("chromecast");

      (chromecast.startDiscovery as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      manager.stopDiscovery();

      expect(manager.getIsDiscovering()).toBe(false);
    });
  });

  // =========================================================================
  // Device Connection Tests — Req 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
  // =========================================================================

  describe("connect — Req 2.1, 2.5: route to correct provider by protocol", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "ios";
      castStore.reset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("routes connection to the provider matching device.protocol", async () => {
      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");

      const device = makeMockDevice({ protocol: "chromecast" });
      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const manager = CastSessionManager.initialize(makeConfig([chromecast, airplay]));

      // Populate discovered devices
      castStore.setDevices([device]);

      await manager.connect(device);

      expect(chromecast.connect).toHaveBeenCalledWith(device);
      expect(airplay.connect).not.toHaveBeenCalled();
    });

    it("routes to airplay provider for airplay device", async () => {
      const chromecast = makeMockProvider("chromecast");
      const airplay = makeMockProvider("airplay");

      const device = makeMockDevice({ protocol: "airplay", id: "airplay-1" });
      const session: CastSession = {
        id: "session-2",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (airplay.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const manager = CastSessionManager.initialize(makeConfig([chromecast, airplay]));

      castStore.setDevices([device]);

      await manager.connect(device);

      expect(airplay.connect).toHaveBeenCalledWith(device);
      expect(chromecast.connect).not.toHaveBeenCalled();
    });
  });

  describe("connect — Req 2.1, 2.2: state transitions connecting → connected", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
      castStore.reset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("transitions to connecting then connected on success", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const stateHistory: string[] = [];
      castStore.subscribe((state) => {
        if (state.session) {
          stateHistory.push(state.session.state);
        }
      });

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      await manager.connect(device);

      expect(stateHistory).toContain("connecting");
      expect(stateHistory).toContain("connected");
    });

    it("sets isConnected to true and session is non-null on success", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      await manager.connect(device);

      const state = castStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.session).not.toBeNull();
      expect(state.session!.state).toBe("connected");
      expect(state.session!.device).toEqual(device);
      expect(state.session!.id).toBeTruthy();
    });
  });

  describe("connect — Req 2.3: 15-second connection timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
      castStore.reset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("throws CONNECTION_FAILED error after 15 seconds", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      // Provider never resolves
      (chromecast.connect as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}),
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      const connectPromise = manager.connect(device);

      // Advance past the 15-second timeout
      vi.advanceTimersByTime(15000);

      await expect(connectPromise).rejects.toMatchObject({
        code: "CONNECTION_FAILED",
        recoverable: true,
      });
    });

    it("resets state after timeout", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      (chromecast.connect as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}),
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      const connectPromise = manager.connect(device);
      vi.advanceTimersByTime(15000);

      try {
        await connectPromise;
      } catch {
        // expected
      }

      const state = castStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.session).toBeNull();
    });

    it("sets error in state after timeout", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      (chromecast.connect as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}),
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      const connectPromise = manager.connect(device);
      vi.advanceTimersByTime(15000);

      try {
        await connectPromise;
      } catch {
        // expected
      }

      const state = castStore.getState();
      expect(state.error).not.toBeNull();
      expect(state.error!.code).toBe("CONNECTION_FAILED");
      expect(state.error!.recoverable).toBe(true);
    });
  });

  describe("connect — Req 2.7: reject device not in discovered list", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("throws CONNECTION_FAILED when device is not in discovered list", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice({ id: "unknown-device" });

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      // No devices discovered
      castStore.setDevices([]);

      await expect(manager.connect(device)).rejects.toMatchObject({
        code: "CONNECTION_FAILED",
      });
    });

    it("does not call provider.connect when device is not discovered", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice({ id: "unknown-device" });

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([]);

      try {
        await manager.connect(device);
      } catch {
        // expected
      }

      expect(chromecast.connect).not.toHaveBeenCalled();
    });

    it("sets error in state when device is not discovered", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice({ id: "unknown-device" });

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([]);

      try {
        await manager.connect(device);
      } catch {
        // expected
      }

      expect(castStore.getState().error).toMatchObject({
        code: "CONNECTION_FAILED",
      });
    });
  });

  describe("connect — Req 2.6: disconnect existing session before new connection", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (Platform as any).OS = "android";
      castStore.reset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("disconnects existing session before connecting to new device", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device1 = makeMockDevice({ id: "d1", name: "TV 1" });
      const device2 = makeMockDevice({ id: "d2", name: "TV 2" });

      const session1: CastSession = {
        id: "session-1",
        device: device1,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };
      const session2: CastSession = {
        id: "session-2",
        device: device2,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2);
      (chromecast.disconnect as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device1, device2]);

      // Connect to first device
      await manager.connect(device1);
      expect(castStore.getState().isConnected).toBe(true);

      // Connect to second device — should disconnect first
      await manager.connect(device2);

      expect(chromecast.disconnect).toHaveBeenCalledTimes(1);
      expect(castStore.getState().session!.device.id).toBe("d2");
    });
  });

  describe("connect — provider connection failure", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("throws CONNECTION_FAILED when provider rejects", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      (chromecast.connect as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection refused"),
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      await expect(manager.connect(device)).rejects.toMatchObject({
        code: "CONNECTION_FAILED",
        recoverable: true,
      });
    });

    it("resets state when provider rejects", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      (chromecast.connect as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection refused"),
      );

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      try {
        await manager.connect(device);
      } catch {
        // expected
      }

      const state = castStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.session).toBeNull();
    });
  });

  describe("disconnect — Req 2.4: disconnect and reset state", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("calls provider.disconnect() on the active provider", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.disconnect as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      await manager.connect(device);
      await manager.disconnect();

      expect(chromecast.disconnect).toHaveBeenCalledTimes(1);
    });

    it("sets isConnected to false and session to null", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.disconnect as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      await manager.connect(device);
      await manager.disconnect();

      const state = castStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.session).toBeNull();
    });

    it("is a no-op when not connected", async () => {
      const chromecast = makeMockProvider("chromecast");

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      // Should not throw
      await expect(manager.disconnect()).resolves.toBeUndefined();
      expect(chromecast.disconnect).not.toHaveBeenCalled();
    });

    it("handles provider disconnect errors gracefully", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.disconnect as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Disconnect failed"),
      );

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      await manager.connect(device);

      // Should not throw even if provider.disconnect() fails
      await expect(manager.disconnect()).resolves.toBeUndefined();

      // State should still be reset
      const state = castStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.session).toBeNull();

      warnSpy.mockRestore();
    });

    it("clears error state on disconnect", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.disconnect as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);

      await manager.connect(device);

      // Manually set an error
      castStore.setError({
        code: "COMMAND_FAILED",
        message: "Some error",
        recoverable: true,
      });

      await manager.disconnect();

      expect(castStore.getState().error).toBeNull();
    });
  });

  // =========================================================================
  // castMedia Tests — Req 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
  // =========================================================================

  describe("castMedia — Req 3.5: null/undefined stream throws before network ops", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("throws CastError when stream is null", async () => {
      const chromecast = makeMockProvider("chromecast");
      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const params = {
        stream: null as unknown as StreamResult,
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await expect(manager.castMedia(params)).rejects.toMatchObject({
        code: "MEDIA_LOAD_FAILED",
      });
    });

    it("throws CastError when stream is undefined", async () => {
      const chromecast = makeMockProvider("chromecast");
      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const params = {
        stream: undefined as unknown as StreamResult,
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await expect(manager.castMedia(params)).rejects.toMatchObject({
        code: "MEDIA_LOAD_FAILED",
      });
    });

    it("does not call any provider methods when stream is null", async () => {
      const chromecast = makeMockProvider("chromecast");
      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const params = {
        stream: null as unknown as StreamResult,
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      try {
        await manager.castMedia(params);
      } catch {
        // expected
      }

      expect(chromecast.loadMedia).not.toHaveBeenCalled();
    });
  });

  describe("castMedia — Req 3.6: throws CONNECTION_FAILED when not connected", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("throws CastError with CONNECTION_FAILED when not connected", async () => {
      const chromecast = makeMockProvider("chromecast");
      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const params: CastMediaParams = {
        stream: { url: "https://example.com/video.m3u8", isEmbed: false },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await expect(manager.castMedia(params)).rejects.toMatchObject({
        code: "CONNECTION_FAILED",
        recoverable: true,
      });
    });

    it("does not call loadMedia when not connected", async () => {
      const chromecast = makeMockProvider("chromecast");
      const manager = CastSessionManager.initialize(makeConfig([chromecast]));

      const params: CastMediaParams = {
        stream: { url: "https://example.com/video.m3u8", isEmbed: false },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      try {
        await manager.castMedia(params);
      } catch {
        // expected
      }

      expect(chromecast.loadMedia).not.toHaveBeenCalled();
    });
  });

  describe("castMedia — Req 3.7: transitions to loading before resolution", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("transitions session to loading state", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const stateHistory: string[] = [];
      castStore.subscribe((state) => {
        if (state.session) {
          stateHistory.push(state.session.state);
        }
      });

      const params: CastMediaParams = {
        stream: { url: "https://example.com/video.m3u8", isEmbed: false },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await manager.castMedia(params);

      expect(stateHistory).toContain("loading");
    });
  });

  describe("castMedia — Req 3.1: loads media on device via provider.loadMedia()", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("calls provider.loadMedia with correct MediaInfo for direct stream", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: { url: "https://example.com/video.m3u8", isEmbed: false },
        title: "Test Movie",
        subtitle: "Episode 1",
        posterUrl: "https://example.com/poster.jpg",
        episodeId: "ep-1",
        sourceId: "test-source",
        startPosition: 120,
      };

      await manager.castMedia(params);

      expect(chromecast.loadMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com/video.m3u8",
          title: "Test Movie",
          subtitle: "Episode 1",
          posterUrl: "https://example.com/poster.jpg",
          mimeType: "application/x-mpegURL",
          startPosition: 120,
          sourceId: "test-source",
        }),
      );
    });

    it("infers MIME type for .mp4 URLs", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: { url: "https://example.com/video.mp4", isEmbed: false },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await manager.castMedia(params);

      expect(chromecast.loadMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: "video/mp4",
        }),
      );
    });

    it("uses stream.mimeType if provided instead of inferring", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: {
          url: "https://example.com/stream",
          isEmbed: false,
          mimeType: "application/dash+xml",
        },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await manager.castMedia(params);

      expect(chromecast.loadMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: "application/dash+xml",
        }),
      );
    });
  });

  describe("castMedia — Req 3.2: embed sources delegate to HeadlessExtractService", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("uses HeadlessExtractService for embed streams", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Mock HeadlessExtractService
      const extractStreamSpy = vi.spyOn(HeadlessExtractService.prototype, "extractStream")
        .mockResolvedValue({
          url: "https://cdn.example.com/resolved.m3u8",
          isEmbed: false,
          sourceId: "test-source",
        });

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: { url: "https://embed.example.com/player", isEmbed: true },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await manager.castMedia(params);

      expect(extractStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          embedUrl: "https://embed.example.com/player",
          sourceId: "test-source",
        }),
      );

      // Should load the resolved URL, not the embed URL
      expect(chromecast.loadMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://cdn.example.com/resolved.m3u8",
        }),
      );

      extractStreamSpy.mockRestore();
    });
  });

  describe("castMedia — Req 3.3: transitions from loading to playing on success", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("transitions to playing after successful loadMedia", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice();

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: { url: "https://example.com/video.m3u8", isEmbed: false },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await manager.castMedia(params);

      const state = castStore.getState();
      expect(state.session!.state).toBe("playing");
    });
  });

  describe("castMedia — Req 3.4: HEADERS_REQUIRED when device doesn't support custom headers", () => {
    beforeEach(() => {
      (Platform as any).OS = "android";
      castStore.reset();
    });

    it("throws HEADERS_REQUIRED when stream has headers and device doesn't support them", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice({
        capabilities: {
          supportsHls: true,
          supportsDash: false,
          supportsMp4: true,
          supportsSubtitles: true,
          supportsCustomHeaders: false,
        },
      });

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: {
          url: "https://example.com/video.m3u8",
          isEmbed: false,
          headers: { Referer: "https://example.com", "User-Agent": "Custom" },
        },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await expect(manager.castMedia(params)).rejects.toMatchObject({
        code: "HEADERS_REQUIRED",
        recoverable: false,
      });
    });

    it("does not throw when device supports custom headers", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice({
        capabilities: {
          supportsHls: true,
          supportsDash: false,
          supportsMp4: true,
          supportsSubtitles: true,
          supportsCustomHeaders: true,
        },
      });

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: {
          url: "https://example.com/video.m3u8",
          isEmbed: false,
          headers: { Referer: "https://example.com" },
        },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await expect(manager.castMedia(params)).resolves.toBeUndefined();
    });

    it("does not throw when stream has no headers", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice({
        capabilities: {
          supportsHls: true,
          supportsDash: false,
          supportsMp4: true,
          supportsSubtitles: true,
          supportsCustomHeaders: false,
        },
      });

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (chromecast.loadMedia as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: { url: "https://example.com/video.m3u8", isEmbed: false },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      await expect(manager.castMedia(params)).resolves.toBeUndefined();
    });

    it("does not call loadMedia when HEADERS_REQUIRED is thrown", async () => {
      const chromecast = makeMockProvider("chromecast");
      const device = makeMockDevice({
        capabilities: {
          supportsHls: true,
          supportsDash: false,
          supportsMp4: true,
          supportsSubtitles: true,
          supportsCustomHeaders: false,
        },
      });

      const session: CastSession = {
        id: "session-1",
        device,
        state: "connected",
        media: null,
        startedAt: Date.now(),
      };

      (chromecast.connect as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const manager = CastSessionManager.initialize(makeConfig([chromecast]));
      castStore.setDevices([device]);
      await manager.connect(device);

      const params: CastMediaParams = {
        stream: {
          url: "https://example.com/video.m3u8",
          isEmbed: false,
          headers: { Referer: "https://example.com" },
        },
        title: "Test Movie",
        episodeId: "ep-1",
        sourceId: "test-source",
      };

      try {
        await manager.castMedia(params);
      } catch {
        // expected
      }

      expect(chromecast.loadMedia).not.toHaveBeenCalled();
    });
  });
});
