import {
  downloadEncryptedWorkspaceBundleFromCloudKit,
  uploadEncryptedWorkspaceBundleToCloudKit
} from "@/lib/storage/cloudkit-provider";
import { GoogleApiError } from "@/lib/integrations/google-auth";
import { CloudProviderError } from "@/lib/storage/cloud-provider-error";
import {
  downloadEncryptedWorkspaceBundleFromGoogleDrive,
  uploadEncryptedWorkspaceBundleToGoogleDrive
} from "@/lib/storage/google-drive-provider";
import {
  assertGoogleDriveAuthenticatedUser,
  getGoogleDriveConfigurationStatus,
  getGoogleDriveIdentity
} from "@/lib/storage/google-drive/google-drive-client";
import {
  assertCloudKitAuthenticatedUser,
  CloudKitClientError,
  describeLastFailedCloudKitResponse,
  getCloudKitConfigurationStatus,
  probeCloudKitReachability,
  getCloudKitUserRecordName,
  setUpCloudKitAuth,
  type CloudKitUserIdentity
} from "@/lib/storage/cloudkit/cloudkit-client";
import {
  captureEncryptedWorkspaceBundle,
  restoreEncryptedWorkspaceBundle,
  type EncryptedWorkspaceBundleSnapshot
} from "@/lib/storage/indexed-db";
import {
  getWorkspaceStoragePreference,
  isCloudStorageProvider,
  setWorkspaceStorageProvider,
  updateWorkspaceStoragePreference,
  type WorkspaceCloudStorageProvider,
  type WorkspaceStoragePreference,
  type WorkspaceStorageProvider
} from "@/lib/storage/storage-preferences";
import {
  bumpWorkspaceMutationEpoch,
  getWorkspaceMutationEpoch,
  withWorkspaceMutationLock
} from "@/lib/storage/workspace-mutation-lock";
import { validateWorkspaceId } from "@/lib/security/workspace-crypto";

const BACKGROUND_UPLOAD_DELAY_MS = 1_500;
// These bound the login/recovery cloud steps. They must exceed the retry
// budget of the operations they wrap (each CloudKit request retries up to
// CLOUDKIT_DB_MAX_ATTEMPTS with linear backoff), or a lossy connection trips
// the timeout mid-retry and the whole first-device join fails even though the
// individual requests are eventually succeeding.
const LOGIN_AUTH_TIMEOUT_MS = 30_000;
const LOGIN_PULL_TIMEOUT_MS = 60_000;
const noSharedVersionHistoryMessage = (label: string) =>
  `The restored local workspace and its ${label} copy have no shared version history. Choose which version to keep.`;

export type WorkspaceCloudSyncAvailability =
  | { available: true }
  | {
      available: false;
      reason: "configuration-missing" | "configuration-invalid" | "browser-unavailable";
      missing: string[];
    };

export type WorkspaceCloudAuthState = {
  configured: boolean;
  signedIn: boolean;
  user: CloudKitUserIdentity | null;
  error: string | null;
};

export type WorkspaceSyncDirection = "none" | "upload" | "download";
export type WorkspaceSyncOutcome =
  | "not-enabled"
  | "unavailable"
  | "offline"
  | "auth-required"
  | "account-mismatch"
  | "pending"
  | "conflict"
  | "synced"
  | "error";

export type WorkspaceSyncResult = {
  workspaceId: string;
  outcome: WorkspaceSyncOutcome;
  direction: WorkspaceSyncDirection;
  didReplaceLocalBundle: boolean;
  preference: WorkspaceStoragePreference;
  user: CloudKitUserIdentity | null;
};

export type WorkspaceConflictResolution = "keep-local" | "use-cloud";

export type WorkspaceCloudSyncOptions = {
  /**
   * A CloudKit identity delivered by Apple's sign-in event. Supplying it avoids
   * asking setUpAuth() to rediscover the same just-completed popup session.
   */
  authenticatedUser?: CloudKitUserIdentity;
  /**
   * Verifies that a downloaded encrypted bundle can be unlocked by the active
   * workspace before the IndexedDB copy is replaced. Auth owns the in-memory
   * master key, so the coordinator accepts a callback instead of retaining it.
   */
  validateRemoteBundle?: (
    snapshot: EncryptedWorkspaceBundleSnapshot
  ) => void | Promise<void>;
  /** Restore a verified remote bundle even when the local IndexedDB copy is missing. */
  forceRemoteRestore?: boolean;
  /**
   * Bound for the login pull's download. A sign-in that already holds the
   * workspace locally passes a short bound so a cloud that refuses or crawls
   * cannot hold the door; the pull then ends as a recorded error.
   */
  downloadTimeoutMs?: number;
};

type WorkspaceSyncErrorCode =
  | "ACCOUNT_MISMATCH"
  | "AUTH_REQUIRED"
  | "LOCAL_WORKSPACE_MISSING"
  | "REMOTE_VALIDATION_FAILED"
  | "REMOTE_VALIDATION_REQUIRED"
  | "REMOTE_WORKSPACE_MISSING"
  | "TIMEOUT";

class WorkspaceSyncError extends Error {
  constructor(
    public readonly code: WorkspaceSyncErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WorkspaceSyncError";
  }
}

const uploadTimers = new Map<string, ReturnType<typeof setTimeout>>();
const syncInFlight = new Map<string, Promise<WorkspaceSyncResult>>();
const localSaveRevisions = new Map<string, number>();

const getLocalSaveRevision = (workspaceId: string) =>
  localSaveRevisions.get(workspaceId) ?? 0;

const noteLocalSaveRevision = (workspaceId: string) => {
  const next = getLocalSaveRevision(workspaceId) + 1;
  localSaveRevisions.set(workspaceId, next);
  return next;
};

const GENERIC_REQUEST_FAILURE = "The CloudKit request failed.";
const MAX_FAILURE_DETAIL_LENGTH = 320;

/** Loose comparison so "CODE: text" and "CODE · text" count as the same detail. */
const normalizeDetail = (text: string) =>
  text.toLowerCase().replace(/[\s·:—–-]+/g, " ").trim();

