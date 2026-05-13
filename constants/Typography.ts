import type { TextStyle } from "react-native";

export const FontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const Typography = {
  heroTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0,
  } satisfies TextStyle,
  sectionTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 0,
  } satisfies TextStyle,
  cardTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  } satisfies TextStyle,
  body: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 0,
  } satisfies TextStyle,
  caption: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
  } satisfies TextStyle,
  label: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0,
  } satisfies TextStyle,
  button: {
    fontFamily: FontFamily.semibold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
  } satisfies TextStyle,
} as const;

