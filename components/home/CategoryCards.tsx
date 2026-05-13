import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import type { MovieCategory } from "@/types/movie";

type CategoryCardsProps = {
  categories: MovieCategory[];
  onPressCategory?: (category: MovieCategory) => void;
};

export function CategoryCards({
  categories,
  onPressCategory,
}: CategoryCardsProps) {
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader title={t("sections.interests")} />
      <ScrollView
        contentContainerStyle={styles.content}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => onPressCategory?.(category)}
            style={styles.card}
          >
            <LinearGradient
              colors={category.colors}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.gradient}
            >
              <Text numberOfLines={2} style={styles.title}>
                {category.title}
              </Text>
              <Text numberOfLines={2} style={styles.subtitle}>
                {category.subtitle}
              </Text>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 10,
    paddingRight: Layout.screenPadding,
  },
  card: {
    width: Layout.categoryWidth,
    height: 108,
    borderRadius: Layout.cardRadius,
    overflow: "hidden",
  },
  gradient: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "space-between",
  },
  title: {
    ...Typography.sectionTitle,
    fontSize: 16,
    lineHeight: 22,
    color: "#FFFFFF",
  },
  subtitle: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.85)",
  },
});