/** Never let a CloudKit token, Google access token or upload session leak into a visible message. */
export const scrubSecrets = (text: string) =>
  text
    .replace(/(ck(?:API|WebAuth)Token=|access_token=|upload_id=)[^&\s"']+/gi, "$1…")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer …");

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

/**
 * Turn whatever CloudKit JS rejected with (a CKError-like object, a fetch
 * TypeError, a plain Error) into one short human-readable line.
 */
const describeFailureCause = (cause: unknown): string => {
  if (cause === null || cause === undefined) {
    return "";
  }
  if (typeof cause === "string") {
    return cause;
  }
  if (!isPlainRecord(cause)) {
    return String(cause);
  }
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = cause[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  };
  const code = pick("ckErrorCode", "serverErrorCode");
  const status =
    typeof cause.status === "number" && Number.isFinite(cause.status)
      ? `HTTP ${cause.status}`
      : "";
  const reason = pick("reason", "message");
  const name = cause instanceof Error && !code ? cause.name : "";
  // CloudKit JS messages already start with the code ("UNEXPECTED_SERVER_RESPONSE: …").
  const codeAlreadyInReason = Boolean(code) && reason.toUpperCase().startsWith(code);
  const parts = [codeAlreadyInReason ? "" : code, status, reason || name].filter(Boolean);
  if (parts.length === 0 && isPlainRecord(cause.cause)) {
    return describeFailureCause(cause.cause);
  }
  return parts.join(" · ");
};

/** Public detail string for a sync failure: provider message plus the cause. */
export const describeWorkspaceSyncFailure = (error: unknown): string => {
  const ownMessage =
    error instanceof Error && error.message && error.message !== GENERIC_REQUEST_FAILURE
      ? error.message
      : "";
  const causeDetail =
    error instanceof Error ? describeFailureCause((error as { cause?: unknown }).cause) : "";
  // The provider message often already embeds the cause text; keep one copy.
  const sameDetail =
    Boolean(ownMessage && causeDetail) &&
    (normalizeDetail(ownMessage).includes(normalizeDetail(causeDetail)) ||
      normalizeDetail(causeDetail).includes(normalizeDetail(ownMessage)));
  const combined = sameDetail
    ? ownMessage.length >= causeDetail.length
      ? ownMessage
      : causeDetail
    : [ownMessage, causeDetail].filter(Boolean).join(" — ");
  // CloudKit JS hides the HTTP status; quote the last failed response instead.
  const lastResponse =
    (error instanceof CloudProviderError && error.provider === "gdrive") ||
    error instanceof GoogleApiError
      ? ""
      : describeLastFailedCloudKitResponse();
  const detail = lastResponse ? `${combined}; last response: ${lastResponse}` : combined;
  const scrubbed = scrubSecrets(detail).replace(/\s+/g, " ").trim();
  return scrubbed.length > MAX_FAILURE_DETAIL_LENGTH
    ? `${scrubbed.slice(0, MAX_FAILURE_DETAIL_LENGTH - 1)}…`
    : scrubbed;
};

const genericErrorMessage = (error: unknown) => {
  if (error instanceof CloudProviderError) {
    const drive = error.provider === "gdrive";
    const service = drive ? "Google Drive" : "CloudKit";
    switch (error.code) {
      case "AUTH_REQUIRED":
        return drive
          ? "Reconnect Google Drive to continue syncing this workspace."
          : "Sign in to iCloud to continue syncing this workspace.";
      case "CONFLICT":
        return `${service} contains a different version of this workspace.`;
      case "PAYLOAD_TOO_LARGE":
        return `The encrypted workspace is too large to sync to ${service}.`;
      case "INVALID_REMOTE_DATA":
        return `The ${service} workspace is incomplete or failed verification.`;
      case "CRYPTO_UNAVAILABLE":
        return "Secure browser cryptography is unavailable.";
      case "QUOTA_EXCEEDED":
        return drive
          ? "Google Drive storage is full, so the upload was rejected. Free up Drive space and sync again."
          : "iCloud storage is full, so CloudKit rejected the upload. Free up iCloud space (or delete leftover SMOSWorkspaceChunk records) and sync again.";
      case "THROTTLED":
        return `${service} is rate-limiting this device (${describeWorkspaceSyncFailure(error) || "try again later"}).`;
      default: {
        // REQUEST_FAILED covers every server/transport failure (QUOTA_EXCEEDED,
        // BAD_REQUEST, THROTTLED, CORS, 421, 5xx…). Show the actual reason so
        // the storage card is diagnosable instead of a blanket "unreachable".
        const detail = describeWorkspaceSyncFailure(error);
        return detail
          ? `${service} request failed: ${detail}. The local encrypted copy is unchanged.`
          : `${service} could not be reached. The local encrypted copy is unchanged.`;
      }
    }
  }
  if (error instanceof WorkspaceSyncError) {
    return error.message;
  }
  const detail = describeWorkspaceSyncFailure(error);
  return detail
    ? `Cloud sync failed: ${detail}. The local encrypted copy is unchanged.`
    : "Cloud sync failed. The local encrypted copy is unchanged.";
};

/**
 * Production builds strip NODE_ENV-gated debug logs, so sync failures are
 * logged unconditionally (secrets scrubbed) for DevTools diagnosis.
 */
const logSyncFailure = (workspaceId: string, error: unknown) => {
  if (typeof console === "undefined") {
    return;
  }
  const code =
    error instanceof CloudProviderError || error instanceof WorkspaceSyncError
      ? error.code
      : error instanceof Error
        ? error.name
        : typeof error;
  console.warn(
    `[smos-sync] workspace ${workspaceId} failed (${code}): ${describeWorkspaceSyncFailure(error) || "no detail"}`,
    error
  );
};

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new WorkspaceSyncError("TIMEOUT", "The cloud service did not respond in time.")),
      timeoutMs
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

const result = (
  workspaceId: string,
  outcome: WorkspaceSyncOutcome,
  direction: WorkspaceSyncDirection,
  didReplaceLocalBundle: boolean,
  user: CloudKitUserIdentity | null
): WorkspaceSyncResult => ({
  workspaceId,
  outcome,
  direction,
  didReplaceLocalBundle,
  preference: getWorkspaceStoragePreference(workspaceId),
  user
});

const assertCloudKitUserMatches = (workspaceId: string, user: CloudKitUserIdentity) => {
  // Resolve like every other identity comparison (trimmed, lookupInfo
  // fallback); a raw empty userRecordName must not turn this check into a
  // no-op or bind an empty value.
  const userRecordName = getCloudKitUserRecordName(user);
  if (!userRecordName) {
    throw new WorkspaceSyncError(
      "AUTH_REQUIRED",
      "Apple ID did not provide a usable account identity."
    );
  }

  const preference = getWorkspaceStoragePreference(workspaceId);
  if (
    preference.cloudKitUserRecordName &&
    preference.cloudKitUserRecordName !== userRecordName
  ) {
    throw new WorkspaceSyncError(
      "ACCOUNT_MISMATCH",
      "This workspace is linked to a different cloud account."
    );
  }

  return userRecordName;
};

const bindCloudKitUser = (workspaceId: string, user: CloudKitUserIdentity) => {
  const userRecordName = assertCloudKitUserMatches(workspaceId, user);
  const preference = getWorkspaceStoragePreference(workspaceId);

  if (!preference.cloudKitUserRecordName) {
    updateWorkspaceStoragePreference(workspaceId, {
      cloudKitUserRecordName: userRecordName
    });
  }
};

const markAuthRequired = (workspaceId: string, adapter: CloudAdapter) =>
  updateWorkspaceStoragePreference(workspaceId, {
    status: "auth-required",
    lastError: adapter.authRequiredMessage
  });

/**
 * The auth re-check inside a sync throws CloudKitClientError, not the
 * provider's error class. Without this it was recorded as a generic failure
 * and the card never asked the user to sign in again.
 */
const isClientAuthRequired = (error: unknown) =>
  error instanceof CloudKitClientError && error.code === "AUTH_REQUIRED";

const isClientAccountMismatch = (error: unknown) =>
  error instanceof CloudKitClientError && error.code === "ACCOUNT_MISMATCH";

const markAccountMismatch = (workspaceId: string, error: unknown) =>
  updateWorkspaceStoragePreference(workspaceId, {
    status: "account-mismatch",
    lastError: genericErrorMessage(error)
  });

const markConflict = (workspaceId: string, message: string) =>
  updateWorkspaceStoragePreference(workspaceId, {
    status: "conflict",
    pendingUpload: true,
    lastError: message
  });

