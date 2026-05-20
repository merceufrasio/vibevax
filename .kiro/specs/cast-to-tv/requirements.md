# Requirements Document

## Introduction

The Cast to TV feature enables users of the ReVax mobile app to cast video streams to TV-class devices including Chromecast, Apple TV, and DLNA Smart TVs. The feature provides a unified casting experience across protocols, handles both direct streams and embed sources requiring headless extraction, and integrates seamlessly with the existing player and source plugin system.

## Glossary

- **CastSessionManager**: Central orchestrator that manages device discovery, session lifecycle, and media playback commands across all casting protocols
- **CastProvider**: Protocol-specific adapter implementing casting logic for a given protocol (Chromecast, AirPlay, DLNA)
- **HeadlessExtractService**: Service that resolves embed source URLs into castable direct stream URLs using a hidden WebView
- **CastDevice**: A discovered TV-class device on the local network capable of receiving cast streams
- **CastSession**: An active connection between the app and a CastDevice with associated playback state
- **CastState**: Global observable state representing the current status of casting (devices, connection, playback)
- **StreamResult**: The output of source resolution containing a stream URL, headers, and metadata
- **DevicePicker**: UI component presenting available cast devices for user selection
- **MiniController**: Persistent mini-bar UI showing current cast media with basic playback controls
- **NowPlaying**: Full-screen remote control UI with seek, volume, and subtitle controls
- **CastButton**: UI component indicating cast availability and triggering device discovery/selection
- **Custom_Receiver**: A Chromecast receiver application hosted on GitHub Pages that supports custom headers and subtitle conversion
- **Local_Proxy**: An HTTP proxy running on the mobile device that injects custom headers for protocols that cannot send them natively
- **SRT**: SubRip subtitle format using comma as millisecond separator
- **WebVTT**: Web Video Text Tracks format required by Chromecast, using dot as millisecond separator

## Requirements

### Requirement 1: Device Discovery

**User Story:** As a user, I want to discover available cast devices on my local network, so that I can select a TV to cast my video to.

#### Acceptance Criteria

1. WHEN the user initiates device discovery, THE CastSessionManager SHALL scan all registered providers in parallel and complete or abort within a maximum of 30 seconds
2. WHEN multiple providers discover devices simultaneously, THE CastSessionManager SHALL deduplicate devices by matching composite key of IP address AND device name, retaining the first-discovered instance
3. WHEN discovery completes with at least one device found, THE CastState SHALL set `isAvailable` to true
4. WHEN discovery completes with zero devices found, THE CastState SHALL set `isAvailable` to false without throwing an error
5. WHEN discovery exceeds the configured timeout (default: 10 seconds), THE CastSessionManager SHALL stop all provider scans and return the devices found so far
6. WHEN discovery is stopped and restarted, THE CastSessionManager SHALL clear all previously discovered devices before beginning the new scan, ensuring no devices from prior runs appear in the results
7. IF a registered provider throws an error during scanning, THEN THE CastSessionManager SHALL log the failure, continue scanning with the remaining providers, and include only successfully discovered devices in the results

### Requirement 2: Device Connection

**User Story:** As a user, I want to connect to a discovered cast device, so that I can begin casting video content to my TV.

#### Acceptance Criteria

1. WHEN the user selects a device from the DevicePicker, THE CastSessionManager SHALL route the connection request to the provider matching the device protocol and transition the session state to `connecting`
2. WHEN a connection is successfully established, THE CastState SHALL transition to `isConnected: true` with a CastSession containing a non-null `id`, the connected `device`, and state set to `connected`
3. IF a connection attempt does not succeed within 15 seconds, THEN THE CastSessionManager SHALL abort the attempt and emit a CastError with code `CONNECTION_FAILED` and `recoverable: true`
4. WHEN the user disconnects, THE CastState SHALL transition to `isConnected: false` and `session: null`, and the CastSessionManager SHALL call `disconnect()` on the active provider to close the network connection
5. THE CastSessionManager SHALL dispatch commands exclusively to the provider matching the session device protocol
6. IF the user attempts to connect while a session is already active, THEN THE CastSessionManager SHALL disconnect the existing session before establishing the new connection
7. IF the user attempts to connect to a device not present in the current discovered devices list, THEN THE CastSessionManager SHALL reject the request and emit a CastError with code `CONNECTION_FAILED`

