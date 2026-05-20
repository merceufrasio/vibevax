import { describe, it, expect, vi } from "vitest";
import {
  serializeSenderMessage,
  serializeReceiverMessage,
  deserializeSenderMessage,
  deserializeReceiverMessage,
  type SenderMessage,
  type ReceiverMessage,
} from "./messages";

describe("serializeSenderMessage", () => {
  it("serializes a LOAD message with full payload", () => {
    const msg: SenderMessage = {
      type: "LOAD",
      payload: {
        url: "https://cdn.example.com/stream.m3u8",
        headers: { Referer: "https://example.com" },
        mimeType: "application/x-mpegURL",
        title: "Test Movie",
        subtitle: "Episode 1",
        posterUrl: "https://example.com/poster.jpg",
        startPosition: 120,
      },
    };
    const json = serializeSenderMessage(msg);
    expect(JSON.parse(json)).toEqual(msg);
  });

  it("serializes a PLAY message", () => {
    const msg: SenderMessage = { type: "PLAY" };
    expect(JSON.parse(serializeSenderMessage(msg))).toEqual(msg);
  });

  it("serializes a PAUSE message", () => {
    const msg: SenderMessage = { type: "PAUSE" };
    expect(JSON.parse(serializeSenderMessage(msg))).toEqual(msg);
  });

  it("serializes a SEEK message", () => {
    const msg: SenderMessage = { type: "SEEK", position: 45.5 };
    expect(JSON.parse(serializeSenderMessage(msg))).toEqual(msg);
  });

  it("serializes a STOP message", () => {
    const msg: SenderMessage = { type: "STOP" };
    expect(JSON.parse(serializeSenderMessage(msg))).toEqual(msg);
  });

  it("serializes a SET_VOLUME message", () => {
    const msg: SenderMessage = { type: "SET_VOLUME", level: 0.75 };
    expect(JSON.parse(serializeSenderMessage(msg))).toEqual(msg);
  });

  it("serializes a SET_SUBTITLE message with track index", () => {
    const msg: SenderMessage = { type: "SET_SUBTITLE", trackIndex: 2 };
    expect(JSON.parse(serializeSenderMessage(msg))).toEqual(msg);
  });

  it("serializes a SET_SUBTITLE message with null track index", () => {
    const msg: SenderMessage = { type: "SET_SUBTITLE", trackIndex: null };
    expect(JSON.parse(serializeSenderMessage(msg))).toEqual(msg);
  });
});

describe("serializeReceiverMessage", () => {
  it("serializes a STATUS message", () => {
    const msg: ReceiverMessage = { type: "STATUS", state: "playing" };
    expect(JSON.parse(serializeReceiverMessage(msg))).toEqual(msg);
  });

  it("serializes a POSITION message", () => {
    const msg: ReceiverMessage = { type: "POSITION", position: 30, duration: 3600 };
    expect(JSON.parse(serializeReceiverMessage(msg))).toEqual(msg);
  });

  it("serializes an ERROR message", () => {
    const msg: ReceiverMessage = { type: "ERROR", code: "MEDIA_FAILED", message: "Stream not found" };
    expect(JSON.parse(serializeReceiverMessage(msg))).toEqual(msg);
  });
});

