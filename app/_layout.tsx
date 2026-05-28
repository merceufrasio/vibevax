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
import { setSourceBrowserCookies } from "@/sources/sourceBrowserSession";

// Hardcoded cookies for sources that require authentication
// Update these when they expire
const SOURCE_COOKIES: Record<string, { cookies: string; userAgent?: string }> = {
  clbpx: {
    cookies: "wordpress_logged_in_4f11e66873917c29d453ff7fc4f26e7b=ariehpuah3%40gmail.com%7C1780112370%7CKaCjauXjMgcGtVjD1VaOlGemisfmEkXiHttMdEVgYFR%7Ce98212f86ad875da678e4d06c626636e167dd0284edd969ab1cf51c79ee62eaa",
  },
};

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Load hardcoded source cookies into memory on startup
  useEffect(() => {
    for (const [sourceId, data] of Object.entries(SOURCE_COOKIES)) {
      setSourceBrowserCookies(sourceId, data);
    }
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
