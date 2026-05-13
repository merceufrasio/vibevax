import { ScrollView, StyleSheet } from "react-native";

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
  return (
    <>
      <SectionHeader title={title} />
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
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
});

