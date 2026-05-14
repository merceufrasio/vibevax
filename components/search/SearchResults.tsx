import { StyleSheet, View } from "react-native";

import { MovieCard } from "@/components/shared/MovieCard";
import { Layout } from "@/constants/Layout";
import type { Movie } from "@/types/movie";

type SearchResultsProps = {
  movies: Movie[];
  onPressMovie: (movie: Movie) => void;
};

const COLUMN_GAP = 14;
const CARD_WIDTH =
  (Layout.window.width - Layout.screenPadding * 2 - COLUMN_GAP) / 2;

export function SearchResults({
  movies,
  onPressMovie,
}: SearchResultsProps) {
  return (
    <View style={styles.grid}>
      {movies.map((movie) => (
        <View key={movie.id} style={styles.item}>
          <MovieCard
            movie={movie}
            onPress={() => onPressMovie(movie)}
            width={CARD_WIDTH}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: COLUMN_GAP,
    rowGap: 24,
  },
  item: {
    width: CARD_WIDTH,
  },
});
