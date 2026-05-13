import { Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

export const Layout = {
  window: { width, height },
  screenPadding: 20,
  sectionGap: 28,
  cardRadius: 8,
  heroCardWidth: Math.min(width - 84, 320),
  heroCardHeight: Math.min((width - 84) * 1.48, 474),
  posterWidth: 138,
  posterHeight: 204,
  categoryWidth: 172,
  tabBarHeight: 78,
} as const;