const TRANSPORT_FAILURE_PATTERN =
  /NETWORK_ERROR|UNEXPECTED_SERVER_RESPONSE|SERVICE_UNAVAILABLE|TRY_AGAIN_LATER|timed out|Failed to fetch|no response/i;

const isTransportFailure = (error: unknown) =>
  error instanceof CloudProviderError &&
  error.provider === "cloudkit" &&
  (error.code === "REQUEST_FAILED" || error.code === "THROTTLED") &&
  TRANSPORT_FAILURE_PATTERN.test(describeWorkspaceSyncFailure(error));

const markError = (workspaceId: string, error: unknown) => {
  logSyncFailure(workspaceId, error);
  const message = genericErrorMessage(error);
  updateWorkspaceStoragePreference(workspaceId, {
    status: "error",
    lastError: message
  });
  if (!isTransportFailure(error)) {
    return;
  }
  // Append a reachability verdict once it is known, unless a newer attempt
  // has replaced the status in the meantime.
  void probeCloudKitReachability().then((summary) => {
    if (!summary) {
      return;
    }
    console.warn(`[smos-sync] ${summary}`);
    const current = getWorkspaceStoragePreference(workspaceId);
    if (current.status === "error" && current.lastError === message) {
      updateWorkspaceStoragePreference(workspaceId, { lastError: `${message} ${summary}` });
    }
  });
};

const markSynced = (
  workspaceId: string,
  user: CloudKitUserIdentity,
  manifestChangeTag: string
) =>
  updateWorkspaceStoragePreference(workspaceId, {
    status: "synced",
    pendingUpload: false,
    lastError: null,
    lastSyncAt: new Date().toISOString(),
    cloudKitUserRecordName: user.userRecordName,
    cloudManifestChangeTag: manifestChangeTag
  });

const captureRequiredLocalBundle = async (workspaceId: string) => {
  const snapshot = await captureEncryptedWorkspaceBundle(workspaceId);
  if (snapshot.workspaceRecord === null) {
    throw new WorkspaceSyncError(
      "LOCAL_WORKSPACE_MISSING",
      "The local encrypted workspace is missing."
    );
  }
  return snapshot;
};

const remoteChangedSinceLastSync = (
  preference: WorkspaceStoragePreference,
  remote: CloudDownload
) =>
  preference.cloudManifestChangeTag === null ||
  preference.cloudManifestChangeTag !== remote.manifest.recordChangeTag;

const encryptedWorkspaceRecordsMatch = (
  left: EncryptedWorkspaceBundleSnapshot,
  right: EncryptedWorkspaceBundleSnapshot
) => {
  const leftRecord = left.workspaceRecord;
  const rightRecord = right.workspaceRecord;

  if (!leftRecord || !rightRecord) {
    return leftRecord === rightRecord;
  }

  return (
    leftRecord.updatedAt === rightRecord.updatedAt &&
    leftRecord.keyDerivation.salt === rightRecord.keyDerivation.salt &&
    leftRecord.encryptedPayload.iv === rightRecord.encryptedPayload.iv &&
    leftRecord.encryptedPayload.ciphertext === rightRecord.encryptedPayload.ciphertext
  );
};

const validateRemoteBundleBeforeRestore = async (
  remote: CloudDownload,
  options: WorkspaceCloudSyncOptions
) => {
  if (!options.validateRemoteBundle) {
    throw new WorkspaceSyncError(
      "REMOTE_VALIDATION_REQUIRED",
      "The cloud copy was not applied because the active workspace key was unavailable."
    );
  }

  try {
    await options.validateRemoteBundle(remote.snapshot);
  } catch {
    throw new WorkspaceSyncError(
      "REMOTE_VALIDATION_FAILED",
      "The cloud copy does not match this workspace. The local encrypted copy is unchanged."
    );
  }
};

type RemoteRestoreGuard = {
  expectedLocal?: EncryptedWorkspaceBundleSnapshot;
  expectedLocalWasInvalid?: boolean;
  expectedLocalSaveRevision?: number;
  expectedMutationEpoch: number;
  allowPendingUpload?: boolean;
  conflictMessage: string;
};

type RemoteRestoreOutcome = "restored" | "conflict" | "stale";
type SyncFinalizationOutcome = "synced" | "pending" | "stale";
type CloudSyncStartGuard = {
  mutationEpoch: number;
  provider: WorkspaceStoragePreference["provider"];
  cloudKitUserRecordName: string | null;
};

const captureCloudSyncStartGuard = (workspaceId: string): CloudSyncStartGuard => {
  const preference = getWorkspaceStoragePreference(workspaceId);
  return {
    mutationEpoch: getWorkspaceMutationEpoch(workspaceId),
    provider: preference.provider,
    cloudKitUserRecordName: preference.cloudKitUserRecordName
  };
};

const cloudSyncStartGuardStillMatches = (
  workspaceId: string,
  guard: CloudSyncStartGuard
) => {
  const preference = getWorkspaceStoragePreference(workspaceId);
  return (
    getWorkspaceMutationEpoch(workspaceId) === guard.mutationEpoch &&
    preference.provider === guard.provider &&
    preference.cloudKitUserRecordName === guard.cloudKitUserRecordName
  );
};

const cloudBindingStillMatches = (
  workspaceId: string,
  user: CloudKitUserIdentity,
  preference = getWorkspaceStoragePreference(workspaceId)
) =>
  isCloudStorageProvider(preference.provider) &&
  preference.cloudKitUserRecordName === user.userRecordName;

const staleSyncResult = (workspaceId: string): WorkspaceSyncResult => {
  const preference = getWorkspaceStoragePreference(workspaceId);
  let outcome: WorkspaceSyncOutcome = "pending";

  if (!isCloudStorageProvider(preference.provider)) {
    outcome = "not-enabled";
  } else if (
    preference.status === "auth-required" ||
    preference.cloudKitUserRecordName === null
  ) {
    outcome = "auth-required";
  } else if (preference.status === "account-mismatch") {
    outcome = "account-mismatch";
  } else if (preference.status === "conflict") {
    outcome = "conflict";
  } else if (preference.status === "error") {
    outcome = "error";
  }

  return result(workspaceId, outcome, "none", false, null);
};

// ---------------------------------------------------------------------------
// Provider adapters. The state machine below never talks to CloudKit or Google
// Drive directly: it binds an identity, downloads a snapshot with a change
// tag, and uploads a snapshot against an expected tag. Both providers expose
// identities shaped like CloudKit's (userRecordName plus optional display
// fields), so binding and account checks are shared.
// ---------------------------------------------------------------------------

type CloudDownload = {
  snapshot: EncryptedWorkspaceBundleSnapshot;
  manifest: { recordChangeTag: string };
};

type IdentityLookupMode = {
  timeoutMs?: number;
  /**
   * How a caller-supplied identity (options.authenticatedUser) is treated:
   * re-verified against the live session, trusted as-is (login just produced
   * it), or ignored.
   */
  useProvided?: "verify" | "trust" | "ignore";
};

