const CLOUDKIT_SCRIPT_URL = "https://cdn.apple-cloudkit.com/ck/2/cloudkit.js";
const CLOUDKIT_SCRIPT_ID = "studio-map-os-cloudkit-js";
const CLOUDKIT_SCRIPT_TIMEOUT_MS = 20_000;
const SIGN_IN_MESSAGE_GUARD_WINDOW_MS = 10 * 60_000;
// CloudKit JS database requests intermittently fail with a transport-level
// NETWORK_ERROR (a connection that succeeds once warm), so every private-DB
// call is retried a few times before it is surfaced to the caller.
const CLOUDKIT_DB_MAX_ATTEMPTS = 4;
const CLOUDKIT_DB_RETRY_BASE_DELAY_MS = 350;

export const CLOUDKIT_SIGN_IN_BUTTON_ID = "apple-sign-in-button" as const;
export const CLOUDKIT_SIGN_OUT_BUTTON_ID = "apple-sign-out-button" as const;

export type CloudKitEnvironment = "development" | "production";

export type CloudKitConfiguration = {
  containerIdentifier: string;
  apiToken: string;
  environment: CloudKitEnvironment;
};

export type CloudKitConfigurationStatus =
  | { configured: true; configuration: CloudKitConfiguration }
  | {
      configured: false;
      missing: Array<"containerIdentifier" | "apiToken" | "environment">;
      invalidEnvironment: boolean;
    };

export type CloudKitUserIdentity = {
  userRecordName: string;
  nameComponents?: {
    givenName?: string;
    familyName?: string;
  };
  lookupInfo?: {
    userRecordName?: string;
    emailAddress?: string;
    phoneNumber?: string;
    [key: string]: unknown;
  };
};

export type CloudKitAccountDisplay = {
  displayName: string | null;
  maskedEmailAddress: string | null;
};

export type CloudKitRecordField = {
  value: unknown;
  type?: string;
};

export type CloudKitRecord = {
  recordType?: string;
  recordName?: string;
  recordChangeTag?: string;
  fields?: Record<string, CloudKitRecordField>;
  deleted?: boolean;
};

export type CloudKitResponseError = {
  message?: string;
  reason?: string;
  ckErrorCode?: string;
  serverErrorCode?: string;
  recordName?: string;
  retryAfter?: number;
};

export type CloudKitRecordsResponse = {
  records?: CloudKitRecord[];
  errors?: CloudKitResponseError[];
};

export type CloudKitDatabase = {
  fetchRecords(
    recordNames: string | string[],
    options?: { desiredKeys?: string[]; numbersAsStrings?: boolean }
  ): Promise<CloudKitRecordsResponse>;
  saveRecords(
    records: CloudKitRecord | CloudKitRecord[],
    options?: { desiredKeys?: string[]; numbersAsStrings?: boolean }
  ): Promise<CloudKitRecordsResponse>;
  deleteRecords(
    recordNames: string | string[],
    options?: { desiredKeys?: string[]; numbersAsStrings?: boolean }
  ): Promise<CloudKitRecordsResponse>;
};

export type CloudKitContainer = {
  privateCloudDatabase: CloudKitDatabase;
  setUpAuth(): Promise<CloudKitUserIdentity | null>;
  whenUserSignsIn(): Promise<CloudKitUserIdentity>;
  whenUserSignsOut(): Promise<void>;
  signOut(): void;
};

type CloudKitNamespace = {
  configure(configuration: {
    containers: Array<{
      containerIdentifier: string;
      apiTokenAuth: {
        apiToken: string;
        persist: true;
        signInButton: { id: string; theme: "black" | "white" };
        signOutButton: { id: string; theme: "black" | "white" };
      };
      environment: CloudKitEnvironment;
    }>;
  }): void;
  getDefaultContainer(): CloudKitContainer;
};

declare global {
  interface Window {
    CloudKit?: CloudKitNamespace;
    __studioMapCloudKitConfigurationKey?: string;
  }
}

export type CloudKitClientErrorCode =
  | "CONFIGURATION_MISSING"
  | "CONFIGURATION_INVALID"
  | "SCRIPT_LOAD_FAILED"
  | "CLIENT_UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "ACCOUNT_MISMATCH";

