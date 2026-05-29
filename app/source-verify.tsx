import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { activateSourceBrowserSession, setSourceBrowserCookies } from "@/sources/sourceBrowserSession";
import {
  cancelSourceChallenge,
  getSourceChallenge,
  resolveSourceChallenge,
  resolveSourceChallengePages,
} from "@/sources/sourceChallenge";

function buildVerificationScript(prefetchUrls: string[]) {
  return `
    (function () {
      // If success was already detected, don't run script again — let page redirect naturally
      if (window.__REVAX_SUCCESS_DETECTED__) {
        return true;
      }

      // Re-entrancy guard — script gets injected multiple times via onLoadProgress
      if (window.__REVAX_VERIFY_RUNNING__) {
        return true;
      }
      window.__REVAX_VERIFY_RUNNING__ = true;

      function postState(state, extra) {
        var payload = Object.assign({ type: "challenge-state", state: state }, extra || {});
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        } catch (e) {}
      }

      function postDebug(msg) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "debug", msg: msg }));
        } catch (e) {}
      }

      function detectPageType() {
        var html = document.documentElement ? document.documentElement.outerHTML : "";
        var lower = html.toLowerCase();

        // 1. Cloudflare turnstile / challenge page
        if (lower.indexOf("cloudflare") !== -1 && (
          lower.indexOf("verify you are human") !== -1 ||
          lower.indexOf("checking your browser") !== -1 ||
          lower.indexOf("__cf_chl") !== -1 ||
          lower.indexOf("cf-turnstile") !== -1 ||
          lower.indexOf("cf-challenge-running") !== -1
        )) {
          return "cloudflare";
        }

        // 2. AnimeVietSub xác minh form page (has the verify form)
        if (document.getElementById("verify-form") || document.getElementById("btn-submit")) {
          return "xacminh";
        }

        // 3. AnimeVietSub success overlay (transitioning to content)
        var overlay = document.getElementById("success-overlay");
        if (overlay) {
          return "xacminh-success";
        }

        // Also check by text content (overlay may not have class yet)
        if (lower.indexOf("xác minh thành công") !== -1 || lower.indexOf("đang chuyển hướng") !== -1) {
          return "xacminh-success";
        }

        // 4. Content page (no challenge markers, no form)
        return "content";
      }

      function autoFillXacMinh() {
        var form = document.getElementById("verify-form");
        if (!form || form.__REVAX_FILLED__) return false;

        var ngayNg = form.querySelector('input[name="ngay_ng"]');
        var tiente = form.querySelector('input[name="tiente"]');
        var quocky = form.querySelector('input[name="quocky"]');
        var quandao = form.querySelector('input[name="quandao"]');
        var cautho = form.querySelector('input[name="cautho"]');

        if (!ngayNg || !tiente || !quocky || !quandao || !cautho) {
          return false;
        }

        ngayNg.value = "20/11";
        tiente.value = "VND";
        quocky.value = "5";
        quandao.value = "Vi\\u1EC7t Nam";
        cautho.value = "B\\u00E1c H\\u1ED3";
        form.__REVAX_FILLED__ = true;

        // Auto-click submit after a short delay (let user see the values briefly)
        setTimeout(function () {
          if (form.__REVAX_SUBMITTED__) return;
          form.__REVAX_SUBMITTED__ = true;
          var btn = document.getElementById("btn-submit");
          if (btn) {
            btn.click();
          } else {
            try { form.submit(); } catch (e) {}
          }
        }, 800);

        return true;
      }

      function reportContent() {
        var html = document.documentElement ? document.documentElement.outerHTML : "";
        var urls = ${JSON.stringify(prefetchUrls)};

        Promise.all(urls.map(function (url) {
          return fetch(url, { credentials: "include" })
            .then(function (r) { return r.text(); })
            .then(function (h) { return [url, h]; })
            .catch(function () { return [url, ""]; });
        })).then(function (entries) {
          var pages = {};
          entries.forEach(function (e) {
            if (e[0] && e[1]) pages[e[0]] = e[1];
          });
          if (!pages[window.location.href] && html) {
            pages[window.location.href] = html;
          }
          postState("verified", {
            html: html,
            pages: pages,
            cookies: document.cookie,
            userAgent: navigator.userAgent
          });
        }).catch(function () {
          postState("verified", {
            html: html,
            pages: {},
            cookies: document.cookie,
            userAgent: navigator.userAgent
          });
        });
      }

      // Main detection — runs once per page load
      var pageType = detectPageType();
      postDebug("pageType=" + pageType + " url=" + window.location.href.substring(0, 60));

      if (pageType === "cloudflare") {
        postState("pending");
        window.__REVAX_VERIFY_RUNNING__ = false;
        return true;
      }

      if (pageType === "xacminh") {
        // Try auto-fill once
        var filled = autoFillXacMinh();
        postState("pending");
        // Reset flag so script can re-run after navigation
        window.__REVAX_VERIFY_RUNNING__ = false;
        return true;
      }

      if (pageType === "xacminh-success") {
        // Success! Block all further script injections — let the page redirect naturally
        window.__REVAX_SUCCESS_DETECTED__ = true;
        postDebug("SUCCESS! Waiting for redirect...");
        postState("pending");
        return true;
      }
            // 10 seconds max wait
            clearInterval(successPoll);
            window.__REVAX_VERIFY_RUNNING__ = false;
          }
        }, 500);
        return true;
      }

      // Content page — wait briefly to ensure page settled, then report verified
      setTimeout(function () {
        // Re-check after delay in case page is still navigating
        var typeAfterDelay = detectPageType();
        if (typeAfterDelay !== "content") {
          postState("pending");
          window.__REVAX_VERIFY_RUNNING__ = false;
          return;
        }
        reportContent();
      }, 1500);

      return true;
    })();
  `;
}

