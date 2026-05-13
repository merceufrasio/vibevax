import { StyleSheet, View } from "react-native";

import { MovieCard } from "@/components/shared/MovieCard";
import type { Movie } from "@/types/movie";

type SearchResultsProps = {
  movies: Movie[];
  onPressMovie: (movie: Movie) => void;
};

export function SearchResults({
  movies,
  onPressMovie,
}: SearchResultsProps) {
  return (
    <View style={styles.grid}>
      {movies.map((movie) => (
        <View key={movie.id} style={styles.item}>
          <MovieCard movie={movie} onPress={() => onPressMovie(movie)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  item: {
    marginBottom: 24,
  },
});
