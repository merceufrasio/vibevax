import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import {
  activateSourceBrowserSession,
  setSourceBrowserCookies,
} from "@/sources/sourceBrowserSession";
import { persistSourceCookies } from "@/sources/sourceCookiePersistence";
import { isLoginSuccessNavigation } from "@/sources/sourceLogin";

const COOKIE_EXTRACT_SCRIPT = `
  (function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "login-cookies",
      cookies: document.cookie,
      userAgent: navigator.userAgent,
      currentUrl: window.location.href
    }));
  })();
  true;
`;

export default function SourceLoginScreen() {
  const router = useRouter();
  const { sourceId, sourceName, loginUrl, originalUrl } = useLocalSearchParams<{
    sourceId: string;
    sourceName?: string;
    loginUrl: string;
    originalUrl?: string;
  }>();

  const webViewRef = useRef<WebView>(null);
  const handledRef = useRef(false);
  const previousUrlRef = useRef(loginUrl ?? "");
  const [statusText, setStatusText] = useState("Đang tải trang đăng nhập...");

  if (!sourceId || !loginUrl) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>Thiếu thông tin đăng nhập</Text>
          <Text style={styles.subtitle}>
            Không tìm thấy URL đăng nhập hoặc ID nguồn.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleClose = () => {
    router.back();
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (handledRef.current) return;

    const currentUrl = navState.url ?? "";
    const prevUrl = previousUrlRef.current;

    // Detect login success: navigated away from wp-login.php
    if (isLoginSuccessNavigation(currentUrl, prevUrl)) {
      handledRef.current = true;
      setStatusText("Đăng nhập thành công, đang lưu phiên...");
      webViewRef.current?.injectJavaScript(COOKIE_EXTRACT_SCRIPT);
    }

    previousUrlRef.current = currentUrl;
  };

  const handleLoadEnd = () => {
    if (handledRef.current) return;

    // Also check on load end — some WordPress sites redirect via JS after login
    webViewRef.current?.injectJavaScript(`
      (function() {
        var url = window.location.href;
        if (url.indexOf('/wp-login.php') === -1 && url.indexOf('${new URL(loginUrl).hostname}') !== -1) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "login-cookies",
            cookies: document.cookie,
            userAgent: navigator.userAgent,
            currentUrl: url
          }));
        }
      })();
      true;
    `);
  };

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        cookies?: string;
        userAgent?: string;
        currentUrl?: string;
      };

      if (payload.type !== "login-cookies") return;
      if (handledRef.current && !payload.currentUrl) return;

      // Skip if still on login page
      if (payload.currentUrl && payload.currentUrl.includes("/wp-login.php")) return;

      handledRef.current = true;

      const cookies = payload.cookies ?? "";
      const userAgent = payload.userAgent;

      // Extract domain from loginUrl
      let domain = "";
      try {
        domain = new URL(loginUrl).hostname;
      } catch {
        domain = loginUrl.replace(/^https?:\/\//, "").split("/")[0];
      }

      // Activate browser session for this source
      activateSourceBrowserSession({
        sourceId,
        sourceName,
        url: `https://${domain}/`,
      });

      // Store cookies in memory (even if empty — shared cookie jar handles the real cookies)
      setSourceBrowserCookies(sourceId, { cookies, userAgent });

      // Persist cookies to AsyncStorage
      persistSourceCookies(sourceId, { cookies, userAgent }, domain);

      // Navigate back — caller will retry the request
      router.back();
    } catch {
      // Ignore malformed messages
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
          <Text style={styles.title}>Đăng nhập nguồn</Text>
          <Text style={styles.subtitle}>{sourceName ?? sourceId}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Đăng nhập để tiếp tục</Text>
        <Text style={styles.panelBody}>{statusText}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.accent.primary} />
          <Text style={styles.loadingText}>{loginUrl}</Text>
        </View>
      </View>

      <View style={styles.webViewWrap}>
        <WebView
          ref={webViewRef}
          javaScriptEnabled
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          originWhitelist={["*"]}
          sharedCookiesEnabled
          source={{ uri: loginUrl }}
          style={styles.webView}
          thirdPartyCookiesEnabled
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
});
