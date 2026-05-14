import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AdBlockLogEntry } from "@/sources/types";

const STORAGE_KEY = "@revax/ad-block-logs";
const MAX_LOGS = 80;

export async function loadAdBlockLogs(): Promise<AdBlockLogEntry[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as AdBlockLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendAdBlockLog(
  entry: Omit<AdBlockLogEntry, "id" | "createdAt">,
) {
  const current = await loadAdBlockLogs();
  const next: AdBlockLogEntry[] = [
    {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    },
    ...current,
  ].slice(0, MAX_LOGS);

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function clearAdBlockLogs() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
