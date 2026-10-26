"use client";

import {
  GoogleApiError,
  GoogleAuthError,
  googleFetch,
  googleTokenUsableUntil,
  readGoogleToken,
  requestGoogleToken,
  revokeGoogleToken,
  writeGoogleToken,
  type GoogleStoredToken
} from "@/lib/integrations/google-auth";
import {
  CloudProviderError,
  GOOGLE_DRIVE_IDENTITY_PREFIX
} from "@/lib/storage/cloud-provider-error";

/**
 * Google Drive as a cloud location for the encrypted workspace bundle.
 *
 * The bundle lives in Drive's hidden application data folder, which only this
 * OAuth client can see. Everything device-bound (OAuth client id, cached
 * token, the Google account this device connected) stays in localStorage,
 * keyed by workspace, exactly like the CloudKit session does.
 */

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const GOOGLE_DRIVE_STATUS_EVENT = "smos:google-drive-status";
const SETTINGS_KEY_PREFIX = "studio-map-os.google-drive:";
const TOKEN_KEY_PREFIX = "studio-map-os.google-drive-token:";
const CALENDAR_SETTINGS_KEY_PREFIX = "studio-map-os.google-calendar:";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const ACCOUNT_ID_PREFIX = GOOGLE_DRIVE_IDENTITY_PREFIX;
const CALENDAR_TOKEN_KEY_PREFIX = "studio-map-os.google-calendar-token:";

export type GoogleDriveSettings = {
  clientId: string;
  /** Stable Drive permission id of the connected Google account. */
  accountId: string;
  accountEmail: string;
  accountName: string;
  /** Set once Google granted consent on this device, so later prompts skip the consent screen. */
  consentGranted: boolean;
  connectedAt: string;
};

/**
 * Shaped like a CloudKit identity so the sync coordinator can bind, compare
 * and display either kind of account with the same code.
 */
export type GoogleDriveIdentity = {
  userRecordName: string;
  nameComponents?: { givenName?: string; familyName?: string };
  lookupInfo?: { userRecordName?: string; emailAddress?: string };
};

const canUseBrowser = () => typeof window !== "undefined";

const settingsKey = (workspaceId: string) => `${SETTINGS_KEY_PREFIX}${workspaceId}`;
const tokenKey = (workspaceId: string) => `${TOKEN_KEY_PREFIX}${workspaceId}`;

/** The Calendar integration may already hold a pasted OAuth client id; reuse it. */
const readCalendarClientId = (workspaceId: string) => {
  if (!canUseBrowser()) {
    return "";
  }
  try {
    const raw = window.localStorage.getItem(`${CALENDAR_SETTINGS_KEY_PREFIX}${workspaceId}`);
    const parsed = raw ? (JSON.parse(raw) as { clientId?: unknown }) : null;
    return parsed && typeof parsed.clientId === "string" ? parsed.clientId : "";
  } catch {
    return "";
  }
};

const defaultSettings = (workspaceId: string): GoogleDriveSettings => ({
  clientId: readCalendarClientId(workspaceId) || (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""),
  accountId: "",
  accountEmail: "",
  accountName: "",
  consentGranted: false,
  connectedAt: ""
});

export const readGoogleDriveSettings = (workspaceId: string): GoogleDriveSettings => {
  const fallback = defaultSettings(workspaceId);
  if (!canUseBrowser()) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(settingsKey(workspaceId));
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<GoogleDriveSettings>;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
      clientId: text(parsed.clientId) || fallback.clientId,
      accountId: text(parsed.accountId),
      accountEmail: text(parsed.accountEmail),
      accountName: text(parsed.accountName),
      consentGranted: parsed.consentGranted === true,
      connectedAt: text(parsed.connectedAt)
    };
  } catch {
    return fallback;
  }
};

export const writeGoogleDriveSettings = (
  workspaceId: string,
  patch: Partial<GoogleDriveSettings>
): GoogleDriveSettings => {
  const next = { ...readGoogleDriveSettings(workspaceId), ...patch };
  if (canUseBrowser()) {
    window.localStorage.setItem(settingsKey(workspaceId), JSON.stringify(next));
  }
  publishGoogleDriveStatus();
  return next;
};

// ---------------------------------------------------------------------------
// Status notifications (the storage card re-reads settings + token on change)
// ---------------------------------------------------------------------------