type CloudAdapter = {
  provider: WorkspaceCloudStorageProvider;
  label: string;
  authRequiredMessage: string;
  availability: (workspaceId: string) => WorkspaceCloudSyncAvailability;
  getIdentity: (
    workspaceId: string,
    options: WorkspaceCloudSyncOptions,
    mode: IdentityLookupMode
  ) => Promise<CloudKitUserIdentity | null>;
  assertIdentity: (workspaceId: string, user: CloudKitUserIdentity) => Promise<CloudKitUserIdentity>;
  download: (workspaceId: string) => Promise<CloudDownload | null>;
  upload: (
    snapshot: EncryptedWorkspaceBundleSnapshot,
    expectedManifestChangeTag: string | null
  ) => Promise<{ recordChangeTag: string }>;
  isAuthRequiredError: (error: unknown) => boolean;
  isAccountMismatchError: (error: unknown) => boolean;
  isConflictError: (error: unknown) => boolean;
};

const cloudKitAdapter: CloudAdapter = {
  provider: "cloudkit",
  label: "iCloud",
  authRequiredMessage: "Sign in to iCloud to sync this workspace.",
  availability: () => getWorkspaceCloudSyncAvailability(),
  getIdentity: async (_workspaceId, options, mode) => {
    if (options.authenticatedUser && mode.useProvided !== "ignore") {
      return mode.useProvided === "trust"
        ? options.authenticatedUser
        : assertCloudKitAuthenticatedUser(options.authenticatedUser);
    }
    const authentication = setUpCloudKitAuth();
    return mode.timeoutMs ? withTimeout(authentication, mode.timeoutMs) : authentication;
  },
  assertIdentity: (_workspaceId, user) => assertCloudKitAuthenticatedUser(user),
  download: (workspaceId) => downloadEncryptedWorkspaceBundleFromCloudKit(workspaceId),
  upload: async (snapshot, expectedManifestChangeTag) => {
    const uploaded = await uploadEncryptedWorkspaceBundleToCloudKit(snapshot, {
      expectedManifestChangeTag
    });
    return { recordChangeTag: uploaded.manifest.recordChangeTag };
  },
  isAuthRequiredError: (error) =>
    (error instanceof CloudProviderError && error.code === "AUTH_REQUIRED") ||
    isClientAuthRequired(error),
  isAccountMismatchError: (error) => isClientAccountMismatch(error),
  isConflictError: (error) => error instanceof CloudProviderError && error.code === "CONFLICT"
};

const googleDriveAdapter: CloudAdapter = {
  provider: "gdrive",
  label: "Google Drive",
  authRequiredMessage: "Reconnect Google Drive to sync this workspace.",
  availability: (workspaceId) => {
    if (typeof window === "undefined") {
      return { available: false, reason: "browser-unavailable", missing: [] };
    }
    const status = getGoogleDriveConfigurationStatus(workspaceId);
    return status.configured
      ? { available: true }
      : { available: false, reason: "configuration-missing", missing: ["clientId"] };
  },
  // Never opens Google UI: a missing token surfaces as auth-required and the
  // storage card asks for one click.
  getIdentity: async (workspaceId, _options, mode) => {
    const lookup = getGoogleDriveIdentity(workspaceId);
    return mode.timeoutMs ? withTimeout(lookup, mode.timeoutMs) : lookup;
  },
  assertIdentity: (workspaceId, user) => assertGoogleDriveAuthenticatedUser(workspaceId, user),
  download: (workspaceId) => downloadEncryptedWorkspaceBundleFromGoogleDrive(workspaceId),
  upload: async (snapshot, expectedManifestChangeTag) => {
    const uploaded = await uploadEncryptedWorkspaceBundleToGoogleDrive(snapshot, {
      expectedManifestChangeTag
    });
    return { recordChangeTag: uploaded.manifest.recordChangeTag };
  },
  isAuthRequiredError: (error) =>
    error instanceof CloudProviderError && error.code === "AUTH_REQUIRED",
  isAccountMismatchError: (error) =>
    error instanceof CloudProviderError && error.code === "ACCOUNT_MISMATCH",
  isConflictError: (error) => error instanceof CloudProviderError && error.code === "CONFLICT"
};

const adapterFor = (provider: WorkspaceStorageProvider): CloudAdapter | null =>
  provider === "cloudkit" ? cloudKitAdapter : provider === "gdrive" ? googleDriveAdapter : null;

/**
 * Applies a verified cloud snapshot while holding the same lock as local
 * persistence. The final fingerprint check happens inside that lock so a save
 * cannot slip between the guard and the IndexedDB replacement.
 */
const restoreRemoteBundleUnderMutationLock = async (
  workspaceId: string,
  user: CloudKitUserIdentity,
  remote: CloudDownload,
  guard: RemoteRestoreGuard
): Promise<RemoteRestoreOutcome> =>
  withWorkspaceMutationLock(workspaceId, async () => {
    const preference = getWorkspaceStoragePreference(workspaceId);

    // A whole-site restore deliberately removes the device-bound CloudKit
    // identity and change tag. An older sync must not silently attach them
    // again after that restore has completed.
    if (!cloudBindingStillMatches(workspaceId, user, preference)) {
      return "stale";
    }

    const revisionChanged =
      guard.expectedLocalSaveRevision !== undefined &&
      getLocalSaveRevision(workspaceId) !== guard.expectedLocalSaveRevision;
    const mutationEpochChanged =
      getWorkspaceMutationEpoch(workspaceId) !== guard.expectedMutationEpoch;
    const pendingChanged = !guard.allowPendingUpload && preference.pendingUpload;
    let latestLocal: EncryptedWorkspaceBundleSnapshot | null = null;
    let latestLocalWasInvalid = false;
    if (guard.expectedLocal || guard.expectedLocalWasInvalid) {
      try {
        latestLocal = await captureEncryptedWorkspaceBundle(workspaceId);
      } catch {
        latestLocalWasInvalid = true;
      }
    }
    const localStateChanged = guard.expectedLocalWasInvalid
      ? !latestLocalWasInvalid
      : Boolean(
          guard.expectedLocal &&
            (latestLocalWasInvalid ||
              !latestLocal ||
              !encryptedWorkspaceRecordsMatch(latestLocal, guard.expectedLocal))
        );

    if (revisionChanged || mutationEpochChanged || pendingChanged || localStateChanged) {
      markConflict(workspaceId, guard.conflictMessage);
      return "conflict";
    }

    await restoreEncryptedWorkspaceBundle(remote.snapshot);
    bumpWorkspaceMutationEpoch(workspaceId);
    markSynced(workspaceId, user, remote.manifest.recordChangeTag);
    return "restored";
  });

const markSyncedIfLocalUnchangedUnderMutationLock = async (
  workspaceId: string,
  user: CloudKitUserIdentity,
  expectedLocal: EncryptedWorkspaceBundleSnapshot,
  expectedLocalSaveRevision: number,
  expectedMutationEpoch: number,
  manifestChangeTag: string
): Promise<SyncFinalizationOutcome> => {
  const finalization = await withWorkspaceMutationLock(workspaceId, async () => {
    const preference = getWorkspaceStoragePreference(workspaceId);

    if (!cloudBindingStillMatches(workspaceId, user, preference)) {
      return "stale" as const;
    }

    let latestLocal: EncryptedWorkspaceBundleSnapshot | null = null;
    try {
      latestLocal = await captureEncryptedWorkspaceBundle(workspaceId);
    } catch {
      // A newly unreadable local record must never be marked as synchronized.
    }

    if (
      !isCloudStorageProvider(preference.provider) ||
      getLocalSaveRevision(workspaceId) !== expectedLocalSaveRevision ||
      getWorkspaceMutationEpoch(workspaceId) !== expectedMutationEpoch ||
      !latestLocal ||
      !encryptedWorkspaceRecordsMatch(latestLocal, expectedLocal)
    ) {
      updateWorkspaceStoragePreference(workspaceId, {
        status: "pending",
        pendingUpload: true,
        lastError: null,
        lastSyncAt: new Date().toISOString(),
        cloudManifestChangeTag: manifestChangeTag
      });
      return "pending" as const;
    }

    markSynced(workspaceId, user, manifestChangeTag);
    return "synced" as const;
  });

  if (finalization === "pending") {
    scheduleWorkspaceCloudUpload(workspaceId);
  }
  return finalization;
};