describe("deserializeSenderMessage", () => {
  describe("valid messages", () => {
    it("deserializes a LOAD message", () => {
      const msg: SenderMessage = {
        type: "LOAD",
        payload: {
          url: "https://cdn.example.com/stream.m3u8",
          headers: { Referer: "https://example.com" },
          mimeType: "application/x-mpegURL",
          title: "Test Movie",
        },
      };
      const result = deserializeSenderMessage(JSON.stringify(msg));
      expect(result).toEqual(msg);
    });

    it("deserializes a PLAY message", () => {
      const result = deserializeSenderMessage('{"type":"PLAY"}');
      expect(result).toEqual({ type: "PLAY" });
    });

    it("deserializes a PAUSE message", () => {
      const result = deserializeSenderMessage('{"type":"PAUSE"}');
      expect(result).toEqual({ type: "PAUSE" });
    });

    it("deserializes a SEEK message", () => {
      const result = deserializeSenderMessage('{"type":"SEEK","position":90}');
      expect(result).toEqual({ type: "SEEK", position: 90 });
    });

    it("deserializes a STOP message", () => {
      const result = deserializeSenderMessage('{"type":"STOP"}');
      expect(result).toEqual({ type: "STOP" });
    });

    it("deserializes a SET_VOLUME message", () => {
      const result = deserializeSenderMessage('{"type":"SET_VOLUME","level":0.5}');
      expect(result).toEqual({ type: "SET_VOLUME", level: 0.5 });
    });

    it("deserializes a SET_SUBTITLE message with index", () => {
      const result = deserializeSenderMessage('{"type":"SET_SUBTITLE","trackIndex":1}');
      expect(result).toEqual({ type: "SET_SUBTITLE", trackIndex: 1 });
    });

    it("deserializes a SET_SUBTITLE message with null", () => {
      const result = deserializeSenderMessage('{"type":"SET_SUBTITLE","trackIndex":null}');
      expect(result).toEqual({ type: "SET_SUBTITLE", trackIndex: null });
    });
  });

  describe("discards messages with unrecognized or missing type (Req 12.4)", () => {
    it("returns null for malformed JSON", () => {
      expect(deserializeSenderMessage("not json")).toBeNull();
    });

    it("returns null for non-object JSON", () => {
      expect(deserializeSenderMessage('"hello"')).toBeNull();
    });

    it("returns null for array JSON", () => {
      expect(deserializeSenderMessage("[]")).toBeNull();
    });

    it("returns null for missing type field", () => {
      expect(deserializeSenderMessage('{"position":10}')).toBeNull();
    });

    it("returns null for non-string type field", () => {
      expect(deserializeSenderMessage('{"type":123}')).toBeNull();
    });

    it("returns null for unrecognized type", () => {
      expect(deserializeSenderMessage('{"type":"UNKNOWN_CMD"}')).toBeNull();
    });

    it("does not crash on null input type", () => {
      expect(deserializeSenderMessage('{"type":null}')).toBeNull();
    });
  });

  describe("discards messages with missing required fields and reports error (Req 12.5)", () => {
    it("discards LOAD with missing payload and reports error", () => {
      const onError = vi.fn();
      const result = deserializeSenderMessage('{"type":"LOAD"}', onError);
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("LOAD message missing"),
      );
    });

    it("discards LOAD with payload missing url", () => {
      const onError = vi.fn();
      const json = JSON.stringify({
        type: "LOAD",
        payload: { headers: {}, mimeType: "video/mp4", title: "Test" },
      });
      const result = deserializeSenderMessage(json, onError);
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("discards LOAD with payload missing headers", () => {
      const onError = vi.fn();
      const json = JSON.stringify({
        type: "LOAD",
        payload: { url: "http://x.com/s.m3u8", mimeType: "video/mp4", title: "T" },
      });
      const result = deserializeSenderMessage(json, onError);
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("discards SEEK with missing position and reports error", () => {
      const onError = vi.fn();
      const result = deserializeSenderMessage('{"type":"SEEK"}', onError);
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("SEEK message missing"),
      );
    });

    it("discards SEEK with non-number position", () => {
      const onError = vi.fn();
      const result = deserializeSenderMessage('{"type":"SEEK","position":"abc"}', onError);
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("discards SET_VOLUME with missing level and reports error", () => {
      const onError = vi.fn();
      const result = deserializeSenderMessage('{"type":"SET_VOLUME"}', onError);
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("SET_VOLUME message missing"),
      );
    });

    it("discards SET_SUBTITLE with invalid trackIndex", () => {
      const onError = vi.fn();
      const result = deserializeSenderMessage(
        '{"type":"SET_SUBTITLE","trackIndex":"abc"}',
        onError,
      );
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });
  });
});

describe("deserializeReceiverMessage", () => {
  describe("valid messages", () => {
    it("deserializes a STATUS message", () => {
      const result = deserializeReceiverMessage('{"type":"STATUS","state":"playing"}');
      expect(result).toEqual({ type: "STATUS", state: "playing" });
    });

    it("deserializes STATUS with all valid states", () => {
      const states = ["loading", "playing", "paused", "buffering", "idle", "error"];
      for (const state of states) {
        const result = deserializeReceiverMessage(
          JSON.stringify({ type: "STATUS", state }),
        );
        expect(result).toEqual({ type: "STATUS", state });
      }
    });

    it("deserializes a POSITION message", () => {
      const result = deserializeReceiverMessage(
        '{"type":"POSITION","position":45.2,"duration":3600}',
      );
      expect(result).toEqual({ type: "POSITION", position: 45.2, duration: 3600 });
    });

    it("deserializes an ERROR message", () => {
      const result = deserializeReceiverMessage(
        '{"type":"ERROR","code":"MEDIA_FAILED","message":"Cannot load stream"}',
      );
      expect(result).toEqual({
        type: "ERROR",
        code: "MEDIA_FAILED",
        message: "Cannot load stream",
      });
    });
  });

  describe("discards messages with unrecognized or missing type (Req 12.4)", () => {
    it("returns null for malformed JSON", () => {
      expect(deserializeReceiverMessage("{bad json")).toBeNull();
    });

    it("returns null for missing type field", () => {
      expect(deserializeReceiverMessage('{"state":"playing"}')).toBeNull();
    });

    it("returns null for unrecognized type", () => {
      expect(deserializeReceiverMessage('{"type":"VOLUME_CHANGED"}')).toBeNull();
    });

    it("returns null for non-object JSON", () => {
      expect(deserializeReceiverMessage("42")).toBeNull();
    });
  });

  describe("discards messages with missing required fields and reports error (Req 12.5)", () => {
    it("discards STATUS with missing state and reports error", () => {
      const onError = vi.fn();
      const result = deserializeReceiverMessage('{"type":"STATUS"}', onError);
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("STATUS message missing"),
      );
    });

    it("discards STATUS with invalid state value", () => {
      const onError = vi.fn();
      const result = deserializeReceiverMessage(
        '{"type":"STATUS","state":"unknown_state"}',
        onError,
      );
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("discards POSITION with missing position", () => {
      const onError = vi.fn();
      const result = deserializeReceiverMessage(
        '{"type":"POSITION","duration":100}',
        onError,
      );
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("discards POSITION with missing duration", () => {
      const onError = vi.fn();
      const result = deserializeReceiverMessage(
        '{"type":"POSITION","position":50}',
        onError,
      );
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("discards ERROR with missing code", () => {
      const onError = vi.fn();
      const result = deserializeReceiverMessage(
        '{"type":"ERROR","message":"Something failed"}',
        onError,
      );
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("discards ERROR with missing message", () => {
      const onError = vi.fn();
      const result = deserializeReceiverMessage(
        '{"type":"ERROR","code":"MEDIA_FAILED"}',
        onError,
      );
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
    });
  });
});

describe("round-trip serialization (Req 12.3)", () => {
  it("SenderMessage LOAD round-trips correctly", () => {
    const msg: SenderMessage = {
      type: "LOAD",
      payload: {
        url: "https://cdn.example.com/stream.m3u8",
        headers: { Referer: "https://example.com", "User-Agent": "ReVax/1.0" },
        mimeType: "application/x-mpegURL",
        title: "Test Movie",
        subtitle: "Ep 1",
        posterUrl: "https://example.com/poster.jpg",
        subtitles: [{ lang: "en", url: "https://example.com/sub.vtt", label: "English" }],
        startPosition: 60,
      },
    };
    const json = serializeSenderMessage(msg);
    const result = deserializeSenderMessage(json);
    expect(result).toEqual(msg);
  });

  it("SenderMessage SEEK round-trips correctly", () => {
    const msg: SenderMessage = { type: "SEEK", position: 123.456 };
    const json = serializeSenderMessage(msg);
    const result = deserializeSenderMessage(json);
    expect(result).toEqual(msg);
  });

  it("SenderMessage SET_VOLUME round-trips correctly", () => {
    const msg: SenderMessage = { type: "SET_VOLUME", level: 0.33 };
    const json = serializeSenderMessage(msg);
    const result = deserializeSenderMessage(json);
    expect(result).toEqual(msg);
  });

  it("SenderMessage SET_SUBTITLE with null round-trips correctly", () => {
    const msg: SenderMessage = { type: "SET_SUBTITLE", trackIndex: null };
    const json = serializeSenderMessage(msg);
    const result = deserializeSenderMessage(json);
    expect(result).toEqual(msg);
  });

  it("ReceiverMessage STATUS round-trips correctly", () => {
    const msg: ReceiverMessage = { type: "STATUS", state: "buffering" };
    const json = serializeReceiverMessage(msg);
    const result = deserializeReceiverMessage(json);
    expect(result).toEqual(msg);
  });

  it("ReceiverMessage POSITION round-trips correctly", () => {
    const msg: ReceiverMessage = { type: "POSITION", position: 99.5, duration: 7200 };
    const json = serializeReceiverMessage(msg);
    const result = deserializeReceiverMessage(json);
    expect(result).toEqual(msg);
  });

  it("ReceiverMessage ERROR round-trips correctly", () => {
    const msg: ReceiverMessage = { type: "ERROR", code: "NETWORK", message: "Timeout" };
    const json = serializeReceiverMessage(msg);
    const result = deserializeReceiverMessage(json);
    expect(result).toEqual(msg);
  });
});
