import type { BrowserCookieData } from "@/sources/sourceBrowserSession";

export type SourceLoginRequest = {
  id: string;
  sourceId: string;
  sourceName?: string;
  loginUrl: string;
  originalUrl: string;
};

export class SourceLoginRequiredError extends Error {
  readonly login: SourceLoginRequest;

  constructor(login: SourceLoginRequest) {
    super(`Source ${login.sourceName ?? login.sourceId} requires login.`);
    this.name = "SourceLoginRequiredError";
    this.login = login;
  }
}

export function isSourceLoginRequiredError(
  value: unknown,
): value is SourceLoginRequiredError {
  return value instanceof SourceLoginRequiredError;
}

export function createSourceLoginRequest(input: {
  sourceId: string;
  sourceName?: string;
  loginUrl: string;
  originalUrl: string;
}): SourceLoginRequest {
  return {
    id: `${input.sourceId}:login:${Date.now()}`,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    loginUrl: input.loginUrl,
    originalUrl: input.originalUrl,
  };
}

/**
 * Detects if a redirect URL indicates a WordPress login requirement.
 * Returns the login URL if detected, null otherwise.
 */
export function detectLoginRedirect(redirectUrl: string): string | null {
  if (redirectUrl && redirectUrl.includes("/wp-login.php")) {
    return redirectUrl;
  }
  return null;
}

/**
 * Detects if HTML response body contains a WordPress login form,
 * indicating an expired session.
 */
export function isLoginPageHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("/wp-login.php") &&
    (lower.includes('id="loginform"') ||
      lower.includes('id="user_login"') ||
      lower.includes("wp-login"))
  );
}

/**
 * Determines if a navigation URL indicates successful login
 * (navigated away from wp-login.php to a non-login page).
 */
export function isLoginSuccessNavigation(
  currentUrl: string,
  previousUrl: string,
): boolean {
  const wasOnLogin = previousUrl.includes("/wp-login.php");
  const isOffLogin = !currentUrl.includes("/wp-login.php");
  return wasOnLogin && isOffLogin;
}
