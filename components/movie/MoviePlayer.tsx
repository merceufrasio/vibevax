import { Ionicons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { WebView } from "react-native-webview";

import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { CastButton, useCastSession } from "@/modules/cast";
import { SubtitleOverlay } from "@/components/movie/SubtitleOverlay";
import type { StreamResult } from "@/sources/types";
import { appendAdBlockLog } from "@/utils/adBlockLogger";

interface Props {
  stream: StreamResult;
  onClose: () => void;
  /** Optional metadata for cast session */
  title?: string;
  posterUrl?: string;
  episodeId?: string;
  /** TMDB ID for subtitle search */
  tmdbId?: string;
  /** Season number for TV subtitle search */
  season?: number;
  /** Episode number for TV subtitle search */
  episode?: number;
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
      id: "nguonc-hiller-vast-ad",
      pattern: /^https?:\/\/raw\.githubusercontent\.com\/hiller1233456\/.+/i,
    },
    {
      id: "nguonc-ad-tracking",
      pattern: /(?:sharethis\.com|crwdcntrl\.net|dtscout\.com|waust\.at)/i,
    },
    {
      id: "nguonc-ad-video-mp4",
      pattern: /^https?:\/\/(?:www\.)?streamc\.xyz\/\d+\.mp4/i,
    },
    {
      id: "nguonc-ad-redirect",
      pattern: /(?:6789x\.site|6789bet|bet88|lucky88|fb88|w88|188bet|fun88|m88|sbobet|bong88)/i,
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

    // Allow same base domain (e.g., embed15.streamc.xyz allows embed13.streamc.xyz)
    // This handles CDN subdomains for embed players
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      const baseDomain = parts.slice(-2).join(".");
      for (const allowedHost of allowedHosts) {
        const allowedParts = allowedHost.split(".");
        if (allowedParts.length >= 2 && allowedParts.slice(-2).join(".") === baseDomain) {
          return true;
        }
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

/** Format seconds to mm:ss or hh:mm:ss */
function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function MoviePlayer({ stream, onClose, title, posterUrl, episodeId, tmdbId, season, episode }: Props) {
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const isEmbed = stream.isEmbed;
  const isImageGallery = Boolean(stream.images?.length);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  // Cast integration
  const { state: castState, castMedia, play: castPlay, pause: castPause, seek: castSeek, setVolume: castSetVolume, disconnect } = useCastSession();
  const isCasting = castState.isConnected;
  const [castError, setCastError] = useState<string | null>(null);
  const [localResumePosition, setLocalResumePosition] = useState<number | null>(null);
  const lastLocalPositionRef = useRef<number>(0);

  // Track when cast session ends to restore local playback
  const prevCastConnectedRef = useRef(castState.isConnected);
  useEffect(() => {
    const wasConnected = prevCastConnectedRef.current;
    prevCastConnectedRef.current = castState.isConnected;

    if (wasConnected && !castState.isConnected) {
      // Cast session ended — restore local playback from last cast position
      const resumePos = castState.playbackPosition || 0;
      setLocalResumePosition(resumePos);
      setCastError(null);

      // If there was an error, show it
      if (castState.error) {
        setCastError(castState.error.message || "Cast disconnected unexpectedly");
      }
    }
  }, [castState.isConnected, castState.playbackPosition, castState.error]);

  // Handle initiating cast
  const handleCastMedia = useCallback(async () => {
    try {
      setCastError(null);
      await castMedia({
        stream: {
          url: stream.url,
          headers: stream.headers,
          isEmbed: stream.isEmbed,
          mimeType: stream.mimeType,
          sourceId: stream.sourceId,
          subtitles: stream.subtitles,
        },
        title: title || "Unknown",
        posterUrl,
        episodeId: episodeId || "",
        sourceId: stream.sourceId || "",
        startPosition: lastLocalPositionRef.current,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start casting";
      setCastError(message);
      // Restore local playback on cast failure
      setLocalResumePosition(lastLocalPositionRef.current);
    }
  }, [castMedia, stream, title, posterUrl, episodeId]);

  // Auto-cast when a device is connected and we have a stream
  useEffect(() => {
    if (isCasting && castState.session?.state === "connected") {
      void handleCastMedia();
    }
    // Only trigger when connection state changes to connected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCasting, castState.session?.state]);

  // Debug: log stream info when player renders
  useEffect(() => {
    if (__DEV__) {
      console.log("[MoviePlayer:render]", {
        url: stream.url?.substring(0, 100),
        isEmbed,
        isImageGallery,
        hasHeaders: !!stream.headers,
        sourceId: stream.sourceId,
      });
    }
  }, [stream.url, isEmbed, isImageGallery, stream.headers, stream.sourceId]);
  const allowedHosts = useMemo(() => getAllowedHosts(stream), [stream]);
  const blockRules = useMemo(() => getBlockRules(stream), [stream]);
  const playerUrl = isImageGallery ? "" : (isEmbed ? "" : stream.url);

  const player = useVideoPlayer(playerUrl, (p) => {
    if (!isEmbed && !isImageGallery && playerUrl) {
      // Mute initially to bypass iOS autoplay restriction, then unmute after play starts
      p.muted = true;
      if (localResumePosition !== null && localResumePosition > 0) {
        p.currentTime = localResumePosition;
        setLocalResumePosition(null);
      }
      p.play();
    }
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

  // Track local playback position for cast handoff
  useEffect(() => {
    if (isEmbed || isImageGallery || !player) return;

    const interval = setInterval(() => {
      if (player.currentTime > 0) {
        lastLocalPositionRef.current = player.currentTime;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [player, isEmbed, isImageGallery]);

  // Track current time for subtitle sync (more frequent updates)
  const [subtitleTime, setSubtitleTime] = useState(0);
  useEffect(() => {
    if (isEmbed || isImageGallery || !player) return;

    const interval = setInterval(() => {
      if (player.currentTime > 0) {
        setSubtitleTime(player.currentTime);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [player, isEmbed, isImageGallery]);

  // Auto-enter landscape when native player starts playing (custom fullscreen - no native overlay)
  useEffect(() => {
    if (isEmbed || isImageGallery || !player) return;

    let hasEntered = false;

    const subscription = player.addListener("playingChange", (event) => {
      if (event.isPlaying && !hasEntered) {
        hasEntered = true;
        // Force landscape orientation — video container will fill screen via styles
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
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
    <View style={[
      styles.container,
      isImageGallery ? styles.galleryContainer : null,
      // Fullscreen when landscape + native video
      isLandscape && !isEmbed && !isImageGallery ? {
        position: "absolute" as const,
        top: 0,
        left: 0,
        width: windowWidth,
        height: windowHeight,
        aspectRatio: undefined,
        zIndex: 999,
      } : null,
    ]}>
      {isCasting ? (
        /* Cast controls overlay — replaces local video when casting */
        <View style={styles.castOverlay}>
          <Ionicons color={Colors.accent.primary} name="tv" size={48} />
          <Text style={styles.castTitle}>
            {castState.session?.media?.title || title || "Casting..."}
          </Text>
          <Text style={styles.castDevice}>
            {castState.session?.device.name || "Connected device"}
          </Text>

          {/* Seek controls */}
          <View style={styles.castSeekRow}>
            <Text style={styles.castTime}>
              {formatTime(castState.playbackPosition)}
            </Text>
            <View style={styles.castProgressTrack}>
              <View
                style={[
                  styles.castProgressFill,
                  {
                    width: castState.playbackDuration > 0
                      ? `${(castState.playbackPosition / castState.playbackDuration) * 100}%`
                      : "0%",
                  },
                ]}
              />
            </View>
            <Text style={styles.castTime}>
              {formatTime(castState.playbackDuration)}
            </Text>
          </View>

          {/* Playback controls */}
          <View style={styles.castControls}>
            <Pressable
              onPress={() => void castSetVolume(Math.max(0, castState.volume - 0.1))}
              style={({ pressed }) => [styles.castControlBtn, pressed && styles.castControlBtnPressed]}
            >
              <Ionicons color="#FFF" name="volume-low" size={24} />
            </Pressable>

            <Pressable
              onPress={() => void castSeek(Math.max(0, castState.playbackPosition - 10))}
              style={({ pressed }) => [styles.castControlBtn, pressed && styles.castControlBtnPressed]}
            >
              <Ionicons color="#FFF" name="play-back" size={22} />
            </Pressable>

            <Pressable
              onPress={() => {
                if (castState.session?.state === "playing" || castState.session?.state === "buffering") {
                  void castPause();
                } else {
                  void castPlay();
                }
              }}
              style={({ pressed }) => [styles.castControlBtnLarge, pressed && styles.castControlBtnLargePressed]}
            >
              <Ionicons
                color="#FFF"
                name={castState.session?.state === "playing" || castState.session?.state === "buffering" ? "pause" : "play"}
                size={32}
              />
            </Pressable>

            <Pressable
              onPress={() => void castSeek(Math.min(castState.playbackDuration, castState.playbackPosition + 10))}
              style={({ pressed }) => [styles.castControlBtn, pressed && styles.castControlBtnPressed]}
            >
              <Ionicons color="#FFF" name="play-forward" size={22} />
            </Pressable>

            <Pressable
              onPress={() => void castSetVolume(Math.min(1, castState.volume + 0.1))}
              style={({ pressed }) => [styles.castControlBtn, pressed && styles.castControlBtnPressed]}
            >
              <Ionicons color="#FFF" name="volume-high" size={24} />
            </Pressable>
          </View>

          {/* Disconnect button */}
          <Pressable
            onPress={() => void disconnect()}
            style={({ pressed }) => [styles.castDisconnectBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons color="#FF6B6B" name="close-circle-outline" size={20} />
            <Text style={styles.castDisconnectText}>Ngắt kết nối</Text>
          </Pressable>

          {castError ? (
            <Text style={styles.castErrorText}>{castError}</Text>
          ) : null}
        </View>
      ) : isImageGallery ? (
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
            // Block VAST ads for streamc.xyz (nguonc embed)
            // Strategy: block vast.js + devtools.js + ad tracking scripts
            // Let player1.js run normally — without VAST module, JW skips ads
            stream.url.indexOf("streamc.xyz") !== -1
              ? `(function(){
                  'use strict';
                  var log = function(msg) {
                    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'avs-debug',message:'[AdBlock] '+msg})); } catch(e) {}
                  };

                  // Scripts to block completely
                  var BLOCK_SCRIPTS = ['devtools.js','devtools-detector','waust.at'];
                  var shouldBlock = function(url) {
                    if (!url) return false;
                    var lower = url.toLowerCase();
                    for (var i = 0; i < BLOCK_SCRIPTS.length; i++) {
                      if (lower.indexOf(BLOCK_SCRIPTS[i]) !== -1) return true;
                    }
                    return false;
                  };

                  // 1. Override document.createElement to intercept <script>
                  var _createElement = document.createElement.bind(document);
                  document.createElement = function(tagName, options) {
                    var el = _createElement(tagName, options);
                    if (typeof tagName === 'string' && tagName.toLowerCase() === 'script') {
                      var origSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
                      Object.defineProperty(el, 'src', {
                        configurable: true,
                        get: function() { return origSrcDesc.get.call(el); },
                        set: function(val) {
                          if (shouldBlock(val)) {
                            log('blocked: ' + val.substring(0, 80));
                            el.type = 'text/blocked';
                            return;
                          }
                          return origSrcDesc.set.call(el, val);
                        }
                      });
                      var _setAttr = el.setAttribute.bind(el);
                      el.setAttribute = function(name, value) {
                        if (name === 'src' && shouldBlock(value)) {
                          log('attr blocked: ' + value.substring(0, 80));
                          _setAttr('type', 'text/blocked');
                          return;
                        }
                        return _setAttr(name, value);
                      };
                    }
                    return el;
                  };

                  // 2. MutationObserver — remove blocked script tags from DOM
                  new MutationObserver(function(mutations) {
                    for (var i = 0; i < mutations.length; i++) {
                      var nodes = mutations[i].addedNodes;
                      for (var j = 0; j < nodes.length; j++) {
                        var node = nodes[j];
                        if (!node.tagName) continue;
                        var tag = node.tagName.toLowerCase();
                        var src = node.src || (node.getAttribute && node.getAttribute('src')) || '';
                        if (tag === 'script' && shouldBlock(src)) {
                          node.type = 'text/blocked';
                          node.removeAttribute('src');
                          log('DOM removed: ' + src.substring(0, 60));
                        }
                      }
                    }
                  }).observe(document.documentElement || document, { childList: true, subtree: true });

                  // 3. Block fetch/XHR to ad URLs (VAST XML, ad videos, ad networks)
                  var AD_URLS = ['tlk.xml','hiller1233456','googlesyndication','doubleclick','streamc.xyz/1.mp4','streamc.xyz/ads','/vast','/vmap','/adBreak','invideo'];
                  var isAdUrl = function(url) {
                    if (!url) return false;
                    var lower = url.toLowerCase();
                    for (var i = 0; i < AD_URLS.length; i++) {
                      if (lower.indexOf(AD_URLS[i]) !== -1) return true;
                    }
                    return false;
                  };
                  var _fetch = window.fetch;
                  window.fetch = function(input) {
                    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                    if (isAdUrl(url)) { log('fetch blocked: ' + url.substring(0, 60)); return Promise.resolve(new Response('', {status:200})); }
                    return _fetch.apply(this, arguments);
                  };
                  var _xhrOpen = XMLHttpRequest.prototype.open;
                  XMLHttpRequest.prototype.open = function(method, url) {
                    this._blocked = isAdUrl(url);
                    if (this._blocked) log('XHR blocked: ' + url.substring(0, 60));
                    return _xhrOpen.apply(this, arguments);
                  };
                  var _xhrSend = XMLHttpRequest.prototype.send;
                  XMLHttpRequest.prototype.send = function() {
                    if (this._blocked) {
                      var self = this;
                      setTimeout(function() {
                        try {
                          Object.defineProperty(self, 'readyState', {get:function(){return 4;}, configurable:true});
                          Object.defineProperty(self, 'status', {get:function(){return 200;}, configurable:true});
                          Object.defineProperty(self, 'responseText', {get:function(){return '';}, configurable:true});
                          Object.defineProperty(self, 'response', {get:function(){return '';}, configurable:true});
                        } catch(e) {}
                        if (self.onreadystatechange) self.onreadystatechange();
                        if (self.onload) self.onload();
                      }, 10);
                      return;
                    }
                    return _xhrSend.apply(this, arguments);
                  };

                  // 4. Predefine devtoolsDetector
                  window.devtoolsDetector = { addListener:function(){}, launch:function(){}, stop:function(){}, isLaunch:function(){return false;} };
                  window.oncontextmenu = null;

                  // 5. After player loads, strip advertising and hide ad UI
                  var adStyle = document.createElement('style');
                  adStyle.textContent = '.jw-ad-notice,.jw-ad-skip,.jw-ad-label,.jw-ad-badge,.jw-ad-overlay,.jw-plugin-vast,.jw-controls-backdrop[style*="advancement"],.jw-reset.jw-ad-notice-label,.jw-ad,.jw-ad-container,.jw-ad-message,.jw-ad-cta,.jw-ad-skip-button,[class*="jw-ad"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;overflow:hidden!important;}';
                  (document.head || document.documentElement).appendChild(adStyle);

                  // Poll for jwplayer instance and neutralize ads
                  var adTick = 0;
                  var adTimer = setInterval(function() {
                    adTick++;
                    if (adTick > 100) { clearInterval(adTimer); return; }
                    if (typeof jwplayer === 'undefined') return;
                    try {
                      var p = jwplayer(0) || jwplayer('player');
                      if (!p || !p.getConfig) return;
                      // Strip advertising from config
                      var cfg = p.getConfig();
                      if (cfg && cfg.advertising) {
                        cfg.advertising = null;
                        cfg.adSchedule = [];
                        log('advertising config stripped');
                      }
                      // Override ad methods to no-op
                      p.playAd = function(){};
                      p.pauseAd = function(){};
                      // Listen for ad events and force play immediately
                      var forcePlay = function(evt) {
                        log(evt + ' - forcing play');
                        try { p.skipAd(); } catch(e) {}
                        setTimeout(function() { try { p.play(); } catch(e) {} }, 50);
                      };
                      p.on('adBreakStart', function() { forcePlay('adBreakStart'); });
                      p.on('adPlay', function() { forcePlay('adPlay'); });
                      p.on('adRequest', function() { forcePlay('adRequest'); });
                      p.on('adError', function() { log('adError - resuming'); try { p.play(); } catch(e) {} });

                      // Force autoplay: mute first (iOS policy), play, then unmute + fullscreen
                      var hasEnteredFS = false;
                      var enterFullscreen = function() {
                        if (hasEnteredFS) return;
                        hasEnteredFS = true;
                        log('entering fullscreen');
                        // Notify RN to force landscape orientation
                        try {
                          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'orientation-landscape'}));
                        } catch(e) {}
                        // Use JWPlayer fullscreen API
                        setTimeout(function() {
                          try { p.setFullscreen(true); } catch(e) {
                            try {
                              var vid = document.querySelector('video');
                              if (vid && vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
                              else if (vid && vid.requestFullscreen) vid.requestFullscreen();
                            } catch(e2) {}
                          }
                        }, 300);
                      };
                      p.on('play', function() {
                        // Enter fullscreen shortly after play starts
                        setTimeout(enterFullscreen, 800);
                      });
                      // Restore portrait when exiting fullscreen
                      p.on('fullscreen', function(e) {
                        if (!e.fullscreen) {
                          log('exited fullscreen - restoring portrait');
                          try {
                            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'orientation-lock-portrait'}));
                          } catch(ex) {}
                        }
                      });
                      p.on('ready', function() {
                        log('ready - forcing autoplay');
                        p.setMute(true);
                        p.play();
                        setTimeout(function() { p.setMute(false); }, 500);
                      });
                      // If already ready
                      if (p.getState && (p.getState() === 'idle' || p.getState() === 'paused')) {
                        log('already idle - forcing play');
                        p.setMute(true);
                        p.play();
                        setTimeout(function() { p.setMute(false); }, 500);
                      }

                      clearInterval(adTimer);
                      log('JW ad hooks installed');
                    } catch(e) {}
                  }, 200);

                  log('initialized');
                })(); true;`
            // Skip ad-block for storage.googleapiscdn.com — JW Player needs
            // its own resources to load without interference
            : stream.url.indexOf("storage.googleapiscdn.com") !== -1
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
              if (payload.type === "orientation-landscape") {
                // Force landscape for fullscreen video
                ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
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
            // clbpx player loads video from external CDN — allow all navigation
            if (stream.sourceId === "clbpx") {
              return true;
            }

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
            stream.url.indexOf("storage.googleapiscdn.com") !== -1 ||
            stream.url.indexOf("streamc.xyz") !== -1 ||
            stream.url.indexOf("clbphimxua.com") !== -1
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
              // Skip for streamc.xyz — player1.js handles setup, we only block ads
              if (window.location.hostname.indexOf('streamc.xyz') !== -1) return;
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
          contentFit="contain"
          nativeControls
          player={player}
          style={styles.video}
        />
      )}

      {/* Subtitle overlay — inside container so it renders on top of video */}
      {!isImageGallery && !isCasting && (
        <SubtitleOverlay
          currentTime={isEmbed ? 0 : subtitleTime}
          subtitles={stream.subtitles}
          movieTitle={title}
          tmdbId={tmdbId}
          season={season}
          episode={episode}
          sourceId={stream.sourceId}
          episodeId={episodeId}
        />
      )}

      <View style={styles.backButton}>
        <IconButton
          icon={<Ionicons color="#FFF" name="chevron-back" size={24} />}
          onPress={handleClose}
          style={styles.iconButton}
        />
      </View>

      {/* Cast button in top-right controls area */}
      {!isImageGallery && (
        <View style={styles.castButtonContainer}>
          <CastButton color="#FFF" size={22} style={styles.castBtn} />
        </View>
      )}

      {castError && !isCasting ? (
        <View style={styles.castErrorBanner}>
          <Text style={styles.castErrorBannerText}>{castError}</Text>
          <Pressable onPress={() => setCastError(null)}>
            <Ionicons color="#FFF" name="close" size={16} />
          </Pressable>
        </View>
      ) : null}
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
  castButtonContainer: {
    position: "absolute",
    right: 16,
    top: 16,
    zIndex: 10,
  },
  castBtn: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
  },
  castOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  castTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
  },
  castDevice: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textAlign: "center",
  },
  castSeekRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: 12,
  },
  castProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginHorizontal: 8,
    overflow: "hidden",
  },
  castProgressFill: {
    height: "100%",
    backgroundColor: Colors.accent.primary,
    borderRadius: 2,
  },
  castTime: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    minWidth: 40,
    textAlign: "center",
  },
  castControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 12,
  },
  castControlBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  castControlBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.3)",
    transform: [{ scale: 0.9 }],
  },
  castControlBtnLarge: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  castControlBtnLargePressed: {
    backgroundColor: "rgba(255,255,255,0.35)",
    transform: [{ scale: 0.9 }],
  },
  castErrorText: {
    color: "#FF6B6B",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  castDisconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,107,107,0.15)",
  },
  castDisconnectText: {
    color: "#FF6B6B",
    fontSize: 13,
    fontWeight: "500",
  },
  castErrorBanner: {
    position: "absolute",
    bottom: 8,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,80,80,0.9)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  castErrorBannerText: {
    color: "#FFF",
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
});
