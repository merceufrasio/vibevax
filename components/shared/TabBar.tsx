import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";

const routeMeta = {
  index: { icon: "home-outline", activeIcon: "home", label: "Trang Chủ" },
  history: {
    icon: "time-outline",
    activeIcon: "time",
    label: "Lịch sử xem",
  },
} as const;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(Math.round(insets.bottom * 0.4), 6);

  return (
    <View style={[styles.wrap, { bottom: 2 }]}>
      <BlurView
        experimentalBlurMethod="dimezisBlurView"
        intensity={40}
        style={[
          styles.blur,
          {
            minHeight: Layout.tabBarHeight + bottomInset,
            paddingBottom: bottomInset,
          },
        ]}
        tint="dark"
      >
        {state.routes.map((route, index) => {
          const meta = routeMeta[route.name as keyof typeof routeMeta];
          if (!meta) {
            return null;
          }

          const isFocused = state.index === index;
          const { options } = descriptors[route.key];

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={[styles.tab, isFocused ? styles.tabActive : null]}
            >
              <Ionicons
                color={
                  isFocused ? Colors.accent.primary : Colors.text.secondary
                }
                name={(isFocused ? meta.activeIcon : meta.icon) as never}
                size={22}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  isFocused ? styles.labelActive : styles.labelInactive,
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    paddingHorizontal: 10,
    backgroundColor: "transparent",
  },
  blur: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(17,24,39,0.72)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 42,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  label: {
    ...Typography.label,
  },
  labelActive: {
    color: Colors.accent.primary,
  },
  labelInactive: {
    color: Colors.text.secondary,
  },
});
