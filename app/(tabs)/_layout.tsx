import { Tabs } from "expo-router";

import { TabBar } from "@/components/shared/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="favorites" />
    </Tabs>
  );
}

