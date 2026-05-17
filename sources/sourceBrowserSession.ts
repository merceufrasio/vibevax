export type SourceBrowserSession = {
  sourceId: string;
  sourceName?: string;
  url: string;
};

type BrowserSessionListener = (sessions: SourceBrowserSession[]) => void;
type BrowserFetchRequest = {
  id: string;
  sourceId: string;
  url: string;
  options?: BrowserFetchOptions;
};
type BrowserFetchListener = (request: BrowserFetchRequest) => void;

export type BrowserCookieData = { cookies: string; userAgent?: string };

const sessions = new Map<string, SourceBrowserSession>();
const sessionListeners = new Set<BrowserSessionListener>();
const fetchListeners = new Set<BrowserFetchListener>();
const cookiesBySource = new Map<string, BrowserCookieData>();
const cookieListeners = new Set<(sourceId: string, data: BrowserCookieData) => void>();
const pendingFetches = new Map<
  string,
  {
    resolve: (html: string) => void;
    reject: (error: Error) => void;
  }
>();

function notifySessions() {
  const current = Array.from(sessions.values());
  sessionListeners.forEach((listener) => {
    listener(current);
  });
}

function emitFetchRequest(request: BrowserFetchRequest) {
  fetchListeners.forEach((listener) => {
    listener(request);
  });
}

export function activateSourceBrowserSession(session: SourceBrowserSession) {
  sessions.set(session.sourceId, session);
  notifySessions();
}

export function clearSourceBrowserSession(sourceId?: string) {
  if (sourceId) {
    sessions.delete(sourceId);
  } else {
    sessions.clear();
  }

  notifySessions();
}

export function getSourceBrowserSession(sourceId: string) {
  return sessions.get(sourceId) ?? null;
}

export function hasSourceBrowserSession(sourceId: string) {
  return sessions.has(sourceId);
}

export function subscribeToSourceBrowserSessions(listener: BrowserSessionListener) {
  sessionListeners.add(listener);
  listener(Array.from(sessions.values()));

  return () => {
    sessionListeners.delete(listener);
  };
}

export function subscribeToSourceBrowserFetches(listener: BrowserFetchListener) {
  fetchListeners.add(listener);

  return () => {
    fetchListeners.delete(listener);
  };
}

export type BrowserFetchOptions = { method?: string; body?: string; headers?: Record<string, string> };

const BROWSER_FETCH_TIMEOUT_MS = 15_000;

export function requestSourceBrowserFetch(sourceId: string, url: string, options?: BrowserFetchOptions) {
  if (!sessions.has(sourceId)) {
    return Promise.reject(new Error(`No browser session for source ${sourceId}.`));
  }

  const requestId = `${sourceId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  if (__DEV__) {
    console.log("[browserFetch:request]", { requestId: requestId.slice(-12), sourceId, url: url.substring(0, 80), method: options?.method });
  }

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      const pending = pendingFetches.get(requestId);
      if (pending) {
        pendingFetches.delete(requestId);
        if (__DEV__) {
          console.log("[browserFetch:timeout]", { requestId: requestId.slice(-12), url: url.substring(0, 80) });
        }
        reject(new Error(`Browser fetch timed out after ${BROWSER_FETCH_TIMEOUT_MS}ms: ${url}`));
      }
    }, BROWSER_FETCH_TIMEOUT_MS);

    pendingFetches.set(requestId, {
      resolve: (html: string) => {
        clearTimeout(timer);
        if (__DEV__) {
          console.log("[browserFetch:resolved]", { requestId: requestId.slice(-12), len: html.length });
        }
        resolve(html);
      },
      reject: (error: Error) => {
        clearTimeout(timer);
        if (__DEV__) {
          console.log("[browserFetch:rejected]", { requestId: requestId.slice(-12), error: error.message });
        }
        reject(error);
      },
    });

    emitFetchRequest({
      id: requestId,
      sourceId,
      url,
      options,
    });
  });
}

export function resolveSourceBrowserFetch(requestId: string, html: string) {
  const pending = pendingFetches.get(requestId);

  if (!pending) {
    return;
  }

  pendingFetches.delete(requestId);
  pending.resolve(html);
}

export function rejectSourceBrowserFetch(requestId: string, error: string) {
  const pending = pendingFetches.get(requestId);

  if (!pending) {
    return;
  }

  pendingFetches.delete(requestId);
  pending.reject(new Error(error));
}

// ---------------------------------------------------------------------------
//  Cookie helpers — used by image components to load protected images.
// ---------------------------------------------------------------------------

export function setSourceBrowserCookies(sourceId: string, data: BrowserCookieData) {
  const current = cookiesBySource.get(sourceId);
  if (data.cookies && data.cookies !== current?.cookies) {
    cookiesBySource.set(sourceId, data);
    cookieListeners.forEach((listener) => listener(sourceId, data));
  }
}

export function getSourceBrowserCookies(sourceId: string) {
  return cookiesBySource.get(sourceId) ?? null;
}

export function subscribeToSourceBrowserCookies(
  listener: (sourceId: string, data: BrowserCookieData) => void,
) {
  cookieListeners.add(listener);
  return () => {
    cookieListeners.delete(listener);
  };
}
