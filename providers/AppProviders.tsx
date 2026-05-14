import type { ReactNode } from "react";

import { FavoritesProvider } from "@/hooks/useFavorites";
import { SourceSettingsProvider } from "@/hooks/useSourceSettings";
import { WatchHistoryProvider } from "@/hooks/useWatchHistory";
import { SourceBrowserSessionProvider } from "@/providers/SourceBrowserSessionProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SourceSettingsProvider>
      <FavoritesProvider>
        <WatchHistoryProvider>
          {children}
          <SourceBrowserSessionProvider />
        </WatchHistoryProvider>
      </FavoritesProvider>
    </SourceSettingsProvider>
  );
}
