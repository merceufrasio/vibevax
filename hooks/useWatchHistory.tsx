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

import type { WatchHistoryEntry } from "@/types/movie";

const STORAGE_KEY = "@revax/watch-history";

type WatchHistoryContextValue = {
  history: WatchHistoryEntry[];
  isReady: boolean;
  addHistory: (movieId: string, progressLabel: string) => void;
  removeHistory: (movieId: string) => void;
  clearHistory: () => void;
};

const WatchHistoryContext = createContext<WatchHistoryContextValue | undefined>(
  undefined,
);

async function loadHistory(): Promise<WatchHistoryEntry[]> {
  const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(storedValue) as WatchHistoryEntry[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

export function WatchHistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<WatchHistoryEntry[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadHistory()
      .then(setHistory)
      .finally(() => setIsReady(true));
  }, []);

  const persist = useCallback((nextHistory: WatchHistoryEntry[]) => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
  }, []);

  const addHistory = useCallback(
    (movieId: string, progressLabel: string) => {
      setHistory((currentHistory) => {
        const nextHistory = [
          {
            movieId,
            progressLabel,
            watchedAt: new Date().toISOString(),
          },
          ...currentHistory.filter((entry) => entry.movieId !== movieId),
        ].slice(0, 12);

        persist(nextHistory);
        return nextHistory;
      });
    },
    [persist],
  );

  const removeHistory = useCallback(
    (movieId: string) => {
      setHistory((currentHistory) => {
        const nextHistory = currentHistory.filter(
          (entry) => entry.movieId !== movieId,
        );

        persist(nextHistory);
        return nextHistory;
      });
    },
    [persist],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    void AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      history,
      isReady,
      addHistory,
      removeHistory,
      clearHistory,
    }),
    [addHistory, clearHistory, history, isReady, removeHistory],
  );

  return (
    <WatchHistoryContext.Provider value={value}>
      {children}
    </WatchHistoryContext.Provider>
  );
}

export function useWatchHistory() {
  const context = useContext(WatchHistoryContext);

  if (!context) {
    throw new Error(
      "useWatchHistory must be used within a WatchHistoryProvider.",
    );
  }

  return context;
}