export class CloudKitClientError extends Error {
  constructor(
    public readonly code: CloudKitClientErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "CloudKitClientError";
  }
}

const containerIdentifier = process.env.NEXT_PUBLIC_CLOUDKIT_CONTAINER_ID?.trim() ?? "";
const apiToken = process.env.NEXT_PUBLIC_CLOUDKIT_API_TOKEN?.trim() ?? "";
const environmentInput = process.env.NEXT_PUBLIC_CLOUDKIT_ENVIRONMENT?.trim().toLowerCase() ?? "";

let cloudKitLoadPromise: Promise<CloudKitNamespace> | null = null;
let cloudKitAuthSetupPromise: Promise<CloudKitUserIdentity | null> | null = null;

// CloudKit JS setUpAuth() resets internal auth state and aborts any in-flight
// database request that shares the session fetch, surfacing as NETWORK_ERROR.
// Caching the confirmed identity lets repeated auth checks (provider reconcile
// listeners, per-request re-validation) resolve without re-running setUpAuth
// concurrently with reads/writes. The cache is invalidated on every sign-in
// attempt and sign-out, so it never masks an account change.
const IDENTITY_CACHE_TTL_MS = 60_000;
let lastConfirmedIdentity: CloudKitUserIdentity | null = null;
let lastConfirmedIdentityAt = 0;

const rememberConfirmedIdentity = (identity: CloudKitUserIdentity) => {
  lastConfirmedIdentity = identity;
  lastConfirmedIdentityAt = Date.now();
};

const forgetConfirmedIdentity = () => {
  lastConfirmedIdentity = null;
  lastConfirmedIdentityAt = 0;
};

/** Drops the cached CloudKit identity so the next check re-confirms it. */
export function forgetCloudKitIdentity() {
  forgetConfirmedIdentity();
}

/**
 * True while this browser still holds a persisted CloudKit session cookie.
 * An explicit sign-out deletes the cookie, so offline unlock stays disabled
 * after the user deliberately signed out.
 */
export function hasPersistedCloudKitSession(): boolean {
  return readCloudKitSessionCookie() !== null;
}

// Manual test hook: setting this localStorage key in a development build makes
// every CloudKit auth check fail like a dropped connection, so the offline
// unlock path can be exercised without cutting real network access.
const OFFLINE_SIMULATION_STORAGE_KEY = "smos-dev-simulate-cloudkit-offline";

