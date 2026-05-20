/**
 * Sender-side message protocol types and validation for the custom
 * Chromecast receiver communication channel.
 *
 * Defines discriminated union types for messages sent from the sender app
 * to the receiver (SenderMessage) and from the receiver back to the sender
 * (ReceiverMessage). Includes serialization, deserialization, and validation
 * that discards malformed messages without crashing.
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */

// ---------------------------------------------------------------------------
// Receiver Load Payload
// ---------------------------------------------------------------------------

export interface ReceiverSubtitleTrack {
  /** Language code */
  lang: string;
  /** Must be WebVTT format URL */
  url: string;
  /** Display label */
  label: string;
}

export interface ReceiverLoadPayload {
  /** Stream URL (m3u8 or mp4) */
  url: string;
  /** Custom headers (Referer, User-Agent, etc.) */
  headers: Record<string, string>;
  /** MIME type of the stream */
  mimeType: string;
  /** Media title */
  title: string;
  /** Episode name or source info */
  subtitle?: string;
  /** Poster image URL */
  posterUrl?: string;
  /** Available subtitle tracks */
  subtitles?: ReceiverSubtitleTrack[];
  /** Resume position in seconds */
  startPosition?: number;
}

// ---------------------------------------------------------------------------
// Sender → Receiver Messages
// ---------------------------------------------------------------------------

export type SenderMessage =
  | { type: "LOAD"; payload: ReceiverLoadPayload }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SEEK"; position: number }
  | { type: "STOP" }
  | { type: "SET_VOLUME"; level: number }
  | { type: "SET_SUBTITLE"; trackIndex: number | null };

// ---------------------------------------------------------------------------
// Receiver → Sender Messages
// ---------------------------------------------------------------------------

export type ReceiverMessageState =
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "idle"
  | "error";

export type ReceiverMessage =
  | { type: "STATUS"; state: ReceiverMessageState }
  | { type: "POSITION"; position: number; duration: number }
  | { type: "ERROR"; code: string; message: string };

// ---------------------------------------------------------------------------
// Valid type discriminators
// ---------------------------------------------------------------------------

const SENDER_MESSAGE_TYPES = [
  "LOAD",
  "PLAY",
  "PAUSE",
  "SEEK",
  "STOP",
  "SET_VOLUME",
  "SET_SUBTITLE",
] as const;

const RECEIVER_MESSAGE_TYPES = ["STATUS", "POSITION", "ERROR"] as const;

const VALID_RECEIVER_STATES: ReceiverMessageState[] = [
  "loading",
  "playing",
  "paused",
  "buffering",
  "idle",
  "error",
];

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a SenderMessage to a JSON string for transmission over CastChannel.
 */
export function serializeSenderMessage(msg: SenderMessage): string {
  return JSON.stringify(msg);
}

/**
 * Serialize a ReceiverMessage to a JSON string.
 */
