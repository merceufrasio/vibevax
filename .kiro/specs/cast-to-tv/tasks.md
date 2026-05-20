# Implementation Plan: Cast to TV

## Overview

Implement the Cast to TV feature for the ReVax mobile app, enabling users to cast video streams to Chromecast, Apple TV, and DLNA Smart TVs. The implementation follows a three-layer architecture: UI components, CastSessionManager orchestrator, and protocol-specific Provider adapters. Tasks are organized to build foundational types and state management first, then core logic, providers, extraction, UI components, and finally integration with the existing player.

## Tasks

- [x] 1. Set up module structure, types, and state management
  - [x] 1.1 Create cast module directory structure and type definitions
    - Create `modules/cast/` directory with `index.ts`, `config.ts`, `types.ts`
    - Define all TypeScript interfaces: `CastDevice`, `CastSession`, `MediaInfo`, `CastState`, `CastError`, `CastErrorCode`, `CastProtocol`, `DeviceCapabilities`, `SubtitleTrack`, `CastMediaParams`, `CastConfig`
    - Define `CastSessionState` type and `VALID_TRANSITIONS` map
    - Define `CastProvider` interface with all method signatures
    - _Requirements: 5.1, 10.1–10.5, 12.1, 12.2_

  - [x] 1.2 Implement CastState observable store and state machine logic
    - Create `modules/cast/state.ts` with Zustand store or EventEmitter-based observable state
    - Implement `transitionState` function enforcing the valid transitions map
    - Implement state update methods that validate transitions before applying
    - Log warnings for invalid transition attempts
    - Ensure `session` is always `null` when `isConnected` is `false`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 1.3 Write property tests for state machine validity
    - **Property 3: State machine validity** — For any sequence of state transition requests, the state is always a valid `CastSessionState` and every applied transition follows the `VALID_TRANSITIONS` map
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 1.4 Write property test for no orphaned sessions
    - **Property 4: No orphaned sessions** — For any CastState where `isConnected === false`, the `session` field is always `null`
    - **Validates: Requirements 5.4, 2.4**