export default function SourceVerifyScreen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const handledRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
  const lastInjectedUrlRef = useRef<string>("");
  const [statusText, setStatusText] = useState("Đang chờ bạn xác minh Cloudflare...");
  const [error, setError] = useState<string | null>(null);

  const challenge = useMemo(
    () => (challengeId ? getSourceChallenge(challengeId) : null),
    [challengeId],
  );

  if (!challenge) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>Không tìm thấy yêu cầu xác minh</Text>
          <Text style={styles.subtitle}>
            Yêu cầu xác minh đã hết hạn hoặc chưa được khởi tạo đúng cách.
          </Text>
          <Button label="Quay lại" onPress={() => router.back()} style={styles.button} />
        </View>
      </SafeAreaView>
    );
  }

  const prefetchUrls = Array.from(
    new Set([challenge.url, ...(challenge.prefetchUrls ?? [])].filter(Boolean)),
  );
  const verificationScript = useMemo(
    () => buildVerificationScript(prefetchUrls),
    [prefetchUrls],
  );

  const handleClose = () => {
    cancelSourceChallenge(challenge.id);
    router.back();
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        state?: string;
        html?: string;
        pages?: Record<string, string>;
        error?: string;
        cookies?: string;
        userAgent?: string;
        msg?: string;
      };

      // Show debug messages on panel
      if (payload.type === "debug") {
        setStatusText(payload.msg ?? "");
        return;
      }

      if (handledRef.current) {
        return;
      }

      if (payload.type !== "challenge-state") {
        return;
      }

      if (payload.state === "pending") {
        setStatusText("Cloudflare đang chờ bạn xác minh, hãy hoàn tất bước kiểm tra.");
        return;
      }

      if (payload.state === "verified") {
        handledRef.current = true;
        setStatusText("Xác minh thành công, đang trả dữ liệu về ứng dụng...");
        activateSourceBrowserSession({
          sourceId: challenge.sourceId,
          sourceName: challenge.sourceName,
          url: challenge.url,
        });

        // Store Cloudflare cookies for image loading.
        if (payload.cookies) {
          setSourceBrowserCookies(challenge.sourceId, { 
            cookies: payload.cookies, 
            userAgent: payload.userAgent 
          });
        }

        if (payload.pages && Object.keys(payload.pages).length > 0) {
          resolveSourceChallengePages(challenge.id, payload.pages);
        } else if (payload.html) {
          resolveSourceChallenge(challenge.id, payload.html);
        } else {
          throw new Error("Thiếu HTML đã xác minh.");
        }

        router.back();
        return;
      }

      if (payload.state === "error") {
        setError(payload.error ?? "Không thể lấy HTML sau khi xác minh.");
      }
    } catch (messageError) {
      setError(String(messageError));
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton
          icon={<Ionicons color={Colors.text.primary} name="close" size={20} />}
          onPress={handleClose}
        />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Xác minh nguồn</Text>
          <Text style={styles.subtitle}>{challenge.sourceName ?? challenge.sourceId}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Hoàn tất bước xác minh để tiếp tục</Text>
        <Text style={styles.panelBody}>{statusText}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.accent.primary} />
          <Text style={styles.loadingText}>URL: {challenge.url}</Text>
        </View>
      </View>

      <View style={styles.webViewWrap}>
        <WebView
          ref={webViewRef}
          injectedJavaScript={verificationScript}
          javaScriptEnabled
          onMessage={handleMessage}
          onLoadEnd={() => {
            if (!handledRef.current) {
              setStatusText("Đã tải trang xác minh, chờ bạn hoàn tất bước kiểm tra.");
            }
          }}
          onNavigationStateChange={(navState) => {
            if (!handledRef.current) {
              const url = navState.url ?? "";
              setStatusText("URL: " + url.substring(0, 80));
            }
          }}
          originWhitelist={["*"]}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          source={{ uri: challenge.url }}
          style={styles.webView}
          thirdPartyCookiesEnabled
          onLoadProgress={({ nativeEvent }) => {
            if (!handledRef.current && nativeEvent.progress >= 0.95) {
              // Re-run verification only if URL changed since last injection
              const currentUrl = nativeEvent.url ?? "";
              if (lastInjectedUrlRef.current !== currentUrl) {
                lastInjectedUrlRef.current = currentUrl;
                try {
                  webViewRef.current?.injectJavaScript(verificationScript);
                } catch {}
              }
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPadding,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: Layout.screenPadding,
    marginBottom: 16,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  panel: {
    marginHorizontal: Layout.screenPadding,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    padding: 14,
    marginBottom: 14,
  },
  panelTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  panelBody: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 8,
  },
  error: {
    ...Typography.caption,
    color: Colors.accent.danger,
    marginTop: 10,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  loadingText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    flex: 1,
  },
  webViewWrap: {
    flex: 1,
    overflow: "hidden",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Layout.screenPadding,
    marginBottom: 16,
    backgroundColor: Colors.background.surface,
  },
  webView: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  button: {
    marginTop: 20,
  },
});