export function serializeReceiverMessage(msg: ReceiverMessage): string {
  return JSON.stringify(msg);
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Validate a ReceiverLoadPayload object.
 * Returns true if all required fields are present and correctly typed.
 */
function isValidLoadPayload(payload: unknown): payload is ReceiverLoadPayload {
  if (!isObject(payload)) return false;
  if (!isString(payload.url)) return false;
  if (!isObject(payload.headers)) return false;
  if (!isString(payload.mimeType)) return false;
  if (!isString(payload.title)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Deserialization with Validation
// ---------------------------------------------------------------------------

/**
 * Deserialize and validate a JSON string as a SenderMessage.
 *
 * Returns the validated SenderMessage or null if:
 * - The JSON is malformed
 * - The `type` field is missing or unrecognized (discarded silently per Req 12.4)
 * - Required payload fields are missing (discarded with error report per Req 12.5)
 */
export function deserializeSenderMessage(
  json: string,
  onError?: (error: string) => void,
): SenderMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Malformed JSON — discard silently
    return null;
  }

  if (!isObject(parsed)) {
    return null;
  }

  const { type } = parsed;

  // Missing or non-string type field — discard without crashing (Req 12.4)
  if (!isString(type)) {
    return null;
  }

  // Unrecognized type — discard without crashing (Req 12.4)
  if (
    !(SENDER_MESSAGE_TYPES as readonly string[]).includes(type)
  ) {
    return null;
  }

  // Validate required payload fields per message type (Req 12.5)
  switch (type) {
    case "LOAD": {
      if (!isValidLoadPayload(parsed.payload)) {
        onError?.(
          `LOAD message missing or invalid 'payload' field (requires url, headers, mimeType, title)`,
        );
        return null;
      }
      return { type: "LOAD", payload: parsed.payload as ReceiverLoadPayload };
    }

    case "PLAY":
      return { type: "PLAY" };

    case "PAUSE":
      return { type: "PAUSE" };

    case "SEEK": {
      if (!isNumber(parsed.position)) {
        onError?.(`SEEK message missing or invalid 'position' field (requires number)`);
        return null;
      }
      return { type: "SEEK", position: parsed.position as number };
    }

    case "STOP":
      return { type: "STOP" };

    case "SET_VOLUME": {
      if (!isNumber(parsed.level)) {
        onError?.(`SET_VOLUME message missing or invalid 'level' field (requires number)`);
        return null;
      }
      return { type: "SET_VOLUME", level: parsed.level as number };
    }

    case "SET_SUBTITLE": {
      const trackIndex = parsed.trackIndex;
      if (trackIndex !== null && !isNumber(trackIndex)) {
        onError?.(
          `SET_SUBTITLE message has invalid 'trackIndex' field (requires number or null)`,
        );
        return null;
      }
      return {
        type: "SET_SUBTITLE",
        trackIndex: trackIndex as number | null,
      };
    }

    default:
      return null;
  }
}

/**
 * Deserialize and validate a JSON string as a ReceiverMessage.
 *
 * Returns the validated ReceiverMessage or null if:
 * - The JSON is malformed
 * - The `type` field is missing or unrecognized (discarded silently per Req 12.4)
 * - Required payload fields are missing (discarded with error report per Req 12.5)
 */
export function deserializeReceiverMessage(
  json: string,
  onError?: (error: string) => void,
): ReceiverMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Malformed JSON — discard silently
    return null;
  }

  if (!isObject(parsed)) {
    return null;
  }

  const { type } = parsed;

  // Missing or non-string type field — discard without crashing (Req 12.4)
  if (!isString(type)) {
    return null;
  }

  // Unrecognized type — discard without crashing (Req 12.4)
  if (
    !(RECEIVER_MESSAGE_TYPES as readonly string[]).includes(type)
  ) {
    return null;
  }

  // Validate required payload fields per message type (Req 12.5)
  switch (type) {
    case "STATUS": {
      if (!isString(parsed.state)) {
        onError?.(`STATUS message missing or invalid 'state' field (requires string)`);
        return null;
      }
      if (!VALID_RECEIVER_STATES.includes(parsed.state as ReceiverMessageState)) {
        onError?.(
          `STATUS message has unrecognized 'state' value: ${parsed.state}`,
        );
        return null;
      }
      return { type: "STATUS", state: parsed.state as ReceiverMessageState };
    }

    case "POSITION": {
      if (!isNumber(parsed.position)) {
        onError?.(`POSITION message missing or invalid 'position' field (requires number)`);
        return null;
      }
      if (!isNumber(parsed.duration)) {
        onError?.(`POSITION message missing or invalid 'duration' field (requires number)`);
        return null;
      }
      return {
        type: "POSITION",
        position: parsed.position as number,
        duration: parsed.duration as number,
      };
    }

    case "ERROR": {
      if (!isString(parsed.code)) {
        onError?.(`ERROR message missing or invalid 'code' field (requires string)`);
        return null;
      }
      if (!isString(parsed.message)) {
        onError?.(`ERROR message missing or invalid 'message' field (requires string)`);
        return null;
      }
      return {
        type: "ERROR",
        code: parsed.code as string,
        message: parsed.message as string,
      };
    }

    default:
      return null;
  }
}
