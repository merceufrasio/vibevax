/**
 * Unit tests for CastMessageChannel.
 *
 * Tests the core behaviors: send, receive, validation, clamping, disposal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CastMessageChannel,
  type NativeCastChannel,
} from "./CastMessageChannel";
import type { SenderMessage, ReceiverMessage } from "../protocol/messages";

// ---------------------------------------------------------------------------
// Mock Native Session
// ---------------------------------------------------------------------------

function createMockChannel(): NativeCastChannel & {
  triggerMessage: (msg: string) => void;
  sentMessages: string[];
  removeCalls: number;
} {
  let messageHandler: ((message: Record<string, unknown> | string) => void) | null = null;

  const mock = {
    connected: true,
    writable: true,
    sentMessages: [] as string[],
    removeCalls: 0,

    async sendMessage(message: string): Promise<void> {
      mock.sentMessages.push(message);
    },

    onMessage(listener: (message: Record<string, unknown> | string) => void): void {
      messageHandler = listener;
    },

    offMessage(): void {
      messageHandler = null;
    },

    async remove(): Promise<void> {
      mock.removeCalls += 1;
    },

    triggerMessage(msg: string): void {
      messageHandler?.(msg);
    },
  };

  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CastMessageChannel", () => {
  let mockChannel: ReturnType<typeof createMockChannel>;
  let channel: CastMessageChannel;

  beforeEach(() => {
    mockChannel = createMockChannel();
    channel = new CastMessageChannel(mockChannel);
  });

  describe("send()", () => {
    it("serializes and sends a PLAY message over the native channel", async () => {
      await channel.send({ type: "PLAY" });

      expect(mockChannel.sentMessages).toHaveLength(1);
      expect(JSON.parse(mockChannel.sentMessages[0])).toEqual({
        type: "PLAY",
      });
    });

    it("serializes a SEEK message with position", async () => {
      await channel.send({ type: "SEEK", position: 42.5 });

      const sent = JSON.parse(mockChannel.sentMessages[0]);
      expect(sent).toEqual({ type: "SEEK", position: 42.5 });
    });

    it("serializes a LOAD message with full payload", async () => {
      const loadMsg: SenderMessage = {
        type: "LOAD",
        payload: {
          url: "https://example.com/stream.m3u8",
          headers: { Referer: "https://phimpal.org/" },
          mimeType: "application/x-mpegURL",
          title: "Test Movie",
          subtitle: "Episode 1",
          posterUrl: "https://example.com/poster.jpg",
          subtitles: [
            { lang: "en", url: "https://example.com/en.vtt", label: "English" },
          ],
          startPosition: 120,
        },
      };

      await channel.send(loadMsg);

      const sent = JSON.parse(mockChannel.sentMessages[0]);
      expect(sent.type).toBe("LOAD");
      expect(sent.payload.url).toBe("https://example.com/stream.m3u8");
      expect(sent.payload.headers.Referer).toBe("https://phimpal.org/");
      expect(sent.payload.startPosition).toBe(120);
    });

    it("throws an error if channel is not connected", async () => {
      channel.dispose();

      await expect(channel.send({ type: "PLAY" })).rejects.toThrow(
        "CastMessageChannel is not connected",
      );
    });
  });

  describe("onMessage()", () => {
    it("notifies listeners with valid STATUS messages", () => {
      const listener = vi.fn();
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({ type: "STATUS", state: "playing" }),
      );

      expect(listener).toHaveBeenCalledWith({
        type: "STATUS",
        state: "playing",
      });
    });

    it("notifies listeners with valid POSITION messages", () => {
      const listener = vi.fn();
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({ type: "POSITION", position: 30, duration: 120 }),
      );

      expect(listener).toHaveBeenCalledWith({
        type: "POSITION",
        position: 30,
        duration: 120,
      });
    });

    it("notifies listeners with valid ERROR messages", () => {
      const listener = vi.fn();
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({
          type: "ERROR",
          code: "NETWORK_ERROR",
          message: "Stream failed",
        }),
      );

      expect(listener).toHaveBeenCalledWith({
        type: "ERROR",
        code: "NETWORK_ERROR",
        message: "Stream failed",
      });
    });

    it("returns an unsubscribe function that removes the listener", () => {
      const listener = vi.fn();
      const unsubscribe = channel.onMessage(listener);

      unsubscribe();

      mockChannel.triggerMessage(
        JSON.stringify({ type: "STATUS", state: "playing" }),
      );

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("malformed message handling (Req 7.4, 7.5)", () => {
    it("discards malformed JSON without notifying listeners", () => {
      const listener = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      channel.onMessage(listener);

      mockChannel.triggerMessage("not valid json {{{");

      expect(listener).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("discards messages with unrecognized type", () => {
      const listener = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({ type: "UNKNOWN_TYPE", data: "foo" }),
      );

      expect(listener).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("discards valid JSON that is not an object", () => {
      const listener = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      channel.onMessage(listener);

      mockChannel.triggerMessage('"just a string"');

      expect(listener).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("STATUS message with unrecognized state (Req 6.6)", () => {
    it("discards STATUS messages with unrecognized state values", () => {
      const listener = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({ type: "STATUS", state: "unknown_state" }),
      );

      expect(listener).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("POSITION clamping (Req 6.5)", () => {
    it("clamps position to duration when position > duration", () => {
      const listener = vi.fn();
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({ type: "POSITION", position: 150, duration: 120 }),
      );

      expect(listener).toHaveBeenCalledWith({
        type: "POSITION",
        position: 120,
        duration: 120,
      });
    });

    it("does not clamp when position <= duration", () => {
      const listener = vi.fn();
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({ type: "POSITION", position: 60, duration: 120 }),
      );

      expect(listener).toHaveBeenCalledWith({
        type: "POSITION",
        position: 60,
        duration: 120,
      });
    });

    it("handles position equal to duration without clamping", () => {
      const listener = vi.fn();
      channel.onMessage(listener);

      mockChannel.triggerMessage(
        JSON.stringify({ type: "POSITION", position: 120, duration: 120 }),
      );

      expect(listener).toHaveBeenCalledWith({
        type: "POSITION",
        position: 120,
        duration: 120,
      });
    });
  });

  describe("isConnected()", () => {
    it("returns true when session is active", () => {
      expect(channel.isConnected()).toBe(true);
    });

    it("returns false after dispose", () => {
      channel.dispose();
      expect(channel.isConnected()).toBe(false);
    });
  });

  describe("dispose()", () => {
    it("removes all listeners", () => {
      const listener = vi.fn();
      channel.onMessage(listener);

      channel.dispose();

      // Even if somehow a message arrives, no listener should be called
      // (native subscription is also cancelled)
      expect(channel.isConnected()).toBe(false);
    });

    it("cancels native subscription", () => {
      // After dispose, triggering a message should not call listeners
      const listener = vi.fn();
      channel.onMessage(listener);

      channel.dispose();

      // The native message listener was removed, so triggerMessage won't reach handler
      mockChannel.triggerMessage(
        JSON.stringify({ type: "STATUS", state: "playing" }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it("nulls the session reference", () => {
      channel.dispose();
      expect(channel.isConnected()).toBe(false);
    });
  });
});