const uploadLocalBundle = async (
  adapter: CloudAdapter,
  workspaceId: string,
  user: CloudKitUserIdentity,
  local: EncryptedWorkspaceBundleSnapshot,
  expectedManifestChangeTag: string | null,
  localSaveRevision: number,
  mutationEpoch: number
) => {
  await adapter.assertIdentity(workspaceId, user);
  const uploaded = await adapter.upload(local, expectedManifestChangeTag);
  try {
    await adapter.assertIdentity(workspaceId, user);
  } catch (error) {
    // The upload did commit. Remember its revision even though the session
    // lapsed (a Drive token can expire during a long upload), so the next
    // sync compares against this version instead of raising a phantom
    // conflict with the device's own upload.
    updateWorkspaceStoragePreference(workspaceId, {
      cloudManifestChangeTag: uploaded.recordChangeTag
    });
    throw error;
  }

  // The final fingerprint check and status update share the local persistence
  // lock, so another tab cannot save between them and have pending cleared.
  const finalization = await markSyncedIfLocalUnchangedUnderMutationLock(
    workspaceId,
    user,
    local,
    localSaveRevision,
    mutationEpoch,
    uploaded.recordChangeTag
  );
  if (finalization === "stale") {
    return staleSyncResult(workspaceId);
  }
  if (finalization === "pending") {
    return result(workspaceId, "pending", "upload", false, user);
  }

  return result(workspaceId, "synced", "upload", false, user);
};

const manualSyncInternal = async (
  workspaceId: string,
  options: WorkspaceCloudSyncOptions,
  startGuard: CloudSyncStartGuard
): Promise<WorkspaceSyncResult> => {
  if (!cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
    return staleSyncResult(workspaceId);
  }

  let preference = getWorkspaceStoragePreference(workspaceId);
  const adapter = adapterFor(preference.provider);
  if (!adapter) {
    return result(workspaceId, "not-enabled", "none", false, null);
  }

  const availability = adapter.availability(workspaceId);
  if (!availability.available) {
    markError(workspaceId, new Error(`${adapter.label} is not configured.`));
    return result(workspaceId, "unavailable", "none", false, null);
  }
  if (isOffline()) {
    updateWorkspaceStoragePreference(workspaceId, {
      status: "pending",
      lastError: `${adapter.label} sync is waiting for a network connection.`
    });
    return result(workspaceId, "offline", "none", false, null);
  }

  let user: CloudKitUserIdentity | null = null;
  let bindingEstablished = false;
  try {
    user = await adapter.getIdentity(workspaceId, options, { useProvided: "verify" });
    if (!cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
      return staleSyncResult(workspaceId);
    }
    if (!user) {
      markAuthRequired(workspaceId, adapter);
      return result(workspaceId, "auth-required", "none", false, null);
    }
    assertCloudKitUserMatches(workspaceId, user);
    bindCloudKitUser(workspaceId, user);
    bindingEstablished = true;
    updateWorkspaceStoragePreference(workspaceId, { status: "syncing", lastError: null });
    preference = getWorkspaceStoragePreference(workspaceId);
    const localSaveRevision = getLocalSaveRevision(workspaceId);
    const mutationEpoch = getWorkspaceMutationEpoch(workspaceId);

    const [local, remote] = await Promise.all([
      captureRequiredLocalBundle(workspaceId),
      adapter.download(workspaceId)
    ]);
    user = await adapter.assertIdentity(workspaceId, user);
    preference = getWorkspaceStoragePreference(workspaceId);

    if (!cloudBindingStillMatches(workspaceId, user, preference)) {
      return staleSyncResult(workspaceId);
    }

    if (!remote) {
      if (!preference.pendingUpload) {
        const missingRemote = new WorkspaceSyncError(
          "REMOTE_WORKSPACE_MISSING",
          `No ${adapter.label} copy was found for this restored workspace. Verify the connected account; the local encrypted copy is unchanged.`
        );
        markError(workspaceId, missingRemote);
        return result(workspaceId, "error", "none", false, user);
      }
      return await uploadLocalBundle(
        adapter,
        workspaceId,
        user,
        local,
        null,
        localSaveRevision,
        mutationEpoch
      );
    }

    // A restored full-site backup deliberately has no device-bound change tag.
    // Without shared version history, device clocks cannot safely decide which
    // encrypted copy should replace the other.
    if (!preference.pendingUpload && preference.cloudManifestChangeTag === null) {
      await validateRemoteBundleBeforeRestore(remote, options);

      if (!cloudBindingStillMatches(workspaceId, user)) {
        return staleSyncResult(workspaceId);
      }
      if (
        getLocalSaveRevision(workspaceId) !== localSaveRevision ||
        getWorkspaceMutationEpoch(workspaceId) !== mutationEpoch
      ) {
        const message = `The local workspace changed while its restored ${adapter.label} copy was being checked. Sync again to avoid overwriting either version.`;
        markConflict(workspaceId, message);
        return result(workspaceId, "conflict", "none", false, user);
      }

      if (!encryptedWorkspaceRecordsMatch(local, remote.snapshot)) {
        markConflict(workspaceId, noSharedVersionHistoryMessage(adapter.label));
        return result(workspaceId, "conflict", "none", false, user);
      }

      const settled = await markSyncedIfLocalUnchangedUnderMutationLock(
        workspaceId,
        user,
        local,
        localSaveRevision,
        mutationEpoch,
        remote.manifest.recordChangeTag
      );
      if (settled === "stale") {
        return staleSyncResult(workspaceId);
      }
      if (settled === "pending") {
        return result(workspaceId, "pending", "none", false, user);
      }
      return result(workspaceId, "synced", "none", false, user);
    }

    if (preference.pendingUpload) {
      if (remoteChangedSinceLastSync(preference, remote)) {
        const message = `Both the local workspace and its ${adapter.label} copy have changes. Resolve the conflict before syncing.`;
        markConflict(workspaceId, message);
        return result(workspaceId, "conflict", "none", false, user);
      }
      return await uploadLocalBundle(
        adapter,
        workspaceId,
        user,
        local,
        remote.manifest.recordChangeTag,
        localSaveRevision,
        mutationEpoch
      );
    }

    if (!remoteChangedSinceLastSync(preference, remote)) {
      const settled = await markSyncedIfLocalUnchangedUnderMutationLock(
        workspaceId,
        user,
        local,
        localSaveRevision,
        mutationEpoch,
        remote.manifest.recordChangeTag
      );
      if (settled === "stale") {
        return staleSyncResult(workspaceId);
      }
      if (settled === "pending") {
        return result(workspaceId, "pending", "none", false, user);
      }
      return result(workspaceId, "synced", "none", false, user);
    }

    await validateRemoteBundleBeforeRestore(remote, options);
    if (
      !cloudBindingStillMatches(workspaceId, user) ||
      getLocalSaveRevision(workspaceId) !== localSaveRevision ||
      getWorkspaceMutationEpoch(workspaceId) !== mutationEpoch
    ) {
      if (!cloudBindingStillMatches(workspaceId, user)) {
        return staleSyncResult(workspaceId);
      }
      const message = `The local workspace changed while ${adapter.label} was being checked. Sync again to avoid overwriting either version.`;
      markConflict(workspaceId, message);
      return result(workspaceId, "conflict", "none", false, user);
    }
    const restored = await restoreRemoteBundleUnderMutationLock(
      workspaceId,
      user,
      remote,
      {
        expectedLocal: local,
        expectedLocalSaveRevision: localSaveRevision,
        expectedMutationEpoch: mutationEpoch,
        conflictMessage: `The local workspace changed while ${adapter.label} was being applied. Review both versions again.`
      }
    );
    if (restored === "stale") {
      return staleSyncResult(workspaceId);
    }
    if (restored === "conflict") {
      return result(workspaceId, "conflict", "none", false, user);
    }
    return result(workspaceId, "synced", "download", true, user);
  } catch (error) {
    if (!bindingEstablished && !cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
      return staleSyncResult(workspaceId);
    }
    if (bindingEstablished && user && !cloudBindingStillMatches(workspaceId, user)) {
      return staleSyncResult(workspaceId);
    }
    if (adapter.isAuthRequiredError(error)) {
      markAuthRequired(workspaceId, adapter);
      return result(workspaceId, "auth-required", "none", false, user);
    }
    if (
      (error instanceof WorkspaceSyncError && error.code === "ACCOUNT_MISMATCH") ||
      adapter.isAccountMismatchError(error)
    ) {
      markAccountMismatch(workspaceId, error);
      return result(workspaceId, "account-mismatch", "none", false, user);
    }
    if (adapter.isConflictError(error)) {
      markConflict(workspaceId, genericErrorMessage(error));
      return result(workspaceId, "conflict", "none", false, user);
    }
    markError(workspaceId, error);
    return result(workspaceId, "error", "none", false, user);
  }
};

