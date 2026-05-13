import AsyncStorage from "@react-native-async-storage/async-storage";

import bundledRegistry from "@/repo/plugins.json";
import type { PluginRegistry, PluginRegistryItem } from "@/sources/types";

const REGISTRY_URL_KEY = "@revax/sources/registry-url";
const REGISTRY_DATA_KEY = "@revax/sources/registry-data";
const ACTIVE_SOURCE_KEY = "@revax/sources/active-source";
const SCRIPT_CACHE_PREFIX = "@revax/sources/script-cache/";

export const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/youngbi/repo/main/plugins.json";

export const BUNDLED_REGISTRY = bundledRegistry as PluginRegistry;

const ADULT_SOURCE_PATTERN =
  /(missav|misskon|jav|vlxx|sextop|topxx|avdb|sayhentai)/i;

function normalizeRegistry(value: unknown): PluginRegistry {
  const registry = value as PluginRegistry;

  if (!registry || !Array.isArray(registry.plugins)) {
    throw new Error("Registry JSON is missing plugins[].");
  }

  return {
    version: Number(registry.version || 1),
    plugins: registry.plugins.filter(
      (plugin): plugin is PluginRegistryItem =>
        Boolean(plugin?.id && plugin.name && plugin.scriptUrl),
    ),
  };
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
  return (await AsyncStorage.getItem(REGISTRY_URL_KEY)) ?? DEFAULT_REGISTRY_URL;
}

export async function saveRegistryUrl(url: string) {
  await AsyncStorage.setItem(REGISTRY_URL_KEY, url.trim() || DEFAULT_REGISTRY_URL);
}

export async function loadRegistry() {
  const cached = await AsyncStorage.getItem(REGISTRY_DATA_KEY);

  if (!cached) {
    return normalizeRegistry(BUNDLED_REGISTRY);
  }

  try {
    return normalizeRegistry(JSON.parse(cached));
  } catch {
    return normalizeRegistry(BUNDLED_REGISTRY);
  }
}

export async function refreshRegistry(url?: string) {
  const registryUrl = url ?? (await getRegistryUrl());
  const response = await fetch(registryUrl);

  if (!response.ok) {
    throw new Error(`Cannot load registry (${response.status}).`);
  }

  const registry = normalizeRegistry(await response.json());
  await AsyncStorage.setItem(REGISTRY_DATA_KEY, JSON.stringify(registry));
  await saveRegistryUrl(registryUrl);
  return registry;
}

export async function resetRegistry() {
  await AsyncStorage.removeItem(REGISTRY_DATA_KEY);
  await AsyncStorage.setItem(REGISTRY_URL_KEY, DEFAULT_REGISTRY_URL);
  return normalizeRegistry(BUNDLED_REGISTRY);
}

export async function getActiveSourceId(registry: PluginRegistry) {
  const savedId = await AsyncStorage.getItem(ACTIVE_SOURCE_KEY);
  const savedPlugin = registry.plugins.find((plugin) => plugin.id === savedId);

  return savedPlugin?.id ?? pickDefaultSource(registry)?.id ?? "";
}

export async function saveActiveSourceId(sourceId: string) {
  await AsyncStorage.setItem(ACTIVE_SOURCE_KEY, sourceId);
}

export async function getCachedPluginScript(plugin: PluginRegistryItem) {
  const key = `${SCRIPT_CACHE_PREFIX}${plugin.id}:${plugin.version}`;
  return AsyncStorage.getItem(key);
}

export async function cachePluginScript(
  plugin: PluginRegistryItem,
  script: string,
) {
  const key = `${SCRIPT_CACHE_PREFIX}${plugin.id}:${plugin.version}`;
  await AsyncStorage.setItem(key, script);
}

export async function clearPluginScriptCache(plugin: PluginRegistryItem) {
  const key = `${SCRIPT_CACHE_PREFIX}${plugin.id}:${plugin.version}`;
  await AsyncStorage.removeItem(key);
}