const statusListeners = new Set<() => void>();

const publishGoogleDriveStatus = () => {
  statusListeners.forEach((listener) => listener());
  if (canUseBrowser()) {
    window.dispatchEvent(new CustomEvent(GOOGLE_DRIVE_STATUS_EVENT));
  }
};

export const subscribeGoogleDriveStatus = (listener: () => void) => {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
};

// ---------------------------------------------------------------------------
// Configuration / tokens
// ---------------------------------------------------------------------------

export const getGoogleDriveConfigurationStatus = (workspaceId: string) => {
  const settings = readGoogleDriveSettings(workspaceId);
  return { configured: Boolean(settings.clientId.trim()), clientId: settings.clientId };
};

/** True while a usable token is cached, i.e. background sync can run without any popup. */
export const hasGoogleDriveAccessToken = (workspaceId: string) =>
  readGoogleToken(tokenKey(workspaceId)) !== null;

/** Instant the cached token stops being usable, so the card can refresh right then. */
export const getGoogleDriveTokenUsableUntil = (workspaceId: string) => {
  const token = readGoogleToken(tokenKey(workspaceId));
  return token ? googleTokenUsableUntil(token) : null;
};

/** Whether the Calendar integration on this device still uses the same OAuth grant. */
const calendarSharesGrant = (workspaceId: string, clientId: string) => {
  if (!canUseBrowser()) {
    return false;
  }
  try {
    const raw = window.localStorage.getItem(`${CALENDAR_SETTINGS_KEY_PREFIX}${workspaceId}`);
    const parsed = raw
      ? (JSON.parse(raw) as { clientId?: unknown; calendarId?: unknown; connectedAt?: unknown })
      : null;
    return Boolean(
      parsed &&
        parsed.clientId === clientId &&
        typeof parsed.calendarId === "string" &&
        parsed.calendarId &&
        typeof parsed.connectedAt === "string" &&
        parsed.connectedAt
    );
  } catch {
    return false;
  }
};

export const isGoogleDriveConnected = (settings: GoogleDriveSettings) =>
  Boolean(settings.clientId && settings.accountId && settings.connectedAt);

const authRequired = (message: string, cause?: unknown) =>
  new CloudProviderError("gdrive", "AUTH_REQUIRED", message, cause ? { cause } : undefined);

/**
 * Token for provider calls. Never opens UI: when the cached token is gone the
 * coordinator records "auth-required" and the card asks for one click.
 */
export const requireGoogleDriveAccessToken = (workspaceId: string): GoogleStoredToken => {
  const token = readGoogleToken(tokenKey(workspaceId));
  if (!token) {
    throw authRequired("Google sign-in required");
  }
  return token;
};

// Access tokens whose Google account has been confirmed against the stored
// binding. Keyed by workspace; a token not in here is verified before use so
// a popup that picked a different account can never upload to the wrong Drive.
const verifiedTokens = new Map<string, string>();

