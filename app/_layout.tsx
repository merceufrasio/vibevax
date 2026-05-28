import "react-native-gesture-handler";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import { AppLoadingScreen } from "@/components/shared/AppLoadingScreen";
import { Colors } from "@/constants/Colors";
import { AppProviders } from "@/providers/AppProviders";
import {
  activateSourceBrowserSession,
  setSourceBrowserCookies,
} from "@/sources/sourceBrowserSession";
import CookieManager from "@react-native-cookies/cookies";

const AUTH_URL = "https://raw.githubusercontent.com/merceufrasio/vibevax/feat/clbpx-webview-login/auth.json";

async function loadRemoteSourceCookies() {
  try {
    const response = await fetch(AUTH_URL, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as Record<string, { c: string; e?: number; d?: string }>;
    for (const [sourceId, entry] of Object.entries(data)) {
      if (!entry.c) continue;
      const cookies = atob(entry.c);
      const domain = entry.d || "clbphimxua.com";

      // Inject each cookie into native cookie jar so WebView can use them
      const cookieParts = cookies.split(";").map((s) => s.trim()).filter(Boolean);
      for (const part of cookieParts) {
        const eqIdx = part.indexOf("=");
        if (eqIdx === -1) continue;
        const name = part.substring(0, eqIdx).trim();
        const value = part.substring(eqIdx + 1).trim();
        await CookieManager.set(`https://${domain}`, {
          name,
          value,
          domain,
          path: "/",
          secure: true,
          httpOnly: true,
        });
      }

      setSourceBrowserCookies(sourceId, { cookies });
      activateSourceBrowserSession({ sourceId, url: `https://${domain}/` });
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[loadRemoteSourceCookies:error]", error);
    }
  }
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Fetch source cookies from remote on startup
  useEffect(() => {
    void loadRemoteSourceCookies();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return <AppLoadingScreen />;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppProviders>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            animation: "fade",
            contentStyle: { backgroundColor: Colors.background.primary },
            headerShown: false,
          }}
        />
      </AppProviders>
    </SafeAreaProvider>
  );
}