- [x] 2. Implement CastSessionManager core logic
  - [x] 2.1 Implement CastSessionManager initialization and provider registration
    - Create `modules/cast/CastSessionManager.ts` as singleton class
    - Implement `initialize(config)` that validates at least one provider is supplied
    - Store registered providers and configuration
    - Implement platform-based provider registration logic (Android: Chromecast only; iOS: Chromecast + AirPlay)
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 2.2 Implement device discovery with parallel scanning and deduplication
    - Implement `startDiscovery()` that runs all providers in parallel
    - Implement deduplication by composite key of IP + device name (first-discovered wins)
    - Implement discovery timeout (default 10s) that stops all scans and returns found devices
    - Implement `stopDiscovery()` that clears previously discovered devices
    - Handle provider errors gracefully (log and continue with remaining providers)
    - Update `CastState.isAvailable` based on device count
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 2.3 Write property tests for device discovery
    - **Property 1: Device deduplication is order-independent** — Deduplication produces the same set regardless of discovery order
    - **Property 2: Discovery availability reflects device count** — `isAvailable === true` iff `devices.length > 0`
    - **Property 14: Discovery freshness** — After stop/start, no stale devices from previous runs
    - **Property 16: Parallel discovery protocol isolation** — Each device's protocol matches its discovering provider
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.6, 14.4**

  - [x] 2.4 Implement device connection and disconnection
    - Implement `connect(device)` that routes to the correct provider by protocol
    - Transition state to `connecting` then `connected` on success
    - Implement 15-second connection timeout with `CONNECTION_FAILED` error
    - Implement `disconnect()` that calls provider disconnect and resets state
    - Handle connecting while already connected (disconnect first)
    - Reject connection to devices not in current discovered list
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 2.5 Write property test for connect/disconnect symmetry
    - **Property 15: Connect/disconnect symmetry** — After connect then disconnect, `isConnected === false` and `session === null`
    - **Validates: Requirements 2.4**

  - [x] 2.6 Implement playback controls (play, pause, seek, setVolume, stop)
    - Implement `play()`, `pause()`, `stop()` delegating to active provider
    - Implement `seek(positionSeconds)` with clamping to `[0, playbackDuration]`
    - Implement `setVolume(level)` with clamping to `[0.0, 1.0]`
    - Reject commands when no active session exists
    - Handle provider command failures with `COMMAND_FAILED` error
    - Update CastState within 500ms of provider confirmation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 2.7 Write property tests for playback controls
    - **Property 6: Volume clamping** — For any numeric value, resulting volume is within `[0.0, 1.0]`
    - **Property 7: Seek clamping** — For any numeric value, resulting position is within `[0, duration]`
    - **Property 5: Provider routing correctness** — Commands dispatched only to provider matching session device protocol
    - **Validates: Requirements 4.3, 4.4, 2.1, 2.5**

  - [x] 2.8 Implement castMedia with stream resolution logic
    - Implement `castMedia(params)` that validates connection state and stream parameter
    - Transition session to `loading` before resolution begins
    - Detect embed sources and delegate to HeadlessExtractService
    - Check `supportsCustomHeaders` capability and throw `HEADERS_REQUIRED` if needed
    - Call `inferMimeType` for MIME type detection
    - Call provider `loadMedia` with resolved MediaInfo
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 2.9 Write property test for headers-required error
    - **Property 20: Headers-required error for unsupported devices** — Streams requiring headers on devices without `supportsCustomHeaders` always throw `HEADERS_REQUIRED`
    - **Validates: Requirements 3.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement utility functions
  - [x] 4.1 Implement inferMimeType function
    - Create MIME type inference based on URL path extension (before query/fragment)
    - Support `.m3u8` → `application/x-mpegURL`, `.mp4` → `video/mp4`, `.mpd` → `application/dash+xml`
    - Default to `application/x-mpegURL` for unrecognized extensions or empty URLs
    - Case-insensitive matching
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 4.2 Write property test for MIME type inference
    - **Property 11: MIME type inference consistency** — `inferMimeType` returns correct MIME type based on extension regardless of query parameters or fragments
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

  - [x] 4.3 Implement SRT to WebVTT subtitle converter
    - Create `modules/cast/extraction/subtitleConverter.ts`
    - Implement `convertSrtToWebVtt(srtContent)` that outputs `WEBVTT` header, converts comma to dot in timestamps, normalizes CRLF to LF
    - Implement `resolveSubtitleForCast(track, headers)` that fetches subtitle, detects format by extension, converts if SRT, passes through if VTT
    - Handle network errors with `SUBTITLE_FETCH_FAILED` error code
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ]* 4.4 Write property tests for subtitle converter
    - **Property 8: SRT→WebVTT cue preservation** — Number of cue blocks in output equals input
    - **Property 9: SRT→WebVTT timestamp format** — All output timestamps use `.` not `,`
    - **Property 10: SRT→WebVTT header** — Output always starts with `"WEBVTT"`
    - **Property 18: Subtitle format-based routing** — `.srt` URLs get converted, `.vtt` URLs pass through
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**

- [x] 5. Implement ChromecastProvider
  - [x] 5.1 Implement ChromecastProvider with react-native-google-cast
    - Create `modules/cast/providers/ChromecastProvider.ts` implementing `CastProvider` interface
    - Implement `startDiscovery` / `stopDiscovery` using `react-native-google-cast` SDK
    - Implement `connect` / `disconnect` session management
    - Implement `loadMedia`, `play`, `pause`, `stop`, `seek`, `setVolume`
    - Implement `onStateChange` and `onPositionUpdate` listeners
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.3, 4.4, 4.5, 14.2_

  - [ ]* 5.2 Write unit tests for ChromecastProvider
    - Mock `react-native-google-cast` native module
    - Test discovery, connection, media loading, and playback control flows
    - Test error handling for connection failures and timeouts
    - _Requirements: 2.1, 2.3, 4.6, 4.7_

