/**
 * Protocol module — message types and serialization for the custom
 * Chromecast receiver communication channel.
 */
export type {
  SenderMessage,
  ReceiverMessage,
  ReceiverMessageState,
  ReceiverLoadPayload,
  ReceiverSubtitleTrack,
} from "./messages";

export {
  serializeSenderMessage,
  serializeReceiverMessage,
  deserializeSenderMessage,
  deserializeReceiverMessage,
} from "./messages";
