import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getActiveSourceId,
  getRegistryUrl,
  isLikelyAdultSource,
  loadRegistry,
  refreshRegistry,
  resetRegistry,
  saveActiveSourceId,
  saveRegistryUrl,
} from "@/sources/pluginRegistry";
import type { PluginRegistry, PluginRegistryItem } from "@/sources/types";

type SourceSettingsContextValue = {
  registry: PluginRegistry | null;
  registryUrl: string;
  activeSourceId: string;
  activeSource: PluginRegistryItem | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  setRegistryUrl: (url: string) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
  setActiveSource: (sourceId: string) => Promise<void>;
  isLikelyAdultSource: (plugin: PluginRegistryItem) => boolean;
};

const SourceSettingsContext =
  createContext<SourceSettingsContextValue | undefined>(undefined);

export function SourceSettingsProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<PluginRegistry | null>(null);
  const [registryUrl, setRegistryUrlState] = useState("");
  const [activeSourceId, setActiveSourceId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextUrl, nextRegistry] = await Promise.all([
        getRegistryUrl(),
        loadRegistry(),
      ]);
      const nextActiveId = await getActiveSourceId(nextRegistry);

      setRegistryUrlState(nextUrl);
      setRegistry(nextRegistry);
      setActiveSourceId(nextActiveId);
    } catch (bootstrapError) {
      setError(String(bootstrapError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const updateRegistryUrl = useCallback(async (url: string) => {
    await saveRegistryUrl(url);
    setRegistryUrlState(url);
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const nextRegistry = await refreshRegistry(registryUrl);
      const nextActiveId = await getActiveSourceId(nextRegistry);

      setRegistry(nextRegistry);
      setActiveSourceId(nextActiveId);
    } catch (refreshError) {
      setError(String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, [registryUrl]);

  const reset = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const nextRegistry = await resetRegistry();
      const nextUrl = await getRegistryUrl();
      const nextActiveId = await getActiveSourceId(nextRegistry);

      setRegistry(nextRegistry);
      setRegistryUrlState(nextUrl);
      setActiveSourceId(nextActiveId);
    } catch (resetError) {
      setError(String(resetError));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const setActiveSource = useCallback(async (sourceId: string) => {
    await saveActiveSourceId(sourceId);
    setActiveSourceId(sourceId);
  }, []);

  const activeSource = useMemo(
    () => registry?.plugins.find((plugin) => plugin.id === activeSourceId) ?? null,
    [activeSourceId, registry],
  );

  const value = useMemo(
    () => ({
      registry,
      registryUrl,
      activeSourceId,
      activeSource,
      isLoading,
      isRefreshing,
      error,
      setRegistryUrl: updateRegistryUrl,
      refresh,
      reset,
      setActiveSource,
      isLikelyAdultSource,
    }),
    [
      activeSource,
      activeSourceId,
      error,
      isLoading,
      isRefreshing,
      refresh,
      registry,
      registryUrl,
      reset,
      setActiveSource,
      updateRegistryUrl,
    ],
  );

  return (
    <SourceSettingsContext.Provider value={value}>
      {children}
    </SourceSettingsContext.Provider>
  );
}

export function useSourceSettings() {
  const context = useContext(SourceSettingsContext);

  if (!context) {
    throw new Error(
      "useSourceSettings must be used within a SourceSettingsProvider.",
    );
  }

  return context;
}

