/**
 * CastMessageChannel — Abstraction over the Cast SDK's custom message channel.
 *
 * Handles serialization, deserialization, message routing, and listener
 * management for the `urn:x-cast:com.revax.cast` namespace. Incoming messages
 * are validated via `deserializeReceiverMessage`; malformed or unrecognized
 * messages are discarded with a console.warn.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 6.5, 6.6
 */

import {
  serializeSenderMessage,
  deserializeReceiverMessage,
} from "../protocol/messages";
import type { SenderMessage, ReceiverMessage } from "../protocol/messages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the native CastChannel object from
 * react-native-google-cast. Only the methods we actually use are declared
 * here so the class can be tested with a lightweight mock.
 */
export interface NativeCastChannel {
  /** Send a JSON message on this custom channel. */
  sendMessage(message: string): Promise<void>;

  /** Register a listener for messages received on this channel. */
  onMessage(listener: (message: Record<string, unknown> | string) => void): void;

  /** Remove the active native message listener. */
  offMessage(): void;

  /** Remove the native custom channel from the Cast session. */
  remove(): Promise<void>;

  /** Whether the native channel is connected. */
  connected?: boolean;

  /** Whether the native channel can currently send messages. */
  writable?: boolean;
}

export type ReceiverMessageListener = (message: ReceiverMessage) => void;

// ---------------------------------------------------------------------------
// CastMessageChannel
// ---------------------------------------------------------------------------

export class CastMessageChannel {
  private channel: NativeCastChannel | null;
  private listeners: Set<ReceiverMessageListener> = new Set();

  constructor(nativeChannel: NativeCastChannel) {
    this.channel = nativeChannel;
    this.setupNativeListener();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Send a typed message to the receiver.
   *
   * Serializes the message via `serializeSenderMessage` and transmits it
   * over the native custom channel created for `urn:x-cast:com.revax.cast`.
   *
   * @throws Error if the channel is not connected.
   */
  async send(message: SenderMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error(
        "CastMessageChannel is not connected. Cannot send message.",
      );
    }

    const json = serializeSenderMessage(message);
    await this.channel!.sendMessage(json);
  }

  /**
   * Register a listener for validated receiver messages.
   *
   * The listener is only called for messages that pass deserialization
   * and validation. Malformed or unrecognized messages are discarded.
   *
   * @returns An unsubscribe function that removes the listener.
   */
  onMessage(listener: ReceiverMessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Whether the channel is currently connected (session reference is alive).
   */
  isConnected(): boolean {
    return this.channel != null && this.channel.connected !== false;
  }

  /**
   * Dispose the channel: remove all listeners, cancel the native
   * subscription, and null the session reference.
   */
  dispose(): void {
    if (this.channel) {
      this.channel.offMessage();
      void this.channel.remove().catch(() => undefined);
    }

    this.listeners.clear();
    this.channel = null;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Set up the native message listener on the custom channel namespace.
   * Incoming messages are deserialized and validated before being dispatched
   * to registered listeners.
   */
  private setupNativeListener(): void {
    this.channel!.onMessage((rawMessage) => {
      this.handleRawMessage(
        typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage),
      );
    });
  }

  /**
   * Process a raw message string from the native layer.
   *
   * - Malformed JSON → console.warn, discard (Req 7.4)
   * - Unrecognized type → console.warn, discard (Req 7.5)
   * - STATUS with unrecognized state → discard (Req 6.6)
   * - POSITION where position > duration → clamp position to duration (Req 6.5)
   */
  private handleRawMessage(rawMessage: string): void {
    const message = deserializeReceiverMessage(rawMessage, (error) => {
      console.warn("[CastMessageChannel] Message validation error:", error);
    });

    if (message === null) {
      // deserializeReceiverMessage returns null for malformed JSON,
      // unrecognized types, and invalid payloads. The onError callback
      // above handles logging for validation errors. For malformed JSON
      // and unrecognized types, we also log here.
      console.warn(
        "[CastMessageChannel] Discarding invalid message:",
        rawMessage,
      );
      return;
    }

    // Clamp POSITION messages where position > duration (Req 6.5)
    if (message.type === "POSITION") {
      const clamped: ReceiverMessage = {
        type: "POSITION",
        position: Math.min(message.position, message.duration),
        duration: message.duration,
      };
      this.notifyListeners(clamped);
      return;
    }

    this.notifyListeners(message);
  }

  /**
   * Notify all registered listeners with a validated message.
   */
  private notifyListeners(message: ReceiverMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}