### Requirement 3: Media Casting

**User Story:** As a user, I want to cast the currently playing video to my connected TV device, so that I can watch content on a larger screen.

#### Acceptance Criteria

1. WHEN the user casts a direct stream, THE CastSessionManager SHALL load the stream URL, title, MIME type, and poster URL on the connected device via the active provider's `loadMedia` method
2. WHEN the user casts an embed source, THE CastSessionManager SHALL invoke the HeadlessExtractService to resolve a direct stream URL before loading on the connected device
3. WHEN media is successfully loaded on the device and playback begins, THE CastSession state SHALL transition from `loading` to `playing`
4. IF a stream requires custom headers and the connected device's `supportsCustomHeaders` capability is false, THEN THE CastSessionManager SHALL throw a CastError with code `HEADERS_REQUIRED` without attempting to load media on the device
5. IF `castMedia` is called with a null or undefined stream parameter, THEN THE CastSessionManager SHALL throw a CastError before attempting any network operation or provider call
6. IF `castMedia` is called while `CastState.isConnected` is false, THEN THE CastSessionManager SHALL throw a CastError with code `CONNECTION_FAILED` without attempting media resolution or device loading
7. WHEN `castMedia` is called with a valid stream and an active connection, THE CastSession state SHALL transition to `loading` before stream resolution begins

### Requirement 4: Playback Controls

**User Story:** As a user, I want to control playback on my TV from my phone, so that I can play, pause, seek, and adjust volume remotely.

#### Acceptance Criteria

1. WHEN the user issues a play command, THE CastSessionManager SHALL delegate to the active provider and transition state to `playing`
2. WHEN the user issues a pause command, THE CastSessionManager SHALL delegate to the active provider and transition state to `paused`
3. WHEN the user seeks to a position, THE CastSessionManager SHALL clamp the position in seconds to `[0, playbackDuration]` and update playback position to within 1 second of the requested value
4. WHEN the user sets volume, THE CastSessionManager SHALL clamp the value to `[0.0, 1.0]` and update the device volume
5. WHEN the user issues a stop command, THE CastSessionManager SHALL stop playback, reset the playback position to 0, and transition the session state to `idle`
6. IF a playback control command (play, pause, seek, setVolume, stop) is issued while no cast session is active, THEN THE CastSessionManager SHALL reject the command with a CastError indicating no active session
7. IF the active provider fails to execute a delegated playback command, THEN THE CastSessionManager SHALL emit a CastError with code `COMMAND_FAILED` and remain in the current state
8. WHEN a playback control command succeeds, THE CastSessionManager SHALL update the CastState within 500 milliseconds of receiving confirmation from the provider

### Requirement 5: Session State Machine

**User Story:** As a developer, I want the cast session to follow a well-defined state machine, so that the UI always reflects a valid and predictable state.

#### Acceptance Criteria

1. THE CastSession state SHALL only contain values from the defined set: `connecting`, `connected`, `loading`, `playing`, `paused`, `buffering`, `idle`, `disconnected`, `error`
2. WHEN a new CastSession is created, THE CastSessionManager SHALL set the initial state to `disconnected`
3. WHEN a state transition is requested, THE CastSessionManager SHALL only allow transitions defined in the valid transitions map: `disconnected` → [`connecting`]; `connecting` → [`connected`, `error`, `disconnected`]; `connected` → [`loading`, `idle`, `disconnected`]; `loading` → [`playing`, `error`, `disconnected`]; `playing` → [`paused`, `buffering`, `idle`, `error`, `disconnected`]; `paused` → [`playing`, `buffering`, `idle`, `error`, `disconnected`]; `buffering` → [`playing`, `paused`, `error`, `disconnected`]; `idle` → [`loading`, `disconnected`]; `error` → [`connecting`, `disconnected`, `idle`]
4. IF an invalid state transition is attempted, THEN THE CastSessionManager SHALL remain in the current state and emit a warning-level log entry containing the current state and the rejected target state
5. WHILE `state.isConnected` is false, THE CastState SHALL maintain `session` as null

