import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/shared/EmptyState";
import { MovieCard } from "@/components/shared/MovieCard";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useFavorites } from "@/hooks/useFavorites";
import { useMovies } from "@/hooks/useMovies";

export default function FavoritesScreen() {
  const router = useRouter();
  const { favoriteIds } = useFavorites();
  const { getMovieById } = useMovies();

  const favoriteMovies = favoriteIds
    .map((movieId) => getMovieById(movieId))
    .filter((movie): movie is NonNullable<typeof movie> => Boolean(movie));

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Yêu thích</Text>
          <Text style={styles.subtitle}>Danh sách phim bạn đã lưu lại.</Text>
        </View>

        {favoriteMovies.length ? (
          <View style={styles.grid}>
            {favoriteMovies.map((movie) => (
              <View key={movie.id} style={styles.item}>
                <MovieCard
                  movie={movie}
                  onPress={() =>
                    router.push({
                      pathname: "/movie/[id]",
                      params: { id: movie.id },
                    })
                  }
                />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            body="Bạn chưa thêm phim nào vào danh sách yêu thích."
            icon="heart-outline"
            title="Danh sách trống"
          />
        )}
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
  },
  header: {
    marginBottom: 24,
  },
  title: {
    ...Typography.heroTitle,
    color: Colors.text.primary,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  item: {
    marginBottom: 24,
  },
});