- [x] 6. Implement HeadlessExtractService
  - [x] 6.1 Implement HeadlessExtractService for embed stream extraction
    - Create `modules/cast/extraction/HeadlessExtractService.ts`
    - Implement `extractStream(params)` that spawns hidden WebView, loads embed page, intercepts `.m3u8`/`.mp4` network requests
    - Implement 15-second timeout with `EXTRACTION_TIMEOUT` error
    - Apply source-specific ad-blocking rules from `SOURCE_SPECIFIC_BLOCK_RULES`
    - Destroy WebView within 1000ms of completion or failure
    - Implement `cancel()` and `needsExtraction()` static method
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 6.2 Write property tests for HeadlessExtractService
    - **Property 12: Extraction result is always direct** — Successful extraction returns `isEmbed === false`
    - **Property 13: Extraction timeout guarantee** — Promise resolves/rejects within `timeoutMs + 1000ms`
    - **Validates: Requirements 6.2, 6.3**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Custom Chromecast Receiver
  - [x] 8.1 Create custom receiver HTML/JS for GitHub Pages
    - Create `modules/cast/receiver/index.html` with CAF receiver shell
    - Create `modules/cast/receiver/receiver.js` with hls.js integration
    - Implement `xhrSetup` callback for custom header injection on every segment/manifest request
    - Handle LOAD messages: validate URL, begin playback at start position (or 0)
    - Handle PLAY, PAUSE, SEEK, STOP, SET_VOLUME, SET_SUBTITLE messages
    - Send STATUS messages on state changes, POSITION messages every 1 second
    - Send ERROR messages with code and human-readable message on failures
    - Reject LOAD with missing/empty URL by sending ERROR back to sender
    - Create `modules/cast/receiver/styles.css` with minimal receiver UI
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 8.2 Implement sender-side message protocol types and validation
    - Define `SenderMessage` and `ReceiverMessage` discriminated union types
    - Implement message serialization/deserialization with validation
    - Discard messages with unrecognized or missing `type` field without crashing
    - Discard messages with correct `type` but missing required payload fields, report error
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 8.3 Write property test for message protocol round-trip
    - **Property 17: Sender message serialization round-trip** — Any valid SenderMessage serialized to JSON and deserialized back produces a deep-equal object
    - **Validates: Requirements 12.3**

- [x] 9. Implement Local Proxy Server
  - [x] 9.1 Implement LocalProxyServer for AirPlay header passthrough
    - Create `modules/cast/proxy/LocalProxyServer.ts`
    - Implement `start(port)` binding to `127.0.0.1` only, ready within 3 seconds
    - Implement `registerStream` returning unique proxied URL with 16+ char random path token
    - Forward requests to original URL with injected headers, preserve non-conflicting client headers
    - Forward upstream error responses (4xx/5xx) without retrying; 15-second upstream timeout
    - Return not-found for unregistered path tokens
    - Implement `stop()` closing connections and releasing port within 5 seconds
    - Reject non-loopback connections
    - Support maximum 20 concurrent registered streams
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

  - [ ]* 9.2 Write property test for proxy URL uniqueness
    - **Property 19: Proxy URL uniqueness** — Each `registerStream` call returns a unique URL path that never collides with other registrations
    - **Validates: Requirements 13.2**

  - [ ]* 9.3 Write unit tests for LocalProxyServer
    - Test loopback-only binding
    - Test header injection on proxied requests
    - Test unregistered path returns not-found
    - Test max 20 concurrent streams limit
    - _Requirements: 13.1, 13.5, 13.7, 13.8_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement UI components
  - [x] 11.1 Implement CastButton component
    - Create `modules/cast/components/CastButton.tsx`
    - Show cast icon in active state when devices are available
    - Show disabled/inactive state when no devices available (no tap response)
    - Trigger DevicePicker on tap when devices are available
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 11.2 Implement DevicePicker component
    - Create `modules/cast/components/DevicePicker.tsx` as modal/bottom-sheet
    - List all discovered devices with name (truncated single line) and protocol icon
    - Call `onDeviceSelected` callback when user selects a device
    - _Requirements: 8.3, 8.9_

  - [x] 11.3 Implement MiniController component
    - Create `modules/cast/components/MiniController.tsx`
    - Display above tab navigation when cast session is active
    - Show current media title (truncated single line with ellipsis)
    - Include play/pause and stop controls
    - Navigate to NowPlaying on tap outside controls
    - _Requirements: 8.4, 8.5, 8.6_

  - [x] 11.4 Implement NowPlaying full-screen remote control
    - Create `modules/cast/components/NowPlaying.tsx`
    - Include seek bar, volume control, play/pause/stop, subtitle selection
    - Display media title, poster, and playback progress
    - _Requirements: 8.6_

  - [x] 11.5 Implement useCastSession React hook
    - Create `modules/cast/hooks/useCastSession.ts`
    - Expose `state`, `startDiscovery`, `stopDiscovery`, `connect`, `disconnect`, `castMedia`, `play`, `pause`, `stop`, `seek`, `setVolume`
    - Subscribe to CastState changes and trigger re-renders
    - _Requirements: 8.4, 8.5_

