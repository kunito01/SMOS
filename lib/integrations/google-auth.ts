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
 * Google UI. It returns a cached token, or — when this device already granted
 * consent — asks Google Identity Services for a new one with `prompt: ""`.
 * A timeout or a network failure is `transient`: callers must keep the cached
 * token and the signed-in session. Only an explicit rejection asks the user
 * to click again.
 */

export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_SIGN_IN_TIMEOUT_MS = 120_000;
const GIS_LOAD_TIMEOUT_MS = 15_000;
const SILENT_REFRESH_TIMEOUT_MS = 12_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

const gisFailureIsTransient = (message: string) =>
  /timed out|timeout|network|failed to fetch|offline|unavailable|could not be loaded|too long to load/i.test(
    message
  );

export type GoogleStoredToken = {
  accessToken: string;
  expiresAt: number;
  /** Space-separated scopes Google actually granted (users can untick some). */
  scope?: string;
};

/** Google Calendar access limited to the calendars this app creates. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

/** Whether a token carries a scope; unknown (older tokens) counts as no. */
export const googleTokenHasScope = (token: GoogleStoredToken, scope: string) =>
  typeof token.scope === "string" && token.scope.split(/\s+/).includes(scope);

/**
 * Whether Google's scope string explicitly leaves this scope out.
 * A token with no scope field is unknown, not a refusal: callers try the API
 * instead of forcing another consent screen.
 */
export const googleTokenOmitsScope = (token: GoogleStoredToken, scope: string) =>
  typeof token.scope === "string" && !token.scope.split(/\s+/).includes(scope);

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
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
    readonly interactive: boolean,
    /** Timeout or transport failure. The cached grant is still in place. */
    readonly transient: boolean = false
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/** Last instant at which `readGoogleToken` still returns this token. */
export const googleTokenUsableUntil = (token: GoogleStoredToken) =>
  token.expiresAt - TOKEN_EXPIRY_MARGIN_MS;

const parseStoredToken = (storageKey: string): GoogleStoredToken | null => {
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
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      ...(typeof parsed.scope === "string" ? { scope: parsed.scope } : {})
    };
  } catch {
    return null;
  }
};

export const readGoogleToken = (storageKey: string): GoogleStoredToken | null => {
  const parsed = parseStoredToken(storageKey);
  if (!parsed) {
    return null;
  }
  // Treat tokens within a minute of expiry as expired so a request never dies mid-flight.
  return parsed.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now() ? parsed : null;
};

/** Token Google has not actually expired, including the last minute the strict reader hides. */
export const readGoogleTokenAllowingNearExpiry = (storageKey: string): GoogleStoredToken | null => {
  const parsed = parseStoredToken(storageKey);
  if (!parsed || parsed.expiresAt <= Date.now()) {
    return null;
  }
  return parsed;
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
  /**
   * Ask Google even when a cached token exists. The previous token stays in
   * storage until a replacement is actually granted, so a closed or timed-out
   * popup cannot sign the user out.
   */
  ignoreCache?: boolean;
  /**
   * When a silent refresh fails, return a cached token that has not actually
   * expired. Set false after Google has already rejected that token.
   */
  allowStaleOnFailure?: boolean;
  /**
   * Scopes an interactive sign-in must actually grant. When the grant comes
   * back without one of them, one consent prompt asks for the full set before
   * this sign-in resolves. Silent refresh never prompts.
   */
  ensureScopes?: readonly string[];
};

const storeGrantedToken = (request: GoogleTokenRequest, response: TokenResponse): GoogleStoredToken => {
  if (!response.access_token) {
    throw new GoogleAuthError(
      response.error_description ?? response.error ?? "Google sign-in was cancelled",
      true,
      false
    );
  }
  const token: GoogleStoredToken = {
    accessToken: response.access_token,
    expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
    ...(typeof response.scope === "string" ? { scope: response.scope } : {})
  };
  writeGoogleToken(request.storageKey, token);
  request.onGranted?.(token);
  return token;
};

/**
 * Asks Google Identity Services for a token. Does not read or delete the cache:
 * a failure leaves whatever was stored before.
 */
