import { ScrollView, StyleSheet } from "react-native";

import { MovieCard } from "@/components/shared/MovieCard";
import type { Movie } from "@/types/movie";

type RecommendListProps = {
  movies: Movie[];
  onPressMovie: (movie: Movie) => void;
};

export function RecommendList({
  movies,
  onPressMovie,
}: RecommendListProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {movies.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          onPress={() => onPressMovie(movie)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingRight: 20,
  },
});

