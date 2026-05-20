/**
 * Public API for the Cast to TV module.
 *
 * This is the only entry point that consumers outside `modules/cast/`
 * should import from. It exposes:
 *
 *   - All type definitions for devices, sessions, media, state, and errors
 *   - The state machine transitions map
 *   - Configuration accessors for runtime setup
 *   - The CastProvider interface for protocol adapters
 *
 * Validates: Requirements 5.1, 10.1–10.5, 12.1, 12.2
 */

// Types
export type {
  CastDevice,
  CastSession,
  CastSessionState,
  CastState,
  CastError,
  CastErrorCode,
  CastProtocol,
  DeviceCapabilities,
  SubtitleTrack,
  MediaInfo,
  CastMediaParams,
  CastConfig,
  CastProvider,
} from "./types";

// State machine transitions map
export { VALID_TRANSITIONS } from "./types";

// Configuration
export { configureCastModule, getCastConfig, isCastEnabled } from "./config";

// State store and state machine
export { castStore, transitionState } from "./state";
export type { CastStateListener } from "./state";

// CastSessionManager
export { CastSessionManager } from "./CastSessionManager";

// Utilities
export { inferMimeType } from "./utils";

// Protocol — message types and serialization for custom receiver
export type {
  SenderMessage,
  ReceiverMessage,
  ReceiverMessageState,
  ReceiverLoadPayload,
  ReceiverSubtitleTrack,
} from "./protocol";

export {
  serializeSenderMessage,
  serializeReceiverMessage,
  deserializeSenderMessage,
  deserializeReceiverMessage,
} from "./protocol";

// React hook
export { useCastSession } from "./hooks/useCastSession";
export type { UseCastSessionReturn } from "./hooks/useCastSession";

// UI Components
export { CastButton } from "./components/CastButton";
export type { CastButtonProps } from "./components/CastButton";
export { DevicePicker } from "./components/DevicePicker";
export type { DevicePickerProps } from "./components/DevicePicker";
export { MiniController } from "./components/MiniController";
export type { MiniControllerProps } from "./components/MiniController";
export { NowPlaying } from "./components/NowPlaying";
export type { NowPlayingProps } from "./components/NowPlaying";
export { CastErrorDisplay } from "./components/CastErrorDisplay";
export type { CastErrorDisplayProps } from "./components/CastErrorDisplay";

// Connection Recovery
export { ConnectionRecoveryManager } from "./ConnectionRecoveryManager";
export type {
  ConnectionRecoveryState,
  ConnectionRecoveryListener,
  ReconnectStatus,
} from "./ConnectionRecoveryManager";

// DRM Detection
export { isDrmProtected, assertNotDrmProtected } from "./drmDetection";