export const requestGoogleDriveAccessToken = async (
  workspaceId: string,
  mode: "interactive" | "silent"
): Promise<GoogleStoredToken> => {
  const settings = readGoogleDriveSettings(workspaceId);
  let token: GoogleStoredToken;
  try {
    token = await requestGoogleToken({
      storageKey: tokenKey(workspaceId),
      clientId: settings.clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      mode,
      consentGranted: settings.consentGranted,
      hint: settings.accountEmail || undefined,
      onGranted: () => {
        writeGoogleDriveSettings(workspaceId, { consentGranted: true });
      }
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      throw authRequired(error.message, error);
    }
    throw error;
  }
  await verifyTokenAccount(workspaceId, token);
  return token;
};

/**
 * Confirms which Google account a token belongs to and rejects it when the
 * workspace is bound to a different one (the account chooser lets the user
 * pick any signed-in account, whatever the hint said).
 */
const verifyTokenAccount = async (workspaceId: string, token: GoogleStoredToken) => {
  if (verifiedTokens.get(workspaceId) === token.accessToken) {
    return;
  }
  const settings = readGoogleDriveSettings(workspaceId);
  const account = await fetchGoogleDriveAccount(token);
  if (settings.accountId && settings.accountId !== account.accountId) {
    // Drop the token so the next attempt opens the chooser again (with the
    // bound account pre-selected through login_hint) instead of retrying
    // against the wrong Drive.
    writeGoogleToken(tokenKey(workspaceId), null);
    publishGoogleDriveStatus();
    throw new CloudProviderError(
      "gdrive",
      "ACCOUNT_MISMATCH",
      `Signed in as ${account.accountEmail || "another Google account"}, but this workspace is connected to ${settings.accountEmail || "a different Google account"}. Reconnect with that account.`
    );
  }
  if (!settings.accountId) {
    writeGoogleDriveSettings(workspaceId, {
      ...account,
      connectedAt: settings.connectedAt || new Date().toISOString()
    });
  }
  verifiedTokens.set(workspaceId, token.accessToken);
};

/** Drops the cached token after Google rejected it, so the next attempt asks for a click. */
export const forgetGoogleDriveAccessToken = (workspaceId: string) => {
  writeGoogleToken(tokenKey(workspaceId), null);
  verifiedTokens.delete(workspaceId);
  publishGoogleDriveStatus();
};

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

const toIdentity = (settings: GoogleDriveSettings): GoogleDriveIdentity => ({
  userRecordName: `${ACCOUNT_ID_PREFIX}${settings.accountId}`,
  nameComponents: settings.accountName ? { givenName: settings.accountName } : undefined,
  lookupInfo: {
    userRecordName: `${ACCOUNT_ID_PREFIX}${settings.accountId}`,
    emailAddress: settings.accountEmail || undefined
  }
});

export const isGoogleDriveIdentity = (identity: { userRecordName: string }) =>
  identity.userRecordName.startsWith(ACCOUNT_ID_PREFIX);

type DriveAboutResponse = {
  user?: { permissionId?: string; emailAddress?: string; displayName?: string };
};

/** Resolves which Google account the token belongs to. */
const fetchGoogleDriveAccount = async (token: GoogleStoredToken) => {
  let response: Response;
  try {
    response = await googleFetch(
      token.accessToken,
      `${DRIVE_API}/about?fields=user(permissionId,emailAddress,displayName)`
    );
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 401) {
      throw error;
    }
    // Keep provider semantics for every other failure so the coordinator
    // classifies it (throttling, quota, transport) instead of guessing.
    throw new CloudProviderError(
      "gdrive",
      error instanceof GoogleApiError && error.status === 429 ? "THROTTLED" : "REQUEST_FAILED",
      error instanceof Error ? `Google account lookup failed: ${error.message}` : "Google account lookup failed.",
      { cause: error }
    );
  }
  const body = (await response.json()) as DriveAboutResponse;
  const permissionId = body.user?.permissionId?.trim() ?? "";
  if (!permissionId) {
    throw new CloudProviderError(
      "gdrive",
      "REQUEST_FAILED",
      "Google Drive did not return the connected account."
    );
  }
  return {
    accountId: permissionId,
    accountEmail: body.user?.emailAddress?.trim() ?? "",
    accountName: body.user?.displayName?.trim() ?? ""
  };
};

/**
 * Silent identity lookup for the coordinator: null when this device has no
 * usable token; otherwise the connected account (fetched once, then cached).
 */
export const getGoogleDriveIdentity = async (
  workspaceId: string
): Promise<GoogleDriveIdentity | null> => {
  const token = readGoogleToken(tokenKey(workspaceId));
  if (!token) {
    return null;
  }
  try {
    await verifyTokenAccount(workspaceId, token);
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 401) {
      forgetGoogleDriveAccessToken(workspaceId);
      return null;
    }
    throw error;
  }
  return toIdentity(readGoogleDriveSettings(workspaceId));
};

/** Re-checks that the expected account still has a live token on this device. */
export const assertGoogleDriveAuthenticatedUser = async (
  workspaceId: string,
  expected: { userRecordName: string }
): Promise<GoogleDriveIdentity> => {
  const identity = await getGoogleDriveIdentity(workspaceId);
  if (!identity) {
    throw authRequired("Google sign-in required");
  }
  if (identity.userRecordName !== expected.userRecordName) {
    throw new CloudProviderError(
      "gdrive",
      "AUTH_REQUIRED",
      "The connected Google account changed before the request began."
    );
  }
  return identity;
};

