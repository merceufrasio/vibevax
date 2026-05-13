import { homeSections } from "@/data/categories";
import { movies } from "@/data/movies";
import type { Movie, MovieRegion } from "@/types/movie";

export function useMovies() {
  const featuredMovies = movies.filter((movie) => movie.featured);
  const trendingMovies = movies.filter((movie) => movie.isTrending);

  const getMovieById = (id?: string) =>
    movies.find((movie) => movie.id === id);

  const getMoviesByRegion = (region: MovieRegion) =>
    movies.filter((movie) => movie.region === region);

  const getRecommendedMovies = (movie: Movie) =>
    movie.recommendedIds
      .map((id) => getMovieById(id))
      .filter((item): item is Movie => Boolean(item));

  const searchMovies = (query: string, genre?: string) => {
    const normalizedQuery = query.trim().toLowerCase();

    return movies.filter((movie) => {
      const matchesQuery =
        !normalizedQuery ||
        movie.title.toLowerCase().includes(normalizedQuery) ||
        movie.originalTitle.toLowerCase().includes(normalizedQuery) ||
        movie.description.toLowerCase().includes(normalizedQuery);

      const matchesGenre =
        !genre ||
        genre === "Tất cả" ||
        movie.genres.includes(genre);

      return matchesQuery && matchesGenre;
    });
  };

  return {
    movies,
    homeSections,
    featuredMovies,
    trendingMovies,
    getMovieById,
    getMoviesByRegion,
    getRecommendedMovies,
    searchMovies,
  };
}

