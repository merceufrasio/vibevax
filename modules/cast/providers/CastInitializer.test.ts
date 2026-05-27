/**
 * Tests for CastInitializer real-provider initialization.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeModules, Platform } from "react-native";

import { CastSessionManager } from "../CastSessionManager";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "android" },
}));

vi.mock("react-native-google-cast", () => ({ default: {}, CastContext: {} }));

vi.mock("../CastSessionManager", () => ({
  CastSessionManager: {
    getInstance: vi.fn(() => null),
    initialize: vi.fn(() => ({ getProviders: () => [] })),
    destroy: vi.fn(),
  },
}));

vi.mock("../config", () => ({
  CAST_RECEIVER_URL: "https://example.com/receiver",
}));

vi.mock("./ChromecastProvider", () => ({
  ChromecastProvider: class ChromecastProvider {
    readonly protocol = "chromecast";
    async startDiscovery() {}
    stopDiscovery() {}
    async connect() {
      return {
        id: "real",
        device: {} as any,
        state: "connected" as const,
        media: null,
        startedAt: 0,
      };
    }
    async disconnect() {}
    async loadMedia() {}
    async play() {}
    async pause() {}
    async stop() {}
    async seek() {}
    async setVolume() {}
    onStateChange() {
      return () => {};
    }
    onPositionUpdate() {
      return () => {};
    }
  },
}));

describe("CastInitializer", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (Platform as any).OS = "android";
    (NativeModules as Record<string, unknown>).RNGCCastContext = {};
    (CastSessionManager.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (CastSessionManager.initialize as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("returns null on unsupported platforms", async () => {
    (Platform as any).OS = "web";

    const { initializeCastProvider } = await import("./CastInitializer");
    const provider = initializeCastProvider();

    expect(provider).toBeNull();
  });

  it("returns null when the native Google Cast module is not linked", async () => {
    (Platform as any).OS = "android";
    delete (NativeModules as Record<string, unknown>).RNGCCastContext;

    const { initializeCastProvider } = await import("./CastInitializer");
    const provider = initializeCastProvider();

    expect(provider).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("react-native-google-cast native module unavailable"),
      expect.any(String),
    );
  });

  it("returns ChromecastProvider when the native module is linked", async () => {
    const { initializeCastProvider } = await import("./CastInitializer");
    const provider = initializeCastProvider();

    expect(provider).not.toBeNull();
    expect(provider!.protocol).toBe("chromecast");
  });

  it("returns existing CastSessionManager instance if already initialized", async () => {
    const mockInstance = { getProviders: () => [] } as any;
    (CastSessionManager.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(mockInstance);

    const { initializeCastSession } = await import("./CastInitializer");
    const result = initializeCastSession();

    expect(result).toBe(mockInstance);
    expect(CastSessionManager.initialize).not.toHaveBeenCalled();
  });

  it("initializes CastSessionManager with the real Chromecast provider", async () => {
    const { initializeCastSession } = await import("./CastInitializer");
    initializeCastSession();

    expect(CastSessionManager.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ protocol: "chromecast" }),
        ]),
        extractionTimeoutMs: 15000,
        discoveryTimeoutMs: 10000,
      }),
    );
  });

  it("handles CastSessionManager.initialize failure gracefully", async () => {
    (CastSessionManager.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Initialization failed");
    });

    const { initializeCastSession } = await import("./CastInitializer");
    const result = initializeCastSession();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[Cast] CastSessionManager initialization failed:",
      expect.any(Error),
    );
  });
});