- [x] 12. Implement error handling and recovery
  - [x] 12.1 Implement connection loss detection and auto-reconnect
    - Detect connection loss during playback, transition to `disconnected`
    - Emit `CONNECTION_LOST` error with last known playback position
    - Attempt automatic reconnection up to 3 times with 5-second timeout per attempt
    - Display reconnect prompt within 2 seconds of loss
    - If all attempts fail, dismiss prompt and show error message
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 12.2 Implement error UI components
    - Show "No devices found" message with troubleshooting suggestions when discovery finds nothing
    - Show retry button for recoverable errors (`recoverable: true`)
    - Show dismiss-only action for non-recoverable errors (`recoverable: false`)
    - Detect DRM-protected streams and throw `DRM_PROTECTED` error
    - _Requirements: 9.4, 9.5, 9.6, 9.7_

- [x] 13. Integrate with existing MoviePlayer
  - [x] 13.1 Integrate CastButton and cast controls into MoviePlayer
    - Add `CastButton` to existing `MoviePlayer.tsx` controls layout
    - When cast session active: hide local video view, show cast controls (play, pause, seek, volume, disconnect)
    - When cast session ends: restore local player, resume from last cast position within 3 seconds
    - Pass current stream URL, playback position, title, poster, and episode context to cast session
    - Handle cast failure: restore local playback from last position, show error message
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 13.2 Add MiniController as persistent overlay above tab navigation
    - Render MiniController in app layout when cast session is active
    - Hide MiniController and restore MoviePlayer on unexpected disconnect
    - _Requirements: 8.4, 8.7, 8.8_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases
- The custom receiver (task 8.1) is a standalone HTML/JS app hosted on GitHub Pages
- The local proxy server (task 9.1) is only needed for AirPlay with header-protected streams
- Platform-conditional provider registration ensures only supported protocols are active per platform

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "4.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "4.2", "4.3"] },
    { "id": 3, "tasks": ["2.1", "4.4", "5.1"] },
    { "id": 4, "tasks": ["2.2", "5.2", "6.1"] },
    { "id": 5, "tasks": ["2.3", "2.4", "6.2"] },
    { "id": 6, "tasks": ["2.5", "2.6"] },
    { "id": 7, "tasks": ["2.7", "2.8"] },
    { "id": 8, "tasks": ["2.9", "8.1", "8.2", "9.1"] },
    { "id": 9, "tasks": ["8.3", "9.2", "9.3"] },
    { "id": 10, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 11, "tasks": ["12.1", "12.2"] },
    { "id": 12, "tasks": ["13.1", "13.2"] }
  ]
}
```
