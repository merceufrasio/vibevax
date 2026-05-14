import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import {
  type SourceBrowserSession,
  rejectSourceBrowserFetch,
  resolveSourceBrowserFetch,
  setSourceBrowserCookies,
  subscribeToSourceBrowserFetches,
  subscribeToSourceBrowserSessions,
} from "@/sources/sourceBrowserSession";

function buildBrowserFetchScript(requestId: string, url: string) {
  return `
    (function () {
      fetch(${JSON.stringify(url)}, { credentials: "include" })
        .then(function (response) { return response.text(); })
        .then(function (html) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "browser-fetch-result",
            requestId: ${JSON.stringify(requestId)},
            html: html
          }));
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "browser-cookies",
            cookies: document.cookie,
            userAgent: navigator.userAgent
          }));
        })
        .catch(function (error) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "browser-fetch-error",
            requestId: ${JSON.stringify(requestId)},
            error: String(error)
          }));
        });
      true;
    })();
  `;
}

const COOKIE_EXTRACT_SCRIPT = `
  (function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "browser-cookies",
      cookies: document.cookie,
      userAgent: navigator.userAgent
    }));
    true;
  })();
`;

export function SourceBrowserSessionProvider() {
  const webViewRef = useRef<WebView>(null);
  const pendingRequestRef = useRef<{ id: string; url: string } | null>(null);
  const [sessions, setSessions] = useState<SourceBrowserSession[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sourceId === activeSourceId) ?? sessions[0] ?? null,
    [activeSourceId, sessions],
  );

  useEffect(() => {
    return subscribeToSourceBrowserSessions((nextSessions) => {
      setSessions(nextSessions);
      if (!activeSourceId && nextSessions[0]?.sourceId) {
        setActiveSourceId(nextSessions[0].sourceId);
      }
    });
  }, [activeSourceId]);

  useEffect(() => {
    return subscribeToSourceBrowserFetches((request) => {
      setActiveSourceId(request.sourceId);
      pendingRequestRef.current = {
        id: request.id,
        url: request.url,
      };

      if (isReady && activeSession?.sourceId === request.sourceId) {
        webViewRef.current?.injectJavaScript(
          buildBrowserFetchScript(request.id, request.url),
        );
      }
    });
  }, [activeSession?.sourceId, isReady]);

  if (!activeSession) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.hiddenWrap}>
      <WebView
        ref={webViewRef}
        javaScriptEnabled
        onLoadEnd={() => {
          setIsReady(true);

          // Extract cookies as soon as the page loads.
          webViewRef.current?.injectJavaScript(COOKIE_EXTRACT_SCRIPT);

          const pending = pendingRequestRef.current;
          if (pending) {
            webViewRef.current?.injectJavaScript(
              buildBrowserFetchScript(pending.id, pending.url),
            );
          }
        }}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              requestId?: string;
              html?: string;
              error?: string;
            };

            if (payload.type === "browser-fetch-result" && payload.requestId) {
              if (pendingRequestRef.current?.id === payload.requestId) {
                pendingRequestRef.current = null;
              }
              resolveSourceBrowserFetch(payload.requestId, payload.html ?? "");
              return;
            }

            if (payload.type === "browser-cookies" && activeSession) {
              const cookies = (payload as { cookies?: string }).cookies;
              const userAgent = (payload as { userAgent?: string }).userAgent;
              if (__DEV__) {
                console.log("[browser-cookies:extracted]", { sourceId: activeSession.sourceId, hasCookies: !!cookies, len: cookies?.length, userAgent });
              }
              if (cookies) {
                setSourceBrowserCookies(activeSession.sourceId, { cookies, userAgent });
              }
              return;
            }

            if (payload.type === "browser-fetch-error" && payload.requestId) {
              if (pendingRequestRef.current?.id === payload.requestId) {
                pendingRequestRef.current = null;
              }
              rejectSourceBrowserFetch(
                payload.requestId,
                payload.error ?? "Unknown browser session error.",
              );
            }
          } catch (error) {
            const pending = pendingRequestRef.current;
            if (pending) {
              pendingRequestRef.current = null;
              rejectSourceBrowserFetch(pending.id, String(error));
            }
          }
        }}
        originWhitelist={["*"]}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        source={{ uri: activeSession.url }}
        style={styles.hiddenWebView}
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenWrap: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -1000,
    top: -1000,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
