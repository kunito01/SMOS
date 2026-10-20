"use client";

/**
 * Shared Google Identity Services plumbing for every Google integration
 * (Calendar push, Drive storage).
 *
 * Google's implicit token flow hands the browser a short-lived access token
 * (about one hour) and nothing else: there is no refresh token in a static
 * PWA. Each feature keeps its own cached token under its own storage key and
 * scope; the OAuth grant itself is shared, so a feature only revokes it when
 * no sibling feature is connected any more. A `silent` request never opens
 * Google UI; it either returns a cached token or throws with
 * `interactive = true` so the caller can ask the user for a click.
 */

export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_SIGN_IN_TIMEOUT_MS = 120_000;
const GIS_LOAD_TIMEOUT_MS = 15_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export type GoogleStoredToken = {
  accessToken: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken: (overrides?: { prompt?: string; login_hint?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
          revoke: (accessToken: string, done?: () => void) => void;
        };
      };
    };
  }
}

const canUseBrowser = () => typeof window !== "undefined";

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly interactive: boolean
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/** Last instant at which `readGoogleToken` still returns this token. */
export const googleTokenUsableUntil = (token: GoogleStoredToken) =>
  token.expiresAt - TOKEN_EXPIRY_MARGIN_MS;

export const readGoogleToken = (storageKey: string): GoogleStoredToken | null => {
  if (!canUseBrowser()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<GoogleStoredToken>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.expiresAt !== "number") {
      return null;
    }
    // Treat tokens within a minute of expiry as expired so a request never dies mid-flight.
    return parsed.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()
      ? { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt }
      : null;
  } catch {
    return null;
  }
};

export const writeGoogleToken = (storageKey: string, token: GoogleStoredToken | null) => {
  if (!canUseBrowser()) {
    return;
  }
  if (token) {
    window.localStorage.setItem(storageKey, JSON.stringify(token));
  } else {
    window.localStorage.removeItem(storageKey);
  }
};

let gisLoading: Promise<void> | null = null;

/** Loads the Google Identity Services script; call early so a later click can open the popup synchronously. */
export const preloadGoogleIdentity = () => {
  if (!canUseBrowser()) {
    return Promise.reject(new Error("Google Identity Services needs a browser"));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
      const script = existing ?? document.createElement("script");
      const finish = () => {
        if (window.google?.accounts?.oauth2) {
          resolve();
        } else {
          // Drop the failed element so the next attempt injects a fresh one
          // instead of waiting forever on a script that will never load.
          script.remove();
          gisLoading = null;
          reject(new Error("Google Identity Services failed to initialise"));
        }
      };
      script.addEventListener("load", finish, { once: true });
      script.addEventListener(
        "error",
        () => {
          script.remove();
          gisLoading = null;
          reject(new Error("Google Identity Services could not be loaded"));
        },
        { once: true }
      );
      if (!existing) {
        script.src = GIS_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      } else if (window.google?.accounts?.oauth2) {
        finish();
      }
    });
  }
  return gisLoading;
};

export type GoogleTokenRequest = {
  /** localStorage key that caches this feature's token. */
  storageKey: string;
  clientId: string;
  /** Space-separated OAuth scopes for this feature. */
  scope: string;
  mode: "interactive" | "silent";
  /** Skip the consent screen when this device already granted these scopes. */
  consentGranted: boolean;
  /** Called after Google granted a token interactively. */
  onGranted?: (token: GoogleStoredToken) => void;
  /** Google account hint so a signed-in user is not asked to pick an account again. */
  hint?: string;
};

/**
 * Returns a usable access token for one feature.
 *
 * `silent` never opens Google UI. `interactive` reuses a cached token when
 * there is one and otherwise opens Google's popup, which must therefore run
 * inside a user gesture; only the very first connection shows the consent
 * screen.
 */
