import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";

const routeMeta = {
  index: { icon: "home-outline", activeIcon: "home", labelKey: "tabs.home" },
  history: {
    icon: "time-outline",
    activeIcon: "time",
    labelKey: "tabs.history",
  },
  favorites: {
    icon: "heart-outline",
    activeIcon: "heart",
    labelKey: "tabs.favorites",
  },
} as const;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const bottomInset = Math.max(insets.bottom, 10);

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
                {t(meta.labelKey)}
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
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
  blur: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(17,24,39,0.72)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 10,
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
    gap: 4,
    minHeight: 54,
    borderRadius: 16,
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