const runExclusive = (workspaceId: string, operation: () => Promise<WorkspaceSyncResult>) => {
  const existing = syncInFlight.get(workspaceId);
  if (existing) {
    return existing;
  }

  const runWithBrowserLock = async (): Promise<WorkspaceSyncResult> => {
    if (typeof navigator === "undefined" || !navigator.locks) {
      return operation();
    }

    return await navigator.locks.request<Promise<WorkspaceSyncResult>>(
      `studio-map-os.cloudkit-sync.${workspaceId}`,
      { mode: "exclusive" },
      () => operation()
    );
  };

  const current = runWithBrowserLock().finally(() => {
    if (syncInFlight.get(workspaceId) === current) {
      syncInFlight.delete(workspaceId);
    }
  });
  syncInFlight.set(workspaceId, current);
  return current;
};

export function getWorkspaceCloudSyncAvailability(): WorkspaceCloudSyncAvailability {
  if (typeof window === "undefined") {
    return { available: false, reason: "browser-unavailable", missing: [] };
  }

  const status = getCloudKitConfigurationStatus();
  if (!status.configured) {
    return {
      available: false,
      reason: status.invalidEnvironment ? "configuration-invalid" : "configuration-missing",
      missing: status.missing
    };
  }

  return { available: true };
}

export async function getWorkspaceCloudAuthState(): Promise<WorkspaceCloudAuthState> {
  const availability = getWorkspaceCloudSyncAvailability();
  if (!availability.available) {
    return {
      configured: false,
      signedIn: false,
      user: null,
      error: availability.reason
    };
  }

  try {
    const user = await setUpCloudKitAuth();
    return { configured: true, signedIn: Boolean(user), user, error: null };
  } catch (error) {
    return {
      configured: true,
      signedIn: false,
      user: null,
      error: genericErrorMessage(error)
    };
  }
}

export function noteWorkspaceLocalSave(workspaceIdInput: string) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const preference = getWorkspaceStoragePreference(workspaceId);
  if (!isCloudStorageProvider(preference.provider)) {
    return preference;
  }

  noteLocalSaveRevision(workspaceId);

  // An unresolved conflict must stay visible until the user picks a side;
  // flipping back to "pending" here would hide it and let scheduled uploads
  // race the pending decision.
  if (preference.status === "conflict") {
    return preference;
  }

  const next = updateWorkspaceStoragePreference(workspaceId, {
    status: "pending",
    pendingUpload: true,
    lastError: null
  });
  scheduleWorkspaceCloudUpload(workspaceId);
  return next;
}

export function scheduleWorkspaceCloudUpload(
  workspaceIdInput: string,
  delayMs = BACKGROUND_UPLOAD_DELAY_MS
) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const preference = getWorkspaceStoragePreference(workspaceId);
  if (!isCloudStorageProvider(preference.provider) || !preference.pendingUpload) {
    return false;
  }

  const existing = uploadTimers.get(workspaceId);
  if (existing) {
    clearTimeout(existing);
  }

  const startGuard = captureCloudSyncStartGuard(workspaceId);
  const timer = setTimeout(() => {
    uploadTimers.delete(workspaceId);
    void runExclusive(workspaceId, () =>
      manualSyncInternal(workspaceId, {}, startGuard)
    );
  }, Math.max(0, delayMs));
  uploadTimers.set(workspaceId, timer);
  return true;
}

export function cancelWorkspaceCloudUpload(workspaceIdInput: string) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const existing = uploadTimers.get(workspaceId);
  if (!existing) {
    return false;
  }
  clearTimeout(existing);
  uploadTimers.delete(workspaceId);
  return true;
}

export async function manualSyncWorkspace(
  workspaceIdInput: string,
  options: WorkspaceCloudSyncOptions = {}
) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  cancelWorkspaceCloudUpload(workspaceId);
  const startGuard = captureCloudSyncStartGuard(workspaceId);
  return runExclusive(workspaceId, () =>
    manualSyncInternal(workspaceId, options, startGuard)
  );
}

