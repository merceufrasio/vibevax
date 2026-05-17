import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PluginRegistry, PluginRegistryItem } from "@/sources/types";

const REGISTRY_URL_KEY = "@revax/sources/registry-url";
const REGISTRY_DATA_KEY = "@revax/sources/registry-data";
const ACTIVE_SOURCE_KEY = "@revax/sources/active-source";
const SCRIPT_CACHE_PREFIX = "@revax/sources/script-cache/";

export const DEFAULT_REGISTRY_URL =
  "https://gist.githubusercontent.com/minhducle25/906a700e8817ca70728c2ecda1c4e7ec/raw/plugins1.json";

const ADULT_SOURCE_PATTERN =
  /(missav|misskon|jav|vlxx|sextop|topxx|avdb|sayhentai)/i;

async function tryReadCachedRegistry(): Promise<PluginRegistry | null> {
  try {
    const cached = await AsyncStorage.getItem(REGISTRY_DATA_KEY);
    if (cached) {
      return normalizeRegistry(JSON.parse(cached));
    }
  } catch {}
  return null;
}

function normalizeRegistry(value: unknown): PluginRegistry {
  const registry = value as PluginRegistry;

  if (!registry || !Array.isArray(registry.plugins)) {
    throw new Error("Registry JSON không hợp lệ hoặc thiếu plugins[].");
  }

  return {
    version: Number(registry.version || 1),
    plugins: registry.plugins.filter((plugin): plugin is PluginRegistryItem =>
      Boolean(plugin?.id && plugin.name && plugin.scriptUrl),
    ),
  };
}

async function fetchRegistry(
  registryUrl: string,
  { useCacheFallback = false } = {},
): Promise<PluginRegistry> {
  if (!registryUrl) {
    return { version: 1, plugins: [] };
  }

  let response: Response;

  try {
    const urlWithCacheBuster = `${registryUrl}${registryUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
    response = await fetch(urlWithCacheBuster, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    if (useCacheFallback) {
      const cached = await tryReadCachedRegistry();
      if (cached) return cached;
    }
    throw new Error(
      "Không tải được registry từ URL hiện tại. Vui lòng kiểm tra link JSON hoặc kết nối mạng.",
    );
  }

  if (!response.ok) {
    if (useCacheFallback) {
      const cached = await tryReadCachedRegistry();
      if (cached) return cached;
    }
    throw new Error(
      `Không tải được registry từ URL hiện tại (${response.status}). Vui lòng kiểm tra link JSON hoặc thử lại sau.`,
    );
  }

  const registry = normalizeRegistry(await response.json());
  await AsyncStorage.setItem(REGISTRY_DATA_KEY, JSON.stringify(registry));
  await saveRegistryUrl(registryUrl);
  return registry;
}

export function isLikelyAdultSource(plugin: PluginRegistryItem) {
  return ADULT_SOURCE_PATTERN.test(`${plugin.id} ${plugin.name}`);
}

export function pickDefaultSource(registry: PluginRegistry) {
  return (
    registry.plugins.find((plugin) => !isLikelyAdultSource(plugin)) ??
    registry.plugins[0]
  );
}

export async function getRegistryUrl() {
  return (await AsyncStorage.getItem(REGISTRY_URL_KEY)) ?? "";
}

export async function saveRegistryUrl(url: string) {
  await AsyncStorage.setItem(REGISTRY_URL_KEY, url.trim());
}

export async function loadRegistry() {
  const registryUrl = await getRegistryUrl();
  // Use cache as fallback on startup — better to show stale plugins than nothing.
  return fetchRegistry(registryUrl, { useCacheFallback: true });
}

export async function refreshRegistry(url?: string) {
  const registryUrl = url ?? (await getRegistryUrl());
  return fetchRegistry(registryUrl);
}

export async function getActiveSourceId(registry: PluginRegistry) {
  const savedId = await AsyncStorage.getItem(ACTIVE_SOURCE_KEY);
  const savedPlugin = registry.plugins.find((plugin) => plugin.id === savedId);

  return savedPlugin?.id ?? pickDefaultSource(registry)?.id ?? "";
}

export async function saveActiveSourceId(sourceId: string) {
  await AsyncStorage.setItem(ACTIVE_SOURCE_KEY, sourceId);
}

function getPluginScriptCacheKey(plugin: PluginRegistryItem) {
  return `${SCRIPT_CACHE_PREFIX}${plugin.id}:${plugin.version}:${plugin.scriptUrl.trim()}`;
}

export async function getCachedPluginScript(plugin: PluginRegistryItem) {
  const key = getPluginScriptCacheKey(plugin);
  return AsyncStorage.getItem(key);
}

export async function cachePluginScript(
  plugin: PluginRegistryItem,
  script: string,
) {
  const key = getPluginScriptCacheKey(plugin);
  await AsyncStorage.setItem(key, script);
}

export async function clearPluginScriptCache(plugin: PluginRegistryItem) {
  const key = getPluginScriptCacheKey(plugin);
  await AsyncStorage.removeItem(key);
}
