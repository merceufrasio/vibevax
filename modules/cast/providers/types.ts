/**
 * CastProvider interface for protocol-specific adapters.
 *
 * Each provider implements the actual casting logic for a given protocol
 * (Chromecast, AirPlay, DLNA). The CastSessionManager routes commands
 * to the appropriate provider based on the connected device's protocol.
 *
 * Re-exports the CastProvider interface from the main types module
 * for convenience when implementing providers.
 */

export type {
  CastProvider,
  CastDevice,
  CastSession,
  CastSessionState,
  CastProtocol,
  MediaInfo,
} from "../types";