export async function resolveWorkspaceCloudConflict(
  workspaceIdInput: string,
  resolution: WorkspaceConflictResolution,
  options: WorkspaceCloudSyncOptions = {}
): Promise<WorkspaceSyncResult> {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  cancelWorkspaceCloudUpload(workspaceId);
  const startGuard = captureCloudSyncStartGuard(workspaceId);

  return runExclusive(workspaceId, async () => {
    if (!cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
      return staleSyncResult(workspaceId);
    }

    const preference = getWorkspaceStoragePreference(workspaceId);
    const adapter = adapterFor(preference.provider);
    if (!adapter) {
      return result(workspaceId, "not-enabled", "none", false, null);
    }
    if (isOffline()) {
      updateWorkspaceStoragePreference(workspaceId, {
        status: "conflict",
        lastError: `Connect to the internet before resolving this ${adapter.label} conflict.`
      });
      return result(workspaceId, "offline", "none", false, null);
    }

    let user: CloudKitUserIdentity | null = null;
    let bindingEstablished = false;
    try {
      user = await adapter.getIdentity(workspaceId, options, { useProvided: "ignore" });
      if (!cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
        return staleSyncResult(workspaceId);
      }
      if (!user) {
        markAuthRequired(workspaceId, adapter);
        return result(workspaceId, "auth-required", "none", false, null);
      }
      assertCloudKitUserMatches(workspaceId, user);
      bindCloudKitUser(workspaceId, user);
      bindingEstablished = true;

      const localSaveRevision = getLocalSaveRevision(workspaceId);
      const mutationEpoch = getWorkspaceMutationEpoch(workspaceId);
      const [local, remote] = await Promise.all([
        captureRequiredLocalBundle(workspaceId),
        adapter.download(workspaceId)
      ]);

      if (!cloudBindingStillMatches(workspaceId, user)) {
        return staleSyncResult(workspaceId);
      }

      if (!remote) {
        if (resolution === "use-cloud" || !preference.cloudKitUserRecordName) {
          const missingRemote = new WorkspaceSyncError(
            "REMOTE_WORKSPACE_MISSING",
            `No verified ${adapter.label} copy is available. The local encrypted copy is unchanged.`
          );
          markError(workspaceId, missingRemote);
          return result(workspaceId, "error", "none", false, user);
        }

        return await uploadLocalBundle(
          adapter,
          workspaceId,
          user,
          local,
          null,
          localSaveRevision,
          mutationEpoch
        );
      }

      await validateRemoteBundleBeforeRestore(remote, options);

      if (resolution === "keep-local") {
        return await uploadLocalBundle(
          adapter,
          workspaceId,
          user,
          local,
          remote.manifest.recordChangeTag,
          localSaveRevision,
          mutationEpoch
        );
      }

      const latestLocal = await captureRequiredLocalBundle(workspaceId);
      if (!cloudBindingStillMatches(workspaceId, user)) {
        return staleSyncResult(workspaceId);
      }
      if (
        getLocalSaveRevision(workspaceId) !== localSaveRevision ||
        getWorkspaceMutationEpoch(workspaceId) !== mutationEpoch ||
        !encryptedWorkspaceRecordsMatch(latestLocal, local)
      ) {
        const message = `The local workspace changed while the ${adapter.label} conflict was being resolved. Review both versions again.`;
        markConflict(workspaceId, message);
        return result(workspaceId, "conflict", "none", false, user);
      }

      const restored = await restoreRemoteBundleUnderMutationLock(
        workspaceId,
        user,
        remote,
        {
          expectedLocal: local,
          expectedLocalSaveRevision: localSaveRevision,
          expectedMutationEpoch: mutationEpoch,
          allowPendingUpload: true,
          conflictMessage: `The local workspace changed while the ${adapter.label} conflict was being resolved. Review both versions again.`
        }
      );
      if (restored === "stale") {
        return staleSyncResult(workspaceId);
      }
      if (restored === "conflict") {
        return result(workspaceId, "conflict", "none", false, user);
      }
      return result(workspaceId, "synced", "download", true, user);
    } catch (error) {
      if (!bindingEstablished && !cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
        return staleSyncResult(workspaceId);
      }
      if (bindingEstablished && user && !cloudBindingStillMatches(workspaceId, user)) {
        return staleSyncResult(workspaceId);
      }
      if (adapter.isAuthRequiredError(error)) {
        markAuthRequired(workspaceId, adapter);
        return result(workspaceId, "auth-required", "none", false, user);
      }
      if (
        (error instanceof WorkspaceSyncError && error.code === "ACCOUNT_MISMATCH") ||
        adapter.isAccountMismatchError(error)
      ) {
        markAccountMismatch(workspaceId, error);
        return result(workspaceId, "account-mismatch", "none", false, user);
      }
      if (adapter.isConflictError(error)) {
        markConflict(workspaceId, genericErrorMessage(error));
        return result(workspaceId, "conflict", "none", false, user);
      }
      markError(workspaceId, error);
      return result(workspaceId, "error", "none", false, user);
    }
  });
}

