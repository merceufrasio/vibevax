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

import {
  getActiveSourceId,
  getRegistryUrl,
  isLikelyAdultSource,
  loadRegistry,
  refreshRegistry,
  saveActiveSourceId,
  saveRegistryUrl,
} from "@/sources/pluginRegistry";
import type { PluginRegistry, PluginRegistryItem } from "@/sources/types";

const SHOW_ADULT_SOURCES_KEY = "@revax/sources/show-adult";

type SourceSettingsContextValue = {
  registry: PluginRegistry | null;
  registryUrl: string;
  activeSourceId: string;
  activeSource: PluginRegistryItem | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  showAdultSources: boolean;
  setRegistryUrl: (url: string) => Promise<void>;
  refresh: () => Promise<void>;
  setActiveSource: (sourceId: string) => Promise<void>;
  setShowAdultSources: (value: boolean) => Promise<void>;
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
  const [showAdultSources, setShowAdultSourcesState] = useState(false);

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextUrl = await getRegistryUrl();
      const nextRegistry = await loadRegistry();
      const nextActiveId = await getActiveSourceId(nextRegistry);
      const savedShowAdultSources = await AsyncStorage.getItem(
        SHOW_ADULT_SOURCES_KEY,
      );

      setRegistryUrlState(nextUrl);
      setRegistry(nextRegistry);
      setActiveSourceId(nextActiveId);
      setShowAdultSourcesState(savedShowAdultSources === "true");
    } catch (bootstrapError) {
      setRegistry(null);
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
      setRegistry(null);
      setError(String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, [registryUrl]);

  const setActiveSource = useCallback(async (sourceId: string) => {
    await saveActiveSourceId(sourceId);
    setActiveSourceId(sourceId);
  }, []);

  const setShowAdultSources = useCallback(async (value: boolean) => {
    await AsyncStorage.setItem(SHOW_ADULT_SOURCES_KEY, String(value));
    setShowAdultSourcesState(value);
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
      showAdultSources,
      setRegistryUrl: updateRegistryUrl,
      refresh,
      setActiveSource,
      setShowAdultSources,
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
      setActiveSource,
      setShowAdultSources,
      showAdultSources,
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