const isCloudKitOfflineSimulated = () => {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(OFFLINE_SIMULATION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

/** Records the identity delivered by a live sign-in event as authoritative. */
export function noteCloudKitSignedIn(identity: CloudKitUserIdentity) {
  rememberConfirmedIdentity(identity);
}

const cleanIdentityValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const getCloudKitUserRecordName = (identity: CloudKitUserIdentity) =>
  cleanIdentityValue(identity.userRecordName) ??
  cleanIdentityValue(identity.lookupInfo?.userRecordName);

const maskCloudKitEmailAddress = (emailAddress: string | null) => {
  if (!emailAddress) {
    return null;
  }

  const separatorIndex = emailAddress.indexOf("@");
  if (separatorIndex <= 0 || separatorIndex === emailAddress.length - 1) {
    return null;
  }

  return `${emailAddress[0]}•••${emailAddress.slice(separatorIndex)}`;
};

/**
 * Returns display-only account information without persisting Apple identity data.
 * CloudKit may omit the email address and name for privacy. The raw user record
 * name is never exposed here; getCloudKitAccountTag derives a safe comparison tag.
 */
export function getCloudKitAccountDisplay(
  identity: CloudKitUserIdentity
): CloudKitAccountDisplay {
  const givenName = cleanIdentityValue(identity.nameComponents?.givenName);
  const familyName = cleanIdentityValue(identity.nameComponents?.familyName);
  const displayName = [givenName, familyName].filter(Boolean).join(" ") || null;
  const maskedEmailAddress = maskCloudKitEmailAddress(
    cleanIdentityValue(identity.lookupInfo?.emailAddress)
  );

  return {
    displayName,
    maskedEmailAddress
  };
}

/** Creates a stable, non-reversible label for comparing CloudKit accounts. */
export async function getCloudKitAccountTag(
  identity: CloudKitUserIdentity
): Promise<string | null> {
  const fingerprint = await getCloudKitAccountFingerprint(identity);
  if (!fingerprint) {
    return null;
  }

  const displayFingerprint = fingerprint.slice(0, 8).toUpperCase();
  return `CK-${displayFingerprint.slice(0, 4)}-${displayFingerprint.slice(4, 8)}`;
}

/**
 * Returns the full internal account binding. It is safe to persist as an
 * equality key, but must not be shown as an Apple ID or used as encryption key
 * material.
 */
export async function getCloudKitAccountFingerprint(
  identity: CloudKitUserIdentity
): Promise<string | null> {
  const userRecordName = getCloudKitUserRecordName(identity);
  if (!userRecordName || !globalThis.crypto?.subtle) {
    return null;
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${containerIdentifier}\0${userRecordName}`)
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function getCloudKitConfigurationStatus(): CloudKitConfigurationStatus {
  const missing: Array<"containerIdentifier" | "apiToken" | "environment"> = [];

  if (!containerIdentifier) {
    missing.push("containerIdentifier");
  }
  if (!apiToken) {
    missing.push("apiToken");
  }
  if (!environmentInput) {
    missing.push("environment");
  }

  const invalidEnvironment =
    Boolean(environmentInput) &&
    environmentInput !== "development" &&
    environmentInput !== "production";

  if (missing.length > 0 || invalidEnvironment) {
    return { configured: false, missing, invalidEnvironment };
  }

  return {
    configured: true,
    configuration: {
      containerIdentifier,
      apiToken,
      environment: environmentInput as CloudKitEnvironment
    }
  };
}

const requireConfiguration = () => {
  const status = getCloudKitConfigurationStatus();
  if (!status.configured) {
    throw new CloudKitClientError(
      status.invalidEnvironment ? "CONFIGURATION_INVALID" : "CONFIGURATION_MISSING",
      status.invalidEnvironment
        ? "The CloudKit environment must be development or production."
        : `CloudKit configuration is missing: ${status.missing.join(", ")}.`
    );
  }

  return status.configuration;
};

const configurationKey = (configuration: CloudKitConfiguration) =>
  `${configuration.containerIdentifier}:${configuration.environment}`;

/**
 * CloudKit JS resolves its sign-in popup with a one-shot window "message"
 * listener that accepts any object-shaped payload from any origin. A single
 * stray postMessage (browser extensions, devtools bridges) consumes that
 * listener and silently kills the attempt, and a forged payload could inject
 * an attacker-controlled ckSession. While a sign-in attempt is active, this
 * guard stops every window message that is not a CloudKit auth result from a
 * trusted Apple origin before the SDK listener can observe it.
 */
const trustedAuthMessageOrigin = (origin: string) => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname;
  return (
    host === "idmsa.apple.com" ||
    host === "appleid.apple.com" ||
    host === "apple-cloudkit.com" ||
    host.endsWith(".apple-cloudkit.com") ||
    host === "icloud.com" ||
    host.endsWith(".icloud.com")
  );
};

const isAuthResultShaped = (data: unknown): boolean =>
  typeof data === "object" &&
  data !== null &&
  ("ckSession" in data || "errorMessage" in data);

let signInMessageGuardInstalled = false;
let signInMessageGuardArmedUntil = 0;

const disarmSignInMessageGuard = () => {
  signInMessageGuardArmedUntil = 0;
};

const debugSignInMessage = (decision: string, event: MessageEvent) => {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const data = event.data;
  console.debug(`[cloudkit-signin-guard] ${decision}`, {
    origin: event.origin,
    dataType: typeof data,
    keys:
      typeof data === "object" && data !== null
        ? Object.keys(data as Record<string, unknown>).slice(0, 8)
        : String(data).slice(0, 40)
  });
};

const filterSignInMessages = (event: MessageEvent) => {
  if (signInMessageGuardArmedUntil < Date.now()) {
    return;
  }
  // Non-object payloads cannot resolve the SDK's popup listener.
  if (typeof event.data !== "object" || event.data === null) {
    debugSignInMessage("pass (non-object payload)", event);
    return;
  }
  if (isAuthResultShaped(event.data)) {
    if (trustedAuthMessageOrigin(event.origin)) {
      // The genuine popup result settles this attempt; stop filtering so
      // unrelated messages flow normally again.
      debugSignInMessage("pass (auth result from trusted origin)", event);
      disarmSignInMessageGuard();
      // CloudKit JS stores the delivered session but its follow-up identity
      // fetch fails silently (legacy endpoint); re-run auth setup so the REST
      // fallback completes the sign-in without waiting for a focus event. Force
      // past the identity cache: a freshly delivered session may belong to a
      // different account than the one cached before this attempt.
      forgetConfirmedIdentity();
      window.setTimeout(() => {
        void setUpCloudKitAuth({ force: true }).catch(() => {
          // The provider's reconcile listeners retry on their own schedule.
        });
      }, 250);
      return;
    }
    event.stopImmediatePropagation();
    console.warn(
      "Blocked a CloudKit-session-shaped message from an untrusted origin:",
      event.origin
    );
    return;
  }
  event.stopImmediatePropagation();
  debugSignInMessage("blocked (stray object message while signing in)", event);
};

const installSignInMessageGuard = () => {
  if (signInMessageGuardInstalled || typeof window === "undefined") {
    return;
  }
  signInMessageGuardInstalled = true;

  // Same-target listeners run in registration order, so registering before
  // any sign-in click guarantees this filter runs before the listener that
  // CloudKit JS adds when its button opens the popup.
  window.addEventListener("message", filterSignInMessages);

  // Arm on the capture phase of any click that reaches the CloudKit sign-in
  // button, covering every page that hosts the button without requiring the
  // hosting component to opt in.
  document.addEventListener(
    "click",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(`#${CLOUDKIT_SIGN_IN_BUTTON_ID}`)
      ) {
        signInMessageGuardArmedUntil = Date.now() + SIGN_IN_MESSAGE_GUARD_WINDOW_MS;
        if (process.env.NODE_ENV === "development") {
          console.debug("[cloudkit-signin-guard] armed by sign-in button click");
        }
      }
    },
    true
  );
};