export async function pullWorkspaceFromCloudOnLogin(
  workspaceIdInput: string,
  options: WorkspaceCloudSyncOptions = {}
): Promise<WorkspaceSyncResult> {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const preference = getWorkspaceStoragePreference(workspaceId);
  const adapter = adapterFor(preference.provider);
  if (!adapter) {
    return result(workspaceId, "not-enabled", "none", false, null);
  }

  const availability = adapter.availability(workspaceId);
  if (!availability.available) {
    return result(workspaceId, "unavailable", "none", false, null);
  }
  if (isOffline()) {
    return result(workspaceId, "offline", "none", false, null);
  }

  const startGuard = captureCloudSyncStartGuard(workspaceId);
  return runExclusive(workspaceId, async () => {
    if (!cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
      return staleSyncResult(workspaceId);
    }

    let user: CloudKitUserIdentity | null = null;
    let bindingEstablished = false;
    try {
      user = await adapter.getIdentity(workspaceId, options, {
        timeoutMs: LOGIN_AUTH_TIMEOUT_MS,
        useProvided: "trust"
      });
      if (!cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
        return staleSyncResult(workspaceId);
      }
      if (!user) {
        markAuthRequired(workspaceId, adapter);
        return result(workspaceId, "auth-required", "none", false, null);
      }
      assertCloudKitUserMatches(workspaceId, user);
      bindCloudKitUser(workspaceId, user);
      bindingEstablished = true;

      const remote = await withTimeout(
        adapter.download(workspaceId),
        options.downloadTimeoutMs ?? LOGIN_PULL_TIMEOUT_MS
      );
      const current = getWorkspaceStoragePreference(workspaceId);

      if (!cloudBindingStillMatches(workspaceId, user, current)) {
        return staleSyncResult(workspaceId);
      }

      if (!remote) {
        if (!current.pendingUpload) {
          const missingRemote = new WorkspaceSyncError(
            "REMOTE_WORKSPACE_MISSING",
            `No ${adapter.label} copy was found for this restored workspace. Verify the connected account; the local encrypted copy is unchanged.`
          );
          markError(workspaceId, missingRemote);
          return result(workspaceId, "error", "none", false, user);
        }
        updateWorkspaceStoragePreference(workspaceId, {
          status: "pending",
          pendingUpload: true,
          lastError: null
        });
        scheduleWorkspaceCloudUpload(workspaceId);
        return result(workspaceId, "pending", "none", false, user);
      }

      if (options.forceRemoteRestore) {
        const localSaveRevision = getLocalSaveRevision(workspaceId);
        const mutationEpoch = getWorkspaceMutationEpoch(workspaceId);
        let local: EncryptedWorkspaceBundleSnapshot | undefined;
        let localWasInvalid = false;
        try {
          local = await captureEncryptedWorkspaceBundle(workspaceId);
        } catch {
          localWasInvalid = true;
        }
        await validateRemoteBundleBeforeRestore(remote, options);
        const restored = await restoreRemoteBundleUnderMutationLock(
          workspaceId,
          user,
          remote,
          {
            expectedLocal: local,
            expectedLocalWasInvalid: localWasInvalid,
            expectedLocalSaveRevision: localSaveRevision,
            expectedMutationEpoch: mutationEpoch,
            // A forced restore (new-device join, missing/unreadable local copy)
            // exists to overwrite local from cloud. Enabling a cloud provider
            // sets pendingUpload=true as a side effect, but there is no real
            // local content to preserve here, so that flag must not block the
            // restore. The expectedLocal / revision / epoch guards still catch
            // genuine concurrent local changes.
            allowPendingUpload: true,
            conflictMessage: `The local workspace changed while its ${adapter.label} recovery copy was being applied. Try signing in again.`
          }
        );
        if (restored === "stale") {
          return staleSyncResult(workspaceId);
        }
        if (restored === "conflict") {
          return result(workspaceId, "conflict", "none", false, user);
        }
        return result(workspaceId, "synced", "download", true, user);
      }

      if (!current.pendingUpload && current.cloudManifestChangeTag === null) {
        const localSaveRevision = getLocalSaveRevision(workspaceId);
        const mutationEpoch = getWorkspaceMutationEpoch(workspaceId);
        const local = await captureRequiredLocalBundle(workspaceId);
        await validateRemoteBundleBeforeRestore(remote, options);

        if (!cloudBindingStillMatches(workspaceId, user)) {
          return staleSyncResult(workspaceId);
        }
        if (getWorkspaceMutationEpoch(workspaceId) !== mutationEpoch) {
          const message = `The local workspace changed while its restored ${adapter.label} copy was being checked. Sync again to avoid overwriting either version.`;
          markConflict(workspaceId, message);
          return result(workspaceId, "conflict", "none", false, user);
        }

        if (!encryptedWorkspaceRecordsMatch(local, remote.snapshot)) {
          markConflict(workspaceId, noSharedVersionHistoryMessage(adapter.label));
          return result(workspaceId, "conflict", "none", false, user);
        }

        const settled = await markSyncedIfLocalUnchangedUnderMutationLock(
          workspaceId,
          user,
          local,
          localSaveRevision,
          mutationEpoch,
          remote.manifest.recordChangeTag
        );
        if (settled === "stale") {
          return staleSyncResult(workspaceId);
        }
        if (settled === "pending") {
          return result(workspaceId, "pending", "none", false, user);
        }
        return result(workspaceId, "synced", "none", false, user);
      }
      if (current.pendingUpload) {
        if (remoteChangedSinceLastSync(current, remote)) {
          const message = `Both the local workspace and its ${adapter.label} copy have changes. Resolve the conflict before syncing.`;
          markConflict(workspaceId, message);
          return result(workspaceId, "conflict", "none", false, user);
        }
        scheduleWorkspaceCloudUpload(workspaceId);
        return result(workspaceId, "pending", "none", false, user);
      }

      if (!remoteChangedSinceLastSync(current, remote)) {
        const localSaveRevision = getLocalSaveRevision(workspaceId);
        const mutationEpoch = getWorkspaceMutationEpoch(workspaceId);
        const local = await captureRequiredLocalBundle(workspaceId);
        const settled = await markSyncedIfLocalUnchangedUnderMutationLock(
          workspaceId,
          user,
          local,
          localSaveRevision,
          mutationEpoch,
          remote.manifest.recordChangeTag
        );
        if (settled === "stale") {
          return staleSyncResult(workspaceId);
        }
        if (settled === "pending") {
          return result(workspaceId, "pending", "none", false, user);
        }
        return result(workspaceId, "synced", "none", false, user);
      }

      const localSaveRevision = getLocalSaveRevision(workspaceId);
      const mutationEpoch = getWorkspaceMutationEpoch(workspaceId);
      const local = await captureRequiredLocalBundle(workspaceId);
      await validateRemoteBundleBeforeRestore(remote, options);
      const restored = await restoreRemoteBundleUnderMutationLock(
        workspaceId,
        user,
        remote,
        {
          expectedLocal: local,
          expectedLocalSaveRevision: localSaveRevision,
          expectedMutationEpoch: mutationEpoch,
          conflictMessage: `The local workspace changed while ${adapter.label} was being applied. Review both versions again.`
        }
      );
      if (restored === "stale") {
        return staleSyncResult(workspaceId);
      }
      if (restored === "conflict") {
        return result(workspaceId, "conflict", "none", false, user);
      }
      return result(workspaceId, "synced", "download", true, user);
    } catch (error) {
      if (!bindingEstablished && !cloudSyncStartGuardStillMatches(workspaceId, startGuard)) {
        return staleSyncResult(workspaceId);
      }
      if (bindingEstablished && user && !cloudBindingStillMatches(workspaceId, user)) {
        return staleSyncResult(workspaceId);
      }
      if (adapter.isAuthRequiredError(error)) {
        markAuthRequired(workspaceId, adapter);
        return result(workspaceId, "auth-required", "none", false, user);
      }
      if (
        (error instanceof WorkspaceSyncError && error.code === "ACCOUNT_MISMATCH") ||
        adapter.isAccountMismatchError(error)
      ) {
        markAccountMismatch(workspaceId, error);
        return result(workspaceId, "account-mismatch", "none", false, user);
      }
      if (adapter.isConflictError(error)) {
        markConflict(workspaceId, genericErrorMessage(error));
        return result(workspaceId, "conflict", "none", false, user);
      }
      logSyncFailure(workspaceId, error);
      updateWorkspaceStoragePreference(workspaceId, {
        status: "pending",
        lastError: genericErrorMessage(error)
      });
      return result(workspaceId, "error", "none", false, user);
    }
  });
}

/** Availability of one cloud provider for a workspace (CloudKit config or Google client id). */
export function getWorkspaceCloudProviderAvailability(
  workspaceIdInput: string,
  provider: WorkspaceCloudStorageProvider
): WorkspaceCloudSyncAvailability {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const adapter = adapterFor(provider);
  return adapter
    ? adapter.availability(workspaceId)
    : { available: false, reason: "configuration-missing", missing: ["provider"] };
}

/**
 * Switches the workspace to a cloud provider (or keeps it) and runs a sync.
 * A real provider change starts from a clean binding, so the first sync
 * either uploads (no remote copy yet) or raises a conflict for the user to
 * decide (a copy already exists there).
 */
export async function connectWorkspaceCloud(
  workspaceIdInput: string,
  provider: WorkspaceCloudStorageProvider,
  options: WorkspaceCloudSyncOptions = {}
) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  // A sync of the previous provider may still be running; switching under it
  // would hand its stale result back to the caller. Let it settle first.
  await syncInFlight.get(workspaceId)?.catch(() => undefined);
  const current = getWorkspaceStoragePreference(workspaceId);
  if (current.provider !== provider) {
    cancelWorkspaceCloudUpload(workspaceId);
    setWorkspaceStorageProvider(workspaceId, provider);
  }
  return manualSyncWorkspace(workspaceId, options);
}

export async function connectWorkspaceCloudKit(
  workspaceIdInput: string,
  options: WorkspaceCloudSyncOptions = {}
) {
  return connectWorkspaceCloud(workspaceIdInput, "cloudkit", options);
}

/** Stops cloud sync for the workspace; both encrypted copies are kept. */
export function disconnectWorkspaceCloud(workspaceIdInput: string) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  cancelWorkspaceCloudUpload(workspaceId);
  return setWorkspaceStorageProvider(workspaceId, "indexeddb");
}

export function disconnectWorkspaceCloudKit(workspaceIdInput: string) {
  return disconnectWorkspaceCloud(workspaceIdInput);
}

/**
 * Pauses cloud sync after the CloudKit session is signed out without erasing
 * the workspace-to-account binding or either encrypted copy.
 */
export function noteWorkspaceCloudKitSignedOut(workspaceIdInput: string) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  cancelWorkspaceCloudUpload(workspaceId);
  const preference = getWorkspaceStoragePreference(workspaceId);
  return preference.provider === "cloudkit" ? markAuthRequired(workspaceId, cloudKitAdapter) : preference;
}
