import { Ionicons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, Pressable, StatusBar, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { IconButton } from "@/components/ui/IconButton";
import type { StreamResult } from "@/sources/types";
import { appendAdBlockLog } from "@/utils/adBlockLogger";

interface Props {
  stream: StreamResult;
  onClose: () => void;
}

type BlockRule = {
  id: string;
  pattern: RegExp;
};

const GENERIC_BLOCK_RULES: BlockRule[] = [
  {
    id: "generic-vast",
    pattern: /(?:^|[/?#&=_-])(vast|vmap|vastconfig|adtag|adser|preroll|midroll|postroll)(?:[/?#&=._-]|$)/i,
  },
  {
    id: "generic-ad-network",
    pattern: /(?:doubleclick|googlesyndication|googletagmanager|imasdk|prebid|adservice|adskeeper)/i,
  },
  {
    id: "generic-click-tracker",
    pattern: /(?:clickunder|popunder|tracking|banner|redirect|affiliate|campaign)/i,
  },
];

const SOURCE_SPECIFIC_BLOCK_RULES: Record<string, BlockRule[]> = {
  nguonc: [
    {
      id: "nguonc-streamc-ad-video",
      pattern: /^https?:\/\/(?:www\.)?streamc\.xyz\/1\.mp4(?:[?#].*)?$/i,
    },
    {
      id: "nguonc-hiller-raw-github",
      pattern: /^https?:\/\/raw\.githubusercontent\.com\/hiller1233456\/.+/i,
    },
  ],
  animevietsub: [
    {
      id: "avs-gambling-ads",
      pattern: /(?:min88|sin88|yo88|hitclub|gemwin|sunwin|go88|rik88|iwin|b52club|ta88)/i,
    },
  ],
};

function normalizeHostname(value: string) {
  return value.replace(/^www\./i, "").toLowerCase();
}

function getAllowedHosts(stream: StreamResult) {
  const hosts = new Set<string>();

  try {
    hosts.add(normalizeHostname(new URL(stream.url).hostname));
  } catch {
    // Ignore malformed URLs here; WebView will handle load failure separately.
  }

  stream.webView?.allowedDomains?.forEach((domain) => {
    const normalized = normalizeHostname(domain);
    if (normalized) {
      hosts.add(normalized);
    }
  });

  // Allow the Referer/Origin domains so inline HTML pages (iframe wrappers)
  // are not blocked by onShouldStartLoadWithRequest on initial load.
  for (const key of ["Referer", "Origin"] as const) {
    const headerValue = stream.headers?.[key];
    if (headerValue) {
      try {
        hosts.add(normalizeHostname(new URL(headerValue).hostname));
      } catch {}
    }
  }

  return hosts;
}

function getBlockRules(stream: StreamResult) {
  const sourceRules = stream.sourceId
    ? SOURCE_SPECIFIC_BLOCK_RULES[stream.sourceId] ?? []
    : [];

  return [...GENERIC_BLOCK_RULES, ...sourceRules];
}

function getBlockedRule(url: string, rules: BlockRule[]) {
  return rules.find((rule) => rule.pattern.test(url)) ?? null;
}

function isAllowedNavigation(
  url: string,
  allowedHosts: Set<string>,
  rules: BlockRule[],
) {
  if (!url) {
    return false;
  }

  if (
    url.startsWith("about:blank") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return true;
  }

  if (getBlockedRule(url, rules)) {
    return false;
  }

  try {
    const hostname = normalizeHostname(new URL(url).hostname);

    for (const allowedHost of allowedHosts) {
      if (hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function buildBlockedRequestScript(stream: StreamResult, rules: BlockRule[]) {
  const serializedRules = JSON.stringify(
    rules.map((rule) => ({ id: rule.id, source: rule.pattern.source, flags: rule.pattern.flags })),
  );
  const sourceId = JSON.stringify(stream.sourceId ?? "");

  return `
    (function () {
      const sourceId = ${sourceId};
      const blockedRules = ${serializedRules}.map((rule) => ({
        id: rule.id,
        pattern: new RegExp(rule.source, rule.flags),
      }));

      const postLog = (url, ruleId) => {
        try {
          if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
            return;
          }

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "ad-block-log",
            sourceId,
            url,
            rule: ruleId,
          }));
        } catch {}
      };

      const toAbsoluteUrl = (value) => {
        if (!value) return "";
        try {
          return new URL(String(value), window.location.href).toString();
        } catch {
          return String(value);
        }
      };

      const getBlockedRule = (value) => {
        const absolute = toAbsoluteUrl(value);
        const matched = blockedRules.find((rule) => rule.pattern.test(absolute));
        return matched ? { absolute, rule: matched } : null;
      };

      const scrubNode = (node) => {
        if (!node || typeof node !== "object") return;

        const src = node.getAttribute && node.getAttribute("src");
        const href = node.getAttribute && node.getAttribute("href");
        const blockedSrc = src ? getBlockedRule(src) : null;
        const blockedHref = href ? getBlockedRule(href) : null;

        if (blockedSrc || blockedHref) {
          const blocked = blockedSrc || blockedHref;
          postLog(blocked.absolute, blocked.rule.id);

          try {
            if (typeof node.pause === "function") {
              node.pause();
            }
            if (typeof node.removeAttribute === "function") {
              node.removeAttribute("src");
              node.removeAttribute("href");
            }
            if ("src" in node) {
              node.src = "about:blank";
            }
            if (typeof node.load === "function") {
              node.load();
            }
            if (typeof node.remove === "function") {
              node.remove();
            }
          } catch {}
        }

        if (node.querySelectorAll) {
          node.querySelectorAll("[src],[href]").forEach((child) => scrubNode(child));
        }
      };

      const patchSetAttribute = () => {
        const originalSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name, value) {
          if (name === "src" || name === "href") {
            const blocked = getBlockedRule(value);
            if (blocked) {
              postLog(blocked.absolute, blocked.rule.id);
              return;
            }
          }

          return originalSetAttribute.apply(this, arguments);
        };
      };

      const patchFetch = () => {
        if (typeof window.fetch !== "function") return;
        const originalFetch = window.fetch;
        window.fetch = function (input, init) {
          const url =
            typeof input === "string"
              ? input
              : input && typeof input.url === "string"
                ? input.url
                : "";
          const blocked = getBlockedRule(url);

          if (blocked) {
            postLog(blocked.absolute, blocked.rule.id);
            return Promise.reject(new Error("Blocked by ReVax"));
          }

          return originalFetch.call(this, input, init);
        };
      };

      const patchXHR = () => {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
          const blocked = getBlockedRule(url);
          this.__revaxBlocked = blocked;
          if (blocked) {
            postLog(blocked.absolute, blocked.rule.id);
            return;
          }
          return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function () {
          if (this.__revaxBlocked) {
            try {
              this.abort();
            } catch {}
            return;
          }
          return originalSend.apply(this, arguments);
        };
      };

      const patchMediaSrc = () => {
        const defineSafeSrc = (ctor) => {
          if (!ctor || !ctor.prototype) return;
          const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, "src");
          if (!descriptor || !descriptor.configurable || !descriptor.set) return;

          Object.defineProperty(ctor.prototype, "src", {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: descriptor.get,
            set(value) {
              const blocked = getBlockedRule(value);
              if (blocked) {
                postLog(blocked.absolute, blocked.rule.id);
                try {
                  if (typeof this.pause === "function") {
                    this.pause();
                  }
                  if (typeof this.removeAttribute === "function") {
                    this.removeAttribute("src");
                  }
                } catch {}
                return value;
              }
              return descriptor.set.call(this, value);
            },
          });
        };

        defineSafeSrc(window.HTMLMediaElement);
        defineSafeSrc(window.HTMLSourceElement);
        defineSafeSrc(window.HTMLScriptElement);
        defineSafeSrc(window.HTMLIFrameElement);
      };

      const patchWindowOpen = () => {
        const originalOpen = window.open;
        window.open = function (url) {
          const blocked = getBlockedRule(url);
          if (blocked) {
            postLog(blocked.absolute, blocked.rule.id);
            return null;
          }
          return originalOpen ? originalOpen.apply(this, arguments) : null;
        };
      };

      const observeDom = () => {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => scrubNode(node));
          });
        });

        observer.observe(document.documentElement || document, {
          childList: true,
          subtree: true,
        });
      };

      patchSetAttribute();
      patchFetch();
      patchXHR();
      patchMediaSrc();
      patchWindowOpen();
      observeDom();

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
          document.querySelectorAll("[src],[href]").forEach((node) => scrubNode(node));
        });
      } else {
        document.querySelectorAll("[src],[href]").forEach((node) => scrubNode(node));
      }
    })();
    true;
  `;
}

export function MoviePlayer({ stream, onClose }: Props) {
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const isEmbed = stream.isEmbed;
  const isImageGallery = Boolean(stream.images?.length);
  const allowedHosts = useMemo(() => getAllowedHosts(stream), [stream]);
  const blockRules = useMemo(() => getBlockRules(stream), [stream]);
  const playerUrl = isImageGallery ? "" : stream.url;

  const player = useVideoPlayer(playerUrl, (p) => {
    // Mute initially to bypass iOS autoplay restriction, then unmute after play starts
    p.muted = true;
    p.play();
  });

  const videoRef = useRef<VideoView>(null);

  // Unmute after playback starts
  useEffect(() => {
    if (isEmbed || isImageGallery || !player) return;

    const subscription = player.addListener("playingChange", (event) => {
      if (event.isPlaying) {
        // Unmute after autoplay succeeds
        setTimeout(() => { player.muted = false; }, 300);
      }
    });

    return () => subscription.remove();
  }, [player, isEmbed, isImageGallery]);

  // Auto-enter fullscreen + landscape when native player starts playing
  useEffect(() => {
    if (isEmbed || isImageGallery || !player) return;

    const subscription = player.addListener("playingChange", (event) => {
      if (event.isPlaying && videoRef.current) {
        // Force landscape orientation for fullscreen video
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
        videoRef.current.enterFullscreen();
      }
    });

    return () => {
      subscription.remove();
      // Restore portrait when component unmounts
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [player, isEmbed, isImageGallery]);

  // For embed (WebView) players: unlock orientation so native fullscreen can auto-rotate
  useEffect(() => {
    if (!isEmbed || isImageGallery) return;

    // Unlock orientation — native iOS player will auto-rotate to landscape for 16:9 videos
    ScreenOrientation.unlockAsync().catch(() => {});

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [isEmbed, isImageGallery]);

  // Hide status bar when player is active
  useEffect(() => {
    StatusBar.setHidden(true, "fade");
    return () => {
      StatusBar.setHidden(false, "fade");
    };
  }, []);

  const handleClose = () => {
    StatusBar.setHidden(false, "fade");
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    onClose();
  };

  return (
    <View style={[styles.container, isImageGallery ? styles.galleryContainer : null]}>
      {isImageGallery ? (
        <View style={styles.galleryList}>
          {stream.images?.map((imageUrl) => (
            <Image
              key={imageUrl}
              onLoad={(event) => {
                const { width, height } = event.nativeEvent.source;
                if (width && height) {
                  setImageRatios((current) => {
                    const nextRatio = width / height;
                    if (current[imageUrl] === nextRatio) {
                      return current;
                    }

                    return {
                      ...current,
                      [imageUrl]: nextRatio,
                    };
                  });
                }
              }}
              resizeMode="contain"
              source={{
                uri: imageUrl,
                headers: stream.headers,
              }}
              style={[
                styles.galleryImage,
                {
                  aspectRatio: imageRatios[imageUrl] ?? 3 / 4,
                },
              ]}
            />
          ))}
        </View>
      ) : isEmbed ? (
        <WebView
          allowsFullScreen
          allowsInlineMediaPlayback
          injectedJavaScriptBeforeContentLoaded={
            // Skip ad-block for storage.googleapiscdn.com — JW Player needs
            // its own resources to load without interference
            stream.url.indexOf("storage.googleapiscdn.com") !== -1
              ? `(function(){
                  // === 1. Disable Service Worker to prevent reload loops ===
                  // iOS WKWebView doesn't support SW anyway, but the inline
                  // script checks for it and triggers a reload if version mismatches
                  if ('serviceWorker' in navigator) {
                    Object.defineProperty(navigator, 'serviceWorker', {
                      get: function() { return undefined; },
                      configurable: true
                    });
                  }
                  if ('caches' in window) {
                    Object.defineProperty(window, 'caches', {
                      get: function() { return undefined; },
                      configurable: true
                    });
                  }

                  // === 2. Skip SW version check ===
                  try {
                    var origGetItem = sessionStorage.getItem;
                    var origSetItem = sessionStorage.setItem;
                    sessionStorage.getItem = function(key) {
                      if (key === 'avs_sw_v') return '1.3.7';
                      return origGetItem.call(sessionStorage, key);
                    };
                    sessionStorage.setItem = function(key, val) {
                      if (key === 'avs_sw_v') return;
                      return origSetItem.call(sessionStorage, key, val);
                    };
                  } catch(e) {}

                  // === 3. Force plain mode ===
                  // iOS WKWebView has no Service Worker support, so encrypted
                  // segments can't be decrypted via SW intercept.
                  // Setting _avsCryptoSupported=false tells init.js to request
                  // ?plain=1 (unencrypted segments) from the server.
                  window._avsCryptoSupported = false;
                  // Also override the detection that runs in the page
                  Object.defineProperty(window, 'crypto', {
                    value: undefined,
                    writable: false,
                    configurable: true
                  });

                  // === 4. Neutralize ads if any are configured ===
                  window.google_ima_available = false;
                  Object.defineProperty(window, 'google', {
                    value: undefined,
                    writable: true,
                    configurable: true
                  });
                })(); true;`
              : buildBlockedRequestScript(stream, blockRules)
          }
          javaScriptCanOpenWindowsAutomatically={false}
          mediaPlaybackRequiresUserAction={false}
          onMessage={(event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data) as {
                type?: string;
                sourceId?: string;
                url?: string;
                rule?: string;
                message?: string;
              };

              if (payload.type === "avs-debug" && __DEV__) {
                console.log("[WebView:avs-debug]", payload.message);
              }

              // Handle orientation changes from WebView native fullscreen
              if (payload.type === "orientation-unlock") {
                // Unlock orientation so native iOS player can auto-rotate to landscape
                ScreenOrientation.unlockAsync().catch(() => {});
              }
              if (payload.type === "orientation-lock-portrait") {
                // Re-lock to portrait when exiting native fullscreen
                ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
              }

              if (
                payload.type === "ad-block-log" &&
                payload.url &&
                payload.rule
              ) {
                void appendAdBlockLog({
                  sourceId: payload.sourceId || stream.sourceId,
                  url: payload.url,
                  rule: payload.rule,
                });
              }
            } catch {
              // Ignore malformed postMessage payloads from embed pages.
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            const isAllowed = isAllowedNavigation(
              request.url,
              allowedHosts,
              blockRules,
            );

            if (!isAllowed) {
              const blockedRule = getBlockedRule(request.url, blockRules);

              void appendAdBlockLog({
                sourceId: stream.sourceId,
                url: request.url,
                rule: blockedRule?.id ?? "blocked-navigation",
              });
            }

            return isAllowed;
          }}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          source={
            stream.url.indexOf("storage.googleapiscdn.com") !== -1
              ? { uri: stream.url }
              : {
                  html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000;overflow:hidden}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="${stream.url}" referrerpolicy="unsafe-url" allowfullscreen allow="autoplay;fullscreen;encrypted-media"></iframe></body></html>`,
                  baseUrl: stream.headers?.Referer || "https://hhpanda.st/",
                }
          }
          injectedJavaScript={`
            ${stream.webView?.injectedJavaScript || ""}
            (function() {
              if (window.__avs_reload_checked) return;
              window.__avs_reload_checked = true;

              // Log player state for debugging
              var logToRN = function(msg) {
                try {
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'avs-debug',
                    message: msg
                  }));
                } catch(e) {}
              };

              logToRN('Page loaded: ' + document.title);

              // Auto-reload for storage.googleapiscdn.com CF challenge
              var isBlocked = document.title === 'Truy cập bị chặn' ||
                document.title === 'Just a moment...' ||
                document.querySelector('.btn[href*="reload"]') ||
                (document.body && document.body.innerText && document.body.innerText.indexOf('Truy cập bị chặn') !== -1) ||
                (document.body && document.body.innerText && document.body.innerText.indexOf('Không thể phát video') !== -1) ||
                (document.body && document.body.innerText && document.body.innerText.indexOf('trang web được ủy quyền') !== -1);

              if (isBlocked) {
                document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#000;color:#fff;font-family:-apple-system,sans-serif;text-align:center;padding:20px;"><div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:16px;"></div><div style="font-size:14px;opacity:0.9;">Đang kết nối tới server...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
                setTimeout(function() { window.location.reload(); }, 1200);
                return;
              }

              // === Auto-play + enter native fullscreen ===
              // Native iOS player will open in landscape thanks to AppDelegate config plugin
              var autoPlayDone = false;
              var autoPlayAttempts = 0;

              function tryAutoPlay() {
                autoPlayAttempts++;
                if (autoPlayDone || autoPlayAttempts > 30) return;

                // Debug: log DOM state on first few attempts
                if (autoPlayAttempts <= 3) {
                  var videos = document.querySelectorAll('video');
                  var iframes = document.querySelectorAll('iframe');
                  var sources = document.querySelectorAll('source');
                  var bodyText = (document.body && document.body.innerHTML) ? document.body.innerHTML.substring(0, 500) : 'empty';
                  logToRN('[AutoPlay:DOM] videos=' + videos.length + ' iframes=' + iframes.length + ' sources=' + sources.length);
                  logToRN('[AutoPlay:DOM:body] ' + bodyText.replace(/\\n/g, ' ').substring(0, 300));
                  if (videos.length > 0) {
                    var v = videos[0];
                    logToRN('[AutoPlay:DOM:video] src=' + (v.src || 'none') + ' readyState=' + v.readyState + ' paused=' + v.paused + ' playsinline=' + v.hasAttribute('playsinline'));
                  }
                  if (iframes.length > 0) {
                    logToRN('[AutoPlay:DOM:iframe] src=' + (iframes[0].src || 'none'));
                  }
                }

                logToRN('[AutoPlay] Attempt ' + autoPlayAttempts);

                // Strategy 1: JW Player API
                try {
                  if (typeof jwplayer !== 'undefined') {
                    var p = jwplayer();
                    if (p && p.play && p.getState) {
                      var state = p.getState();
                      logToRN('[AutoPlay] JW state: ' + state);
                      if (state === 'idle' || state === 'paused') {
                        p.play();
                        autoPlayDone = true;
                        logToRN('[AutoPlay] Called jwplayer().play()');
                        return;
                      } else if (state === 'playing' || state === 'buffering') {
                        autoPlayDone = true;
                        logToRN('[AutoPlay] JW already playing');
                        return;
                      }
                    }
                  }
                } catch(e) {}

                // Strategy 2: Click play button
                var playBtn = document.querySelector('.jw-icon-display') ||
                              document.querySelector('.jw-display-icon-container') ||
                              document.querySelector('[aria-label="Play"]') ||
                              document.querySelector('.vjs-big-play-button');
                if (playBtn) {
                  playBtn.click();
                  autoPlayDone = true;
                  logToRN('[AutoPlay] Clicked play button: ' + (playBtn.className || ''));
                  return;
                }

                // Strategy 3: Direct video.play() + webkitEnterFullscreen
                var videos = document.querySelectorAll('video');
                if (videos.length > 0) {
                  var v = videos[0];
                  logToRN('[AutoPlay] video readyState=' + v.readyState + ' paused=' + v.paused);

                  // Remove playsinline so native player can open
                  v.removeAttribute('playsinline');
                  v.removeAttribute('webkit-playsinline');

                  if (v.paused) {
                    v.play().then(function() {
                      logToRN('[AutoPlay] play() success, entering fullscreen...');
                      setTimeout(function() {
                        try {
                          if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
                          logToRN('[AutoPlay] webkitEnterFullscreen called');
                        } catch(e) {
                          logToRN('[AutoPlay] fullscreen error: ' + e.message);
                        }
                      }, 500);
                      autoPlayDone = true;
                    }).catch(function(e) {
                      logToRN('[AutoPlay] play() failed: ' + e.message);
                    });
                  } else {
                    // Already playing, just enter fullscreen
                    try {
                      if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
                      logToRN('[AutoPlay] Already playing, entered fullscreen');
                    } catch(e) {}
                    autoPlayDone = true;
                  }
                }
              }

              // Poll every second
              var autoPlayInterval = setInterval(function() {
                tryAutoPlay();
                if (autoPlayDone || autoPlayAttempts > 30) {
                  clearInterval(autoPlayInterval);
                }
              }, 1000);

              // Aggressive fullscreen: once video is playing, enter native iOS fullscreen in landscape.
              // Strategy: unlock orientation so native player can auto-rotate to landscape,
              // then call webkitEnterFullscreen(). Native iOS player will display in landscape
              // for landscape videos (16:9). When user exits, we re-lock to portrait.
              var fsAttempts = 0;
              var fsDone = false;
              var fsInterval = setInterval(function() {
                fsAttempts++;
                if (fsAttempts > 60 || fsDone) { clearInterval(fsInterval); return; }
                var videos = document.querySelectorAll('video');
                for (var vi = 0; vi < videos.length; vi++) {
                  var v = videos[vi];
                  if (!v.paused && v.readyState >= 2) {
                    v.removeAttribute('playsinline');
                    v.removeAttribute('webkit-playsinline');

                    // Listen for fullscreen events to notify React Native
                    v.addEventListener('webkitbeginfullscreen', function() {
                      logToRN('[Fullscreen] Native fullscreen started');
                      try {
                        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'orientation-unlock'
                        }));
                      } catch(e) {}
                    });
                    v.addEventListener('webkitendfullscreen', function() {
                      logToRN('[Fullscreen] Native fullscreen ended');
                      try {
                        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'orientation-lock-portrait'
                        }));
                      } catch(e) {}
                    });

                    try {
                      if (v.webkitEnterFullscreen) {
                        v.webkitEnterFullscreen();
                        logToRN('[Fullscreen] Forced native fullscreen');
                        fsDone = true;
                        clearInterval(fsInterval);
                      }
                    } catch(e) {
                      logToRN('[Fullscreen] Error: ' + e.message);
                    }
                    break;
                  }
                }
              }, 1000);

              // Also listen for any video play event (covers user manual play)
              var videoObserver = new MutationObserver(function() {
                if (fsDone) return;
                var videos = document.querySelectorAll('video');
                videos.forEach(function(v) {
                  if (v.__fsListenerAdded) return;
                  v.__fsListenerAdded = true;
                  v.addEventListener('playing', function() {
                    if (fsDone) return;
                    setTimeout(function() {
                      v.removeAttribute('playsinline');
                      v.removeAttribute('webkit-playsinline');
                      try {
                        if (v.webkitEnterFullscreen) {
                          v.webkitEnterFullscreen();
                          logToRN('[Fullscreen] Native fullscreen via play event');
                          fsDone = true;
                          clearInterval(fsInterval);
                        }
                      } catch(e) {}
                    }, 500);
                  });
                });
              });
              videoObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

              // Also try on DOM changes
              var playObserver = new MutationObserver(function() {
                if (!autoPlayDone) tryAutoPlay();
              });
              playObserver.observe(document.documentElement || document, { childList: true, subtree: true });

              // === Block pause overlay ads (min88, sin88, etc.) ===
              // Hide any overlay/modal that appears on pause
              var adStyle = document.createElement('style');
              adStyle.textContent = '#invideo_wrapper, .jw-plugin-pause, [id*="invideo"], [class*="invideo"], [id*="pause-ad"], .pause-overlay-ad { display:none!important; visibility:hidden!important; pointer-events:none!important; width:0!important; height:0!important; overflow:hidden!important; }';
              document.head.appendChild(adStyle);

              // MutationObserver to catch dynamically added pause ads
              var adObserver = new MutationObserver(function(mutations) {
                mutations.forEach(function(m) {
                  m.addedNodes.forEach(function(node) {
                    if (!node || !node.querySelector) return;
                    // Check if it contains ad links (min88, sin88, casino, etc.)
                    var html = node.innerHTML || '';
                    if (html.indexOf('min88') !== -1 || html.indexOf('sin88') !== -1 ||
                        html.indexOf('casino') !== -1 || html.indexOf('invideo') !== -1 ||
                        html.indexOf('yo88') !== -1 || html.indexOf('hitclub') !== -1 ||
                        html.indexOf('gemwin') !== -1) {
                      node.style.display = 'none';
                      node.style.visibility = 'hidden';
                      node.remove();
                      logToRN('Blocked pause ad overlay');
                    }
                  });
                });
              });
              adObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

              // Monitor JW Player for errors and auto-recover
              var fixAttempts = 0;
              var fixInterval = setInterval(function() {
                fixAttempts++;
                if (fixAttempts > 60) { clearInterval(fixInterval); return; }
                try {
                  var p = typeof jwplayer !== 'undefined' && jwplayer('player');
                  if (!p || !p.getState) return;

                  var state = p.getState();

                  if (fixAttempts === 1 || state === 'error') {
                    logToRN('JWPlayer state: ' + state + ' (attempt ' + fixAttempts + ')');
                  }

                  // If player errors, try to re-setup without ads
                  if (state === 'error') {
                    var playlist = p.getPlaylist();
                    if (playlist && playlist.length > 0) {
                      var item = playlist[0];
                      var src = item.file || (item.sources && item.sources[0] && item.sources[0].file);
                      if (src) {
                        logToRN('Recovering with source: ' + src.substring(0, 100));
                        clearInterval(fixInterval);
                        p.setup({
                          file: src,
                          width: '100%',
                          height: '100%',
                          autostart: true,
                          mute: false,
                          primary: 'html5'
                        });
                      }
                    }
                  }

                  // If player is playing, we're good
                  if (state === 'playing' || state === 'buffering') {
                    logToRN('Player is playing!');
                    clearInterval(fixInterval);
                  }
                } catch(e) {
                  if (fixAttempts <= 3) logToRN('Error: ' + e.message);
                }
              }, 1000);
            })();
            true;
          `}
          style={styles.webview}
        />
      ) : (
        <VideoView
          ref={videoRef}
          allowsPictureInPicture
          fullscreenOptions={{
            enable: true,
          }}
          player={player}
          style={styles.video}
        />
      )}

      <View style={styles.backButton}>
        <IconButton
          icon={<Ionicons color="#FFF" name="chevron-back" size={24} />}
          onPress={handleClose}
          style={styles.iconButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative",
  },
  galleryContainer: {
    aspectRatio: undefined,
    minHeight: 220,
    paddingBottom: 12,
  },
  galleryList: {
    gap: 12,
  },
  galleryImage: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: 16,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  backButton: {
    position: "absolute",
    left: 16,
    top: 16,
    zIndex: 10,
  },
  iconButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