const configureCloudKit = (
  cloudKit: CloudKitNamespace,
  configuration: CloudKitConfiguration
) => {
  installSignInMessageGuard();

  const key = configurationKey(configuration);

  if (window.__studioMapCloudKitConfigurationKey === key) {
    return cloudKit;
  }

  // CloudKit.configure replaces the SDK's container/auth instance. Repeating it
  // while setUpAuth or a sign-in listener is active disconnects the visible
  // Apple button from the listener waiting for its result. New route-level DOM
  // mounts are refreshed by setUpAuth instead of reconfiguring the SDK.
  cloudKit.configure({
    containers: [
      {
        containerIdentifier: configuration.containerIdentifier,
        environment: configuration.environment,
        apiTokenAuth: {
          apiToken: configuration.apiToken,
          persist: true,
          signInButton: { id: CLOUDKIT_SIGN_IN_BUTTON_ID, theme: "black" },
          signOutButton: { id: CLOUDKIT_SIGN_OUT_BUTTON_ID, theme: "black" }
        }
      }
    ]
  });
  window.__studioMapCloudKitConfigurationKey = key;
  return cloudKit;
};

const loadCloudKitNamespace = async (): Promise<CloudKitNamespace> => {
  const configuration = requireConfiguration();
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new CloudKitClientError(
      "CLIENT_UNAVAILABLE",
      "CloudKit JS is available only in a browser context."
    );
  }

  if (window.CloudKit) {
    return configureCloudKit(window.CloudKit, configuration);
  }

  if (cloudKitLoadPromise) {
    return cloudKitLoadPromise;
  }

  cloudKitLoadPromise = new Promise<CloudKitNamespace>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      callback();
    };
    const resolveLoaded = () => {
      if (!window.CloudKit) {
        settle(() =>
          reject(
            new CloudKitClientError(
              "SCRIPT_LOAD_FAILED",
              "Apple CloudKit JS loaded without exposing its browser client."
            )
          )
        );
        return;
      }

      settle(() => resolve(configureCloudKit(window.CloudKit as CloudKitNamespace, configuration)));
    };
    const rejectLoad = (cause?: unknown) =>
      settle(() =>
        reject(
          new CloudKitClientError(
            "SCRIPT_LOAD_FAILED",
            "Apple CloudKit JS could not be loaded.",
            { cause }
          )
        )
      );

    const timeoutId = window.setTimeout(
      () => rejectLoad(new Error("CloudKit JS load timed out.")),
      CLOUDKIT_SCRIPT_TIMEOUT_MS
    );
    const existing = document.getElementById(CLOUDKIT_SCRIPT_ID);

    if (existing instanceof HTMLScriptElement) {
      existing.addEventListener("load", resolveLoaded, { once: true });
      existing.addEventListener("error", rejectLoad, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = CLOUDKIT_SCRIPT_ID;
    script.src = CLOUDKIT_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", resolveLoaded, { once: true });
    script.addEventListener("error", rejectLoad, { once: true });
    document.head.append(script);
  }).catch((error) => {
    cloudKitLoadPromise = null;
    throw error;
  });

  return cloudKitLoadPromise;
};

