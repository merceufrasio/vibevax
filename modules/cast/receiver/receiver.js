/**
 * ReVax Custom Chromecast Receiver
 *
 * Uses hls.js for HLS playback with custom header injection via xhrSetup.
 * Communicates with the sender app via a custom message channel.
 *
 * Sender → Receiver messages: LOAD, PLAY, PAUSE, SEEK, STOP, SET_VOLUME, SET_SUBTITLE
 * Receiver → Sender messages: STATUS, POSITION, ERROR
 */

(function () {
  'use strict';

  // Custom namespace for sender↔receiver communication
  var CHANNEL_NAMESPACE = 'urn:x-cast:com.revax.cast';

  // DOM elements
  var videoElement = document.getElementById('player');
  var mediaOverlay = document.getElementById('media-overlay');
  var posterElement = document.getElementById('poster');
  var titleElement = document.getElementById('media-title');
  var subtitleElement = document.getElementById('media-subtitle');
  var spinnerElement = document.getElementById('spinner');
  var idleScreen = document.getElementById('idle-screen');

  // State
  var hlsInstance = null;
  var currentHeaders = {};
  var positionInterval = null;
  var currentState = 'idle';
  var subtitleTracks = [];
  var activeSubtitleIndex = null;

  // --- CAF Receiver Context ---
  var castContext = cast.framework.CastReceiverContext.getInstance();
  var playerManager = castContext.getPlayerManager();

  // --- Custom Message Bus ---
  castContext.addCustomMessageListener(CHANNEL_NAMESPACE, function (event) {
    var senderId = event.senderId;
    var message = event.data;

    if (!message || typeof message.type !== 'string') {
      // Discard messages with missing or invalid type field
      return;
    }

    switch (message.type) {
      case 'LOAD':
        handleLoad(senderId, message.payload);
        break;
      case 'PLAY':
        handlePlay();
        break;
      case 'PAUSE':
        handlePause();
        break;
      case 'SEEK':
        handleSeek(message.position);
        break;
      case 'STOP':
        handleStop();
        break;
      case 'SET_VOLUME':
        handleSetVolume(message.level);
        break;
      case 'SET_SUBTITLE':
        handleSetSubtitle(message.trackIndex);
        break;
      default:
        // Unrecognized message type — discard silently
        break;
    }
  });

  // --- Message Handlers ---

  function handleLoad(senderId, payload) {
    // Validate payload
    if (!payload || !payload.url || typeof payload.url !== 'string' || payload.url.trim() === '') {
      sendError('INVALID_URL', 'LOAD rejected: missing or empty URL');
      return;
    }

    // Clean up previous playback
    cleanup();

    // Store headers for xhrSetup
    currentHeaders = payload.headers || {};

    // Update UI with media info
    showMediaOverlay(payload);
    hideIdleScreen();
    updateState('loading');

    var url = payload.url;
    var startPosition = typeof payload.startPosition === 'number' ? payload.startPosition : 0;

    // Set up subtitle tracks
    subtitleTracks = payload.subtitles || [];
    activeSubtitleIndex = null;

    // Determine playback strategy
    if (isHlsStream(url)) {
      loadWithHls(url, startPosition);
    } else {
      loadDirectly(url, startPosition);
    }
  }

  function handlePlay() {
    if (videoElement.paused) {
      videoElement.play().catch(function (err) {
        sendError('PLAYBACK_ERROR', 'Failed to resume playback: ' + err.message);
      });
    }
  }

  function handlePause() {
    if (!videoElement.paused) {
      videoElement.pause();
    }
  }

  function handleSeek(position) {
    if (typeof position !== 'number' || isNaN(position)) {
      return;
    }
    var duration = videoElement.duration || 0;
    var clampedPosition = Math.max(0, Math.min(position, duration));
    videoElement.currentTime = clampedPosition;
  }

  function handleStop() {
    cleanup();
    showIdleScreen();
    updateState('idle');
  }

  function handleSetVolume(level) {
    if (typeof level !== 'number' || isNaN(level)) {
      return;
    }
    var clampedLevel = Math.max(0, Math.min(1, level));
    videoElement.volume = clampedLevel;
    videoElement.muted = clampedLevel === 0;
  }

  function handleSetSubtitle(trackIndex) {
    // Disable all text tracks
    for (var i = 0; i < videoElement.textTracks.length; i++) {
      videoElement.textTracks[i].mode = 'hidden';
    }

    activeSubtitleIndex = trackIndex;

    if (trackIndex === null || trackIndex === undefined || trackIndex < 0) {
      // Subtitles disabled
      return;
    }

    // Enable the requested track
    if (trackIndex < videoElement.textTracks.length) {
      videoElement.textTracks[trackIndex].mode = 'showing';
    }
  }

  // --- Playback Strategies ---

  function loadWithHls(url, startPosition) {
    if (!Hls.isSupported()) {
      sendError('HLS_NOT_SUPPORTED', 'hls.js is not supported in this environment');
      updateState('error');
      return;
    }

    hlsInstance = new Hls({
      xhrSetup: function (xhr, requestUrl) {
        // Inject custom headers on every segment and manifest request
        var headerKeys = Object.keys(currentHeaders);
        for (var i = 0; i < headerKeys.length; i++) {
          var key = headerKeys[i];
          xhr.setRequestHeader(key, currentHeaders[key]);
        }
      },
      startPosition: startPosition > 0 ? startPosition : -1,
    });

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
      videoElement.play().then(function () {
        if (startPosition > 0) {
          videoElement.currentTime = startPosition;
        }
        loadSubtitleTracks();
      }).catch(function (err) {
        sendError('PLAYBACK_ERROR', 'Failed to start playback: ' + err.message);
        updateState('error');
      });
    });

    hlsInstance.on(Hls.Events.ERROR, function (event, data) {
      if (data.fatal) {
        var errorMessage = 'HLS fatal error: ' + data.type + ' - ' + data.details;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            sendError('NETWORK_ERROR', errorMessage);
            // Try to recover
            hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            sendError('MEDIA_ERROR', errorMessage);
            hlsInstance.recoverMediaError();
            break;
          default:
            sendError('FATAL_ERROR', errorMessage);
            updateState('error');
            cleanup();
            break;
        }
      }
    });

    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(videoElement);
  }

  function loadDirectly(url, startPosition) {
    // For MP4 or other direct sources
    videoElement.src = url;
    videoElement.currentTime = startPosition;

    videoElement.play().then(function () {
      loadSubtitleTracks();
    }).catch(function (err) {
      sendError('PLAYBACK_ERROR', 'Failed to start playback: ' + err.message);
      updateState('error');
    });
  }

  function loadSubtitleTracks() {
    // Remove existing track elements
    var existingTracks = videoElement.querySelectorAll('track');
    for (var i = existingTracks.length - 1; i >= 0; i--) {
      videoElement.removeChild(existingTracks[i]);
    }

    // Add new subtitle tracks
    for (var j = 0; j < subtitleTracks.length; j++) {
      var track = subtitleTracks[j];
      var trackElement = document.createElement('track');
      trackElement.kind = 'subtitles';
      trackElement.label = track.label || track.lang;
      trackElement.srclang = track.lang;
      trackElement.src = track.url;
      if (j === 0) {
        trackElement.default = true;
      }
      videoElement.appendChild(trackElement);
    }
  }

  // --- Video Event Listeners ---

  videoElement.addEventListener('playing', function () {
    updateState('playing');
    hideMediaOverlay();
    startPositionReporting();
  });

  videoElement.addEventListener('pause', function () {
    // Only report paused if not seeking or ended
    if (!videoElement.seeking && !videoElement.ended) {
      updateState('paused');
    }
  });

  videoElement.addEventListener('waiting', function () {
    updateState('buffering');
    showSpinner();
  });

  videoElement.addEventListener('canplay', function () {
    hideSpinner();
  });

  videoElement.addEventListener('ended', function () {
    updateState('idle');
    stopPositionReporting();
  });

  videoElement.addEventListener('error', function () {
    var error = videoElement.error;
    var message = 'Video playback error';
    var code = 'PLAYBACK_ERROR';

    if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          message = 'Playback aborted';
          code = 'ABORTED';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          message = 'Network error during playback';
          code = 'NETWORK_ERROR';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          message = 'Media decode error';
          code = 'DECODE_ERROR';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          message = 'Media format not supported';
          code = 'FORMAT_NOT_SUPPORTED';
          break;
      }
    }

    sendError(code, message);
    updateState('error');
  });

  // --- State Management ---

  function updateState(newState) {
    if (newState === currentState) {
      return;
    }
    currentState = newState;
    sendStatus(newState);
  }

  // --- Sender Communication ---

  function sendStatus(state) {
    broadcastMessage({
      type: 'STATUS',
      state: state,
    });
  }

  function sendPosition() {
    var position = videoElement.currentTime || 0;
    var duration = videoElement.duration || 0;

    // Don't send position if duration is not available or is infinite (live)
    if (!isFinite(duration)) {
      duration = 0;
    }

    broadcastMessage({
      type: 'POSITION',
      position: Math.round(position * 10) / 10,
      duration: Math.round(duration * 10) / 10,
    });
  }

  function sendError(code, message) {
    broadcastMessage({
      type: 'ERROR',
      code: code,
      message: message,
    });
  }

  function broadcastMessage(message) {
    castContext.sendCustomMessage(CHANNEL_NAMESPACE, undefined, message);
  }

  // --- Position Reporting ---

  function startPositionReporting() {
    stopPositionReporting();
    positionInterval = setInterval(function () {
      if (!videoElement.paused && !videoElement.ended) {
        sendPosition();
      }
    }, 1000);
  }

  function stopPositionReporting() {
    if (positionInterval !== null) {
      clearInterval(positionInterval);
      positionInterval = null;
    }
  }

  // --- UI Helpers ---

  function showMediaOverlay(payload) {
    posterElement.src = payload.posterUrl || '';
    titleElement.textContent = payload.title || '';
    subtitleElement.textContent = payload.subtitle || '';
    mediaOverlay.classList.add('visible');
    showSpinner();
  }

  function hideMediaOverlay() {
    mediaOverlay.classList.remove('visible');
    hideSpinner();
  }

  function showSpinner() {
    spinnerElement.classList.remove('hidden');
  }

  function hideSpinner() {
    spinnerElement.classList.add('hidden');
  }

  function showIdleScreen() {
    idleScreen.classList.remove('hidden');
  }

  function hideIdleScreen() {
    idleScreen.classList.add('hidden');
  }

  // --- Utility ---

  function isHlsStream(url) {
    return /\.m3u8(\?|$)/i.test(url);
  }

  function cleanup() {
    stopPositionReporting();

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();

    // Remove subtitle tracks
    var existingTracks = videoElement.querySelectorAll('track');
    for (var i = existingTracks.length - 1; i >= 0; i--) {
      videoElement.removeChild(existingTracks[i]);
    }

    currentHeaders = {};
    subtitleTracks = [];
    activeSubtitleIndex = null;
  }

  // --- Initialize CAF Receiver ---

  var options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = true;

  castContext.start(options);

  // Send initial idle status
  updateState('idle');
})();