// ---------------------------------------------------------------------------
// Interactive connect / disconnect (called from click handlers only)
// ---------------------------------------------------------------------------

/**
 * Opens Google's consent popup (must run inside a user gesture), then records
 * which account answered. Returns the identity the coordinator will bind.
 */
export const connectGoogleDriveAccount = async (
  workspaceId: string,
  clientId: string
): Promise<GoogleDriveIdentity> => {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw authRequired("Missing Google OAuth client id");
  }
  const previous = readGoogleDriveSettings(workspaceId);
  if (previous.clientId !== trimmedClientId) {
    // A different OAuth client means a different app data folder and consent.
    writeGoogleToken(tokenKey(workspaceId), null);
    writeGoogleDriveSettings(workspaceId, {
      clientId: trimmedClientId,
      consentGranted: false,
      accountId: "",
      accountEmail: "",
      accountName: ""
    });
  }
  // The token request verifies which account answered and records it (or
  // rejects a token from a different account than the bound one).
  await requestGoogleDriveAccessToken(workspaceId, "interactive");
  const settings = writeGoogleDriveSettings(workspaceId, {
    connectedAt: new Date().toISOString()
  });
  return toIdentity(settings);
};

/**
 * Adopts a token obtained by Google sign-in (its scopes include Drive app
 * data) as this workspace's Drive connection, so sync starts without a second
 * popup. The account is verified exactly like a Drive-only token would be.
 */
export const seedGoogleDriveConnection = async (
  workspaceId: string,
  token: GoogleStoredToken,
  clientId: string
): Promise<GoogleDriveIdentity> => {
  const settings = readGoogleDriveSettings(workspaceId);
  const nextClientId = clientId.trim();
  if (settings.accountId && nextClientId && settings.clientId && settings.clientId !== nextClientId) {
    // Each OAuth client has its own app data folder: switching clients here
    // would quietly fork this workspace's Drive copy.
    throw new CloudProviderError(
      "gdrive",
      "ACCOUNT_MISMATCH",
      "This workspace syncs to Google Drive through a different OAuth client ID. Sign in with that client ID."
    );
  }
  const account = await fetchGoogleDriveAccount(token);
  if (settings.accountId && settings.accountId !== account.accountId) {
    throw new CloudProviderError(
      "gdrive",
      "ACCOUNT_MISMATCH",
      `Signed in as ${account.accountEmail || "another Google account"}, but this workspace's Drive copy belongs to ${settings.accountEmail || "a different Google account"}.`
    );
  }
  const next = writeGoogleDriveSettings(workspaceId, {
    clientId: clientId.trim() || settings.clientId,
    ...account,
    consentGranted: true,
    connectedAt: settings.connectedAt || new Date().toISOString()
  });
  writeGoogleToken(tokenKey(workspaceId), token);
  verifiedTokens.set(workspaceId, token.accessToken);
  publishGoogleDriveStatus();
  return toIdentity(next);
};

/** Forgets the connection on this device and revokes its token. The Drive copy is kept. */
export const disconnectGoogleDriveAccount = async (workspaceId: string) => {
  const settings = readGoogleDriveSettings(workspaceId);
  verifiedTokens.delete(workspaceId);
  // Revoking the grant would also cut off a still-connected Calendar push.
  const revokeGrant = !calendarSharesGrant(workspaceId, settings.clientId);
  await revokeGoogleToken(tokenKey(workspaceId), { revokeGrant });
  if (revokeGrant) {
    writeGoogleToken(`${CALENDAR_TOKEN_KEY_PREFIX}${workspaceId}`, null);
  }
  writeGoogleDriveSettings(workspaceId, {
    clientId: settings.clientId,
    accountId: "",
    accountEmail: "",
    accountName: "",
    consentGranted: false,
    connectedAt: ""
  });
};

/** Shown on the storage card next to the connected account. */
export const describeGoogleDriveAccount = (workspaceId: string) => {
  const settings = readGoogleDriveSettings(workspaceId);
  if (!isGoogleDriveConnected(settings)) {
    return null;
  }
  return {
    accountId: settings.accountId,
    email: settings.accountEmail,
    name: settings.accountName,
    connectedAt: settings.connectedAt,
    hasToken: hasGoogleDriveAccessToken(workspaceId)
  };
};
