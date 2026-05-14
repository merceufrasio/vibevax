import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
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
  const isEmbed = stream.isEmbed;
  const allowedHosts = useMemo(() => getAllowedHosts(stream), [stream]);
  const blockRules = useMemo(() => getBlockRules(stream), [stream]);

  const player = useVideoPlayer(stream.url, (p) => {
    p.play();
  });

  return (
    <View style={styles.container}>
      {isEmbed ? (
        <WebView
          allowsInlineMediaPlayback={false}
          injectedJavaScript={stream.webView?.injectedJavaScript}
          injectedJavaScriptBeforeContentLoaded={buildBlockedRequestScript(
            stream,
            blockRules,
          )}
          javaScriptCanOpenWindowsAutomatically={false}
          mediaPlaybackRequiresUserAction={false}
          onMessage={(event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data) as {
                type?: string;
                sourceId?: string;
                url?: string;
                rule?: string;
              };

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
          source={{ uri: stream.url, headers: stream.headers }}
          style={styles.webview}
        />
      ) : (
        <VideoView
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
          onPress={onClose}
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
