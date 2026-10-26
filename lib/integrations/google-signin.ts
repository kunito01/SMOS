"use client";

import {
  GoogleAuthError,
  googleFetch,
  googleTokenUsableUntil,
  readGoogleToken,
  requestGoogleToken,
  writeGoogleToken,
  type GoogleStoredToken
} from "@/lib/integrations/google-auth";
import { GOOGLE_DRIVE_SCOPE } from "@/lib/storage/google-drive/google-drive-client";

/**
 * Device-level Google sign-in for Studio Map OS accounts.
 *
 * One popup yields a token that both identifies the Google account (OpenID
 * userinfo) and can reach the Drive app data folder, so a sign-in never needs
 * a second consent before sync starts. No workspace exists yet when this
 * runs, so everything here is keyed by device, not by workspace.
 */

export const GOOGLE_SIGN_IN_SCOPE = `openid email profile ${GOOGLE_DRIVE_SCOPE}`;
export const GOOGLE_SIGN_IN_TOKEN_KEY = "studio-map-os.google-signin-token.v1";
const SETTINGS_KEY = "studio-map-os.google-signin.v1";
const CLIENT_ID_KEY = "studio-map-os.google-client-id";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
// Domain-separates the account secret from every other use of the subject id.
const FINGERPRINT_DOMAIN = "studio-map-os.google-account.v1";
// A token must outlive the sign-in's own Drive pull to count as usable.
const MIN_USABLE_TOKEN_MS = 5 * 60_000;
const WORKSPACE_SETTINGS_PREFIXES = ["studio-map-os.google-drive:", "studio-map-os.google-calendar:"];

export type GoogleSignInSettings = {
  clientId: string;
  email: string;
  displayName: string;
  /** Google granted the sign-in scopes on this device; later prompts skip the consent screen. */
  consentGranted: boolean;
  /** Set by an explicit sign-out: local entry stays closed until Google is asked again. */
  signedOut: boolean;
  lastSignInAt: string;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
};

const defaults: GoogleSignInSettings = {
  clientId: "",
  email: "",
  displayName: "",
  consentGranted: false,
  signedOut: false,
  lastSignInAt: ""
};

const canUseBrowser = () => typeof window !== "undefined";

const str = (value: unknown) => (typeof value === "string" ? value : "");

export const readGoogleSignInSettings = (): GoogleSignInSettings => {
  if (!canUseBrowser()) {
    return { ...defaults };
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") {
      return { ...defaults };
    }
    const record = parsed as Record<string, unknown>;
    return {
      clientId: str(record.clientId),
      email: str(record.email),
      displayName: str(record.displayName),
      consentGranted: record.consentGranted === true,
      signedOut: record.signedOut === true,
      lastSignInAt: str(record.lastSignInAt)
    };
  } catch {
    return { ...defaults };
  }
};

export const writeGoogleSignInSettings = (patch: Partial<GoogleSignInSettings>) => {
  const next = { ...readGoogleSignInSettings(), ...patch };
  if (canUseBrowser()) {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // The session still works; only the convenience state is lost.
    }
  }
  return next;
};

/** A client id already used by Drive or Calendar on this device, if any. */
const scanWorkspaceClientIds = () => {
  if (!canUseBrowser()) {
    return "";
  }
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) ?? "";
      if (!WORKSPACE_SETTINGS_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        continue;
      }
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
      const clientId = parsed && typeof parsed === "object" ? str((parsed as Record<string, unknown>).clientId).trim() : "";
      if (clientId) {
        return clientId;
      }
    }
  } catch {
    // Fall through to the build-time default.
  }
  return "";
};

/**
 * The OAuth client id to sign in with. The login page has no workspace to
 * read a per-workspace setting from, so the order is: the id this device
 * last signed in with, the id Drive or Calendar already use here, then the
 * id baked into the build. Empty means the user must enter it once.
 */