export const requestGoogleToken = async (request: GoogleTokenRequest): Promise<GoogleStoredToken> => {
  const cached = readGoogleToken(request.storageKey);
  if (cached) {
    return cached;
  }
  if (request.mode === "silent") {
    throw new GoogleAuthError("Google sign-in required", true);
  }
  if (!request.clientId.trim()) {
    throw new GoogleAuthError("Missing Google OAuth client id", true);
  }

  // When the script is already present this resolves in a microtask and keeps
  // the user activation; a slow or stuck load fails instead of hanging the UI.
  await Promise.race([
    preloadGoogleIdentity(),
    new Promise<never>((_, reject) =>
      window.setTimeout(
        () => reject(new GoogleAuthError("Google Identity Services took too long to load", true)),
        GIS_LOAD_TIMEOUT_MS
      )
    )
  ]);
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new GoogleAuthError("Google Identity Services unavailable", true);
  }

  return new Promise<GoogleStoredToken>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const timeout = window.setTimeout(
      () => settle(() => reject(new GoogleAuthError("Google sign-in timed out", true))),
      GOOGLE_SIGN_IN_TIMEOUT_MS
    );
    const client = oauth2.initTokenClient({
      client_id: request.clientId.trim(),
      scope: request.scope,
      callback: (response) => {
        window.clearTimeout(timeout);
        if (!response.access_token) {
          settle(() =>
            reject(
              new GoogleAuthError(
                response.error_description ?? response.error ?? "Google sign-in was cancelled",
                true
              )
            )
          );
          return;
        }
        const token = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000
        };
        writeGoogleToken(request.storageKey, token);
        request.onGranted?.(token);
        settle(() => resolve(token));
      },
      error_callback: (error) => {
        window.clearTimeout(timeout);
        settle(() =>
          reject(new GoogleAuthError(error?.message ?? error?.type ?? "Google sign-in failed", true))
        );
      }
    });
    client.requestAccessToken({
      prompt: request.consentGranted ? "" : "consent",
      ...(request.hint ? { login_hint: request.hint } : {})
    });
  });
};

/**
 * Forgets the cached token and, unless another feature of this app still
 * relies on the same OAuth grant, asks Google to revoke it. Revocation covers
 * the whole grant (every scope the user approved for this client), so callers
 * pass `revokeGrant: false` while a sibling feature is still connected.
 */
export const revokeGoogleToken = async (
  storageKey: string,
  { revokeGrant = true }: { revokeGrant?: boolean } = {}
) => {
  const token = readGoogleToken(storageKey);
  writeGoogleToken(storageKey, null);
  if (!token || !canUseBrowser() || !revokeGrant) {
    return;
  }
  try {
    await preloadGoogleIdentity();
    await new Promise<void>((resolve) => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
        resolve();
        return;
      }
      oauth2.revoke(token.accessToken, () => resolve());
      window.setTimeout(resolve, 3_000);
    });
  } catch {
    // Revocation is best effort; the token expires within the hour anyway.
  }
};

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

const RETRYABLE_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "backendError",
  "internalError"
]);

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Parses Google's JSON error envelope without consuming a good response. */
export const describeGoogleErrorResponse = async (response: Response) => {
  let detail = "";
  let reason = "";
  try {
    const body = (await response.json()) as {
      error?: { message?: string; errors?: { reason?: string }[]; status?: string };
    };
    detail = body.error?.message ?? "";
    reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? "";
  } catch {
    // Non-JSON error bodies carry nothing useful.
  }
  return { detail, reason };
};

export type GoogleFetchOptions = {
  /** Statuses that are returned to the caller instead of being treated as failures. */
  acceptStatuses?: number[];
  /** Transient failures are retried this many times with backoff. */
  retries?: number;
};

/**
 * Authorized fetch against a Google API. Returns the raw Response so callers
 * can read JSON, bytes, or headers; non-OK responses become GoogleApiError
 * after the retry budget, unless their status is explicitly accepted.
 */
export const googleFetch = async (
  token: string,
  url: string,
  init: RequestInit = {},
  options: GoogleFetchOptions = {},
  attempt = 0
): Promise<Response> => {
  const retries = options.retries ?? 2;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      // The service worker caches cross-origin GETs; Google answers must be live.
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    if (attempt < retries) {
      await sleep(1_200 * (attempt + 1));
      return googleFetch(token, url, init, options, attempt + 1);
    }
    throw new GoogleApiError(
      error instanceof Error ? `Google request failed: ${error.message}` : "Google request failed",
      0,
      "network"
    );
  }
  if (response.ok || options.acceptStatuses?.includes(response.status)) {
    return response;
  }
  const { detail, reason } = await describeGoogleErrorResponse(response);
  const retryable =
    response.status === 429 ||
    response.status >= 500 ||
    (response.status === 403 && RETRYABLE_REASONS.has(reason));
  if (retryable && attempt < retries) {
    await sleep(1_200 * (attempt + 1));
    return googleFetch(token, url, init, options, attempt + 1);
  }
  throw new GoogleApiError(
    detail || `Google request failed (${response.status})`,
    response.status,
    reason
  );
};
