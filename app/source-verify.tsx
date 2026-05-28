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
      if (window.__REVAX_VERIFY_RUNNING__) {
        return true;
      }

      window.__REVAX_VERIFY_RUNNING__ = true;

      // --- AnimeVietSub xac-minh.php auto-fill logic ---
      if (window.location.href.indexOf("xac-minh.php") !== -1) {
        // Already handling xac-minh.php submission monitoring
        if (window.__REVAX_XAC_MINH_SUBMITTED__) {
          window.__REVAX_VERIFY_RUNNING__ = false;
          return true;
        }

        var pollStart = Date.now();
        var pollInterval = setInterval(function () {
          var elapsed = Date.now() - pollStart;
          var form = document.getElementById("verify-form");

          // Timeout: form not found within 3 seconds, fall back to standard behavior
          if (!form && elapsed >= 3000) {
            clearInterval(pollInterval);
            window.__REVAX_VERIFY_RUNNING__ = false;
            window.__REVAX_XAC_MINH_FALLBACK__ = true;
            return;
          }

          if (!form) {
            return; // Keep polling
          }

          // Form found — check all expected input fields exist
          clearInterval(pollInterval);

          var ngayNg = form.querySelector('input[name="ngay_ng"]');
          var tiente = form.querySelector('input[name="tiente"]');
          var quocky = form.querySelector('input[name="quocky"]');
          var quandao = form.querySelector('input[name="quandao"]');
          var cautho = form.querySelector('input[name="cautho"]');

          if (!ngayNg || !tiente || !quocky || !quandao || !cautho) {
            // Missing expected fields, abort auto-fill and fall back
            window.__REVAX_VERIFY_RUNNING__ = false;
            window.__REVAX_XAC_MINH_FALLBACK__ = true;
            return;
          }

          // Auto-fill the form inputs
          ngayNg.value = "20/11";
          tiente.value = "VND";
          quocky.value = "5";
          quandao.value = "Vi\\u1EC7t Nam";
          cautho.value = "B\\u00E1c H\\u1ED3";

          // Click the submit button
          var submitBtn = document.getElementById("btn-submit");
          if (submitBtn) {
            submitBtn.click();
          }

          // Mark as submitted and monitor for navigation away
          window.__REVAX_XAC_MINH_SUBMITTED__ = true;
          var submitTime = Date.now();

          var navCheck = setInterval(function () {
            // Page navigated away from xac-minh.php — verification succeeded
            if (window.location.href.indexOf("xac-minh.php") === -1) {
              clearInterval(navCheck);

              // Wait for new page to fully load, then fetch prefetch URLs and post verified
              var waitForLoad = setInterval(function () {
                if (document.readyState === "complete" || document.readyState === "interactive") {
                  clearInterval(waitForLoad);

                  var verifiedHtml = document.documentElement ? document.documentElement.outerHTML : "";
                  var urls = ${JSON.stringify(prefetchUrls)};

                  Promise.all(
                    urls.map(function (url) {
                      return fetch(url, { credentials: "include" })
                        .then(function (response) { return response.text(); })
                        .then(function (pageHtml) { return [url, pageHtml]; })
                        .catch(function () { return [url, ""]; });
                    })
                  ).then(function (entries) {
                    var pages = {};
                    entries.forEach(function (entry) {
                      if (entry[0] && entry[1]) {
                        pages[entry[0]] = entry[1];
                      }
                    });

                    if (!pages[window.location.href] && verifiedHtml) {
                      pages[window.location.href] = verifiedHtml;
                    }

                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: "challenge-state",
                      state: "verified",
                      html: verifiedHtml,
                      pages: pages,
                      cookies: document.cookie,
                      userAgent: navigator.userAgent
                    }));
                    window.__REVAX_VERIFY_RUNNING__ = false;
                  }).catch(function () {
                    // Even if prefetch fails, still report verified with current page HTML
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: "challenge-state",
                      state: "verified",
                      html: verifiedHtml,
                      pages: {},
                      cookies: document.cookie,
                      userAgent: navigator.userAgent
                    }));
                    window.__REVAX_VERIFY_RUNNING__ = false;
                  });
                }
              }, 200);
              return;
            }

            // Still on xac-minh.php after 5 seconds — treat as failed, fall back
            if (Date.now() - submitTime >= 5000) {
              clearInterval(navCheck);
              window.__REVAX_XAC_MINH_SUBMITTED__ = false;
              window.__REVAX_XAC_MINH_FALLBACK__ = true;
              window.__REVAX_VERIFY_RUNNING__ = false;
              return;
            }
          }, 300);
        }, 200);

        return true;
      }
      // --- End xac-minh.php auto-fill logic ---

      var html = document.documentElement ? document.documentElement.outerHTML : "";
      var normalized = html.toLowerCase();
      var isChallenge =
        normalized.indexOf("cloudflare") !== -1 &&
        (
          normalized.indexOf("verify you are human") !== -1 ||
          normalized.indexOf("checking your browser") !== -1 ||
          normalized.indexOf("__cf_chl") !== -1 ||
          normalized.indexOf("cf-turnstile") !== -1
        );

      if (isChallenge) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "challenge-state",
          state: "pending"
        }));
        return true;
      }

      // If we're on xac-minh.php, don't report verified yet — wait for auto-fill
      if (window.location.href.indexOf("xac-minh") !== -1) {
        window.__REVAX_VERIFY_RUNNING__ = false;
        return true;
      }

      // Wait a moment to ensure page is fully settled (not mid-redirect)
      setTimeout(function() {
        var urls = ${JSON.stringify(prefetchUrls)};

      Promise.all(
        urls.map(function (url) {
          return fetch(url, { credentials: "include" })
            .then(function (response) { return response.text(); })
            .then(function (pageHtml) { return [url, pageHtml]; })
            .catch(function () { return [url, ""]; });
        })
      ).then(function (entries) {
        var pages = {};
        entries.forEach(function (entry) {
          if (entry[0] && entry[1]) {
            pages[entry[0]] = entry[1];
          }
        });

        if (!pages[window.location.href] && html) {
          pages[window.location.href] = html;
        }

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "challenge-state",
          state: "verified",
          html: html,
          pages: pages,
          cookies: document.cookie,
          userAgent: navigator.userAgent
        }));
        window.__REVAX_VERIFY_RUNNING__ = false;
      }).catch(function (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "challenge-state",
          state: "error",
          error: String(error)
        }));
        window.__REVAX_VERIFY_RUNNING__ = false;
      });
      }, 1500); // End setTimeout — wait 1.5s for page to settle

      return true;
    })();
  `;
}

export default function SourceVerifyScreen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const handledRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
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
    if (handledRef.current) {
      return;
    }

    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        state?: string;
        html?: string;
        pages?: Record<string, string>;
        error?: string;
        cookies?: string;
        userAgent?: string;
      };

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
          injectedJavaScriptBeforeContentLoaded={verificationScript}
          javaScriptEnabled
          onMessage={handleMessage}
          onLoadEnd={() => {
            if (!handledRef.current) {
              setStatusText("Đã tải trang xác minh, chờ bạn hoàn tất bước kiểm tra.");
            }
          }}
          onNavigationStateChange={() => {
            if (!handledRef.current) {
              setStatusText("Đang kiểm tra trạng thái xác minh...");
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
              // Re-run verification after navigation completes, especially after Cloudflare redirects.
              try {
                webViewRef.current?.injectJavaScript(verificationScript);
              } catch {}
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