export const resolveGoogleClientId = () => {
  const settings = readGoogleSignInSettings();
  if (settings.clientId.trim()) {
    return settings.clientId.trim();
  }
  if (canUseBrowser()) {
    try {
      const remembered = (window.localStorage.getItem(CLIENT_ID_KEY) ?? "").trim();
      if (remembered) {
        return remembered;
      }
    } catch {
      // ignore
    }
  }
  return scanWorkspaceClientIds() || (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
};

export const rememberGoogleClientId = (clientId: string) => {
  const trimmed = clientId.trim();
  if (!trimmed) {
    return;
  }
  if (canUseBrowser()) {
    try {
      window.localStorage.setItem(CLIENT_ID_KEY, trimmed);
    } catch {
      // ignore
    }
  }
  writeGoogleSignInSettings({ clientId: trimmed });
};

export const readGoogleSignInToken = () => readGoogleToken(GOOGLE_SIGN_IN_TOKEN_KEY);

export const hasUsableGoogleSignInToken = () => {
  const token = readGoogleSignInToken();
  return Boolean(token) && token !== null && googleTokenUsableUntil(token) - Date.now() >= MIN_USABLE_TOKEN_MS;
};

export const forgetGoogleSignInToken = () => writeGoogleToken(GOOGLE_SIGN_IN_TOKEN_KEY, null);

/**
 * Opens Google's popup (interactive mode must run inside a user gesture) or
 * returns the cached token (silent mode). The token carries the sign-in and
 * Drive app-data scopes together.
 */
export const requestGoogleSignIn = async (options: {
  clientId: string;
  mode: "interactive" | "silent";
}): Promise<GoogleStoredToken> => {
  const clientId = options.clientId.trim();
  if (!clientId) {
    throw new GoogleAuthError("The Google OAuth client id is missing.", true);
  }
  const settings = readGoogleSignInSettings();
  const token = await requestGoogleToken({
    storageKey: GOOGLE_SIGN_IN_TOKEN_KEY,
    clientId,
    scope: GOOGLE_SIGN_IN_SCOPE,
    mode: options.mode,
    consentGranted: settings.consentGranted && settings.clientId === clientId,
    hint: settings.email || undefined,
    onGranted: () => {
      writeGoogleSignInSettings({ clientId, consentGranted: true });
    }
  });
  rememberGoogleClientId(clientId);
  return token;
};

/** Resolves which Google account a token belongs to. */
export const fetchGoogleUserInfo = async (token: GoogleStoredToken): Promise<GoogleUserInfo> => {
  const response = await googleFetch(token.accessToken, USERINFO_URL);
  const body = (await response.json()) as Record<string, unknown>;
  const sub = str(body.sub).trim();
  if (!sub) {
    throw new GoogleAuthError("Google did not return an account identifier.", true);
  }
  return {
    sub,
    email: str(body.email).trim().toLowerCase(),
    emailVerified: body.email_verified === true,
    name: str(body.name).trim(),
    picture: str(body.picture).trim()
  };
};

/**
 * The account unlock secret for a Google account: a hex SHA-256 over the
 * OpenID subject id, domain-separated. The subject id is stable for one
 * Google account across OAuth clients and projects. Neither the subject id
 * nor this value is persisted (records and the Drive profile hold only a
 * digest of it), so the stored digest cannot open the Drive account wrap; a
 * live Google sign-in recomputes it.
 *
 * Boundaries, stated plainly: the subject id is not a secret from Google or
 * from other apps the user signed into with Google, so whoever holds this
 * app's Drive grant and knows it can unwrap the account wrap (the accepted
 * "sign in is unlock" trade-off). The device vault is a convenience copy for
 * re-entry: its wrapping key is non-extractable only through the WebCrypto
 * API, so a same-origin script or a copy of the browser profile can open it.
 * Sign-out deletes that entry; the recovery key is the user's own way back.
 */
export const googleAccountFingerprint = async (sub: string) => {
  if (!globalThis.crypto?.subtle) {
    throw new GoogleAuthError("Web Crypto is required for Google sign-in.", false);
  }
  const bytes = new TextEncoder().encode(`${FINGERPRINT_DOMAIN}\0${sub}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const markGoogleSignedIn = (account: { email: string; displayName: string }) =>
  writeGoogleSignInSettings({
    email: account.email,
    displayName: account.displayName,
    signedOut: false,
    lastSignInAt: new Date().toISOString()
  });

/** An explicit sign-out: forget the token and close the local entry until Google is asked again. */
export const markGoogleSignedOut = () => {
  writeGoogleSignInSettings({ signedOut: true });
  forgetGoogleSignInToken();
};
