import { ScrollView, StyleSheet, View } from "react-native";

import { MovieCard } from "@/components/shared/MovieCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { Movie } from "@/types/movie";

type MovieSectionProps = {
  title: string;
  movies: Movie[];
  onPressMovie: (movie: Movie) => void;
};

export function MovieSection({
  title,
  movies,
  onPressMovie,
}: MovieSectionProps) {
  // Deduplicate movies by id to avoid React duplicate key warnings
  // (PhimPal and other sources may return the same item multiple times in a section)
  const uniqueMovies = movies.filter(
    (movie, index, self) => self.findIndex((m) => m.id === movie.id) === index,
  );

  return (
    <View>
      <SectionHeader title={title} />
      <ScrollView
        contentContainerStyle={styles.content}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {uniqueMovies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            onPress={() => onPressMovie(movie)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
});

