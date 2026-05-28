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
import { restoreAllSourceCookies } from "@/sources/sourceCookiePersistence";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Restore persisted source cookies before any source fetches are attempted
  useEffect(() => {
    void restoreAllSourceCookies();
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
