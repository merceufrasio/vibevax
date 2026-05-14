import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HeroCarousel } from "@/components/home/HeroCarousel";
import { MovieSection } from "@/components/home/MovieSection";
import { SourceStatus } from "@/components/source/SourceStatus";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { useMovies } from "@/hooks/useMovies";
import { useSourceHome } from "@/hooks/useSourceHome";
import { sourceItemToMovie } from "@/sources/adapters";

const HOT_SECTION_PATTERNS = [
  /hot/i,
  /trending/i,
  /popular/i,
  /de cu/i,
  /đề cử/i,
  /noi bat/i,
  /nổi bật/i,
  /dang chieu/i,
  /đang chiếu/i,
  /phim moi/i,
  /mới/i,
];

const LOCAL_SECTION_TITLES: Record<string, string> = {
  "sections.cn": "Phim Trung Quốc",
  "sections.usuk": "Phim Âu Mỹ",
  "sections.kr": "Phim Hàn Quốc",
};

function pickHeroSectionIndex(sectionTitles: string[]) {
  const matchedIndex = sectionTitles.findIndex((title) =>
    HOT_SECTION_PATTERNS.some((pattern) => pattern.test(title)),
  );

  return matchedIndex >= 0 ? matchedIndex : 0;
}

export default function HomeScreen() {
  const router = useRouter();
  const { featuredMovies, getMoviesByRegion, homeSections } = useMovies();
  const {
    activeSource,
    challenge: sourceChallenge,
    error: sourceError,
    isLoading: isSourceLoading,
    sections: sourceSections,
  } = useSourceHome();

  const hasSourceSections = sourceSections.length > 0;
  const sourceHeroSectionIndex = pickHeroSectionIndex(
    sourceSections.map((section) => section.title),
  );
  const sourceHeroMovies = hasSourceSections
    ? sourceSections[sourceHeroSectionIndex]?.movies.map(sourceItemToMovie).slice(0, 8) ?? []
    : [];
  const heroMovies = sourceHeroMovies.length ? sourceHeroMovies : featuredMovies;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <HeroCarousel
            movies={heroMovies}
            sourceId={sourceHeroMovies.length ? activeSource?.id : undefined}
          />

          <SourceStatus
            error={sourceError}
            isLoading={isSourceLoading}
            onPress={() =>
              sourceChallenge
                ? router.push({
                    pathname: "/source-verify",
                    params: { challengeId: sourceChallenge.id },
                  })
                : router.push("/settings")
            }
            sourceName={activeSource?.name}
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
                  title={LOCAL_SECTION_TITLES[section.titleKey] ?? section.titleKey}
                />
              ))}
        </ScrollView>

        <View pointerEvents="box-none" style={styles.headerOverlay}>
          <View style={styles.header}>
            <IconButton
              icon={<Ionicons color={Colors.text.primary} name="menu" size={20} />}
              onPress={() => router.push("/settings")}
            />
            <View style={styles.brand}>
              <Image
                contentFit="contain"
                source={require("../../assets/images/revax-app-icon.png")}
                style={styles.brandIcon}
              />
              <Text style={styles.brandText}>ReVax</Text>
            </View>
            <IconButton
              icon={<Ionicons color={Colors.text.primary} name="search" size={20} />}
              onPress={() => router.push("/search")}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Layout.tabBarHeight + 40,
    gap: 28,
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingHorizontal: Layout.screenPadding,
    backgroundColor: "transparent",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 132,
    justifyContent: "center",
  },
  brandIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
  },
  brandText: {
    color: Colors.text.primary,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
});