### Requirement 6: Headless Stream Extraction

**User Story:** As a user, I want to cast videos from embed sources without manual intervention, so that all content is castable regardless of how the source plugin delivers it.

#### Acceptance Criteria

1. WHEN an embed source URL is provided, THE HeadlessExtractService SHALL spawn a hidden WebView to load the embed page and intercept network requests matching direct stream URL patterns (`.m3u8` or `.mp4`)
2. WHEN extraction intercepts a matching stream URL, THE HeadlessExtractService SHALL return a StreamResult with `isEmbed` set to `false` and a valid direct stream URL within 15000 milliseconds of the extraction start
3. WHEN extraction does not intercept a matching stream URL within 15000 milliseconds, THE HeadlessExtractService SHALL throw a CastError with code `EXTRACTION_TIMEOUT`, destroy the WebView instance, and release all associated resources
4. IF extraction fails for reasons other than timeout (network error, WebView crash, or invalid embed URL), THEN THE HeadlessExtractService SHALL throw a CastError with code `EXTRACTION_FAILED` and destroy the WebView instance
5. WHILE extraction is in progress, THE HeadlessExtractService SHALL apply the source-specific ad-blocking rules matching the `sourceId` from `SOURCE_SPECIFIC_BLOCK_RULES` to block non-stream network requests in the hidden WebView
6. WHEN the HeadlessExtractService destroys a WebView after extraction completes or fails, THE HeadlessExtractService SHALL release the WebView within 1000 milliseconds of the extraction result or error

### Requirement 7: Subtitle Conversion

**User Story:** As a user, I want subtitles to work when casting, so that I can watch foreign-language content on my TV with proper captions.

#### Acceptance Criteria

1. WHEN an SRT subtitle file is provided for casting, THE Subtitle_Converter SHALL convert it to WebVTT format
2. THE Subtitle_Converter SHALL produce output that starts with the `WEBVTT` header followed by a blank line before the first cue block
3. THE Subtitle_Converter SHALL convert all timestamp millisecond separators from comma to dot
4. THE Subtitle_Converter SHALL preserve the number of cue blocks from input to output
5. THE Subtitle_Converter SHALL normalize CRLF line endings to LF before processing the SRT content
6. WHEN a subtitle URL ends in `.srt`, THE `resolveSubtitleForCast` function SHALL fetch the content, perform conversion to WebVTT, and return a URL loadable by the Chromecast receiver
7. WHEN a subtitle URL ends in `.vtt`, THE `resolveSubtitleForCast` function SHALL pass the URL through unchanged
8. IF the subtitle URL does not end in `.srt` or `.vtt`, THEN THE `resolveSubtitleForCast` function SHALL treat the content as SRT and attempt conversion
9. IF fetching the subtitle URL fails due to a network error, THEN THE `resolveSubtitleForCast` function SHALL throw a CastError with code `SUBTITLE_FETCH_FAILED`

### Requirement 8: Cast UI Components

**User Story:** As a user, I want intuitive cast controls in the app, so that I can easily discover devices, control playback, and see what is currently casting.

#### Acceptance Criteria

1. WHEN at least one cast device is discovered on the local network, THE CastButton SHALL display a cast icon in its active state visually distinct from the inactive state
2. IF no cast devices are available, THEN THE CastButton SHALL appear in a disabled inactive state and SHALL NOT respond to taps
3. WHEN the user taps the CastButton while at least one device is available, THE system SHALL present the DevicePicker listing all currently discovered devices
4. WHILE a cast session is active, THE MiniController SHALL display above the tab navigation showing the current media title truncated to a single line with ellipsis if exceeding the available width, alongside play/pause and stop controls
5. WHEN the user taps play/pause on the MiniController, THE system SHALL toggle the remote playback between playing and paused states
6. WHEN the user taps the MiniController outside of the playback controls, THE system SHALL navigate to the NowPlaying full-screen remote control
7. WHILE casting is active, THE MoviePlayer SHALL hide the local video player and display the MiniController in its place
8. IF the cast session disconnects unexpectedly, THEN THE system SHALL dismiss the MiniController and restore the local MoviePlayer to its previous state
9. THE DevicePicker SHALL display each device with its name truncated to a single line and its protocol icon

