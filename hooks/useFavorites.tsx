import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "@revax/favorites";

type FavoritesContextValue = {
  favoriteIds: string[];
  isReady: boolean;
  isFavorite: (movieId: string) => boolean;
  setFavorite: (movieId: string, nextValue: boolean) => void;
  toggleFavorite: (movieId: string) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | undefined>(
  undefined,
);

async function loadFavorites(): Promise<string[]> {
  const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(storedValue) as string[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadFavorites()
      .then(setFavoriteIds)
      .finally(() => setIsReady(true));
  }, []);

  const persist = useCallback((nextIds: string[]) => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextIds));
  }, []);

  const setFavorite = useCallback(
    (movieId: string, nextValue: boolean) => {
      setFavoriteIds((currentIds) => {
        const withoutCurrent = currentIds.filter((id) => id !== movieId);
        const nextIds = nextValue
          ? [...withoutCurrent, movieId]
          : withoutCurrent;

        persist(nextIds);
        return nextIds;
      });
    },
    [persist],
  );

  const isFavorite = useCallback(
    (movieId: string) => favoriteIds.includes(movieId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    (movieId: string) => {
      setFavorite(movieId, !isFavorite(movieId));
    },
    [isFavorite, setFavorite],
  );

  const value = useMemo(
    () => ({
      favoriteIds,
      isReady,
      isFavorite,
      setFavorite,
      toggleFavorite,
    }),
    [favoriteIds, isFavorite, isReady, setFavorite, toggleFavorite],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);

  if (!context) {
    throw new Error("useFavorites must be used within a FavoritesProvider.");
  }

  return context;
}