const requestTokenFromGis = async (
  request: GoogleTokenRequest,
  prompt: string,
  timeoutMs: number
): Promise<GoogleStoredToken> => {
  // When the script is already present this resolves in a microtask and keeps
  // the user activation; a slow or stuck load fails instead of hanging the UI.
  await Promise.race([
    preloadGoogleIdentity(),
    new Promise<never>((_, reject) =>
      window.setTimeout(
        () => reject(new GoogleAuthError("Google Identity Services took too long to load", true, true)),
        GIS_LOAD_TIMEOUT_MS
      )
    )
  ]);
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new GoogleAuthError("Google Identity Services unavailable", true, true);
  }

  return new Promise<GoogleStoredToken>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    // A follow-up consent keeps the first grant when the user dismisses it,
    // so sign-in itself still succeeds and only the omitted service stays off.
    let granted: GoogleStoredToken | null = null;
    let askedForMissingScopes = prompt === "consent";
    let followUpStarted = false;
    let timer = 0;
    const finishFailure = (error: unknown) => {
      const kept =
        granted ??
        (followUpStarted ? readGoogleTokenAllowingNearExpiry(request.storageKey) : null);
      if (kept) {
        settle(() => resolve(kept));
        return;
      }
      settle(() => reject(error));
    };
    const armTimeout = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => finishFailure(new GoogleAuthError("Google sign-in timed out", true, true)),
        timeoutMs
      );
    };
    const missingEnsuredScope = (token: GoogleStoredToken) =>
      request.mode === "interactive" &&
      (request.ensureScopes ?? []).some((scope) => googleTokenOmitsScope(token, scope));
    const accessTokenRequest = (nextPrompt: string) => ({
      prompt: nextPrompt,
      ...(request.hint ? { login_hint: request.hint } : {})
    });
    const beginScopeConsent = (tokenClient: { requestAccessToken: (overrides?: { prompt?: string; login_hint?: string }) => void }) => {
      askedForMissingScopes = true;
      followUpStarted = true;
      armTimeout();
      try {
        tokenClient.requestAccessToken(accessTokenRequest("consent"));
      } catch (error) {
        finishFailure(error);
      }
    };
    armTimeout();
    const client = oauth2.initTokenClient({
      client_id: request.clientId.trim(),
      scope: request.scope,
      callback: (response) => {
        window.clearTimeout(timer);
        try {
          const token = storeGrantedToken(request, response);
          granted = token;
          if (missingEnsuredScope(token) && !askedForMissingScopes) {
            // Still this sign-in: one consent for a scope the grant left out.
            beginScopeConsent(client);
            return;
          }
          settle(() => resolve(token));
        } catch (error) {
          finishFailure(error);
        }
      },
      error_callback: (error) => {
        window.clearTimeout(timer);
        const message = error?.message ?? error?.type ?? "Google sign-in failed";
        const transient = gisFailureIsTransient(message);
        if (
          !askedForMissingScopes &&
          request.mode === "interactive" &&
          (request.ensureScopes?.length ?? 0) > 0 &&
          !transient
        ) {
          beginScopeConsent(client);
          return;
        }
        finishFailure(new GoogleAuthError(message, true, transient));
      }
    });
    client.requestAccessToken(accessTokenRequest(prompt));
  });
};

/**
 * Returns a usable access token for one feature.
 *
 * `silent` never opens Google UI. When consent was already granted it asks
 * Google for a fresh token without a popup. `interactive` reuses a cached
 * token unless `ignoreCache` is set, and otherwise opens Google's popup,
 * which must run inside a user gesture; only the very first connection shows
 * the consent screen.
 */
const interactiveGrantOmitsScope = (request: GoogleTokenRequest) => {
  if (request.mode !== "interactive" || !(request.ensureScopes?.length ?? 0)) {
    return false;
  }
  const cached = readGoogleTokenAllowingNearExpiry(request.storageKey);
  return Boolean(
    cached && (request.ensureScopes ?? []).some((scope) => googleTokenOmitsScope(cached, scope))
  );
};

export const requestGoogleToken = async (request: GoogleTokenRequest): Promise<GoogleStoredToken> => {
  if (!request.ignoreCache) {
    const cached = readGoogleToken(request.storageKey);
    // An interactive sign-in whose cached grant left out a required scope must
    // ask again. Reusing that token would leave Drive or Calendar unbound.
    if (cached && !interactiveGrantOmitsScope(request)) {
      return cached;
    }
  }
  if (!request.clientId.trim()) {
    throw new GoogleAuthError("Missing Google OAuth client id", true, false);
  }

  if (request.mode === "silent") {
    const stillValid = () =>
      request.allowStaleOnFailure === false
        ? null
        : readGoogleTokenAllowingNearExpiry(request.storageKey);
    if (!request.consentGranted) {
      const near = stillValid();
      if (near) {
        return near;
      }
      throw new GoogleAuthError("Google sign-in required", true, false);
    }
    try {
      return await requestTokenFromGis(request, "", SILENT_REFRESH_TIMEOUT_MS);
    } catch (error) {
      const near = stillValid();
      if (near) {
        return near;
      }
      if (error instanceof GoogleAuthError) {
        throw error;
      }
      throw new GoogleAuthError(
        error instanceof Error ? error.message : "Google sign-in required",
        true,
        true
      );
    }
  }

  // A cached grant that left a scope out still starts with prompt "" when this
  // device already consented. The callback asks once, with consent, for the
  // missing scope. Dismissing that prompt keeps the grant we already have.
  return requestTokenFromGis(
    request,
    request.consentGranted ? "" : "consent",
    GOOGLE_SIGN_IN_TIMEOUT_MS
  );
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
