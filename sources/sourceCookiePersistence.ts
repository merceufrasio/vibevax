import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  type BrowserCookieData,
  activateSourceBrowserSession,
  setSourceBrowserCookies,
} from "@/sources/sourceBrowserSession";

const COOKIE_STORAGE_PREFIX = "@revax/source-cookies/";

function getStorageKey(sourceId: string): string {
  return `${COOKIE_STORAGE_PREFIX}${sourceId}`;
}

export type PersistedCookieEntry = {
  sourceId: string;
  cookies: string;
  userAgent?: string;
  domain: string;
  savedAt: number;
};

/**
 * Persist cookie data for a source to AsyncStorage.
 */
export async function persistSourceCookies(
  sourceId: string,
  data: BrowserCookieData,
  domain: string,
): Promise<void> {
  const entry: PersistedCookieEntry = {
    sourceId,
    cookies: data.cookies,
    userAgent: data.userAgent,
    domain,
    savedAt: Date.now(),
  };
  await AsyncStorage.setItem(getStorageKey(sourceId), JSON.stringify(entry));
}

/**
 * Load persisted cookie entry for a single source.
 */
export async function loadPersistedSourceCookies(
  sourceId: string,
): Promise<PersistedCookieEntry | null> {
  const raw = await AsyncStorage.getItem(getStorageKey(sourceId));
  if (!raw) return null;
  return JSON.parse(raw) as PersistedCookieEntry;
}

/**
 * Restore all persisted cookies on app startup.
 * Loads from AsyncStorage, populates in-memory map, and activates browser sessions.
 */
export async function restoreAllSourceCookies(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cookieKeys = allKeys.filter((key) =>
      key.startsWith(COOKIE_STORAGE_PREFIX),
    );

    if (cookieKeys.length === 0) return;

    const pairs = await AsyncStorage.multiGet(cookieKeys);

    for (const [, value] of pairs) {
      if (!value) continue;

      try {
        const entry = JSON.parse(value) as PersistedCookieEntry;

        // Restore into in-memory cookie map
        setSourceBrowserCookies(entry.sourceId, {
          cookies: entry.cookies,
          userAgent: entry.userAgent,
        });

        // Activate browser session so fetches use the session path
        activateSourceBrowserSession({
          sourceId: entry.sourceId,
          url: `https://${entry.domain}/`,
        });
      } catch {
        // Skip malformed entries
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[sourceCookiePersistence:restoreAll:error]", error);
    }
    // Continue app startup without cookies
  }
}

/**
 * Clear persisted cookies for a source (logout).
 */
export async function clearPersistedSourceCookies(
  sourceId: string,
): Promise<void> {
  await AsyncStorage.removeItem(getStorageKey(sourceId));
}
