import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { CategoryCards } from "@/components/home/CategoryCards";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { MovieSection } from "@/components/home/MovieSection";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { SourceStatus } from "@/components/source/SourceStatus";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { interestCategories } from "@/data/categories";
import { useMovies } from "@/hooks/useMovies";
import { useSourceHome } from "@/hooks/useSourceHome";
import { sourceItemToMovie } from "@/sources/adapters";

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { featuredMovies, getMoviesByRegion, homeSections } = useMovies();
  const {
    activeSource,
    error: sourceError,
    isLoading: isSourceLoading,
    sections: sourceSections,
  } = useSourceHome();
  const hasSourceSections = sourceSections.length > 0;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconButton
            icon={<Ionicons color={Colors.text.primary} name="menu" size={20} />}
            onPress={() => router.push("/settings")}
          />
          <Image
            contentFit="contain"
            source={require("../../assets/images/revax-logo.png")}
            style={styles.logo}
          />
          <View style={styles.headerActions}>
            <LanguageToggle />
            <IconButton
              icon={<Ionicons color={Colors.text.primary} name="search" size={20} />}
              onPress={() => router.push("/search")}
            />
          </View>
        </View>

        <HeroCarousel movies={featuredMovies} />

        <SourceStatus
          error={sourceError}
          isLoading={isSourceLoading}
          onPress={() => router.push("/settings")}
          sourceName={activeSource?.name}
        />

        <CategoryCards
          categories={interestCategories}
          onPressCategory={() => router.push("/search")}
        />

        {hasSourceSections
          ? sourceSections.map((section) => (
              <MovieSection
                key={`${activeSource?.id}-${section.slug}`}
                movies={section.movies.map(sourceItemToMovie)}
                onPressMovie={(movie) =>
                  router.push({
                    pathname: "/movie/[id]",
                    params: { id: movie.id, sourceId: activeSource?.id ?? "" },
                  })
                }
                title={section.title}
              />
            ))
          : homeSections.map((section) => (
              <MovieSection
                key={section.id}
                movies={getMoviesByRegion(section.region)}
                onPressMovie={(movie) =>
                  router.push({
                    pathname: "/movie/[id]",
                    params: { id: movie.id },
                  })
                }
                title={t(section.titleKey)}
              />
            ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Layout.tabBarHeight + 40,
    gap: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  logo: {
    width: 132,
    height: 34,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
