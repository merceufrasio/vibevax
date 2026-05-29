type SourceChallengeKind = "list" | "search" | "detail" | "stream";

export type SourceChallengeRequest = {
  id: string;
  kind: SourceChallengeKind;
  sourceId: string;
  sourceName?: string;
  url: string;
  message: string;
  prefetchUrls?: string[];
};

type SourceChallengeEvent =
  | {
      status: "resolved";
      request: SourceChallengeRequest;
    }
  | {
      status: "cancelled";
      request: SourceChallengeRequest;
    };

type SourceChallengeListener = (event: SourceChallengeEvent) => void;

const challengeRequests = new Map<string, SourceChallengeRequest>();
const challengeListeners = new Map<string, Set<SourceChallengeListener>>();
const verifiedHtmlByUrl = new Map<string, string>();

function notifySourceChallenge(
  request: SourceChallengeRequest,
  event: SourceChallengeEvent,
) {
  const listeners = challengeListeners.get(request.id);

  if (!listeners?.size) {
    return;
  }

  listeners.forEach((listener) => {
    listener(event);
  });
}

export class SourceChallengeRequiredError extends Error {
  readonly challenge: SourceChallengeRequest;

  constructor(challenge: SourceChallengeRequest) {
    super(challenge.message);
    this.challenge = challenge;
    this.name = "SourceChallengeRequiredError";
  }
}

export function isSourceChallengeRequiredError(
  value: unknown,
): value is SourceChallengeRequiredError {
  return value instanceof SourceChallengeRequiredError;
}

export function createSourceChallenge(input: {
  kind: SourceChallengeKind;
  sourceId: string;
  sourceName?: string;
  url: string;
  message?: string;
}) {
  const request: SourceChallengeRequest = {
    id: `${input.sourceId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    url: input.url,
    message:
      input.message ??
      "Nguồn này đang yêu cầu xác minh Cloudflare trước khi tiếp tục.",
  };

  challengeRequests.set(request.id, request);
  return request;
}

export function getSourceChallenge(requestId: string) {
  return challengeRequests.get(requestId) ?? null;
}

export function updateSourceChallenge(
  requestId: string,
  patch: Partial<Pick<SourceChallengeRequest, "message" | "prefetchUrls">>,
) {
  const request = challengeRequests.get(requestId);

  if (!request) {
    return null;
  }

  const nextRequest = {
    ...request,
    ...patch,
  };

  challengeRequests.set(requestId, nextRequest);
  return nextRequest;
}

export function subscribeToSourceChallenge(
  requestId: string,
  listener: SourceChallengeListener,
) {
  const listeners = challengeListeners.get(requestId) ?? new Set<SourceChallengeListener>();
  listeners.add(listener);
  challengeListeners.set(requestId, listeners);

  return () => {
    const currentListeners = challengeListeners.get(requestId);
    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);

    if (!currentListeners.size) {
      challengeListeners.delete(requestId);
    }
  };
}

export function resolveSourceChallenge(requestId: string, verifiedHtml: string) {
  const request = challengeRequests.get(requestId);

  if (!request) {
    return;
  }

  verifiedHtmlByUrl.set(request.url, verifiedHtml);
  notifySourceChallenge(request, { status: "resolved", request });
  challengeRequests.delete(requestId);
  challengeListeners.delete(requestId);
}

export function resolveSourceChallengePages(
  requestId: string,
  pages: Record<string, string>,
) {
  const request = challengeRequests.get(requestId);

  if (!request) {
    return;
  }

  Object.entries(pages).forEach(([url, html]) => {
    if (url && html) {
      verifiedHtmlByUrl.set(url, html);
    }
  });

  notifySourceChallenge(request, { status: "resolved", request });
  challengeRequests.delete(requestId);
  challengeListeners.delete(requestId);
}

export function cancelSourceChallenge(requestId: string) {
  const request = challengeRequests.get(requestId);

  if (!request) {
    return;
  }

  notifySourceChallenge(request, { status: "cancelled", request });
  challengeRequests.delete(requestId);
  challengeListeners.delete(requestId);
}

export function consumeVerifiedSourceHtml(url: string) {
  const cachedHtml = verifiedHtmlByUrl.get(url);

  if (!cachedHtml) {
    return null;
  }

  // Don't delete on first read — keep cache available for retries within session.
  // Cache is cleared on next challenge resolution or via clearVerifiedSourceHtml().
  return cachedHtml;
}

export function clearVerifiedSourceHtml() {
  verifiedHtmlByUrl.clear();
}
