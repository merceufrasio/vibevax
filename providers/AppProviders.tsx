import type { ReactNode } from "react";

import { FavoritesProvider } from "@/hooks/useFavorites";
import { SourceSettingsProvider } from "@/hooks/useSourceSettings";
import { WatchHistoryProvider } from "@/hooks/useWatchHistory";
import { CastInitializer } from "@/providers/CastProvider";
import { SourceBrowserSessionProvider } from "@/providers/SourceBrowserSessionProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SourceSettingsProvider>
      <FavoritesProvider>
        <WatchHistoryProvider>
          <CastInitializer />
          {children}
          <SourceBrowserSessionProvider />
        </WatchHistoryProvider>
      </FavoritesProvider>
    </SourceSettingsProvider>
  );
}