### Requirement 9: Error Handling and Recovery

**User Story:** As a user, I want clear feedback when casting fails, so that I can understand the problem and take corrective action.

#### Acceptance Criteria

1. WHEN the device connection is lost during playback, THE CastSessionManager SHALL transition state to `disconnected` and emit a CastError with code `CONNECTION_LOST` containing the last known playback position in seconds
2. WHEN a connection is lost, THE system SHALL display a reconnect prompt within 2 seconds and attempt automatic reconnection up to 3 times with a 5-second timeout per attempt
3. IF all reconnection attempts fail, THEN THE system SHALL dismiss the reconnect prompt, display an error message indicating the device is unreachable, and transition the session state to `disconnected` with `session: null`
4. WHEN a DRM-protected stream is detected during media load, THE CastSessionManager SHALL throw a CastError with code `DRM_PROTECTED` and `recoverable: false`
5. WHEN no devices are found after discovery, THE UI SHALL display a "No devices found" message with a list of at least 2 troubleshooting suggestions (e.g., check Wi-Fi network, ensure device is powered on)
6. IF a CastError has `recoverable: true`, THEN THE UI SHALL display a retry button that re-invokes the failed operation when tapped
7. IF a CastError has `recoverable: false`, THEN THE UI SHALL display the error message without a retry option and provide a dismiss action that clears the error from CastState

### Requirement 10: MIME Type Inference

**User Story:** As a developer, I want the system to correctly identify stream formats, so that the cast device receives the proper content type for playback.

#### Acceptance Criteria

1. WHEN a stream URL's path component ends with `.m3u8` (case-insensitive) before any query string or fragment, THE `inferMimeType` function SHALL return `application/x-mpegURL`
2. WHEN a stream URL's path component ends with `.mp4` (case-insensitive) before any query string or fragment, THE `inferMimeType` function SHALL return `video/mp4`
3. WHEN a stream URL's path component ends with `.mpd` (case-insensitive) before any query string or fragment, THE `inferMimeType` function SHALL return `application/dash+xml`
4. WHEN a stream URL's path component does not end with `.m3u8`, `.mp4`, or `.mpd` (case-insensitive), THE `inferMimeType` function SHALL return `application/x-mpegURL` as the default
5. IF the stream URL is empty or contains no path component, THEN THE `inferMimeType` function SHALL return `application/x-mpegURL`

### Requirement 11: Custom Chromecast Receiver

**User Story:** As a user, I want to cast streams that require custom headers, so that protected content from various sources plays correctly on my TV.

#### Acceptance Criteria

1. WHEN a stream requires custom headers, THE Custom_Receiver SHALL inject those headers on every segment and manifest request using hls.js `xhrSetup`
2. WHEN the sender sends a LOAD message with a valid URL and headers, THE Custom_Receiver SHALL begin playback at the specified start position, or at position 0 if no start position is provided
3. IF the sender sends a LOAD message with a missing or empty URL, THEN THE Custom_Receiver SHALL send an ERROR message back to the sender without attempting playback
4. WHEN playback state changes on the receiver to any of `loading`, `playing`, `paused`, `buffering`, `idle`, or `error`, THE Custom_Receiver SHALL send a STATUS message containing the new state back to the sender app
5. WHILE playback is active, THE Custom_Receiver SHALL send POSITION messages containing the current playback position in seconds and total duration in seconds to the sender app every 1 second
6. WHEN an error occurs on the receiver, THE Custom_Receiver SHALL send an ERROR message to the sender containing an error code identifying the failure category and a human-readable message describing the cause

### Requirement 12: Custom Receiver Message Protocol

**User Story:** As a developer, I want a well-defined message protocol between sender and receiver, so that communication is reliable and extensible.

#### Acceptance Criteria