export async function getCloudKitContainer(): Promise<CloudKitContainer> {
  const cloudKit = await loadCloudKitNamespace();
  return cloudKit.getDefaultContainer();
}

type CloudKitAuthInternals = {
  _auth?: {
    _handleCurrentUserIdentity?: (identity: CloudKitUserIdentity) => unknown;
  };
};

const CLOUDKIT_SESSION_COOKIE_DAYS = 14;

const readCloudKitSessionCookie = (): string | null => {
  if (typeof document === "undefined" || !containerIdentifier) {
    return null;
  }
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${containerIdentifier}=`)) {
      return trimmed.slice(containerIdentifier.length + 1) || null;
    }
  }
  return null;
};

const writeCloudKitSessionCookie = (value: string) => {
  if (typeof document === "undefined" || !containerIdentifier) {
    return;
  }
  const expires = new Date(
    Date.now() + CLOUDKIT_SESSION_COOKIE_DAYS * 24 * 60 * 60 * 1000
  ).toUTCString();
  document.cookie = `${containerIdentifier}=${value}; expires=${expires}; path=/`;
};

/**
 * CloudKit JS (frozen at v2.6.4) still resolves the signed-in identity through
 * the legacy public-database users/caller endpoint, which Apple's servers
 * reject with AUTHENTICATION_REQUIRED for this container even while the same
 * web-auth session is accepted by the documented private-database
 * users/current endpoint. Confirmed empirically on 2026-07-16: identical
 * ckWebAuthToken, users/caller → 421, private/users/current → 200. Without
 * this fallback the SDK can never leave its signed-out state, so sign-in
 * appears to do nothing.
 *
 * Returns the identity when the persisted session is valid, null when the
 * server says the session is signed out, and throws on transport failures so
 * offline checks are not mistaken for sign-outs.
 */
const fetchCloudKitIdentityViaRest = async (): Promise<CloudKitUserIdentity | null> => {
  const session = readCloudKitSessionCookie();
  if (!session) {
    return null;
  }

  const configuration = requireConfiguration();
  const url =
    "https://api.apple-cloudkit.com/database/1/" +
    `${encodeURIComponent(configuration.containerIdentifier)}/` +
    `${configuration.environment}/private/users/current` +
    `?ckAPIToken=${encodeURIComponent(configuration.apiToken)}` +
    `&ckWebAuthToken=${encodeURIComponent(session)}`;

  const response = await fetch(url);
  if (response.status === 401 || response.status === 421) {
    return null;
  }
  if (!response.ok) {
    throw new CloudKitClientError(
      "CLIENT_UNAVAILABLE",
      `CloudKit could not confirm the session (HTTP ${response.status}).`
    );
  }

  const body: unknown = await response.json().catch(() => null);
  const userRecordName =
    body && typeof body === "object"
      ? cleanIdentityValue((body as { userRecordName?: unknown }).userRecordName)
      : null;
  if (!userRecordName) {
    return null;
  }

  // Sessions rotate on use; persist the replacement when CORS exposes it.
  const rotatedSession =
    response.headers.get("x-apple-cloudkit-web-auth-token") ??
    response.headers.get("x-apple-cloudkit-session");
  if (rotatedSession) {
    writeCloudKitSessionCookie(rotatedSession);
  }

  return { userRecordName };
};

/**
 * Confirms the persisted session against the working REST endpoint and, on
 * success, drives CloudKit JS into its signed-in state so its sign-out
 * button, whenUserSignsIn subscribers, and database session handling all keep
 * working through the SDK's own code paths.
 */
const recoverCloudKitAuthStateViaRest = async (
  container: CloudKitContainer
): Promise<CloudKitUserIdentity | null> => {
  const identity = await fetchCloudKitIdentityViaRest();
  if (!identity) {
    return null;
  }

  const internals = container as unknown as CloudKitAuthInternals;
  const handleCurrentUserIdentity = internals._auth?._handleCurrentUserIdentity;
  if (typeof handleCurrentUserIdentity === "function") {
    try {
      handleCurrentUserIdentity.call(internals._auth, identity);
    } catch {
      // The SDK keeps rendering its signed-out button, but callers still
      // receive the confirmed identity.
    }
  } else if (process.env.NODE_ENV === "development") {
    console.warn(
      "CloudKit JS internals changed; sign-in state recovery is degraded."
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[cloudkit-signin-guard] identity confirmed via REST fallback");
  }
  return identity;
};

const errorCodeOf = (error: unknown): string => {
  if (error && typeof error === "object") {
    const record = error as { ckErrorCode?: unknown; serverErrorCode?: unknown };
    const code = record.ckErrorCode ?? record.serverErrorCode;
    if (typeof code === "string") {
      return code.toUpperCase();
    }
  }
  return "";
};

/**
 * A retryable failure is a transport-level error (no server response), not an
 * application error like CONFLICT or AUTHENTICATION_REQUIRED. NETWORK_ERROR is
 * how CloudKit JS reports an XHR that never received a response, so the request
 * almost certainly never committed and is safe to repeat.
 */
const isRetryableDatabaseError = (error: unknown): boolean => {
  const code = errorCodeOf(error);
  return (
    code === "NETWORK_ERROR" ||
    code === "SERVICE_UNAVAILABLE" ||
    error instanceof TypeError
  );
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.setTimeout(resolve, ms);
  });

const retryDatabaseOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < CLOUDKIT_DB_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (
        !isRetryableDatabaseError(error) ||
        attempt === CLOUDKIT_DB_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }
      if (process.env.NODE_ENV === "development") {
        console.debug(
          `[cloudkit-db] retrying after ${errorCodeOf(error) || "transport error"} ` +
            `(attempt ${attempt + 1}/${CLOUDKIT_DB_MAX_ATTEMPTS})`
        );
      }
      await delay(CLOUDKIT_DB_RETRY_BASE_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
};

const wrapDatabaseWithRetry = (database: CloudKitDatabase): CloudKitDatabase => ({
  fetchRecords: (recordNames, options) =>
    retryDatabaseOperation(() => database.fetchRecords(recordNames, options)),
  saveRecords: (records, options) =>
    retryDatabaseOperation(() => database.saveRecords(records, options)),
  deleteRecords: (recordNames, options) =>
    retryDatabaseOperation(() => database.deleteRecords(recordNames, options))
});

export async function getCloudKitPrivateDatabase(): Promise<CloudKitDatabase> {
  return wrapDatabaseWithRetry((await getCloudKitContainer()).privateCloudDatabase);
}

export async function setUpCloudKitAuth(
  options?: { force?: boolean }
): Promise<CloudKitUserIdentity | null> {
  if (isCloudKitOfflineSimulated()) {
    throw new CloudKitClientError(
      "CLIENT_UNAVAILABLE",
      "CloudKit offline simulation is active (dev-only)."
    );
  }

  if (
    !options?.force &&
    lastConfirmedIdentity &&
    Date.now() - lastConfirmedIdentityAt < IDENTITY_CACHE_TTL_MS
  ) {
    // Serving from cache avoids invoking setUpAuth() while a database request
    // is in flight, which would abort it (NETWORK_ERROR).
    return lastConfirmedIdentity;
  }

  if (cloudKitAuthSetupPromise) {
    return cloudKitAuthSetupPromise;
  }

  cloudKitAuthSetupPromise = getCloudKitContainer()
    .then(async (container) => {
      // Cold connections to CloudKit fail transiently with NETWORK_ERROR, so
      // the auth bootstrap needs the same retries as database requests —
      // without it the sign-in button never renders.
      const sdkIdentity = await retryDatabaseOperation(() => container.setUpAuth());
      if (sdkIdentity) {
        rememberConfirmedIdentity(sdkIdentity);
        return sdkIdentity;
      }
      // The SDK's own identity check uses a legacy endpoint the server
      // rejects; a valid persisted session must still resolve as signed in.
      const restIdentity = await retryDatabaseOperation(() =>
        recoverCloudKitAuthStateViaRest(container)
      );
      if (restIdentity) {
        rememberConfirmedIdentity(restIdentity);
      } else {
        forgetConfirmedIdentity();
      }
      return restIdentity;
    })
    .finally(() => {
      cloudKitAuthSetupPromise = null;
    });

  return cloudKitAuthSetupPromise;
}

/**
 * Revalidates that a UI-delivered Apple identity still owns the SDK session
 * that will service the next private-database request.
 */
export async function assertCloudKitAuthenticatedUser(
  expectedIdentity: CloudKitUserIdentity
): Promise<CloudKitUserIdentity> {
  const expectedRecordName = getCloudKitUserRecordName(expectedIdentity);
  if (!expectedRecordName) {
    throw new CloudKitClientError(
      "AUTH_REQUIRED",
      "Apple ID did not provide a usable account identity."
    );
  }

  const currentIdentity = await setUpCloudKitAuth();
  const currentRecordName = currentIdentity
    ? getCloudKitUserRecordName(currentIdentity)
    : null;

  if (!currentIdentity || !currentRecordName) {
    throw new CloudKitClientError(
      "AUTH_REQUIRED",
      "Sign in with Apple ID before accessing private CloudKit data."
    );
  }
  if (currentRecordName !== expectedRecordName) {
    throw new CloudKitClientError(
      "ACCOUNT_MISMATCH",
      "The active Apple ID account changed before the request began."
    );
  }

  return currentIdentity;
}

export async function whenCloudKitUserSignsIn(): Promise<CloudKitUserIdentity> {
  return (await getCloudKitContainer()).whenUserSignsIn();
}

export async function whenCloudKitUserSignsOut(): Promise<void> {
  return (await getCloudKitContainer()).whenUserSignsOut();
}

/** Ends any pending sign-in attempt's message filtering window. */
export function disarmCloudKitSignInMessageGuard() {
  disarmSignInMessageGuard();
}

const deleteCloudKitSessionCookie = () => {
  if (typeof document === "undefined" || !containerIdentifier) {
    return;
  }
  // CloudKit JS persists the session in a cookie named after the container.
  // Expire it under both the default path and the site root; unknown paths
  // cannot be enumerated, so this stays best-effort.
  const expired = `${containerIdentifier}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  document.cookie = expired;
  document.cookie = `${expired}; path=/`;
};

/**
 * Signs the browser out of the persisted CloudKit session so a signed-out app
 * session cannot be silently re-entered from the stored ckSession cookie.
 * Never loads CloudKit JS just to sign out; without the SDK the persisted
 * cookie is removed directly.
 */
export async function signOutCloudKitSession(): Promise<void> {
  disarmSignInMessageGuard();
  forgetConfirmedIdentity();

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.CloudKit && window.__studioMapCloudKitConfigurationKey) {
      window.CloudKit.getDefaultContainer().signOut();
    }
  } catch {
    // Fall through to clearing the persisted session cookie directly.
  }

  deleteCloudKitSessionCookie();
}
