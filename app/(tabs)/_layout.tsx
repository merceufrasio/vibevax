import { Tabs, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";

import { TabBar } from "@/components/shared/TabBar";
import { MiniController, useCastSession } from "@/modules/cast";

export default function TabsLayout() {
  const router = useRouter();
  const { state: castState } = useCastSession();
  const prevConnectedRef = useRef(castState.isConnected);

  // Detect unexpected disconnect: was connected, now disconnected
  // without user-initiated action (e.g., connection lost)
  useEffect(() => {
    const wasConnected = prevConnectedRef.current;
    prevConnectedRef.current = castState.isConnected;

    if (wasConnected && !castState.isConnected) {
      // Unexpected disconnect — MiniController will auto-hide since
      // it checks isConnected internally. No additional action needed
      // as the MiniController component returns null when not connected.
    }
  }, [castState.isConnected]);

  const handleExpandMiniController = useCallback(() => {
    // Navigate to NowPlaying screen (could be a modal or dedicated route)
    // For now, this is a placeholder — NowPlaying can be shown as a modal
    // or navigated to via a route when the route is set up
    router.push("/now-playing" as never);
  }, [router]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
        }}
        tabBar={(props) => (
          <View>
            {castState.isConnected && (
              <MiniController onExpand={handleExpandMiniController} />
            )}
            <TabBar {...props} />
          </View>
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="history" />
      </Tabs>
    </View>
  );
}