1. THE sender-to-receiver messages SHALL follow the defined SenderMessage type with a discriminated `type` field whose value is one of: 'LOAD', 'PLAY', 'PAUSE', 'SEEK', 'STOP', 'SET_VOLUME', or 'SET_SUBTITLE'
2. THE receiver-to-sender messages SHALL follow the defined ReceiverMessage type with a discriminated `type` field whose value is one of: 'STATUS', 'POSITION', or 'ERROR'
3. THE system SHALL produce a deep-equal message object when any valid SenderMessage or ReceiverMessage is serialized to JSON and deserialized back, preserving all field names, values, and types
4. IF a received message contains an unrecognized `type` value or is missing the `type` field, THEN THE receiving side SHALL discard the message without crashing and SHALL not alter playback state
5. IF a received message contains the correct `type` field but is missing required payload fields for that type, THEN THE receiving side SHALL discard the message and SHALL report an error indicating the validation failure

### Requirement 13: Local Proxy Server

**User Story:** As a user, I want to cast header-protected streams via AirPlay, so that content requiring authentication headers works on Apple TV.

#### Acceptance Criteria

1. WHEN the Local_Proxy is started with a specified port, THE server SHALL begin listening on that port bound to the loopback address (127.0.0.1) only, and SHALL become ready to accept connections within 3 seconds
2. WHEN a stream is registered with the Local_Proxy providing an original URL and a headers record (as defined in StreamResult), THE server SHALL return a unique proxied URL in the format `http://127.0.0.1:{port}/{unique-path-token}` where the path token is at least 16 characters of URL-safe random characters
3. WHEN the proxied URL is requested by a client, THE Local_Proxy SHALL forward the request to the original registered URL with all custom headers from the registration injected into the outgoing request, preserving any additional request headers sent by the client that do not conflict with injected headers
4. IF the original upstream server responds with an error status (4xx or 5xx) or fails to respond within 15 seconds, THEN THE Local_Proxy SHALL forward the error status to the requesting client without retrying
5. IF a request is received for a path token that has not been registered, THEN THE Local_Proxy SHALL respond with a not-found error status
6. WHEN the Local_Proxy is stopped, THE server SHALL close all active connections, reject new connections, and release the listening port within 5 seconds
7. IF a connection attempt originates from a non-loopback address, THEN THE Local_Proxy SHALL reject the connection without processing the request
8. THE Local_Proxy SHALL support a maximum of 20 concurrent registered streams

### Requirement 14: Provider Registration and Platform Support

**User Story:** As a developer, I want providers to be registered based on platform capabilities, so that only supported protocols are active on each platform.

#### Acceptance Criteria

1. IF zero providers are supplied during CastSessionManager initialization, THEN THE CastSessionManager SHALL reject initialization with an error indicating that at least one provider is required
2. IF the current platform is Android, THEN THE system SHALL register the ChromecastProvider and no other providers
3. IF the current platform is iOS, THEN THE system SHALL register both ChromecastProvider and AirPlayProvider and no other providers
4. IF the current platform is neither Android nor iOS, THEN THE system SHALL not register any cast providers and SHALL not expose cast functionality
5. WHEN discovery runs across multiple registered providers, THE system SHALL return each discovered device associated exclusively with the protocol of the provider that discovered it, such that no device appears in the results of a provider that did not discover it

### Requirement 15: Integration with Existing Player

**User Story:** As a user, I want casting to integrate seamlessly with the existing video player, so that I can switch between local and cast playback without disruption.

#### Acceptance Criteria

1. WHEN a cast session becomes active, THE MoviePlayer SHALL hide the local video view (VideoView or WebView) and display cast controls including play, pause, seek, volume, and a disconnect button
2. WHEN a cast session ends, THE MoviePlayer SHALL restore the local video player and resume playback from the last known cast position within 3 seconds
3. THE CastButton SHALL be rendered within the existing MoviePlayer controls layout
4. WHEN the user initiates casting, THE system SHALL pass the current stream URL, playback position, title, poster image URL, and episode context to the cast session
5. IF the cast session fails to start or disconnects unexpectedly, THEN THE MoviePlayer SHALL restore local playback from the last known playback position and display an error message indicating the cast failure reason
