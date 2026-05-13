import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const currentLanguage = i18n.language.startsWith("en") ? "en" : "vi";

  return (
    <View style={styles.container}>
      {(["vi", "en"] as const).map((language) => {
        const isActive = currentLanguage === language;

        return (
          <Pressable
            key={language}
            onPress={() => {
              if (!isActive) {
                void i18n.changeLanguage(language);
              }
            }}
            style={[styles.segment, isActive ? styles.segmentActive : null]}
          >
            <Text
              style={[
                styles.label,
                isActive ? styles.labelActive : styles.labelInactive,
              ]}
            >
              {t(`meta.${language}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(17,24,39,0.82)",
  },
  segment: {
    minWidth: 34,
    minHeight: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  segmentActive: {
    backgroundColor: Colors.accent.primary,
  },
  label: {
    ...Typography.label,
  },
  labelActive: {
    color: Colors.text.inverse,
  },
  labelInactive: {
    color: Colors.text.secondary,
  },
});

