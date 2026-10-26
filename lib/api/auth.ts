import { mockApi } from "@/lib/api/mock-client";
import {
  activateMockDatabaseWorkspace,
  captureMockDatabaseWorkspaceStorage,
  deactivateMockDatabaseWorkspace,
  finalizeLegacyMockDatabaseClaim,
  hasLegacyMockDatabase,
  persistMockDatabase,
  readMockDatabaseWorkspaceSnapshot,
  restoreMockDatabaseWorkspaceStorage,
  restoreMockDatabaseBackup,
  validateMockDatabaseBackup
} from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import { languages, type Language } from "@/lib/i18n/translations";
import type { EncryptedPublicSharePayload } from "@/lib/security/public-share-storage";
import {
  WorkspaceCryptoError,
  createAppleAccountRecovery,
  createWorkspaceRecovery,
  decryptWorkspaceRecord,
  decryptWorkspaceEnvelope,
  encryptWorkspaceEnvelope,
  generateWorkspaceCode,
  isValidWorkspaceCode,
  parseEncryptedWorkspaceEnvelope,
  protectMasterKeyWithPassword,
  protectMasterKeyWithWorkspaceCode,
  unlockAccountRecovery,
  unlockAppleAccountRecovery,
  unlockMasterKeyWithPassword,
  unlockWorkspaceRecovery,
  validatePasswordProtectedMasterKey,
  validateWorkspaceRecoveryMetadata,
  wrapMasterKeyWithAccountSecret,
  type EncryptedWorkspaceEnvelope,
  type PasswordProtectedMasterKey,
  type WorkspaceMasterKey,
  type WorkspaceRecoveryMetadata
} from "@/lib/security/workspace-crypto";
import {
  AppleDeviceVaultError,
  createOrUpdateAppleDeviceVaultEntry,
  deleteAppleDeviceVaultEntry,
  unlockAppleDeviceVaultEntry
} from "@/lib/security/apple-device-vault";
import {
  createCloudKitAppleAccountProfile,
  fetchCloudKitAppleAccountProfile,
  saveCloudKitAppleAccountProfile,
  type CloudKitAppleAccountProfile,
  type CloudKitAppleAccountProfileInput
} from "@/lib/storage/cloudkit-account-provider";
import {
  assertCloudKitAuthenticatedUser,
  getCloudKitAccountDisplay,
  getCloudKitAccountFingerprint,
  hasPersistedCloudKitSession,
  signOutCloudKitSession,
  type CloudKitUserIdentity
} from "@/lib/storage/cloudkit/cloudkit-client";
import { requestPersistentBrowserStorage } from "@/lib/storage/persistent-storage";
import {
  capturePortableWorkspaceStoragePreferences,
  getStoredWorkspaceStoragePreference,
  getWorkspaceStoragePreference,
  listWorkspaceStoragePreferences,
  parsePortableWorkspaceStoragePreference,
  replaceWorkspaceStoragePreferences,
  replaceWorkspaceStoragePreferencesFromBackup,
  restoreWorkspaceStoragePreference,
  setWorkspaceStorageProvider,
  type PortableWorkspaceStoragePreference,
  type WorkspaceCloudStorageProvider,
  type WorkspaceStoragePreference,
  updateWorkspaceStoragePreference
} from "@/lib/storage/storage-preferences";
import {
  connectWorkspaceCloud,
  connectWorkspaceCloudKit,
  disconnectWorkspaceCloud,
  manualSyncWorkspace,
  pullWorkspaceFromCloudOnLogin,
  resolveWorkspaceCloudConflict,
  type WorkspaceConflictResolution,
  cancelWorkspaceCloudUpload
} from "@/lib/storage/workspace-sync-coordinator";
import {
  bumpWorkspaceMutationEpoch,
  withAuthMutationLock,
  withDatabaseMutationLock
} from "@/lib/storage/workspace-mutation-lock";
import { isWorkspaceSyncConflictError } from "@/lib/storage/workspace-write-guard";
import {
  disconnectGoogleDriveAccount,
  forgetGoogleDriveAccessToken,
  requireGoogleDriveAccessToken,
  seedGoogleDriveConnection
} from "@/lib/storage/google-drive/google-drive-client";
import type { GoogleStoredToken } from "@/lib/integrations/google-auth";
import { CloudProviderError } from "@/lib/storage/cloud-provider-error";
import {
  fetchGoogleUserInfo,
  forgetGoogleSignInToken,
  googleAccountFingerprint,
  hasUsableGoogleSignInToken,
  markGoogleSignedIn,
  markGoogleSignedOut,
  readGoogleSignInSettings,
  readGoogleSignInToken,
  resolveGoogleClientId,
  type GoogleUserInfo
} from "@/lib/integrations/google-signin";
import {
  GOOGLE_ACCOUNT_PROFILE_SCHEMA,
  googleAccountOwnerDigest,
  listGoogleAccountProfiles,
  readGoogleAccountProfile,
  writeGoogleAccountProfile,
  type GoogleAccountProfile
} from "@/lib/storage/google-account-profile";
import {
  IndexedDbStorageError,
  captureEncryptedDatabaseSnapshot,
  parseEncryptedDatabaseSnapshot,
  replaceEncryptedDatabaseSnapshot,
  type EncryptedDatabaseSnapshot,
  type EncryptedWorkspaceBundleSnapshot
} from "@/lib/storage/indexed-db";
import type { User } from "@/lib/types";
import { isMoneyCurrency, type MoneyCurrency } from "@/lib/utils/money";

export type AuthCredentials = {
  email: string;
  password: string;
};

export type WorkspaceRegistrationMode = "create" | "join" | "recover-empty";
export type LocalWorkspaceRole = "owner" | "member";

export type RegisterPayload = AuthCredentials & {
  name: string;
  workspaceCode: string;
  workspaceMode: WorkspaceRegistrationMode;
  workspaceBackup?: EncryptedWorkspaceEnvelope;
};

export type LocalAccountKind = "password" | "apple" | "google";

export type LocalAuthUser = User & {
  workspaceId: string;
  workspaceRole: LocalWorkspaceRole;
  /** True when the unlocked account signs in with Apple ID. */
  isAppleAccount: boolean;
  accountKind: LocalAccountKind;
  /** Identity-provider accounts (Apple ID, Google) always keep a cloud copy. */
  cloudRequired: boolean;
};

export type RegisterResult = {
  claimedLegacyData: boolean;
  joinedExistingWorkspace: boolean;
  restoredLanguage?: Language;
  startedEmptyWorkspace: boolean;
  token: string;
  user: LocalAuthUser;
};

export type AppleAccountLoginResolution =
  | {
      kind: "needs-setup";
      suggestedName: string;
    }
  | {
      /**
       * This device holds the account's encrypted workspace but can unlock it
       * neither from the device vault nor from iCloud; the 16-digit recovery
       * key created in the Archive opens it.
       */
      kind: "needs-recovery-key";
      accountName: string;
    }
  | {
      kind: "ready";
      user: LocalAuthUser;
    };

export type AppleAccountSetupPayload = {
  identity: CloudKitUserIdentity;
  name: string;
};

export type AppleAccountRecoveryPayload = {
  identity: CloudKitUserIdentity;
  workspaceCode: string;
};

export type LocalAuthErrorCode =
  | "ACCOUNT_EXISTS"
  | "APPLE_CLOUD_REQUIRED"
  | "CLOUD_AUTH_REQUIRED"
  | "CLOUD_REQUIRED"
  | "GOOGLE_PROFILE_MISMATCH"
  | "MIGRATION_INCOMPLETE"
  | "BACKUP_INVALID"
  | "BACKUP_CAPTURE_CHANGED"
  | "BACKUP_REQUIRED"
  | "BACKUP_TOO_LARGE"
  | "DEVICE_NOT_EMPTY"
  | "EMPTY_WORKSPACE_RESET_BLOCKED"
  | "INVALID_CREDENTIALS"
  | "INVALID_WORKSPACE_CODE"
  | "NO_ACTIVE_SESSION"
  | "PASSWORD_TOO_SHORT"
  | "RECOVERY_KEY_EXISTS"
  | "RECOVERY_KEY_MISMATCH"
  | "REGISTRATION_FAILED"
  | "RESTORE_IN_PROGRESS"
  | "SECURE_CONTEXT_REQUIRED"
  | "STORAGE_CORRUPT"
  | "STORAGE_UNAVAILABLE"
  | "WORKSPACE_CODE_IN_USE"
  | "WORKSPACE_MISMATCH"
  | "WORKSPACE_NOT_FOUND";

export type StoredPasswordAccount = {
  id: string;
  avatar: string;
  createdAt: string;
  email: string;
  name: string;
  passwordProtection: PasswordProtectedMasterKey;
  workspaceId: string;
  workspaceRole: LocalWorkspaceRole;
};

export type StoredAppleAccount = {
  id: string;
  avatar: string;
  authMethod: "apple-cloudkit";
  appleAccountFingerprint: string;
  createdAt: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceRole: "owner";
};

/**
 * A Google account: "sign in is unlock". The master key reaches this device
 * through the device vault (re-entry on this device) or, at a live sign-in,
 * through the account wrap in the Drive profile, unlocked with a fingerprint
 * derived from the Google subject id. The record holds only a digest of that
 * fingerprint (lookup and vault key); the digest cannot open the Drive wrap.
 * The vault is a device-local convenience copy that sign-out deletes. The
 * workspace registry keeps the recovery-key wrap from the Drive profile, so
 * every device shares one recovery key and backups work as for a local
 * account.
 */
export type StoredGoogleAccount = {
  id: string;
  avatar: string;
  authMethod: "google";
  googleAccountDigest: string;
  createdAt: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceRole: "owner";
};

export type StoredLocalAccount = StoredPasswordAccount | StoredAppleAccount | StoredGoogleAccount;

export const fullSiteBackupSchema = "studio-map-os.full-site-device-backup" as const;
const legacyFullSiteBackupVersion = 1 as const;
export const fullSiteBackupVersion = 2 as const;

export type FullSiteBackup = {
  schema: typeof fullSiteBackupSchema;
  version: typeof fullSiteBackupVersion;
  exportedAt: string;
  protectorWorkspaceId: string;
  authentication: {
    accounts: StoredLocalAccount[];
    workspaces: WorkspaceRecoveryMetadata[];
  };
  indexedDb: EncryptedDatabaseSnapshot<EncryptedPublicSharePayload>;
  preferences: {
    language?: Language;
    displayCurrency?: MoneyCurrency;
    lastAccountEmail?: string;
  };
  storagePreferences: PortableWorkspaceStoragePreference[];
};

export type ImportedSiteBackup =
  | { format: "device"; backup: FullSiteBackup }
  | { format: "legacy-workspace"; backup: ReturnType<typeof validateMockDatabaseBackup> };

type ActiveAuthSession = {
  account: StoredLocalAccount;
  masterKey: WorkspaceMasterKey;
  user: LocalAuthUser;
  workspace: WorkspaceRecoveryMetadata;
};

type LocalDeviceStorageSnapshot = {
  accounts: StoredLocalAccount[];
  workspaces: WorkspaceRecoveryMetadata[];
  indexedDb: EncryptedDatabaseSnapshot<EncryptedPublicSharePayload>;
  language: string | null;
  displayCurrency: string | null;
  lastAccountEmail: string | null;
  storagePreferences: WorkspaceStoragePreference[];
  legacyPlaintextEntries: Array<[string, string]>;
  restoreRecoveryMarker: string | null;
};

const accountsStorageKey = "studio-map-os.local-accounts.v1";
const workspacesStorageKey = "studio-map-os.local-workspaces.v1";
const lastEmailStorageKey = "studio-map-os.last-account-email";
const languageStorageKey = "studio-map-os.language";
const displayCurrencyStorageKey = "studio-map-os.display-currency";
const legacyAuthStorageKey = "studio-map-os.mock-user";
const legacyDatabaseStorageKey = "studio-map-os.mock-database";
const legacyDatabaseClaimStorageKey = "studio-map-os.mock-database.claimed-workspace-id";
const legacyWorkspaceDatabasePrefix = "studio-map-os.workspace.";
const legacyWorkspaceDatabaseSuffix = ".database";
const restoreRecoveryStorageKey = "studio-map-os.full-site-restore-recovery.v1";
const minimumPasswordLength = 8;

const developmentTestAccount =
  process.env.NODE_ENV === "development"
    ? ({
        name: "Studio Map OS Test",
        email: "test@studio-map.test",
        password: "StudioMapOS-Test!",
        workspaceCode: "3305000000000001"
      } as const)
    : null;

let activeSession: ActiveAuthSession | null = null;
let fullSiteRestoreInProgress = false;

const validateCloudBundleForSession = async (
  snapshot: EncryptedWorkspaceBundleSnapshot,
  session: ActiveAuthSession
) => {
  if (
    snapshot.workspaceId !== session.workspace.workspaceId ||
    snapshot.workspaceRecord === null
  ) {
    throw new LocalAuthError(
      "WORKSPACE_MISMATCH",
      "The CloudKit copy does not belong to the active workspace"
    );
  }

  // Structural checks and transport hashes are not enough: authenticate the
  // ciphertext with the unlocked in-memory key before replacing IndexedDB.
  await decryptWorkspaceRecord(snapshot.workspaceRecord, session.masterKey);
};

export class LocalAuthError extends Error {
  constructor(
    public readonly code: LocalAuthErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "LocalAuthError";
  }
}

const canUseStorage = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const requireStorage = () => {
  if (!canUseStorage()) {
    throw new LocalAuthError("STORAGE_UNAVAILABLE", "Local account storage is unavailable");
  }
};

const requireCompletedRestoreState = () => {
  if (window.localStorage.getItem(restoreRecoveryStorageKey) !== null) {
    throw new LocalAuthError(
      "STORAGE_CORRUPT",
      "A full-site restore must be completed before local accounts can be used."
    );
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expectedKeys: readonly string[]) => {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
};

const isCanonicalIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const isStoredPasswordAccount = (value: unknown): value is StoredPasswordAccount => {
  if (!isRecord(value) || !hasExactKeys(value, [
      "id",
      "avatar",
      "createdAt",
      "email",
      "name",
      "passwordProtection",
      "workspaceId",
      "workspaceRole"
    ]) ||
    typeof value.id !== "string" ||
    typeof value.avatar !== "string" ||
    !isCanonicalIsoDate(value.createdAt) ||
    typeof value.email !== "string" ||
    typeof value.name !== "string" ||
    typeof value.workspaceId !== "string" ||
    (value.workspaceRole !== "owner" && value.workspaceRole !== "member")
  ) {
    return false;
  }

  try {
    return validatePasswordProtectedMasterKey(value.passwordProtection).workspaceId === value.workspaceId;
  } catch {
    return false;
  }
};

const isStoredAppleAccount = (value: unknown): value is StoredAppleAccount =>
  isRecord(value) &&
  hasExactKeys(value, [
    "id",
    "avatar",
    "authMethod",
    "appleAccountFingerprint",
    "createdAt",
    "email",
    "name",
    "workspaceId",
    "workspaceRole"
  ]) &&
  typeof value.id === "string" &&
  typeof value.avatar === "string" &&
  value.authMethod === "apple-cloudkit" &&
  typeof value.appleAccountFingerprint === "string" &&
  /^[a-f0-9]{64}$/.test(value.appleAccountFingerprint) &&
  isCanonicalIsoDate(value.createdAt) &&
  typeof value.email === "string" &&
  typeof value.name === "string" &&
  typeof value.workspaceId === "string" &&
  value.workspaceRole === "owner";

const isStoredGoogleAccount = (value: unknown): value is StoredGoogleAccount => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "avatar",
      "authMethod",
      "googleAccountDigest",
      "createdAt",
      "email",
      "name",
      "workspaceId",
      "workspaceRole"
    ]) ||
    typeof value.id !== "string" ||
    typeof value.avatar !== "string" ||
    value.authMethod !== "google" ||
    typeof value.googleAccountDigest !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.googleAccountDigest) ||
    !isCanonicalIsoDate(value.createdAt) ||
    typeof value.email !== "string" ||
    typeof value.name !== "string" ||
    typeof value.workspaceId !== "string" ||
    value.workspaceRole !== "owner"
  ) {
    return false;
  }
  return true;
};

const isStoredLocalAccount = (value: unknown): value is StoredLocalAccount =>
  isStoredPasswordAccount(value) || isStoredAppleAccount(value) || isStoredGoogleAccount(value);

/**
 * A record written by a newer build for an account kind this build does not
 * know. It is carried through untouched instead of condemning the whole
 * registry, so an older cached build never locks every account out.
 */
const isForeignAccountRecord = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  typeof value.authMethod === "string" &&
  value.authMethod !== "apple-cloudkit" &&
  value.authMethod !== "google" &&
  typeof value.id === "string";

const isWorkspaceRecoveryMetadata = (value: unknown): value is WorkspaceRecoveryMetadata => {
  try {
    validateWorkspaceRecoveryMetadata(value);
    return true;
  } catch {
    return false;
  }
};

const readArray = <T>(key: string, isValidItem: (value: unknown) => value is T): T[] => {
  requireStorage();

  const raw = window.localStorage.getItem(key);

  if (raw === null) {
    return [];
  }

  try {
    const value: unknown = JSON.parse(raw);

    if (!Array.isArray(value) || !value.every(isValidItem)) {
      throw new Error("Invalid local account registry");
    }

    return value;
  } catch (error) {
    throw new LocalAuthError(
      "STORAGE_CORRUPT",
      "Local account data is damaged. No account changes were written.",
      { cause: error }
    );
  }
};

const writeArray = <T>(key: string, value: T[]) => {
  requireStorage();
  window.localStorage.setItem(key, JSON.stringify(value));
};

const readAccountRegistry = () =>
  readArray(
    accountsStorageKey,
    (value): value is StoredLocalAccount | Record<string, unknown> =>
      isStoredLocalAccount(value) || isForeignAccountRecord(value)
  );
const readAccounts = () => readAccountRegistry().filter(isStoredLocalAccount);
/** Writes the known accounts and keeps records of unknown (newer) kinds in place. */
const writeAccounts = (accounts: StoredLocalAccount[]) => {
  let foreign: Record<string, unknown>[] = [];
  try {
    foreign = readAccountRegistry().filter(
      (item): item is Record<string, unknown> => !isStoredLocalAccount(item)
    );
  } catch {
    foreign = [];
  }
  writeArray(accountsStorageKey, [...accounts, ...foreign]);
};
const readWorkspaces = () => readArray(workspacesStorageKey, isWorkspaceRecoveryMetadata);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validateFullSiteBackup(value: unknown): FullSiteBackup {
  const isSupportedVersion =
    isRecord(value) &&
    (value.version === legacyFullSiteBackupVersion || value.version === fullSiteBackupVersion);
  const expectedKeys =
    isRecord(value) && value.version === fullSiteBackupVersion
      ? [
          "schema",
          "version",
          "exportedAt",
          "protectorWorkspaceId",
          "authentication",
          "indexedDb",
          "preferences",
          "storagePreferences"
        ]
      : [
          "schema",
          "version",
          "exportedAt",
          "protectorWorkspaceId",
          "authentication",
          "indexedDb",
          "preferences"
        ];

  if (
    !isRecord(value) ||
    !isSupportedVersion ||
    !hasExactKeys(value, expectedKeys) ||
    value.schema !== fullSiteBackupSchema ||
    !isCanonicalIsoDate(value.exportedAt) ||
    typeof value.protectorWorkspaceId !== "string" ||
    !isRecord(value.authentication) ||
    !hasExactKeys(value.authentication, ["accounts", "workspaces"]) ||
    !Array.isArray(value.authentication.accounts) ||
    !value.authentication.accounts.every(isStoredLocalAccount) ||
    !Array.isArray(value.authentication.workspaces) ||
    !value.authentication.workspaces.every(isWorkspaceRecoveryMetadata) ||
    !isRecord(value.preferences) ||
    Object.keys(value.preferences).some(
      (key) => !["language", "displayCurrency", "lastAccountEmail"].includes(key)
    ) ||
    (value.preferences.language !== undefined &&
      !languages.includes(value.preferences.language as Language)) ||
    (value.preferences.displayCurrency !== undefined &&
      !isMoneyCurrency(value.preferences.displayCurrency)) ||
    (value.preferences.lastAccountEmail !== undefined &&
      typeof value.preferences.lastAccountEmail !== "string") ||
    (value.version === fullSiteBackupVersion && !Array.isArray(value.storagePreferences))
  ) {
    throw new LocalAuthError("BACKUP_INVALID", "The full-site backup is invalid or unsupported");
  }

  const accounts = structuredClone(value.authentication.accounts) as StoredLocalAccount[];
  const workspaces = value.authentication.workspaces.map((workspace) =>
    validateWorkspaceRecoveryMetadata(workspace)
  );
  const indexedDb = parseEncryptedDatabaseSnapshot<EncryptedPublicSharePayload>(value.indexedDb);
  const accountIds = new Set<string>();
  const emails = new Set<string>();
  const workspaceIds = new Set<string>();
  const bundleIds = new Set(indexedDb.bundles.map((bundle) => bundle.workspaceId));

  if (accounts.length === 0 || workspaces.length === 0) {
    throw new LocalAuthError("BACKUP_INVALID", "The full-site backup contains no local accounts");
  }

  for (const workspace of workspaces) {
    if (workspaceIds.has(workspace.workspaceId)) {
      throw new LocalAuthError("BACKUP_INVALID", "The full-site backup contains a duplicate workspace");
    }
    workspaceIds.add(workspace.workspaceId);
  }

  let storagePreferences: PortableWorkspaceStoragePreference[];
  if (value.version === legacyFullSiteBackupVersion) {
    storagePreferences = workspaces.map((workspace) => ({
      workspaceId: workspace.workspaceId,
      provider: "indexeddb"
    }));
  } else {
    try {
      storagePreferences = (value.storagePreferences as unknown[]).map((preference) =>
        parsePortableWorkspaceStoragePreference(preference)
      );
    } catch (error) {
      throw new LocalAuthError(
        "BACKUP_INVALID",
        "The full-site storage preferences are invalid",
        { cause: error }
      );
    }

    const storageWorkspaceIds = new Set(
      storagePreferences.map((preference) => preference.workspaceId)
    );
    if (
      storageWorkspaceIds.size !== storagePreferences.length ||
      storageWorkspaceIds.size !== workspaceIds.size ||
      [...workspaceIds].some((workspaceId) => !storageWorkspaceIds.has(workspaceId))
    ) {
      throw new LocalAuthError(
        "BACKUP_INVALID",
        "The full-site storage preferences are inconsistent"
      );
    }
  }

  if (!workspaceIds.has(value.protectorWorkspaceId)) {
    throw new LocalAuthError("BACKUP_INVALID", "The backup protector workspace is missing");
  }

  for (const account of accounts) {
    const email = normalizeEmail(account.email);
    if (
      !email ||
      accountIds.has(account.id) ||
      emails.has(email) ||
      !workspaceIds.has(account.workspaceId)
    ) {
      throw new LocalAuthError("BACKUP_INVALID", "The full-site account registry is inconsistent");
    }
    accountIds.add(account.id);
    emails.add(email);
  }

  if (
    bundleIds.size !== workspaceIds.size ||
    [...workspaceIds].some((workspaceId) => !bundleIds.has(workspaceId)) ||
    indexedDb.bundles.some((bundle) => bundle.workspaceRecord === null)
  ) {
    throw new LocalAuthError("BACKUP_INVALID", "The full-site database is incomplete");
  }

  const lastAccountEmail = value.preferences.lastAccountEmail;
  if (lastAccountEmail !== undefined && !emails.has(normalizeEmail(lastAccountEmail))) {
    throw new LocalAuthError("BACKUP_INVALID", "The saved login preference is inconsistent");
  }

  return {
    schema: fullSiteBackupSchema,
    version: fullSiteBackupVersion,
    exportedAt: value.exportedAt,
    protectorWorkspaceId: value.protectorWorkspaceId,
    authentication: { accounts, workspaces },
    indexedDb,
    preferences: {
      language: value.preferences.language as Language | undefined,
      displayCurrency: value.preferences.displayCurrency as MoneyCurrency | undefined,
      lastAccountEmail
    },
    storagePreferences
  };
}

const captureLocalDeviceStorage = async (): Promise<LocalDeviceStorageSnapshot> => ({
  accounts: readAccounts(),
  workspaces: readWorkspaces(),
  indexedDb: await captureEncryptedDatabaseSnapshot<EncryptedPublicSharePayload>(),
  language: window.localStorage.getItem(languageStorageKey),
  displayCurrency: window.localStorage.getItem(displayCurrencyStorageKey),
  lastAccountEmail: window.localStorage.getItem(lastEmailStorageKey),
  storagePreferences: listWorkspaceStoragePreferences(),
  legacyPlaintextEntries: captureLegacyPlaintextEntries(),
  restoreRecoveryMarker: window.localStorage.getItem(restoreRecoveryStorageKey)
});

const bumpDatabaseSnapshotWorkspaceEpochs = (
  ...snapshots: EncryptedDatabaseSnapshot<EncryptedPublicSharePayload>[]
) => {
  const workspaceIds = new Set(
    snapshots.flatMap((snapshot) =>
      snapshot.bundles.map((bundle) => bundle.workspaceId)
    )
  );

  for (const workspaceId of workspaceIds) {
    bumpWorkspaceMutationEpoch(workspaceId);
  }
};

const restoreStoredValue = (key: string, value: string | null) => {
  if (value === null) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
};

const isLegacyPlaintextDatabaseKey = (key: string) =>
  key === legacyDatabaseStorageKey ||
  key === legacyDatabaseClaimStorageKey ||
  (key.startsWith(legacyWorkspaceDatabasePrefix) && key.endsWith(legacyWorkspaceDatabaseSuffix));

const captureLegacyPlaintextEntries = () => {
  const entries: Array<[string, string]> = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !isLegacyPlaintextDatabaseKey(key)) {
      continue;
    }
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      entries.push([key, value]);
    }
  }

  return entries;
};

const clearLegacyPlaintextEntries = () => {
  const keys = captureLegacyPlaintextEntries().map(([key]) => key);
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
};

const restoreLegacyPlaintextEntries = (entries: Array<[string, string]>) => {
  clearLegacyPlaintextEntries();
  for (const [key, value] of entries) {
    window.localStorage.setItem(key, value);
  }
};

const restoreLocalDeviceStorage = async (
  snapshot: LocalDeviceStorageSnapshot,
  replacedIndexedDb: EncryptedDatabaseSnapshot<EncryptedPublicSharePayload>
) => {
  await replaceEncryptedDatabaseSnapshot(snapshot.indexedDb);
  bumpDatabaseSnapshotWorkspaceEpochs(replacedIndexedDb, snapshot.indexedDb);
  writeAccounts(snapshot.accounts);
  writeArray(workspacesStorageKey, snapshot.workspaces);
  replaceWorkspaceStoragePreferences(snapshot.storagePreferences);
  restoreStoredValue(languageStorageKey, snapshot.language);
  restoreStoredValue(displayCurrencyStorageKey, snapshot.displayCurrency);
  restoreStoredValue(lastEmailStorageKey, snapshot.lastAccountEmail);
  restoreLegacyPlaintextEntries(snapshot.legacyPlaintextEntries);
  restoreStoredValue(restoreRecoveryStorageKey, snapshot.restoreRecoveryMarker);
};

async function replaceLocalDeviceWithFullSiteBackupUnlocked(
  backupValue: unknown,
  options: { requireEmptyDevice?: boolean } = {}
) {
  requireStorage();
  const backup = validateFullSiteBackup(backupValue);
  const previous = await captureLocalDeviceStorage();
  const isRecoveryRetry = previous.restoreRecoveryMarker !== null;

  if (
    options.requireEmptyDevice &&
    !isRecoveryRetry &&
    (previous.accounts.length > 0 ||
      previous.workspaces.length > 0 ||
      previous.indexedDb.bundles.length > 0 ||
      previous.legacyPlaintextEntries.length > 0)
  ) {
    throw new LocalAuthError(
      "DEVICE_NOT_EMPTY",
      "This browser already contains local accounts. Restore from Archive after signing in."
    );
  }

  window.localStorage.setItem(
    restoreRecoveryStorageKey,
    JSON.stringify({ schema: restoreRecoveryStorageKey, startedAt: new Date().toISOString() })
  );

  try {
    await replaceEncryptedDatabaseSnapshot(backup.indexedDb);
    bumpDatabaseSnapshotWorkspaceEpochs(previous.indexedDb, backup.indexedDb);
    // The backup replaces the device: records of other kinds do not survive.
    writeArray(accountsStorageKey, backup.authentication.accounts);
    writeArray(workspacesStorageKey, backup.authentication.workspaces);
    replaceWorkspaceStoragePreferencesFromBackup(backup.storagePreferences);
    restoreStoredValue(languageStorageKey, backup.preferences.language ?? null);
    restoreStoredValue(displayCurrencyStorageKey, backup.preferences.displayCurrency ?? null);
    restoreStoredValue(
      lastEmailStorageKey,
      backup.preferences.lastAccountEmail ??
        backup.authentication.accounts.find(isStoredPasswordAccount)?.email ??
        null
    );
    window.localStorage.removeItem(legacyAuthStorageKey);
    clearLegacyPlaintextEntries();
    window.localStorage.removeItem(restoreRecoveryStorageKey);
  } catch (error) {
    let rollbackSucceeded = false;
    try {
      await restoreLocalDeviceStorage(previous, backup.indexedDb);
      rollbackSucceeded = true;
    } catch {
      try {
        window.localStorage.setItem(restoreRecoveryStorageKey, "recovery-required");
      } catch {
        // The in-memory session is still invalidated below so mixed data cannot
        // continue under a previously unlocked master key.
      }
    }

    activeSession?.masterKey.fill(0);
    activeSession = null;
    deactivateMockDatabaseWorkspace();
    throw new LocalAuthError(
      "STORAGE_CORRUPT",
      rollbackSucceeded
        ? "The full-site restore failed and the previous local data was restored."
        : "The full-site restore failed and must be retried from the login screen.",
      { cause: error }
    );
  }

  activeSession?.masterKey.fill(0);
  activeSession = null;
  deactivateMockDatabaseWorkspace();
  return backup;
}

async function replaceLocalDeviceWithFullSiteBackup(
  backupValue: unknown,
  options: { requireEmptyDevice?: boolean } = {}
) {
  return withDatabaseMutationLock(() =>
    replaceLocalDeviceWithFullSiteBackupUnlocked(backupValue, options)
  );
}

const masterKeysMatch = (left: WorkspaceMasterKey, right: WorkspaceMasterKey) => {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
};

const createId = (prefix: string) => {
  if (!globalThis.crypto?.randomUUID) {
    throw new LocalAuthError("SECURE_CONTEXT_REQUIRED", "Secure browser cryptography is unavailable");
  }

  return `${prefix}-${globalThis.crypto.randomUUID()}`;
};

const toAuthUser = (account: StoredLocalAccount, workspace: WorkspaceRecoveryMetadata): LocalAuthUser => ({
  id: account.id,
  name: account.name,
  email: account.email,
  avatar: account.avatar,
  createdAt: account.createdAt,
  workspaceId: workspace.workspaceId,
  workspaceRole: account.workspaceRole,
  isAppleAccount: isStoredAppleAccount(account),
  accountKind: isStoredAppleAccount(account)
    ? "apple"
    : isStoredGoogleAccount(account)
      ? "google"
      : "password",
  cloudRequired: !isStoredPasswordAccount(account)
});

const createBusinessUser = (account: StoredLocalAccount): User => ({
  id: account.id,
  name: account.name,
  email: account.email,
  avatar: account.avatar,
  createdAt: account.createdAt
});

const rememberLastEmail = (email: string) => {
  try {
    window.localStorage.setItem(lastEmailStorageKey, email);
  } catch {
    // The account remains usable for the current session if this convenience write fails.
  }
};

const upsertWorkspace = (workspace: WorkspaceRecoveryMetadata) => {
  const workspaces = readWorkspaces();
  const index = workspaces.findIndex((item) => item.workspaceId === workspace.workspaceId);

  if (index >= 0) {
    workspaces[index] = workspace;
  } else {
    workspaces.push(workspace);
  }

  writeArray(workspacesStorageKey, workspaces);
};

const upsertWorkspaceMember = async (account: StoredLocalAccount) => {
  const member = createBusinessUser(account);
  const index = mockDatabase.users.findIndex(
    (item) => item.id === member.id || normalizeEmail(item.email) === normalizeEmail(member.email)
  );

  if (index >= 0) {
    const existing = mockDatabase.users[index];
    if (
      existing.id === member.id &&
      existing.name === member.name &&
      existing.email === member.email &&
      existing.avatar === member.avatar &&
      existing.createdAt === member.createdAt
    ) {
      // Login bookkeeping is not a local change. Persisting an unchanged row
      // would set pendingUpload and turn the next sync into a "both changed"
      // conflict whenever another device uploaded in the meantime.
      return;
    }
    mockDatabase.users[index] = member;
  } else {
    mockDatabase.users.unshift(member);
  }

  try {
    await persistMockDatabase({ notifyOnConflictRefusal: false });
  } catch (error) {
    // Signing in must stay possible while an iCloud conflict is pending —
    // resolving it happens in the archive, which needs an unlocked session.
    // The member row is a denormalized copy and is re-upserted on every login.
    if (!isWorkspaceSyncConflictError(error)) {
      throw error;
    }
  }
};

const findWorkspaceByCode = async (workspaceCode: string) => {
  for (const workspace of readWorkspaces()) {
    try {
      const masterKey = await unlockWorkspaceRecovery(workspace, workspaceCode);
      return { masterKey, workspace };
    } catch (error) {
      if (error instanceof WorkspaceCryptoError) {
        continue;
      }

      throw error;
    }
  }

  return null;
};

const findWorkspaceByIdAndCode = async (workspaceId: string, workspaceCode: string) => {
  const workspace = readWorkspaces().find((item) => item.workspaceId === workspaceId);

  if (!workspace) {
    return null;
  }

  try {
    const masterKey = await unlockWorkspaceRecovery(workspace, workspaceCode);
    return { masterKey, workspace };
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      return null;
    }

    throw error;
  }
};

type LocalWorkspaceDataStatus = "corrupt" | "missing" | "usable";

const readLocalWorkspaceDataStatus = async (
  workspace: WorkspaceRecoveryMetadata,
  masterKey: WorkspaceMasterKey
): Promise<LocalWorkspaceDataStatus> => {
  try {
    return (await readMockDatabaseWorkspaceSnapshot(workspace.workspaceId, masterKey))
      ? "usable"
      : "missing";
  } catch {
    return "corrupt";
  }
};

type DecodedRegistrationBackup = {
  databaseBackup: ReturnType<typeof validateMockDatabaseBackup>;
  masterKey: WorkspaceMasterKey;
  metadata: WorkspaceRecoveryMetadata;
};

const decodeRegistrationBackup = async (
  envelopeValue: EncryptedWorkspaceEnvelope,
  workspaceCode: string
): Promise<DecodedRegistrationBackup> => {
  const envelope = parseEncryptedWorkspaceEnvelope(envelopeValue, "workspace");
  const decrypted = await decryptWorkspaceEnvelope(envelope, workspaceCode);
  try {
    return {
      databaseBackup: validateMockDatabaseBackup(decrypted.payload),
      masterKey: decrypted.masterKey,
      metadata: decrypted.metadata
    };
  } catch (error) {
    decrypted.masterKey.fill(0);
    throw error;
  }
};

const setActiveSession = async (
  account: StoredLocalAccount,
  workspace: WorkspaceRecoveryMetadata,
  masterKey: WorkspaceMasterKey
) => {
  const user = toAuthUser(account, workspace);

  await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey);
  activeSession?.masterKey.fill(0);
  activeSession = { account, masterKey, user, workspace };
  if (isStoredPasswordAccount(account)) {
    rememberLastEmail(account.email);
  }

  return user;
};

const mapCryptoError = (error: unknown): never => {
  if (error instanceof LocalAuthError) {
    throw error;
  }

  if (error instanceof WorkspaceCryptoError) {
    const code = error.code === "CRYPTO_UNAVAILABLE" ? "SECURE_CONTEXT_REQUIRED" : "BACKUP_INVALID";
    throw new LocalAuthError(code, error.message, { cause: error });
  }

  throw error;
};

export function getLastAccountEmail() {
  if (!canUseStorage()) {
    return "";
  }

  return window.localStorage.getItem(lastEmailStorageKey) ?? "";
}

export function hasLocalAccounts() {
  return canUseStorage() && readAccounts().length > 0;
}

export function hasUnclaimedLegacyData() {
  return canUseStorage() && readAccounts().length === 0 && hasLegacyMockDatabase();
}

async function registerUnlocked(payload: RegisterPayload): Promise<RegisterResult> {
  requireStorage();
  requireCompletedRestoreState();

  const name = payload.name.trim();
  const email = normalizeEmail(payload.email);
  const password = payload.password;
  const workspaceCode = payload.workspaceCode;

  if (!isValidWorkspaceCode(workspaceCode)) {
    throw new LocalAuthError("INVALID_WORKSPACE_CODE", "The workspace recovery key must contain 16 digits");
  }

  if (password.length < minimumPasswordLength) {
    throw new LocalAuthError("PASSWORD_TOO_SHORT", `Password must contain at least ${minimumPasswordLength} characters`);
  }

  const previousAccounts = readAccounts();
  const previousWorkspaces = readWorkspaces();

  if (previousAccounts.some((account) => normalizeEmail(account.email) === email)) {
    throw new LocalAuthError("ACCOUNT_EXISTS", "A local account already uses this email address");
  }

  let workspace: WorkspaceRecoveryMetadata | null = null;
  let masterKey: WorkspaceMasterKey | null = null;
  let joinedExistingWorkspace = false;
  let startedEmptyWorkspace = false;
  let backupToRestore: ReturnType<typeof validateMockDatabaseBackup> | null = null;
  let discardCorruptBundleForVerifiedRecovery = false;
  let previousStoragePreference: WorkspaceStoragePreference | null = null;

  try {
    const decodedBackup =
      payload.workspaceMode === "join" && payload.workspaceBackup
        ? await decodeRegistrationBackup(payload.workspaceBackup, workspaceCode)
        : null;
    const existingWorkspace = decodedBackup
      ? await findWorkspaceByIdAndCode(decodedBackup.metadata.workspaceId, workspaceCode)
      : await findWorkspaceByCode(workspaceCode);

    if (payload.workspaceMode === "recover-empty" && payload.workspaceBackup) {
      throw new LocalAuthError(
        "BACKUP_INVALID",
        "An encrypted backup cannot be combined with an empty-workspace reset"
      );
    }

    if (payload.workspaceMode === "create") {
      if (existingWorkspace) {
        existingWorkspace.masterKey.fill(0);
        throw new LocalAuthError("WORKSPACE_CODE_IN_USE", "This recovery key already unlocks a local workspace");
      }

      const createdWorkspace = await createWorkspaceRecovery(workspaceCode);
      workspace = createdWorkspace.metadata;
      masterKey = createdWorkspace.masterKey;
    } else if (existingWorkspace) {
      workspace = existingWorkspace.workspace;
      masterKey = existingWorkspace.masterKey;
      const localWorkspaceDataStatus = await readLocalWorkspaceDataStatus(workspace, masterKey);

      if (payload.workspaceMode === "recover-empty") {
        if (localWorkspaceDataStatus === "usable") {
          throw new LocalAuthError(
            "EMPTY_WORKSPACE_RESET_BLOCKED",
            "This recovery key already unlocks usable local workspace data"
          );
        }

        startedEmptyWorkspace = true;
        discardCorruptBundleForVerifiedRecovery = localWorkspaceDataStatus === "corrupt";
      } else {
        joinedExistingWorkspace = true;

        if (decodedBackup) {
          try {
            if (
              decodedBackup.metadata.workspaceId !== workspace.workspaceId ||
              !masterKeysMatch(decodedBackup.masterKey, masterKey)
            ) {
              throw new LocalAuthError("WORKSPACE_MISMATCH", "The encrypted backup belongs to another workspace");
            }

            if (localWorkspaceDataStatus !== "usable") {
              // Recovery metadata alone identifies the workspace but contains no
              // usable business data. A verified encrypted workspace backup may
              // recover a missing or corrupt scoped database transactionally.
              backupToRestore = decodedBackup.databaseBackup;
              discardCorruptBundleForVerifiedRecovery = localWorkspaceDataStatus === "corrupt";
            }
            // When data is already present, selecting a backup only verifies it.
            // Restoring here could silently roll the shared workspace back without
            // the existing members' confirmation.
          } finally {
            decodedBackup.masterKey.fill(0);
          }
        } else if (localWorkspaceDataStatus !== "usable") {
          throw new LocalAuthError(
            "BACKUP_REQUIRED",
            "This workspace is known locally, but its data is missing or damaged; an encrypted backup is required"
          );
        }
      }
    } else if (decodedBackup) {
      let accepted = false;

      try {
        if (previousWorkspaces.some((item) => item.workspaceId === decodedBackup.metadata.workspaceId)) {
          throw new LocalAuthError(
            "WORKSPACE_MISMATCH",
            "A different recovery key is already registered for this workspace ID"
          );
        }

        workspace = decodedBackup.metadata;
        masterKey = decodedBackup.masterKey;
        backupToRestore = decodedBackup.databaseBackup;
        joinedExistingWorkspace = true;
        accepted = true;
      } finally {
        if (!accepted) {
          decodedBackup.masterKey.fill(0);
        }
      }
    } else if (payload.workspaceMode === "recover-empty") {
      const createdWorkspace = await createWorkspaceRecovery(workspaceCode);
      workspace = createdWorkspace.metadata;
      masterKey = createdWorkspace.masterKey;
      startedEmptyWorkspace = true;
    } else {
      throw new LocalAuthError(
        "BACKUP_REQUIRED",
        "This workspace is not stored in this browser; an encrypted workspace backup is required"
      );
    }

    if (!workspace || !masterKey) {
      throw new LocalAuthError("REGISTRATION_FAILED", "The workspace could not be unlocked");
    }

    let account: StoredLocalAccount;
    try {
      account = {
        id: createId("account"),
        avatar: "",
        createdAt: new Date().toISOString(),
        email,
        name,
        passwordProtection: await protectMasterKeyWithPassword(masterKey, password, workspace.workspaceId),
        workspaceId: workspace.workspaceId,
        workspaceRole: payload.workspaceMode === "join" ? "member" : "owner"
      };
    } catch (error) {
      masterKey.fill(0);
      throw error;
    }
    const claimedLegacyData =
      payload.workspaceMode === "create" && previousAccounts.length === 0 && hasLegacyMockDatabase();
    const registeredWorkspaceId = workspace.workspaceId;
    const workspaceStorageSnapshot = await captureMockDatabaseWorkspaceStorage(
      registeredWorkspaceId,
      { discardCorruptBundleForVerifiedRecovery }
    );
    previousStoragePreference = getStoredWorkspaceStoragePreference(registeredWorkspaceId);

    try {
      upsertWorkspace(workspace);
      writeAccounts([...previousAccounts, account]);
      await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey, {
        allowCreate: payload.workspaceMode === "create" || startedEmptyWorkspace,
        allowRecoveryOverwrite: Boolean(backupToRestore) || startedEmptyWorkspace,
        claimLegacy: claimedLegacyData,
        initialDatabase: startedEmptyWorkspace ? "empty" : "examples"
      });

      if (backupToRestore) {
        await restoreMockDatabaseBackup(backupToRestore);
      }

      await upsertWorkspaceMember(account);
      activeSession?.masterKey.fill(0);
      activeSession = {
        account,
        masterKey,
        user: toAuthUser(account, workspace),
        workspace
      };
      rememberLastEmail(account.email);
      if (claimedLegacyData) {
        await finalizeLegacyMockDatabaseClaim(workspace.workspaceId);
      }

      try {
        window.localStorage.removeItem(legacyAuthStorageKey);
      } catch {
        // This obsolete convenience value is not part of the secure account.
      }

      void requestPersistentBrowserStorage();
      setWorkspaceStorageProvider(registeredWorkspaceId, "indexeddb");

      return mockApi({
        claimedLegacyData,
        joinedExistingWorkspace,
        ...(backupToRestore?.preferences?.language
          ? { restoredLanguage: backupToRestore.preferences.language }
          : {}),
        startedEmptyWorkspace,
        token: "local-workspace-session",
        user: activeSession.user
      });
    } catch (error) {
      masterKey.fill(0);
      activeSession = null;
      deactivateMockDatabaseWorkspace();

      const rollbackSteps: Array<() => void | Promise<void>> = [
        () => writeAccounts(previousAccounts),
        () => writeArray(workspacesStorageKey, previousWorkspaces),
        () => restoreMockDatabaseWorkspaceStorage(workspaceStorageSnapshot),
        () => restoreWorkspaceStoragePreference(registeredWorkspaceId, previousStoragePreference)
      ];

      for (const rollback of rollbackSteps) {
        try {
          await rollback();
        } catch {
          // Keep the original registration failure. Key material and the active
          // in-memory workspace have already been cleared above.
        }
      }

      throw new LocalAuthError("REGISTRATION_FAILED", "The local workspace could not be created", { cause: error });
    }
  } catch (error) {
    if (masterKey && activeSession?.masterKey !== masterKey) {
      masterKey.fill(0);
    }
    return mapCryptoError(error);
  }
}

export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  return withAuthMutationLock(() => registerUnlocked(payload));
}

const applePrivateEmail = (fingerprint: string) =>
  `apple.${fingerprint.slice(0, 16)}@private.studio-map.local`;

const appleSuggestedName = (identity: CloudKitUserIdentity) =>
  getCloudKitAccountDisplay(identity).displayName ?? "";

const createStoredAppleAccount = (
  profile: Pick<
    CloudKitAppleAccountProfile,
    "accountId" | "createdAt" | "displayName" | "workspaceId" | "workspaceRole"
  >,
  fingerprint: string
): StoredAppleAccount => ({
  id: profile.accountId,
  avatar: "",
  authMethod: "apple-cloudkit",
  appleAccountFingerprint: fingerprint,
  createdAt: profile.createdAt,
  email: applePrivateEmail(fingerprint),
  name: profile.displayName,
  workspaceId: profile.workspaceId,
  workspaceRole: "owner"
});

const upsertStoredAppleAccount = (account: StoredAppleAccount) => {
  const accounts = readAccounts();
  const conflicting = accounts.find(
    (item) =>
      item.id === account.id ||
      normalizeEmail(item.email) === normalizeEmail(account.email) ||
      (isStoredAppleAccount(item) &&
        item.appleAccountFingerprint === account.appleAccountFingerprint)
  );

  if (
    conflicting &&
    (!isStoredAppleAccount(conflicting) ||
      conflicting.id !== account.id ||
      conflicting.workspaceId !== account.workspaceId ||
      conflicting.appleAccountFingerprint !== account.appleAccountFingerprint)
  ) {
    throw new LocalAuthError(
      "WORKSPACE_MISMATCH",
      "This device already links the Apple account to another Studio Map OS workspace."
    );
  }

  const next = accounts.filter(
    (item) =>
      item.id !== account.id &&
      (!isStoredAppleAccount(item) ||
        item.appleAccountFingerprint !== account.appleAccountFingerprint)
  );
  writeAccounts([...next, account]);
};

const requireAppleFingerprint = async (identity: CloudKitUserIdentity) => {
  const fingerprint = await getCloudKitAccountFingerprint(identity);
  if (!fingerprint) {
    throw new LocalAuthError(
      "INVALID_CREDENTIALS",
      "Apple ID did not provide a usable account identity."
    );
  }
  return fingerprint;
};

/**
 * The registry copy of a workspace's metadata may carry a wrap the cloud
 * profile knows nothing about: a recovery key created on this device. A
 * cloud-path sign-in must never overwrite it with the fingerprint wrap, so the
 * registry copy wins unless it demonstrably wraps a different key (a leftover
 * of an earlier, abandoned provisioning).
 */
const preferRegistryWorkspaceMetadata = async (
  incoming: WorkspaceRecoveryMetadata,
  fingerprint: string,
  masterKey: WorkspaceMasterKey
): Promise<WorkspaceRecoveryMetadata> => {
  const local = readWorkspaces().find((item) => item.workspaceId === incoming.workspaceId);
  if (!local || local.wrappedMasterKey.ciphertext === incoming.wrappedMasterKey.ciphertext) {
    return incoming;
  }
  try {
    const unwrapped = await unlockAppleAccountRecovery(local, fingerprint);
    try {
      return masterKeysMatch(unwrapped, masterKey) ? local : incoming;
    } finally {
      unwrapped.fill(0);
    }
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      // Not wrapped with the fingerprint: a recovery-key wrap made here.
      return local;
    }
    throw error;
  }
};

// Fingerprints whose iCloud account profile was seen in status "ready" from
// this device. A device may only enter without consulting iCloud once that
// is known (or once a sync tag proves a completed first upload); otherwise an
// interrupted first-time setup would never be finished and a second device
// would mint a second workspace for the same Apple ID.
const appleProfileConfirmationsKey = "studio-map-os.apple-profile-confirmed.v1";

const readAppleProfileConfirmations = (): Record<string, string> => {
  try {
    const raw = window.localStorage.getItem(appleProfileConfirmationsKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
};

const markAppleProfileConfirmed = (fingerprint: string) => {
  try {
    const next = { ...readAppleProfileConfirmations(), [fingerprint]: new Date().toISOString() };
    window.localStorage.setItem(appleProfileConfirmationsKey, JSON.stringify(next));
  } catch {
    // Best effort: the next cloud-path sign-in records it again.
  }
};

const isAppleProfileConfirmed = (fingerprint: string, workspaceId: string) =>
  Boolean(readAppleProfileConfirmations()[fingerprint]) ||
  getWorkspaceStoragePreference(workspaceId).cloudManifestChangeTag !== null;

// A device that already holds the workspace must not wait out CloudKit's
// retry budget before it may ask for the recovery key or enter from the vault.
const STORED_ACCOUNT_PROFILE_DEADLINE_MS = 6_000;
// Bound for the iCloud login pull on a device that already holds the
// workspace; Drive keeps the regular bound because it is not refusing.
const LIFELINE_LOGIN_PULL_TIMEOUT_MS = 10_000;

const withDeadline = <T>(operation: Promise<T>, timeoutMs: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The CloudKit profile request timed out.")), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

const lifelineLoginPullTimeout = (workspaceId: string) =>
  getWorkspaceStoragePreference(workspaceId).provider === "cloudkit"
    ? LIFELINE_LOGIN_PULL_TIMEOUT_MS
    : undefined;

type StoredAppleDevice = { account: StoredAppleAccount; workspace: WorkspaceRecoveryMetadata };

/** The account registry entry and workspace metadata this device holds for an Apple ID. */
const findStoredAppleAccountByFingerprint = (fingerprint: string): StoredAppleDevice | null => {
  const account = readAccounts()
    .filter(isStoredAppleAccount)
    .find((item) => item.appleAccountFingerprint === fingerprint);
  if (!account) {
    return null;
  }
  const workspace = readWorkspaces().find((item) => item.workspaceId === account.workspaceId);
  return workspace ? { account, workspace } : null;
};

/**
 * Best-effort follow-up after a device entered without consulting iCloud.
 * When the account profile does answer: make sure this device's workspace is
 * the one registered to the Apple ID (another device may have re-created it),
 * finish an interrupted first-time setup, and remember the confirmation.
 * Silent while Apple refuses the database.
 */
const reconcileAppleProfileAfterLifeline = async (
  identity: CloudKitUserIdentity,
  fingerprint: string,
  workspaceId: string
) => {
  let profile: CloudKitAppleAccountProfile | null;
  try {
    profile = await fetchCloudKitAppleAccountProfile(identity);
  } catch {
    return;
  }
  if (!profile || profile.appleAccountFingerprint !== fingerprint) {
    return;
  }
  if (activeSession?.workspace.workspaceId !== workspaceId) {
    return;
  }
  if (profile.workspaceId !== workspaceId) {
    // Uploading this workspace would fork the account; hold the upload and
    // say so on the storage card instead of staying silent.
    cancelWorkspaceCloudUpload(workspaceId);
    updateWorkspaceStoragePreference(workspaceId, {
      status: "error",
      lastError:
        "This device holds a different workspace than the one registered to this Apple ID in iCloud. Export an encrypted backup before syncing."
    });
    debugAppleAuth("reconcile: this device's workspace differs from the iCloud profile");
    return;
  }
  if (profile.status === "provisioning") {
    try {
      await withAuthMutationLock(() => finalizeAppleProvisioning(profile, identity));
    } catch {
      return;
    }
  }
  markAppleProfileConfirmed(fingerprint);
};

const activateAppleAccountSession = async (input: {
  account: StoredAppleAccount;
  identity: CloudKitUserIdentity;
  masterKey: WorkspaceMasterKey;
  workspace: WorkspaceRecoveryMetadata;
  /**
   * Bound for the routine login pull's download (never for the restore of a
   * missing local bundle). A device that already holds the workspace passes
   * a short bound so an iCloud database that Apple refuses, or a slow link,
   * cannot hold the sign-in; the pull then ends as a recorded error and the
   * foreground and manual syncs retry it.
   */
  loginPullTimeoutMs?: number;
}) => {
  const { account, identity, masterKey } = input;
  let workspace = input.workspace;

  let user: LocalAuthUser;
  let recoveredMissingLocalBundle = false;
  try {
    workspace = await preferRegistryWorkspaceMetadata(
      input.workspace,
      account.appleAccountFingerprint,
      masterKey
    );
    // Apple ID accounts always keep a cloud copy, but the cloud may be iCloud
    // or Google Drive: only a local-only preference is forced onto CloudKit so
    // a Drive choice survives every sign-in.
    const currentPreference = getWorkspaceStoragePreference(workspace.workspaceId);
    if (currentPreference.provider === "indexeddb") {
      setWorkspaceStorageProvider(workspace.workspaceId, "cloudkit");
    }

    try {
      user = await setActiveSession(account, workspace, masterKey);
    } catch (localActivationError) {
      user = toAuthUser(account, workspace);
      activeSession?.masterKey.fill(0);
      activeSession = { account, masterKey, user, workspace };

      const cloudSession = activeSession;
      const recovery = await pullWorkspaceFromCloudOnLogin(workspace.workspaceId, {
        authenticatedUser: identity,
        forceRemoteRestore: true,
        validateRemoteBundle: (snapshot) =>
          validateCloudBundleForSession(snapshot, cloudSession)
      });
      if (!recovery.didReplaceLocalBundle) {
        if (recovery.outcome === "auth-required" && recovery.preference.provider === "gdrive") {
          // The Google Drive copy cannot be fetched without a fresh Google
          // token, and there is no session yet to request one from.
          throw new LocalAuthError(
            "CLOUD_AUTH_REQUIRED",
            "This workspace is stored in Google Drive but the device has no usable Google session. Restore the encrypted full-site backup from another device, then reconnect Google Drive.",
            { cause: localActivationError }
          );
        }
        throw localActivationError;
      }

      await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey);
      recoveredMissingLocalBundle = true;
    }

    const cloudSession = activeSession;
    if (!cloudSession || cloudSession.workspace.workspaceId !== workspace.workspaceId) {
      throw new LocalAuthError("NO_ACTIVE_SESSION", "No Apple workspace is unlocked.");
    }

    if (!recoveredMissingLocalBundle) {
      const cloudPull = await pullWorkspaceFromCloudOnLogin(workspace.workspaceId, {
        authenticatedUser: identity,
        downloadTimeoutMs: input.loginPullTimeoutMs,
        validateRemoteBundle: (snapshot) =>
          validateCloudBundleForSession(snapshot, cloudSession)
      });
      if (cloudPull.didReplaceLocalBundle) {
        await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey);
      }
    }

    upsertWorkspace(workspace);
    upsertStoredAppleAccount(account);
    await upsertWorkspaceMember(account);
    await createOrUpdateAppleDeviceVaultEntry(
      {
        appleAccountFingerprint: account.appleAccountFingerprint,
        workspaceId: workspace.workspaceId,
        masterKey
      }
    );
    void requestPersistentBrowserStorage();
    return user;
  } catch (error) {
    activeSession?.masterKey.fill(0);
    masterKey.fill(0);
    activeSession = null;
    deactivateMockDatabaseWorkspace();
    throw error;
  }
};

const assertAppleProfileOwnership = (
  profile: CloudKitAppleAccountProfile,
  fingerprint: string
) => {
  if (profile.appleAccountFingerprint !== fingerprint) {
    throw new LocalAuthError(
      "WORKSPACE_MISMATCH",
      "The CloudKit profile belongs to a different Apple account."
    );
  }
};

const toAppleProfileInput = (
  profile: CloudKitAppleAccountProfile,
  status: CloudKitAppleAccountProfileInput["status"]
): CloudKitAppleAccountProfileInput => ({
  accountId: profile.accountId,
  appleAccountFingerprint: profile.appleAccountFingerprint,
  createdAt: profile.createdAt,
  displayName: profile.displayName,
  recoveryMetadata: profile.recoveryMetadata,
  status,
  updatedAt: new Date().toISOString(),
  workspaceId: profile.workspaceId,
  workspaceRole: "owner"
});

const activateAppleProvisioningWorkspace = async (input: {
  account: StoredAppleAccount;
  fingerprint: string;
  masterKey: WorkspaceMasterKey;
  workspace: WorkspaceRecoveryMetadata;
  allowCreate: boolean;
}) => {
  const { account, fingerprint, masterKey, workspace, allowCreate } = input;
  upsertWorkspace(workspace);
  upsertStoredAppleAccount(account);
  setWorkspaceStorageProvider(workspace.workspaceId, "indexeddb");
  await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey, {
    allowCreate,
    initialDatabase: "examples"
  });
  await upsertWorkspaceMember(account);
  activeSession?.masterKey.fill(0);
  activeSession = {
    account,
    masterKey,
    user: toAuthUser(account, workspace),
    workspace
  };
  setWorkspaceStorageProvider(workspace.workspaceId, "cloudkit");
  await createOrUpdateAppleDeviceVaultEntry({
    appleAccountFingerprint: fingerprint,
    workspaceId: workspace.workspaceId,
    masterKey
  });
  return activeSession;
};

const finalizeAppleProvisioning = async (
  profile: CloudKitAppleAccountProfile,
  identity: CloudKitUserIdentity
) => {
  const session = activeSession;
  if (!session || session.workspace.workspaceId !== profile.workspaceId) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "The Apple workspace was not activated.");
  }

  const syncResult = await connectWorkspaceCloudKit(profile.workspaceId, {
    authenticatedUser: identity,
    validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, session)
  });
  if (syncResult.outcome !== "synced") {
    throw new LocalAuthError(
      "REGISTRATION_FAILED",
      syncResult.preference.lastError ||
        "The first encrypted iCloud copy could not be verified. Your local data was kept for retry."
    );
  }

  await assertCloudKitAuthenticatedUser(identity);
  try {
    await saveCloudKitAppleAccountProfile(
      toAppleProfileInput(profile, "ready"),
      identity,
      { expectedRecordChangeTag: profile.recordChangeTag }
    );
  } catch (saveError) {
    // The server may have committed the ready state even if the response was
    // lost. Re-read the fixed private record before reporting failure.
    const confirmed = await fetchCloudKitAppleAccountProfile(identity).catch(() => null);
    if (
      !confirmed ||
      confirmed.status !== "ready" ||
      confirmed.workspaceId !== profile.workspaceId ||
      confirmed.appleAccountFingerprint !== profile.appleAccountFingerprint
    ) {
      throw saveError;
    }
  }

  markAppleProfileConfirmed(profile.appleAccountFingerprint);
  void requestPersistentBrowserStorage();
  return session.user;
};

const debugAppleAuth = (step: string) => {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[apple-auth] ${step}`);
  }
};

/** Resolves an authenticated Apple identity into first-time setup or login. */
/**
 * Lifeline for a device that already joined this Apple account. Apple's web
 * front end can refuse every private-database request for an account while
 * Apple sign-in itself keeps working; such a device must still get in. The
 * master key is taken from this device (the vault first, then the registry
 * copy wrapped with the account fingerprint) and no CloudKit database request
 * is made. Returns null when this device holds nothing for the account, so the
 * caller falls back to the account profile in iCloud.
 */
const unlockAppleAccountFromDevice = async (
  stored: StoredAppleDevice
): Promise<{
  account: StoredAppleAccount;
  masterKey: WorkspaceMasterKey;
  workspace: WorkspaceRecoveryMetadata;
} | null> => {
  const { account, workspace } = stored;
  const fingerprint = account.appleAccountFingerprint;

  try {
    const masterKey = await unlockAppleDeviceVaultEntry({
      appleAccountFingerprint: fingerprint,
      workspaceId: account.workspaceId
    });
    debugAppleAuth("device unlock: vault unlocked");
    return { account, masterKey, workspace };
  } catch (error) {
    if (!(error instanceof AppleDeviceVaultError)) {
      throw error;
    }
    // Any vault problem (missing entry, damaged record, blocked IndexedDB)
    // falls through to the registry copy rather than locking the user out.
    debugAppleAuth(`device unlock: vault unavailable (${error.code}) -> registry unwrap`);
  }

  try {
    // The registry metadata is wrapped with the same fingerprint the vault
    // was keyed by, so it is this device's second copy of the key. Once a
    // recovery code replaces that wrap, this unwrap fails and the caller
    // continues with the cloud profile.
    const masterKey = await unlockAppleAccountRecovery(workspace, fingerprint);
    debugAppleAuth("device unlock: registry metadata unwrapped");
    return { account, masterKey, workspace };
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      debugAppleAuth(`device unlock: registry unwrap failed (${error.code})`);
      return null;
    }
    throw error;
  }
};

async function inspectAppleAccountUnlocked(
  identityInput: CloudKitUserIdentity
): Promise<AppleAccountLoginResolution> {
  debugAppleAuth("inspect: start");
  requireStorage();
  requireCompletedRestoreState();

  const identity = await assertCloudKitAuthenticatedUser(identityInput);
  debugAppleAuth("inspect: identity asserted");
  const fingerprint = await requireAppleFingerprint(identity);

  const stored = findStoredAppleAccountByFingerprint(fingerprint);
  const confirmed = stored ? isAppleProfileConfirmed(fingerprint, stored.workspace.workspaceId) : false;

  const enterFromDevice = async (reason: string) => {
    const fromDevice = stored ? await unlockAppleAccountFromDevice(stored) : null;
    if (!fromDevice) {
      return null;
    }
    debugAppleAuth(`inspect: entering from this device (${reason})`);
    const user = await activateAppleAccountSession({
      ...fromDevice,
      identity,
      loginPullTimeoutMs: lifelineLoginPullTimeout(fromDevice.workspace.workspaceId)
    });
    debugAppleAuth("inspect: session active (device lifeline)");
    void reconcileAppleProfileAfterLifeline(identity, fingerprint, fromDevice.workspace.workspaceId);
    return mockApi({ kind: "ready" as const, user });
  };

  if (confirmed) {
    // Lifeline: this device has entered the account's workspace before and
    // iCloud confirmed the account, so the key comes from the device and the
    // profile is only reconciled in the background.
    const ready = await enterFromDevice("profile confirmed earlier");
    if (ready) {
      return ready;
    }
  }

  let profile: CloudKitAppleAccountProfile | null;
  try {
    profile = stored
      ? await withDeadline(fetchCloudKitAppleAccountProfile(identity), STORED_ACCOUNT_PROFILE_DEADLINE_MS)
      : await fetchCloudKitAppleAccountProfile(identity);
  } catch (error) {
    if (!stored) {
      throw error;
    }
    debugAppleAuth("inspect: profile unavailable for a device that holds the workspace");
    if (!confirmed) {
      // Setup was never confirmed, but this device holds the workspace:
      // entering beats a lock-out while Apple refuses the database. The
      // background reconciliation finishes the setup once iCloud answers.
      const ready = await enterFromDevice("profile unavailable, setup unconfirmed");
      if (ready) {
        return ready;
      }
    }
    // The vault is gone and the registry copy is wrapped with the recovery
    // key the user saved; that key opens it.
    return { kind: "needs-recovery-key", accountName: stored.account.name };
  }
  debugAppleAuth(`inspect: profile ${profile ? profile.status : "not found"}`);
  if (!profile) {
    if (stored && !confirmed) {
      // Interrupted first-time setup: resume it for the existing workspace
      // (provisioning reuses the local workspace of a known fingerprint).
      return { kind: "needs-setup", suggestedName: stored.account.name };
    }
    if (stored) {
      // Never offer first-time setup over an existing local workspace: that
      // would mint a second workspace for the same Apple ID.
      return { kind: "needs-recovery-key", accountName: stored.account.name };
    }
    return {
      kind: "needs-setup",
      suggestedName: appleSuggestedName(identity)
    };
  }
  assertAppleProfileOwnership(profile, fingerprint);

  // Same-device fast path uses the local vault; a new device (no vault) unwraps
  // the master key from the account profile using the Apple account
  // fingerprint, so signing in with Apple is enough — no recovery key.
  // activateAppleAccountSession then enrolls this device's local vault.
  let masterKey: WorkspaceMasterKey;
  try {
    masterKey = await unlockAppleDeviceVaultEntry({
      appleAccountFingerprint: fingerprint,
      workspaceId: profile.workspaceId
    });
    debugAppleAuth("inspect: device vault unlocked");
  } catch (error) {
    if (
      error instanceof AppleDeviceVaultError &&
      ["VAULT_ENTRY_NOT_FOUND", "INVALID_VAULT_RECORD", "UNLOCK_FAILED"].includes(error.code)
    ) {
      debugAppleAuth(`inspect: vault miss (${error.code}) -> account unwrap`);
      masterKey = await unlockAppleAccountRecovery(profile.recoveryMetadata, fingerprint);
    } else {
      throw error;
    }
  }

  const account = createStoredAppleAccount(profile, fingerprint);
  debugAppleAuth("inspect: activating session");
  const user = await activateAppleAccountSession({
    account,
    identity,
    masterKey,
    workspace: profile.recoveryMetadata
  });
  debugAppleAuth("inspect: session active");
  if (profile.status === "provisioning") {
    try {
      await finalizeAppleProvisioning(profile, identity);
    } catch (error) {
      await logoutAppleSession();
      throw error;
    }
  }
  markAppleProfileConfirmed(fingerprint);
  return mockApi({ kind: "ready" as const, user });
}

/**
 * Serialized with registration, provisioning, and recovery: resolving an Apple
 * identity mutates the active session, account registry, and device vault, so
 * it must not interleave with the other auth mutations across tabs.
 */
export async function inspectAppleAccount(
  identityInput: CloudKitUserIdentity
): Promise<AppleAccountLoginResolution> {
  debugAppleAuth("inspect: waiting for auth mutation lock");
  return withAuthMutationLock(() => inspectAppleAccountUnlocked(identityInput));
}

/**
 * Offline entry for a device that already joined an Apple account. Runs only
 * when the Apple identity cannot be verified because CloudKit is unreachable;
 * an online "signed out" answer must still require a fresh Apple sign-in.
 * Three conditions gate the unlock: the persisted CloudKit session cookie
 * still exists (an explicit sign-out deletes it), this device holds the
 * account's vault entry, and the encrypted workspace is present locally.
 * Returns null whenever any condition fails, so callers fall back to the
 * normal online flow.
 */
async function unlockAppleAccountOfflineUnlocked(): Promise<{ user: LocalAuthUser } | null> {
  requireStorage();
  requireCompletedRestoreState();

  if (!hasPersistedCloudKitSession()) {
    debugAppleAuth("offline unlock: no persisted session cookie");
    return null;
  }

  const appleAccounts = readAccounts().filter(isStoredAppleAccount);
  if (appleAccounts.length !== 1) {
    // Zero accounts: nothing to unlock. Two or more: the right account cannot
    // be determined without verifying the Apple identity online.
    debugAppleAuth(
      `offline unlock: ${appleAccounts.length} local Apple accounts, need exactly 1`
    );
    return null;
  }

  const account = appleAccounts[0];
  const workspace = readWorkspaces().find(
    (item) => item.workspaceId === account.workspaceId
  );
  if (!workspace) {
    debugAppleAuth("offline unlock: workspace metadata missing");
    return null;
  }

  let masterKey: WorkspaceMasterKey;
  try {
    masterKey = await unlockAppleDeviceVaultEntry({
      appleAccountFingerprint: account.appleAccountFingerprint,
      workspaceId: account.workspaceId
    });
  } catch (error) {
    debugAppleAuth(
      `offline unlock: vault unavailable (${
        error instanceof AppleDeviceVaultError ? error.code : "unexpected"
      })`
    );
    return null;
  }

  try {
    const user = await setActiveSession(account, workspace, masterKey);
    debugAppleAuth("offline unlock: session active (local only)");
    return mockApi({ user });
  } catch (error) {
    masterKey.fill(0);
    debugAppleAuth("offline unlock: local activation failed");
    throw error;
  }
}

export async function unlockAppleAccountOffline(): Promise<{ user: LocalAuthUser } | null> {
  return withAuthMutationLock(() => unlockAppleAccountOfflineUnlocked());
}

async function provisionAppleAccountUnlocked(
  payload: AppleAccountSetupPayload
): Promise<RegisterResult> {
  requireStorage();
  requireCompletedRestoreState();

  const requestedName = payload.name.trim();
  if (!requestedName || requestedName.length > 80) {
    throw new LocalAuthError("REGISTRATION_FAILED", "Enter a name between 1 and 80 characters.");
  }

  const identity = await assertCloudKitAuthenticatedUser(payload.identity);
  const fingerprint = await requireAppleFingerprint(identity);
  let profile = await fetchCloudKitAppleAccountProfile(identity);
  if (profile) {
    assertAppleProfileOwnership(profile, fingerprint);
    if (profile.status === "ready") {
      throw new LocalAuthError(
        "ACCOUNT_EXISTS",
        "This Apple ID account already has a Studio Map OS profile."
      );
    }
  }

  const previousAccounts = readAccounts();
  const previousWorkspaces = readWorkspaces();
  const existingLocalAccount = previousAccounts.find(
    (item): item is StoredAppleAccount =>
      isStoredAppleAccount(item) && item.appleAccountFingerprint === fingerprint
  );

  let account: StoredAppleAccount;
  let workspace: WorkspaceRecoveryMetadata;
  let masterKey: WorkspaceMasterKey;
  let createdNewLocalWorkspace = false;

  if (profile) {
    // Resume an interrupted provisioning; the master key is unwrapped with the
    // Apple account fingerprint, not a recovery code.
    workspace = profile.recoveryMetadata;
    account = createStoredAppleAccount(profile, fingerprint);
    masterKey = await unlockAppleAccountRecovery(workspace, fingerprint);
  } else if (existingLocalAccount) {
    const localWorkspace = previousWorkspaces.find(
      (item) => item.workspaceId === existingLocalAccount.workspaceId
    );
    if (!localWorkspace) {
      throw new LocalAuthError("WORKSPACE_NOT_FOUND", "The local Apple workspace is unavailable.");
    }
    workspace = localWorkspace;
    account = existingLocalAccount;
    masterKey = await unlockAppleAccountRecovery(workspace, fingerprint);
  } else {
    const createdWorkspace = await createAppleAccountRecovery(fingerprint);
    workspace = createdWorkspace.metadata;
    masterKey = createdWorkspace.masterKey;
    const createdAt = new Date().toISOString();
    account = createStoredAppleAccount(
      {
        accountId: createId("account"),
        createdAt,
        displayName: requestedName,
        workspaceId: workspace.workspaceId,
        workspaceRole: "owner"
      },
      fingerprint
    );
    createdNewLocalWorkspace = true;
  }

  const previousPreference = getStoredWorkspaceStoragePreference(workspace.workspaceId);
  const workspaceStorageSnapshot = await captureMockDatabaseWorkspaceStorage(workspace.workspaceId);
  let profileCreationAttempted = Boolean(profile);

  try {
    await activateAppleProvisioningWorkspace({
      account,
      fingerprint,
      masterKey,
      workspace,
      allowCreate: createdNewLocalWorkspace
    });

    if (!profile) {
      const createdAt = account.createdAt;
      const provisioningInput: CloudKitAppleAccountProfileInput = {
        accountId: account.id,
        appleAccountFingerprint: fingerprint,
        createdAt,
        displayName: account.name,
        recoveryMetadata: workspace,
        status: "provisioning",
        updatedAt: new Date().toISOString(),
        workspaceId: workspace.workspaceId,
        workspaceRole: "owner"
      };
      profileCreationAttempted = true;
      try {
        profile = await createCloudKitAppleAccountProfile(provisioningInput, identity);
      } catch (createError) {
        const confirmed = await fetchCloudKitAppleAccountProfile(identity).catch(() => null);
        if (
          !confirmed ||
          confirmed.workspaceId !== workspace.workspaceId ||
          confirmed.appleAccountFingerprint !== fingerprint
        ) {
          throw createError;
        }
        profile = confirmed;
      }
    }

    if (!profile) {
      throw new LocalAuthError("REGISTRATION_FAILED", "The Apple account profile was not created.");
    }
    assertAppleProfileOwnership(profile, fingerprint);
    const user = profile.status === "ready"
      ? activeSession?.user
      : await finalizeAppleProvisioning(profile, identity);
    if (!user) {
      throw new LocalAuthError("NO_ACTIVE_SESSION", "The Apple workspace was not activated.");
    }

    return mockApi({
      claimedLegacyData: false,
      joinedExistingWorkspace: false,
      startedEmptyWorkspace: false,
      token: "apple-cloudkit-workspace-session",
      user
    });
  } catch (error) {
    if (activeSession?.masterKey === masterKey) {
      activeSession.masterKey.fill(0);
      activeSession = null;
      deactivateMockDatabaseWorkspace();
    } else {
      masterKey.fill(0);
    }

    // Before any CloudKit create could have committed, a brand-new local setup
    // can be rolled back safely. Once the request was attempted, retain the
    // encrypted local copy and device vault so a retry can reconcile an
    // uncertain server response without destroying the user's only data.
    if (createdNewLocalWorkspace && !profileCreationAttempted) {
      await deleteAppleDeviceVaultEntry({
        appleAccountFingerprint: fingerprint,
        workspaceId: workspace.workspaceId
      }).catch(() => false);
      writeAccounts(previousAccounts);
      writeArray(workspacesStorageKey, previousWorkspaces);
      await restoreMockDatabaseWorkspaceStorage(workspaceStorageSnapshot).catch(() => undefined);
      restoreWorkspaceStoragePreference(workspace.workspaceId, previousPreference);
    }

    if (error instanceof LocalAuthError) {
      throw error;
    }
    throw new LocalAuthError(
      "REGISTRATION_FAILED",
      "The Apple ID account is not ready yet. Your encrypted local copy was kept for retry.",
      { cause: error }
    );
  }
}

/** Creates or resumes an Apple-backed workspace after the one-time key was saved. */
export async function provisionAppleAccount(
  payload: AppleAccountSetupPayload
): Promise<RegisterResult> {
  return withAuthMutationLock(() => provisionAppleAccountUnlocked(payload));
}

async function recoverAppleAccountUnlocked(
  payload: AppleAccountRecoveryPayload
): Promise<{ token: string; user: LocalAuthUser }> {
  requireStorage();
  requireCompletedRestoreState();

  const identity = await assertCloudKitAuthenticatedUser(payload.identity);
  const fingerprint = await requireAppleFingerprint(identity);

  // A device that already holds the workspace opens it with the recovery key
  // alone: no CloudKit database request, which Apple may be refusing.
  const stored = findStoredAppleAccountByFingerprint(fingerprint);
  if (stored) {
    let localMasterKey: WorkspaceMasterKey;
    try {
      localMasterKey = await unlockWorkspaceRecovery(stored.workspace, payload.workspaceCode);
    } catch (error) {
      if (error instanceof WorkspaceCryptoError) {
        throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The 16-digit recovery key is incorrect.", { cause: error });
      }
      throw error;
    }
    debugAppleAuth("recover: registry metadata unlocked with the recovery key");
    const user = await activateAppleAccountSession({
      account: stored.account,
      identity,
      masterKey: localMasterKey,
      workspace: stored.workspace,
      loginPullTimeoutMs: lifelineLoginPullTimeout(stored.workspace.workspaceId)
    });
    void reconcileAppleProfileAfterLifeline(identity, fingerprint, stored.workspace.workspaceId);
    return mockApi({ token: "apple-cloudkit-workspace-session", user });
  }

  const profile = await fetchCloudKitAppleAccountProfile(identity);
  if (!profile) {
    throw new LocalAuthError("WORKSPACE_NOT_FOUND", "No Studio Map OS profile exists for this Apple ID account.");
  }
  assertAppleProfileOwnership(profile, fingerprint);

  let masterKey: WorkspaceMasterKey;
  try {
    masterKey = await unlockWorkspaceRecovery(profile.recoveryMetadata, payload.workspaceCode);
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The 16-digit recovery key is incorrect.", { cause: error });
    }
    throw error;
  }

  const previousAccounts = readAccounts();
  const previousWorkspaces = readWorkspaces();
  const previousPreference = getStoredWorkspaceStoragePreference(profile.workspaceId);
  // Never delete or overwrite an unreadable local ciphertext merely to attempt
  // cloud recovery. If it cannot be snapshotted, abort and leave it untouched.
  const workspaceStorageSnapshot = await captureMockDatabaseWorkspaceStorage(profile.workspaceId);
  const account = createStoredAppleAccount(profile, fingerprint);

  try {
    upsertWorkspace(profile.recoveryMetadata);
    upsertStoredAppleAccount(account);
    let user = await activateAppleAccountSession({
      account,
      identity,
      masterKey,
      workspace: profile.recoveryMetadata
    });
    if (profile.status === "provisioning") {
      user = await finalizeAppleProvisioning(profile, identity);
    }
    markAppleProfileConfirmed(fingerprint);
    return mockApi({ token: "apple-cloudkit-workspace-session", user });
  } catch (error) {
    if (activeSession?.masterKey === masterKey) {
      activeSession.masterKey.fill(0);
      activeSession = null;
      deactivateMockDatabaseWorkspace();
    } else {
      masterKey.fill(0);
    }
    writeAccounts(previousAccounts);
    writeArray(workspacesStorageKey, previousWorkspaces);
    restoreWorkspaceStoragePreference(profile.workspaceId, previousPreference);
    await restoreMockDatabaseWorkspaceStorage(workspaceStorageSnapshot).catch(() => undefined);
    throw error;
  }
}

/** Unlocks an existing Apple workspace once on a new device, then enrolls it. */
export async function recoverAppleAccount(
  payload: AppleAccountRecoveryPayload
): Promise<{ token: string; user: LocalAuthUser }> {
  return withAuthMutationLock(() => recoverAppleAccountUnlocked(payload));
}

/**
 * The workspace registry is shared by every tab; the in-memory session keeps
 * a copy of the metadata from sign-in. Adopt the registry copy whenever it
 * changed (another tab created or replaced a recovery key), so this tab
 * verifies codes and seals backups against the wrap that is actually stored.
 */
const refreshActiveSessionWorkspaceFromRegistry = (session: ActiveAuthSession) => {
  const registryCopy = readWorkspaces().find(
    (item) => item.workspaceId === session.workspace.workspaceId
  );
  if (
    registryCopy &&
    registryCopy.wrappedMasterKey.ciphertext !== session.workspace.wrappedMasterKey.ciphertext
  ) {
    session.workspace = registryCopy;
  }
  return session.workspace;
};

export type AppleWorkspaceRecoveryState = "not-apple" | "needs-key" | "has-key" | "unknown";

const appleWorkspaceRecoveryState = async (
  account: StoredAppleAccount,
  workspace: WorkspaceRecoveryMetadata,
  masterKey: WorkspaceMasterKey
): Promise<AppleWorkspaceRecoveryState> => {
  try {
    const unwrapped = await unlockAppleAccountRecovery(workspace, account.appleAccountFingerprint);
    try {
      return masterKeysMatch(unwrapped, masterKey) ? "needs-key" : "unknown";
    } finally {
      unwrapped.fill(0);
    }
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      // Only a wrap that is not the fingerprint's means a recovery key exists.
      return error.code === "RECOVERY_UNLOCK_FAILED" ? "has-key" : "unknown";
    }
    throw error;
  }
};

/**
 * Whether the active Apple ID workspace still relies on the account
 * fingerprint alone ("needs-key"), already has a 16-digit recovery key
 * ("has-key"), or cannot be judged because the metadata is unreadable
 * ("unknown"). Reads the shared registry so every tab agrees.
 */
export async function getActiveAppleWorkspaceRecoveryState(): Promise<AppleWorkspaceRecoveryState> {
  const session = activeSession;
  if (!session) {
    return "not-apple";
  }
  if (isStoredGoogleAccount(session.account)) {
    // A Google workspace always carries a recovery-key wrap (the switch
    // required one, and a new device receives it with the profile).
    refreshActiveSessionWorkspaceFromRegistry(session);
    return "has-key";
  }
  if (!isStoredAppleAccount(session.account)) {
    return "not-apple";
  }
  const workspace = refreshActiveSessionWorkspaceFromRegistry(session);
  return appleWorkspaceRecoveryState(session.account, workspace, session.masterKey);
}

/**
 * A Google-owned workspace shares one recovery key across devices through
 * the Drive profile, so a new key is written there BEFORE the local registry
 * changes. Any failure aborts the replacement and the old key stays valid.
 */
const pushRecoveryWrapToGoogleProfile = async (
  workspaceId: string,
  metadata: WorkspaceRecoveryMetadata,
  required: boolean
): Promise<boolean> => {
  let token: string;
  try {
    token = requireGoogleDriveAccessToken(workspaceId).accessToken;
  } catch (error) {
    if (!required) {
      return false;
    }
    throw new LocalAuthError(
      "CLOUD_AUTH_REQUIRED",
      "Reconnect Google Drive first: the recovery key is shared through the Google Drive profile.",
      { cause: error }
    );
  }
  const stored = await readGoogleAccountProfile(token, workspaceId);
  if (!stored) {
    if (!required) {
      return false;
    }
    throw new LocalAuthError(
      "GOOGLE_PROFILE_MISMATCH",
      "Google Drive holds no account profile for this workspace."
    );
  }
  try {
    await writeGoogleAccountProfile(
      token,
      {
        ...stored.profile,
        wraps: { ...stored.profile.wraps, code: metadata },
        updatedAt: new Date().toISOString()
      },
      { expectedTag: stored.tag }
    );
  } catch (error) {
    // The write may have committed even though the answer was lost: look
    // before reporting a failure, so Drive and this device never disagree.
    const after = await readGoogleAccountProfile(token, workspaceId).catch(() => null);
    if (after?.profile.wraps.code?.wrappedMasterKey.ciphertext !== metadata.wrappedMasterKey.ciphertext) {
      throw error;
    }
  }
  return true;
};

// A new recovery key waits here until the user confirms it is saved; only
// then is it written anywhere. Closing the tab before that changes nothing.
let pendingRecoveryKey: {
  workspaceId: string;
  accountId: string;
  baseCiphertext: string;
  metadata: WorkspaceRecoveryMetadata;
} | null = null;

/** Drops a recovery key that was shown but never confirmed. */
export function discardPendingRecoveryKey() {
  pendingRecoveryKey = null;
}

/**
 * Makes the shown recovery key the workspace's key. For a workspace owned by
 * a Google account the Drive profile is updated first (every device shares
 * the key through it); a failure leaves the previous key fully valid.
 */
export async function confirmRecoveryKeyForActiveAppleWorkspace(): Promise<void> {
  return withAuthMutationLock(async () => {
    requireStorage();
    const session = activeSession;
    const pending = pendingRecoveryKey;
    if (
      !session ||
      !pending ||
      pending.workspaceId !== session.workspace.workspaceId ||
      pending.accountId !== session.account.id
    ) {
      throw new LocalAuthError("NO_ACTIVE_SESSION", "This recovery key expired. Create a new one.");
    }
    const current = refreshActiveSessionWorkspaceFromRegistry(session);
    if (current.wrappedMasterKey.ciphertext !== pending.baseCiphertext) {
      pendingRecoveryKey = null;
      throw new LocalAuthError(
        "RECOVERY_KEY_EXISTS",
        "The recovery key changed in another window. Check it before creating a new one."
      );
    }
    const required =
      isStoredGoogleAccount(session.account) || getGoogleAccountForWorkspace(pending.workspaceId) !== null;
    const preference = getWorkspaceStoragePreference(pending.workspaceId);
    const shared =
      required || preference.provider === "gdrive"
        ? await pushRecoveryWrapToGoogleProfile(pending.workspaceId, pending.metadata, required)
        : false;
    upsertWorkspace(pending.metadata);
    session.workspace = pending.metadata;
    if (shared) {
      markRecoveryWrapShared(pending.workspaceId, pending.metadata);
    }
    pendingRecoveryKey = null;
  });
}

/**
 * Gives the active Apple ID workspace a 16-digit recovery key of its own. The
 * same master key is re-wrapped with the code and that wrap replaces the
 * registry copy; the device vault and the iCloud profile are untouched, so
 * every existing way in keeps working. Refuses to mint a second key over an
 * existing one unless `replace` is set, because the previous key stops
 * working the moment the registry changes. Returns the code, shown once.
 */
export async function createRecoveryKeyForActiveAppleWorkspace(
  options: { replace?: boolean } = {}
): Promise<{ workspaceCode: string }> {
  return withAuthMutationLock(async () => {
    requireStorage();
    const session = activeSession;
    if (!session || (!isStoredAppleAccount(session.account) && !isStoredGoogleAccount(session.account))) {
      throw new LocalAuthError("NO_ACTIVE_SESSION", "No Apple ID or Google workspace is unlocked.");
    }
    const registryCopy = refreshActiveSessionWorkspaceFromRegistry(session);
    const state = isStoredAppleAccount(session.account)
      ? await appleWorkspaceRecoveryState(session.account, registryCopy, session.masterKey)
      : "has-key";
    if (state === "unknown") {
      throw new LocalAuthError("STORAGE_CORRUPT", "The workspace recovery metadata could not be read.");
    }
    if (state === "has-key" && !options.replace) {
      throw new LocalAuthError("RECOVERY_KEY_EXISTS", "This workspace already has a recovery key.");
    }
    const workspaceCode = generateWorkspaceCode();
    const metadata = await protectMasterKeyWithWorkspaceCode(
      session.masterKey,
      workspaceCode,
      session.workspace.workspaceId
    );
    // Prove the wrap round-trips before anything on disk is replaced.
    const check = await unlockWorkspaceRecovery(metadata, workspaceCode);
    try {
      if (!masterKeysMatch(check, session.masterKey)) {
        throw new LocalAuthError("STORAGE_CORRUPT", "The recovery key wrap did not round-trip.");
      }
    } finally {
      check.fill(0);
    }
    // Nothing is written yet: the key is shown first and becomes valid only
    // when the user confirms it is saved.
    pendingRecoveryKey = {
      workspaceId: session.workspace.workspaceId,
      accountId: session.account.id,
      baseCiphertext: registryCopy.wrappedMasterKey.ciphertext,
      metadata
    };
    return { workspaceCode };
  });
}

// ---------------------------------------------------------------------------
// Google accounts: "sign in is unlock" through the Google identity, with the
// account profile (both wraps of the master key) in the Drive app data folder.
// ---------------------------------------------------------------------------

export type GoogleAccountLoginResolution =
  | { kind: "ready"; user: LocalAuthUser }
  | { kind: "needs-setup"; email: string; displayName: string };

export type GoogleSignInPayload = { token: GoogleStoredToken; clientId: string };

// Bound for the Drive pull when a device enters from its vault with a live
// token: entry must not hang on a slow link, sync catches up afterwards.
const LOCAL_ENTRY_PULL_TIMEOUT_MS = 20_000;

const findStoredGoogleAccountByDigest = (digest: string) =>
  readAccounts()
    .filter(isStoredGoogleAccount)
    .find((item) => item.googleAccountDigest === digest) ?? null;

const googlePrivateEmail = (digest: string) => `google.${digest.slice(0, 16)}@private.studio-map.local`;

/**
 * The email a Google record stores. It is for display and lookup only, so
 * when another account on this device already uses the address (a password
 * account registered with the same Gmail address), the record falls back to
 * a private address instead of refusing the sign-in.
 */
const googleRecordEmail = (email: string, digest: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return googlePrivateEmail(digest);
  }
  const clash = readAccounts().some(
    (item) => !isStoredGoogleAccount(item) && normalizeEmail(item.email) === normalized
  );
  return clash ? googlePrivateEmail(digest) : normalized;
};

// Per workspace: the recovery wrap this device last shared with the Drive
// profile (pushed or adopted). It tells "the user replaced the key on another
// device" apart from "the user created a key of their own on this device".
const googleRecoverySyncKey = "studio-map-os.google-recovery-sync.v1";

const readSharedRecoveryWraps = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(googleRecoverySyncKey) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
};

const markRecoveryWrapShared = (workspaceId: string, metadata: WorkspaceRecoveryMetadata) => {
  try {
    window.localStorage.setItem(
      googleRecoverySyncKey,
      JSON.stringify({ ...readSharedRecoveryWraps(), [workspaceId]: metadata.wrappedMasterKey.ciphertext })
    );
  } catch {
    // Without the marker a later replacement elsewhere is simply not adopted here.
  }
};

/**
 * Which recovery wrap this device keeps when the Drive profile carries the
 * shared one. A key the user created on this device is never overwritten:
 * the profile's wrap is adopted only when this device has none, holds only
 * the Apple fingerprint wrap (not a user key), or was in step with the
 * profile before (so the difference is a deliberate replacement elsewhere).
 * Every wrap is a wrap of the same master key; this only decides which code
 * this device verifies exports and recovery against.
 */
const reconcileRecoveryWrap = async (
  workspaceId: string,
  shared: WorkspaceRecoveryMetadata | null
): Promise<WorkspaceRecoveryMetadata | null> => {
  const local = readWorkspaces().find((item) => item.workspaceId === workspaceId) ?? null;
  if (!shared) {
    return local;
  }
  if (!local || local.wrappedMasterKey.ciphertext === shared.wrappedMasterKey.ciphertext) {
    return shared;
  }
  const appleFingerprints = readAccounts()
    .filter(isStoredAppleAccount)
    .filter((item) => item.workspaceId === workspaceId)
    .map((item) => item.appleAccountFingerprint);
  for (const fingerprint of appleFingerprints) {
    try {
      const unwrapped = await unlockAppleAccountRecovery(local, fingerprint);
      unwrapped.fill(0);
      return shared;
    } catch (error) {
      if (!(error instanceof WorkspaceCryptoError)) {
        throw error;
      }
    }
  }
  if (readSharedRecoveryWraps()[workspaceId] === local.wrappedMasterKey.ciphertext) {
    return shared;
  }
  return local;
};

/** The Google account record bound to a workspace on this device, if any. */
export function getGoogleAccountForWorkspace(workspaceId: string): { email: string; name: string } | null {
  try {
    const account = readAccounts()
      .filter(isStoredGoogleAccount)
      .find((item) => item.workspaceId === workspaceId);
    return account ? { email: account.email, name: account.name } : null;
  } catch {
    return null;
  }
}

/**
 * What the login page can show for "continue on this device" without any
 * network. Null after an explicit sign-out: that closed the local entry.
 */
export function getStoredGoogleAccountSummary(): { email: string; name: string } | null {
  try {
    const settings = readGoogleSignInSettings();
    if (settings.signedOut) {
      return null;
    }
    const accounts = readAccounts().filter(isStoredGoogleAccount);
    const account =
      accounts.find((item) => normalizeEmail(item.email) === normalizeEmail(settings.email)) ??
      (accounts.length === 1 ? accounts[0] : undefined);
    return account ? { email: account.email, name: account.name } : null;
  } catch {
    return null;
  }
}

/** The registry rules for a Google record, without writing anything. */
const assertStoredGoogleAccountAllowed = (account: StoredGoogleAccount) => {
  const accounts = readAccounts();
  const conflicting = accounts.find(
    (item) =>
      item.id === account.id ||
      (isStoredGoogleAccount(item) && item.googleAccountDigest === account.googleAccountDigest) ||
      (!isStoredGoogleAccount(item) && normalizeEmail(item.email) === normalizeEmail(account.email))
  );
  if (conflicting && !isStoredGoogleAccount(conflicting)) {
    throw new LocalAuthError(
      "ACCOUNT_EXISTS",
      "Another account on this device already uses this email address."
    );
  }
  if (
    conflicting &&
    (conflicting.id !== account.id ||
      conflicting.workspaceId !== account.workspaceId ||
      conflicting.googleAccountDigest !== account.googleAccountDigest)
  ) {
    throw new LocalAuthError(
      "WORKSPACE_MISMATCH",
      "This device already links the Google account to another Studio Map OS workspace."
    );
  }
  return accounts;
};

const upsertStoredGoogleAccount = (account: StoredGoogleAccount) => {
  const accounts = assertStoredGoogleAccountAllowed(account);
  const next = accounts.filter(
    (item) =>
      item.id !== account.id &&
      !(isStoredGoogleAccount(item) && item.googleAccountDigest === account.googleAccountDigest)
  );
  writeAccounts([...next, account]);
};

const createStoredGoogleAccountFromProfile = (
  profile: GoogleAccountProfile,
  digest: string,
  info: GoogleUserInfo
): StoredGoogleAccount => ({
  id: profile.accountId,
  avatar: "",
  authMethod: "google",
  googleAccountDigest: digest,
  createdAt: isCanonicalIsoDate(profile.createdAt) ? profile.createdAt : new Date().toISOString(),
  email: googleRecordEmail(info.email || profile.email, digest),
  name: profile.displayName || info.name || "Studio Map OS",
  workspaceId: profile.workspaceId,
  workspaceRole: "owner"
});

/**
 * Opens a Google-backed workspace on this device. Drive is connected first
 * (a new device restores its bundle from there, and sync starts without a
 * second popup), then the registry, the account record, the member row and
 * the device vault are brought up to date.
 */
const activateGoogleAccountSession = async (input: {
  account: StoredGoogleAccount;
  masterKey: WorkspaceMasterKey;
  workspace: WorkspaceRecoveryMetadata;
  /** The recovery wrap the Drive profile carries, when it was read. */
  sharedRecoveryWrap: WorkspaceRecoveryMetadata | null;
  token: GoogleStoredToken;
  clientId: string;
}) => {
  const { account, masterKey, token, clientId, workspace } = input;
  let user: LocalAuthUser;
  let recoveredMissingLocalBundle = false;
  const storedPreference = getStoredWorkspaceStoragePreference(workspace.workspaceId);
  let switchedProvider = false;
  let seeded = false;
  try {
    // Drive is best effort here: a device that already holds the workspace
    // must get in even while Google's API is unreachable (the storage card
    // reports the sync state). Only a token for a different account than the
    // one this workspace is bound to is a hard stop.
    try {
      await seedGoogleDriveConnection(workspace.workspaceId, token, clientId);
      seeded = true;
    } catch (error) {
      if (error instanceof CloudProviderError && error.code === "ACCOUNT_MISMATCH") {
        throw error;
      }
      debugAppleAuth("google: Drive could not be connected at sign-in; continuing locally");
    }
    if (getWorkspaceStoragePreference(workspace.workspaceId).provider !== "gdrive") {
      setWorkspaceStorageProvider(workspace.workspaceId, "gdrive");
      // This device has no shared history with the Drive copy yet. Clearing
      // the pending flag and the tag makes the login pull compare the two
      // bundles: identical settles silently, different becomes the usual
      // keep-local / use-Drive choice. Local edits are never overwritten.
      updateWorkspaceStoragePreference(workspace.workspaceId, {
        pendingUpload: false,
        cloudManifestChangeTag: null
      });
      switchedProvider = true;
    }

    try {
      user = await setActiveSession(account, workspace, masterKey);
    } catch (localActivationError) {
      user = toAuthUser(account, workspace);
      activeSession?.masterKey.fill(0);
      activeSession = { account, masterKey, user, workspace };
      const cloudSession = activeSession;
      const recovery = await pullWorkspaceFromCloudOnLogin(workspace.workspaceId, {
        forceRemoteRestore: true,
        validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, cloudSession)
      });
      if (!recovery.didReplaceLocalBundle) {
        throw new LocalAuthError(
          "WORKSPACE_NOT_FOUND",
          `This device has no local copy of the workspace and the Google Drive copy could not be downloaded (${recovery.outcome}). Check the connection and sign in again.`,
          { cause: localActivationError }
        );
      }
      await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey);
      recoveredMissingLocalBundle = true;
    }

    const cloudSession = activeSession;
    if (!cloudSession || cloudSession.workspace.workspaceId !== workspace.workspaceId) {
      throw new LocalAuthError("NO_ACTIVE_SESSION", "No Google workspace is unlocked.");
    }
    if (!recoveredMissingLocalBundle) {
      const cloudPull = await pullWorkspaceFromCloudOnLogin(workspace.workspaceId, {
        validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, cloudSession)
      });
      if (cloudPull.didReplaceLocalBundle) {
        await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey);
      }
    }

    upsertWorkspace(workspace);
    if (
      input.sharedRecoveryWrap &&
      input.sharedRecoveryWrap.wrappedMasterKey.ciphertext === workspace.wrappedMasterKey.ciphertext
    ) {
      markRecoveryWrapShared(workspace.workspaceId, workspace);
    }
    upsertStoredGoogleAccount(account);
    await upsertWorkspaceMember(account);
    await createOrUpdateAppleDeviceVaultEntry({
      appleAccountFingerprint: account.googleAccountDigest,
      workspaceId: workspace.workspaceId,
      masterKey
    });
    markGoogleSignedIn({ email: account.email, displayName: account.name });
    rememberLastEmail(account.email);
    void requestPersistentBrowserStorage();
    return user;
  } catch (error) {
    activeSession?.masterKey.fill(0);
    masterKey.fill(0);
    activeSession = null;
    deactivateMockDatabaseWorkspace();
    if (switchedProvider) {
      // A failed Google attempt must not take away the cloud this device
      // used before (its sign-in and recovery paths depend on it).
      restoreWorkspaceStoragePreference(workspace.workspaceId, storedPreference);
    }
    if (seeded) {
      // No session survives this attempt, so no Drive-capable token may either.
      forgetGoogleDriveAccessToken(workspace.workspaceId);
    }
    throw error;
  }
};

async function signInWithGoogleUnlocked(payload: GoogleSignInPayload): Promise<GoogleAccountLoginResolution> {
  requireStorage();
  requireCompletedRestoreState();

  const info = await fetchGoogleUserInfo(payload.token);
  const fingerprint = await googleAccountFingerprint(info.sub);
  const digest = await googleAccountOwnerDigest(fingerprint);
  const stored = findStoredGoogleAccountByDigest(digest);
  const storedWorkspace = stored
    ? readWorkspaces().find((item) => item.workspaceId === stored.workspaceId)
    : undefined;

  if (stored && storedWorkspace) {
    // The Drive profile carries the current recovery wrap (replacing a key
    // updates it first), so a live sign-in adopts it. Reading it is best
    // effort while the vault can open the workspace.
    let profile: Awaited<ReturnType<typeof readGoogleAccountProfile>> = null;
    let profileReadFailed: unknown = null;
    try {
      profile = await readGoogleAccountProfile(payload.token.accessToken, stored.workspaceId);
    } catch (error) {
      profileReadFailed = error;
    }
    const usableProfile =
      profile && profile.profile.ownerDigest === digest && profile.profile.status === "ready"
        ? profile
        : null;

    // The device vault is the local copy of the key; only when it is gone
    // does the account wrap in the Drive profile unlock the workspace.
    let masterKey: WorkspaceMasterKey | null = null;
    try {
      masterKey = await unlockAppleDeviceVaultEntry({
        appleAccountFingerprint: digest,
        workspaceId: stored.workspaceId
      });
    } catch (error) {
      if (!(error instanceof AppleDeviceVaultError)) {
        throw error;
      }
    }
    if (!masterKey) {
      if (profileReadFailed) {
        throw profileReadFailed;
      }
      if (!profile || profile.profile.ownerDigest !== digest) {
        throw new LocalAuthError(
          "GOOGLE_PROFILE_MISMATCH",
          "Google Drive holds no account profile for this workspace and Google account."
        );
      }
      try {
        masterKey = await unlockAccountRecovery(profile.profile.wraps.account, fingerprint);
      } catch (error) {
        if (error instanceof WorkspaceCryptoError) {
          throw new LocalAuthError(
            "GOOGLE_PROFILE_MISMATCH",
            "The account profile in Google Drive cannot be unlocked by this Google account.",
            { cause: error }
          );
        }
        throw error;
      }
    }
    const sharedRecoveryWrap = usableProfile?.profile.wraps.code ?? null;
    const user = await activateGoogleAccountSession({
      account: {
        ...stored,
        email: googleRecordEmail(info.email || stored.email, digest),
        name: stored.name || info.name || "Studio Map OS"
      },
      masterKey,
      workspace: (await reconcileRecoveryWrap(stored.workspaceId, sharedRecoveryWrap)) ?? storedWorkspace,
      sharedRecoveryWrap,
      token: payload.token,
      clientId: payload.clientId
    });
    return mockApi({ kind: "ready" as const, user });
  }
  if (stored) {
    // The account record survived but its workspace metadata did not: the
    // profile in Drive is the better copy, so let it replace the record.
    writeAccounts(readAccounts().filter((item) => item.id !== stored.id));
  }

  // A device that has never opened this account: the profile in Drive carries
  // both wraps, and the workspace bundle follows from the same folder.
  const owned = (await listGoogleAccountProfiles(payload.token.accessToken)).filter(
    (item) => item.profile.ownerDigest === digest
  );
  const profiles = owned.filter((item) => item.profile.status === "ready");
  if (profiles.length === 0) {
    if (owned.length > 0) {
      throw new LocalAuthError(
        "MIGRATION_INCOMPLETE",
        "Switching to Google sign-in did not finish. Open the device that started it and run the switch again."
      );
    }
    return mockApi({ kind: "needs-setup" as const, email: info.email, displayName: info.name });
  }
  profiles.sort((left, right) => right.profile.updatedAt.localeCompare(left.profile.updatedAt));
  const chosen = profiles[0].profile;
  if (!chosen.wraps.code) {
    // Every device must share the recovery key; never fall back to putting
    // the account wrap into the local registry.
    throw new LocalAuthError(
      "MIGRATION_INCOMPLETE",
      "The account profile in Google Drive has no recovery key. Run the switch again on the device that started it."
    );
  }
  const recoveryWrap = chosen.wraps.code;
  let masterKey: WorkspaceMasterKey;
  try {
    masterKey = await unlockAccountRecovery(chosen.wraps.account, fingerprint);
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      throw new LocalAuthError(
        "GOOGLE_PROFILE_MISMATCH",
        "The account profile in Google Drive cannot be unlocked by this Google account.",
        { cause: error }
      );
    }
    throw error;
  }
  const account = createStoredGoogleAccountFromProfile(chosen, digest, info);
  try {
    // Refuse before downloading the whole workspace, not after.
    assertStoredGoogleAccountAllowed(account);
  } catch (error) {
    masterKey.fill(0);
    throw error;
  }
  const user = await activateGoogleAccountSession({
    account,
    masterKey,
    workspace: (await reconcileRecoveryWrap(chosen.workspaceId, recoveryWrap)) ?? recoveryWrap,
    sharedRecoveryWrap: recoveryWrap,
    token: payload.token,
    clientId: payload.clientId
  });
  return mockApi({ kind: "ready" as const, user });
}

/** Signs in with a Google token obtained inside a click (see requestGoogleSignIn). */
export async function signInWithGoogle(payload: GoogleSignInPayload): Promise<GoogleAccountLoginResolution> {
  return withAuthMutationLock(() => signInWithGoogleUnlocked(payload));
}

/**
 * Entry without asking Google: the device vault holds the key for a Google
 * account that signed in here before and has not signed out. With a live
 * sign-in token the Drive connection is seeded and the usual login pull runs
 * (bounded); without one the session is local until the user reconnects.
 */
async function unlockGoogleAccountLocallyUnlocked(options: {
  allowWithoutToken?: boolean;
}): Promise<{ user: LocalAuthUser } | null> {
  requireStorage();
  requireCompletedRestoreState();

  const settings = readGoogleSignInSettings();
  if (settings.signedOut) {
    return null;
  }
  const token = readGoogleSignInToken();
  const tokenUsable = token !== null && hasUsableGoogleSignInToken();
  if (!tokenUsable && !options.allowWithoutToken) {
    return null;
  }
  const accounts = readAccounts().filter(isStoredGoogleAccount);
  const account =
    accounts.find((item) => normalizeEmail(item.email) === normalizeEmail(settings.email)) ??
    (accounts.length === 1 ? accounts[0] : null);
  if (!account) {
    return null;
  }
  const workspace = readWorkspaces().find((item) => item.workspaceId === account.workspaceId);
  if (!workspace) {
    return null;
  }

  let masterKey: WorkspaceMasterKey;
  try {
    masterKey = await unlockAppleDeviceVaultEntry({
      appleAccountFingerprint: account.googleAccountDigest,
      workspaceId: account.workspaceId
    });
  } catch (error) {
    if (error instanceof AppleDeviceVaultError) {
      return null;
    }
    throw error;
  }

  let user: LocalAuthUser;
  try {
    user = await setActiveSession(account, workspace, masterKey);
  } catch (error) {
    masterKey.fill(0);
    throw error;
  }
  rememberLastEmail(account.email);

  if (tokenUsable && token) {
    // Best effort: a reachable Drive lets the session sync right away; a
    // failure here is recorded on the storage card, never a lock-out.
    const session = activeSession;
    let replaced = false;
    try {
      await seedGoogleDriveConnection(
        workspace.workspaceId,
        token,
        settings.clientId || resolveGoogleClientId()
      );
      const pull = await pullWorkspaceFromCloudOnLogin(workspace.workspaceId, {
        downloadTimeoutMs: LOCAL_ENTRY_PULL_TIMEOUT_MS,
        validateRemoteBundle: (snapshot) =>
          session ? validateCloudBundleForSession(snapshot, session) : undefined
      });
      replaced = pull.didReplaceLocalBundle;
      // A recovery key replaced on another device reaches this one here too.
      const profile = await readGoogleAccountProfile(token.accessToken, workspace.workspaceId);
      const shared =
        profile && profile.profile.ownerDigest === account.googleAccountDigest && profile.profile.status === "ready"
          ? profile.profile.wraps.code
          : null;
      const kept = await reconcileRecoveryWrap(workspace.workspaceId, shared);
      if (shared && kept && kept.wrappedMasterKey.ciphertext === shared.wrappedMasterKey.ciphertext) {
        upsertWorkspace(kept);
        markRecoveryWrapShared(workspace.workspaceId, kept);
        if (activeSession && activeSession.workspace.workspaceId === workspace.workspaceId) {
          activeSession.workspace = kept;
        }
      }
    } catch {
      // Sync stays pending until the user reconnects Google.
    }
    if (replaced && activeSession) {
      // The IndexedDB bundle changed under the open session: the in-memory
      // database must follow, or the next save would overwrite the newer copy.
      try {
        await activateMockDatabaseWorkspace(workspace.workspaceId, activeSession.masterKey);
      } catch (error) {
        activeSession.masterKey.fill(0);
        activeSession = null;
        deactivateMockDatabaseWorkspace();
        throw error;
      }
    }
  }
  return mockApi({ user });
}

export async function unlockGoogleAccountLocally(
  options: { allowWithoutToken?: boolean } = {}
): Promise<{ user: LocalAuthUser } | null> {
  return withAuthMutationLock(() => unlockGoogleAccountLocallyUnlocked(options));
}

/**
 * Hands the active Apple ID workspace to a Google account. The same master
 * key is wrapped once more with the Google fingerprint; the profile with both
 * wraps goes to the Drive app data folder before anything local changes; the
 * Apple account record stays, so Apple sign-in keeps working on this device
 * until it is turned off.
 */
async function migrateAppleAccountToGoogleUnlocked(
  payload: GoogleSignInPayload
): Promise<{ user: LocalAuthUser; email: string; workspaceReplaced: boolean }> {
  requireStorage();
  const session = activeSession;
  if (!session || !isStoredAppleAccount(session.account)) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "Sign in with Apple ID first.");
  }
  const appleAccount = session.account;
  const workspaceId = session.workspace.workspaceId;
  const registryWorkspace = refreshActiveSessionWorkspaceFromRegistry(session);
  const recoveryState = await appleWorkspaceRecoveryState(appleAccount, registryWorkspace, session.masterKey);
  if (recoveryState !== "has-key") {
    throw new LocalAuthError(
      "MIGRATION_INCOMPLETE",
      "Create the recovery key for this workspace before switching to Google sign-in."
    );
  }
  if (getWorkspaceStoragePreference(workspaceId).provider !== "gdrive") {
    throw new LocalAuthError(
      "MIGRATION_INCOMPLETE",
      "Switch the workspace storage to Google Drive before switching to Google sign-in."
    );
  }

  const info = await fetchGoogleUserInfo(payload.token);
  const fingerprint = await googleAccountFingerprint(info.sub);
  const ownerDigest = await googleAccountOwnerDigest(fingerprint);
  const existingGoogle = findStoredGoogleAccountByDigest(ownerDigest);
  if (existingGoogle && existingGoogle.workspaceId !== workspaceId) {
    throw new LocalAuthError(
      "WORKSPACE_MISMATCH",
      "This Google account already owns a different workspace on this device."
    );
  }
  // The popup may have picked a different Google account than the one this
  // workspace's Drive copy belongs to; that is refused before any write.
  await seedGoogleDriveConnection(workspaceId, payload.token, payload.clientId);
  // One Google identity owns one workspace, in Drive as on the device. A
  // profile that never became ready elsewhere is an abandoned attempt.
  const ownedProfiles = (await listGoogleAccountProfiles(payload.token.accessToken)).filter(
    (item) => item.profile.ownerDigest === ownerDigest
  );
  if (
    ownedProfiles.some(
      (item) => item.profile.workspaceId !== workspaceId && item.profile.status === "ready"
    )
  ) {
    throw new LocalAuthError(
      "WORKSPACE_MISMATCH",
      "This Google account already owns another Studio Map OS workspace in Google Drive."
    );
  }
  const existing = ownedProfiles.find((item) => item.profile.workspaceId === workspaceId) ?? null;

  let accountProtection: WorkspaceRecoveryMetadata;
  if (existing) {
    if (existing.profile.ownerDigest !== ownerDigest) {
      throw new LocalAuthError(
        "GOOGLE_PROFILE_MISMATCH",
        "A different Google account already owns this workspace in Google Drive."
      );
    }
    // Adopt the wrap Drive already holds, after proving it is the same key.
    let unwrapped: WorkspaceMasterKey;
    try {
      unwrapped = await unlockAccountRecovery(existing.profile.wraps.account, fingerprint);
    } catch (error) {
      throw new LocalAuthError(
        "GOOGLE_PROFILE_MISMATCH",
        "The account profile in Google Drive cannot be unlocked by this Google account.",
        { cause: error }
      );
    }
    try {
      if (!masterKeysMatch(unwrapped, session.masterKey)) {
        throw new LocalAuthError(
          "GOOGLE_PROFILE_MISMATCH",
          "The account profile in Google Drive belongs to a different copy of this workspace."
        );
      }
    } finally {
      unwrapped.fill(0);
    }
    accountProtection = existing.profile.wraps.account;
  } else {
    accountProtection = await wrapMasterKeyWithAccountSecret(session.masterKey, fingerprint, workspaceId);
    const check = await unlockAccountRecovery(accountProtection, fingerprint);
    try {
      if (!masterKeysMatch(check, session.masterKey)) {
        throw new LocalAuthError("STORAGE_CORRUPT", "The Google account wrap did not round-trip.");
      }
    } finally {
      check.fill(0);
    }
  }

  const now = new Date().toISOString();
  const accountId = existingGoogle?.id ?? existing?.profile.accountId ?? createId("account");
  const email = googleRecordEmail(info.email, ownerDigest);
  const googleAccount: StoredGoogleAccount = {
    id: accountId,
    avatar: appleAccount.avatar,
    authMethod: "google",
    googleAccountDigest: ownerDigest,
    createdAt: existing && isCanonicalIsoDate(existing.profile.createdAt) ? existing.profile.createdAt : now,
    email,
    name: appleAccount.name,
    workspaceId,
    workspaceRole: "owner"
  };
  // Every local rule that could refuse the record runs before anything is
  // written to Drive, so a refusal never strands a remote profile.
  assertStoredGoogleAccountAllowed(googleAccount);

  // Drive must hold this exact workspace before any profile points to it.
  const sync = await connectWorkspaceCloud(workspaceId, "gdrive", {
    validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, session)
  });
  if (sync.outcome !== "synced") {
    throw new LocalAuthError(
      "MIGRATION_INCOMPLETE",
      sync.preference.lastError ||
        `The Google Drive copy is not in sync (${sync.outcome}). Resolve that first, then try again.`
    );
  }
  // The sync may have downloaded another device's newer copy into IndexedDB.
  // The open in-memory database must follow before anything is saved, or the
  // member update below would write the stale copy back over it.
  const workspaceReplaced = sync.didReplaceLocalBundle;
  if (workspaceReplaced) {
    await activateMockDatabaseWorkspace(workspaceId, session.masterKey);
  }

  // A switch on a second device keeps the key every device already shares.
  const sharedRecoveryWrap = existing?.profile.wraps.code ?? registryWorkspace;
  const profile: GoogleAccountProfile = {
    schema: GOOGLE_ACCOUNT_PROFILE_SCHEMA,
    formatVersion: 1,
    status: "ready",
    accountId,
    ownerDigest,
    displayName: appleAccount.name,
    email,
    workspaceId,
    workspaceRole: "owner",
    wraps: { account: accountProtection, code: sharedRecoveryWrap },
    migratedFrom: "apple-cloudkit",
    createdAt: googleAccount.createdAt,
    updatedAt: now
  };
  // The profile goes out "ready" in one write, after Drive is in sync. Only
  // then does this device record the Google account, so a failure anywhere
  // before leaves the switch available to run again.
  await writeGoogleAccountProfile(payload.token.accessToken, profile, {
    expectedTag: existing?.tag ?? null
  });

  if (sharedRecoveryWrap.wrappedMasterKey.ciphertext === registryWorkspace.wrappedMasterKey.ciphertext) {
    markRecoveryWrapShared(workspaceId, registryWorkspace);
  }
  upsertStoredGoogleAccount(googleAccount);
  await upsertWorkspaceMember(googleAccount);
  await createOrUpdateAppleDeviceVaultEntry({
    appleAccountFingerprint: ownerDigest,
    workspaceId,
    masterKey: session.masterKey
  });

  session.account = googleAccount;
  session.user = toAuthUser(googleAccount, session.workspace);
  rememberLastEmail(email);
  markGoogleSignedIn({ email: normalizeEmail(info.email) || email, displayName: googleAccount.name });
  return mockApi({ user: session.user, email, workspaceReplaced });
}

export async function migrateAppleAccountToGoogle(
  payload: GoogleSignInPayload
): Promise<{ user: LocalAuthUser; email: string; workspaceReplaced: boolean }> {
  return withAuthMutationLock(() => migrateAppleAccountToGoogleUnlocked(payload));
}

export async function login(payload: AuthCredentials) {
  requireStorage();
  requireCompletedRestoreState();

  const email = normalizeEmail(payload.email);
  const account = readAccounts().find(
    (item): item is StoredPasswordAccount =>
      isStoredPasswordAccount(item) && normalizeEmail(item.email) === email
  );

  if (!account) {
    throw new LocalAuthError("INVALID_CREDENTIALS", "The email address or password is incorrect");
  }

  const workspace = readWorkspaces().find((item) => item.workspaceId === account.workspaceId);

  if (!workspace) {
    throw new LocalAuthError("INVALID_CREDENTIALS", "The account workspace is unavailable");
  }

  let masterKey: WorkspaceMasterKey;

  try {
    masterKey = await unlockMasterKeyWithPassword(
      account.passwordProtection,
      payload.password,
      workspace.workspaceId
    );
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      throw new LocalAuthError("INVALID_CREDENTIALS", "The email address or password is incorrect", {
        cause: error
      });
    }

    throw error;
  }

  try {
    let user: LocalAuthUser;
    try {
      let recoveredMissingLocalBundle = false;

      try {
        user = await setActiveSession(account, workspace, masterKey);
      } catch (localActivationError) {
        const storagePreference = getWorkspaceStoragePreference(workspace.workspaceId);
        if (storagePreference.provider === "indexeddb") {
          throw localActivationError;
        }

        // The password has already unlocked the in-memory workspace key. Keep a
        // temporary authenticated session long enough to verify and restore the
        // encrypted CloudKit copy when IndexedDB is missing or corrupt.
        user = toAuthUser(account, workspace);
        activeSession?.masterKey.fill(0);
        activeSession = { account, masterKey, user, workspace };

        const cloudSession = activeSession;
        const recovery = await pullWorkspaceFromCloudOnLogin(workspace.workspaceId, {
          forceRemoteRestore: true,
          validateRemoteBundle: (snapshot) =>
            validateCloudBundleForSession(snapshot, cloudSession)
        });

        if (!recovery.didReplaceLocalBundle) {
          if (recovery.outcome === "auth-required" && recovery.preference.provider === "gdrive") {
            throw new LocalAuthError(
              "CLOUD_AUTH_REQUIRED",
              "This workspace is stored in Google Drive but the device has no usable Google session. Restore the encrypted full-site backup from another device, then reconnect Google Drive.",
              { cause: localActivationError }
            );
          }
          throw localActivationError;
        }

        await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey);
        recoveredMissingLocalBundle = true;
      }

      const cloudSession = activeSession;
      if (!cloudSession || cloudSession.workspace.workspaceId !== workspace.workspaceId) {
        throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
      }

      if (!recoveredMissingLocalBundle) {
        const cloudPull = await pullWorkspaceFromCloudOnLogin(workspace.workspaceId, {
          validateRemoteBundle: (snapshot) =>
            validateCloudBundleForSession(snapshot, cloudSession)
        });
        if (cloudPull.didReplaceLocalBundle) {
          await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey);
        }
      }
      await upsertWorkspaceMember(account);
      void requestPersistentBrowserStorage();
    } catch (error) {
      activeSession?.masterKey.fill(0);
      masterKey.fill(0);
      activeSession = null;
      deactivateMockDatabaseWorkspace();
      throw error;
    }

    return mockApi({ user, token: "local-workspace-session" });
  } catch (error) {
    if (error instanceof WorkspaceCryptoError || error instanceof IndexedDbStorageError) {
      throw new LocalAuthError("STORAGE_CORRUPT", "The encrypted local workspace is unavailable", {
        cause: error
      });
    }

    throw error;
  }
}

export async function loginDevelopmentTestAccount() {
  const testAccount = developmentTestAccount;

  if (!testAccount) {
    throw new LocalAuthError(
      "INVALID_CREDENTIALS",
      "The built-in test account is available only in local development"
    );
  }

  const localAccounts = readAccounts();
  const existingAccount = localAccounts.some(
    (account) => normalizeEmail(account.email) === testAccount.email
  );

  if (existingAccount) {
    const result = await login({
      email: testAccount.email,
      password: testAccount.password
    });

    try {
      await verifyActiveWorkspaceRecoveryCode(testAccount.workspaceCode);
      return result;
    } catch (error) {
      await logout();
      throw error;
    }
  }

  if (localAccounts.length > 0 || hasLegacyMockDatabase()) {
    throw new LocalAuthError(
      "DEVICE_NOT_EMPTY",
      "The built-in test account can be created only in an empty local development origin"
    );
  }

  const result = await register({
    name: testAccount.name,
    email: testAccount.email,
    password: testAccount.password,
    workspaceCode: testAccount.workspaceCode,
    workspaceMode: "create"
  });

  await handshake(result.user.id);

  return {
    token: result.token,
    user: result.user
  };
}

const clearLocalSession = () => {
  activeSession?.masterKey.fill(0);
  activeSession = null;
  deactivateMockDatabaseWorkspace();

  if (canUseStorage()) {
    window.localStorage.removeItem(legacyAuthStorageKey);
  }
};

/** Identity records on this device that open the given workspace. */
const identityRecordsForWorkspace = (workspaceId: string | null) => {
  if (!workspaceId) {
    return { google: [] as StoredGoogleAccount[], apple: false };
  }
  try {
    const accounts = readAccounts();
    return {
      google: accounts.filter(isStoredGoogleAccount).filter((item) => item.workspaceId === workspaceId),
      apple: accounts.some((item) => isStoredAppleAccount(item) && item.workspaceId === workspaceId)
    };
  } catch {
    return { google: [] as StoredGoogleAccount[], apple: false };
  }
};

/**
 * An explicit sign-out must not leave a silent way back in, whichever account
 * was used to enter: the Google vault entries for the workspace go and the
 * next Google entry needs Google again.
 */
const closeGoogleSilentEntry = async (google: StoredGoogleAccount[]) => {
  if (google.length === 0) {
    return;
  }
  markGoogleSignedOut();
  for (const item of google) {
    await deleteAppleDeviceVaultEntry({
      appleAccountFingerprint: item.googleAccountDigest,
      workspaceId: item.workspaceId
    }).catch(() => false);
  }
};

export async function logout() {
  const wasAppleBacked = Boolean(
    activeSession && isStoredAppleAccount(activeSession.account)
  );
  const workspaceId = activeSession?.workspace.workspaceId ?? null;
  const records = identityRecordsForWorkspace(workspaceId);
  clearLocalSession();
  if (workspaceId) {
    // Google access tokens are device-bound and would otherwise outlive the
    // session for up to an hour on a shared machine.
    forgetGoogleDriveAccessToken(workspaceId);
  }
  // The sign-in token reaches Drive and identifies the account; it never
  // outlives a sign-out, whatever account was in use.
  forgetGoogleSignInToken();
  await closeGoogleSilentEntry(records.google);

  if (wasAppleBacked || records.apple) {
    // Without this, the persisted ckSession cookie lets the login page resolve
    // the Apple identity again and silently re-enter the workspace, making
    // logout a no-op on shared machines. The device vault stays intact, so the
    // next Apple sign-in on this device does not need the recovery key again.
    await signOutCloudKitSession();
  }

  return mockApi({ ok: true });
}

/** Clears only an Apple-backed Studio Map OS session when CloudKit signs out. */
export async function logoutAppleSession() {
  if (!activeSession || !isStoredAppleAccount(activeSession.account)) {
    return false;
  }

  // CloudKit itself reported the sign-out. A workspace that also has a
  // Google record must not stay one silent step away on the login page.
  const workspaceId = activeSession.workspace.workspaceId;
  const records = identityRecordsForWorkspace(workspaceId);
  clearLocalSession();
  forgetGoogleDriveAccessToken(workspaceId);
  forgetGoogleSignInToken();
  await closeGoogleSilentEntry(records.google);
  return true;
}

export async function handshake(userId: string) {
  return mockApi({
    ok: Boolean(activeSession && activeSession.user.id === userId),
    userId,
    serverTime: new Date().toISOString()
  });
}

export async function getCurrentUser() {
  return mockApi(activeSession?.user ?? null);
}

export async function ensureActiveWorkspaceMember() {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  await upsertWorkspaceMember(activeSession.account);
}

export async function reloadActiveWorkspaceDatabase() {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  await activateMockDatabaseWorkspace(
    activeSession.workspace.workspaceId,
    activeSession.masterKey
  );
}

/** Syncs the signed-in workspace without exposing its master key to UI code. */
export async function syncActiveWorkspaceCloud(
  authenticatedUser?: CloudKitUserIdentity
) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  const session = activeSession;
  return manualSyncWorkspace(session.workspace.workspaceId, {
    authenticatedUser,
    validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, session)
  });
}

/**
 * Switches the active workspace to a cloud provider (iCloud or Google Drive)
 * while validating downloads with the active key. Google Drive needs a token
 * obtained inside a user gesture before this is called.
 */
export async function connectActiveWorkspaceCloud(
  provider: WorkspaceCloudStorageProvider,
  authenticatedUser?: CloudKitUserIdentity
) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  const session = activeSession;
  const workspaceId = session.workspace.workspaceId;
  const ownedByGoogleAccount =
    isStoredGoogleAccount(session.account) ||
    readAccounts().some((item) => isStoredGoogleAccount(item) && item.workspaceId === workspaceId);
  if (ownedByGoogleAccount && provider !== "gdrive") {
    // The Google profile points every device at Drive; another cloud would
    // silently fork the workspace.
    throw new LocalAuthError("CLOUD_REQUIRED", "Google accounts always keep their data in Google Drive");
  }
  return connectWorkspaceCloud(workspaceId, provider, {
    authenticatedUser,
    validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, session)
  });
}

/**
 * Disconnects this device's Google Drive account for the active workspace.
 * A workspace owned by a Google account (whichever account entered it) must
 * keep its Drive binding: the profile points every device at that Drive.
 */
export async function disconnectActiveWorkspaceGoogleDrive() {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }
  const workspaceId = activeSession.workspace.workspaceId;
  if (isStoredGoogleAccount(activeSession.account) || getGoogleAccountForWorkspace(workspaceId)) {
    throw new LocalAuthError("CLOUD_REQUIRED", "Google accounts always keep their data in Google Drive");
  }
  await disconnectGoogleDriveAccount(workspaceId);
}

/** Enables/reconnects CloudKit while validating downloads with the active key. */
export async function connectActiveWorkspaceCloudKit(
  authenticatedUser?: CloudKitUserIdentity
) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  const session = activeSession;
  return connectWorkspaceCloudKit(session.workspace.workspaceId, {
    authenticatedUser,
    validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, session)
  });
}

/**
 * Stops cloud sync for the active workspace. Apple ID accounts must keep a
 * cloud copy (iCloud or Google Drive) and can only switch between the two.
 */
export async function disconnectActiveWorkspaceCloud() {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  const workspaceId = activeSession.workspace.workspaceId;
  const ownedByGoogleAccount =
    isStoredGoogleAccount(activeSession.account) ||
    readAccounts().some((item) => isStoredGoogleAccount(item) && item.workspaceId === workspaceId);
  if (ownedByGoogleAccount) {
    throw new LocalAuthError(
      "CLOUD_REQUIRED",
      "Google accounts always keep their data in Google Drive"
    );
  }
  const ownedByAppleAccount =
    isStoredAppleAccount(activeSession.account) ||
    readAccounts().some((item) => isStoredAppleAccount(item) && item.workspaceId === workspaceId);
  if (ownedByAppleAccount) {
    // A member who joined the Apple workspace by recovery key must not switch
    // it to local-only either: the invariant belongs to the workspace.
    throw new LocalAuthError(
      "APPLE_CLOUD_REQUIRED",
      "Apple ID accounts always keep their data in a cloud location (iCloud or Google Drive)"
    );
  }

  return disconnectWorkspaceCloud(workspaceId);
}

/** @deprecated Use disconnectActiveWorkspaceCloud; kept for existing callers. */
export async function disconnectActiveWorkspaceCloudKit() {
  return disconnectActiveWorkspaceCloud();
}

/** Resolves a CloudKit conflict without exposing the active workspace key. */
export async function resolveActiveWorkspaceCloudConflict(
  resolution: WorkspaceConflictResolution,
  authenticatedUser?: CloudKitUserIdentity
) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  const session = activeSession;
  return resolveWorkspaceCloudConflict(session.workspace.workspaceId, resolution, {
    authenticatedUser,
    validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, session)
  });
}

export async function encryptActiveWorkspaceFile<T>(
  kind: "device" | "workspace" | "project",
  payload: T
) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  return encryptWorkspaceEnvelope({
    kind,
    payload,
    metadata: activeSession.workspace,
    masterKey: activeSession.masterKey
  });
}

export async function decryptActiveWorkspaceFile<T>(
  envelopeValue: unknown,
  workspaceCode: string,
  kind: "device" | "workspace" | "project"
) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  try {
    const envelope = parseEncryptedWorkspaceEnvelope(envelopeValue, kind);
    const decrypted = await decryptWorkspaceEnvelope<T>(envelope, workspaceCode);

    try {
      // The 16-digit recovery key is the permission boundary for imported
      // project/workspace files. The active account only supplies the target
      // storage context; its internal workspace ID does not need to match the
      // source file.
      return decrypted.payload;
    } finally {
      decrypted.masterKey.fill(0);
    }
  } catch (error) {
    if (error instanceof LocalAuthError) {
      throw error;
    }

    if (
      error instanceof WorkspaceCryptoError &&
      (error.code === "INVALID_WORKSPACE_CODE" || error.code === "RECOVERY_UNLOCK_FAILED")
    ) {
      throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The recovery key does not match this encrypted file", {
        cause: error
      });
    }

    if (error instanceof WorkspaceCryptoError) {
      throw new LocalAuthError("BACKUP_INVALID", "The recovery key is incorrect or the file is damaged", {
        cause: error
      });
    }

    throw error;
  }
}

/** Confirms that a 16-digit code unlocks the currently signed-in account. */
export async function verifyActiveWorkspaceRecoveryCode(workspaceCode: string) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }
  // Backups package the registry copy; verify against that same wrap so a
  // code that another tab replaced is rejected here instead of producing an
  // export that opens with neither key.
  const workspace = refreshActiveSessionWorkspaceFromRegistry(activeSession);

  let recoveredMasterKey: WorkspaceMasterKey;
  try {
    recoveredMasterKey = await unlockWorkspaceRecovery(workspace, workspaceCode);
  } catch (error) {
    if (
      error instanceof WorkspaceCryptoError &&
      (error.code === "INVALID_WORKSPACE_CODE" || error.code === "RECOVERY_UNLOCK_FAILED")
    ) {
      throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The recovery key does not match the active account", {
        cause: error
      });
    }

    throw new LocalAuthError("STORAGE_CORRUPT", "The active account recovery metadata is invalid", {
      cause: error
    });
  }

  try {
    if (!masterKeysMatch(recoveredMasterKey, activeSession.masterKey)) {
      throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The recovery key does not match the active account");
    }
  } finally {
    recoveredMasterKey.fill(0);
  }
}

/** Builds an encrypted migration package for every local account and workspace. */
export async function createEncryptedFullSiteBackup(
  workspaceCode: string
): Promise<EncryptedWorkspaceEnvelope> {
  const session = activeSession;
  if (!session) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  await verifyActiveWorkspaceRecoveryCode(workspaceCode);
  try {
    await persistMockDatabase({ notifyOnConflictRefusal: false });
  } catch (error) {
    // During an unresolved iCloud conflict every save is refused and the
    // in-memory database cannot drift, so exporting the last persisted state
    // stays safe — and users must still be able to back up before resolving.
    if (!isWorkspaceSyncConflictError(error)) {
      throw error;
    }
  }
  const captured = await withDatabaseMutationLock(async () => {
    if (activeSession !== session) {
      throw new LocalAuthError(
        "NO_ACTIVE_SESSION",
        "The active workspace changed before the full-site backup could be captured"
      );
    }

    // Capture every registry/preference value synchronously before the first
    // IndexedDB await. Some account flows update localStorage immediately and
    // then wait for this database lock, so reading these values afterwards
    // could combine a newer registry with an older encrypted database.
    const accounts = readAccounts();
    const workspaces = readWorkspaces();
    const workspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId));
    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    const storedDisplayCurrency = window.localStorage.getItem(displayCurrencyStorageKey);
    const lastAccountEmail = window.localStorage.getItem(lastEmailStorageKey);
    const storagePreferences = capturePortableWorkspaceStoragePreferences([...workspaceIds]);
    const localStateSignature = JSON.stringify({
      accounts,
      workspaces,
      storedLanguage,
      storedDisplayCurrency,
      lastAccountEmail,
      storagePreferences
    });

    const capturedIndexedDb =
      await captureEncryptedDatabaseSnapshot<EncryptedPublicSharePayload>();

    // IndexedDB capture yields while the database lock is held. Recheck the
    // session before copying its key so logout or account switching cannot
    // produce a backup protected by a stale/cleared in-memory key.
    if (activeSession !== session) {
      throw new LocalAuthError(
        "NO_ACTIVE_SESSION",
        "The active workspace changed while the full-site backup was being captured"
      );
    }

    const refreshedAccounts = readAccounts();
    const refreshedWorkspaces = readWorkspaces();
    const refreshedWorkspaceIds = new Set(
      refreshedWorkspaces.map((workspace) => workspace.workspaceId)
    );
    const refreshedLanguage = window.localStorage.getItem(languageStorageKey);
    const refreshedDisplayCurrency = window.localStorage.getItem(displayCurrencyStorageKey);
    const refreshedLastAccountEmail = window.localStorage.getItem(lastEmailStorageKey);
    const refreshedStoragePreferences = capturePortableWorkspaceStoragePreferences([
      ...refreshedWorkspaceIds
    ]);
    const refreshedLocalStateSignature = JSON.stringify({
      accounts: refreshedAccounts,
      workspaces: refreshedWorkspaces,
      storedLanguage: refreshedLanguage,
      storedDisplayCurrency: refreshedDisplayCurrency,
      lastAccountEmail: refreshedLastAccountEmail,
      storagePreferences: refreshedStoragePreferences
    });

    if (refreshedLocalStateSignature !== localStateSignature) {
      throw new LocalAuthError(
        "BACKUP_CAPTURE_CHANGED",
        "Local data changed while the full-site backup was being captured. Please try again."
      );
    }

    const indexedDb = parseEncryptedDatabaseSnapshot<EncryptedPublicSharePayload>({
      ...capturedIndexedDb,
      bundles: capturedIndexedDb.bundles.filter((bundle) => workspaceIds.has(bundle.workspaceId))
    });

    return {
      accounts,
      workspaces,
      workspaceIds,
      indexedDb,
      storedLanguage,
      storedDisplayCurrency,
      lastAccountEmail,
      storagePreferences,
      protectorWorkspace: structuredClone(session.workspace),
      masterKey: new Uint8Array(session.masterKey)
    };
  });
  try {
    const backup = validateFullSiteBackup({
      schema: fullSiteBackupSchema,
      version: fullSiteBackupVersion,
      exportedAt: new Date().toISOString(),
      protectorWorkspaceId: captured.protectorWorkspace.workspaceId,
      authentication: {
        accounts: captured.accounts,
        workspaces: captured.workspaces
      },
      indexedDb: captured.indexedDb,
      storagePreferences: captured.storagePreferences,
      preferences: {
        ...(languages.includes(captured.storedLanguage as Language)
          ? { language: captured.storedLanguage }
          : {}),
        ...(isMoneyCurrency(captured.storedDisplayCurrency)
          ? { displayCurrency: captured.storedDisplayCurrency }
          : {}),
        ...(captured.lastAccountEmail ? { lastAccountEmail: captured.lastAccountEmail } : {})
      }
    });

    return await encryptWorkspaceEnvelope({
      kind: "device",
      payload: backup,
      metadata: captured.protectorWorkspace,
      masterKey: captured.masterKey
    });
  } finally {
    captured.masterKey.fill(0);
  }
}

/**
 * Decrypts and fully preflights a migration package without changing storage.
 * The 16-digit recovery code is used only in memory and is never added to the
 * returned backup payload.
 */
export async function decryptFullSiteBackup(
  envelopeValue: unknown,
  workspaceCode: string
): Promise<FullSiteBackup> {
  let envelopeDecrypted = false;

  try {
    const envelope = parseEncryptedWorkspaceEnvelope(envelopeValue, "device");
    const decrypted = await decryptWorkspaceEnvelope<unknown>(envelope, workspaceCode);
    envelopeDecrypted = true;

    try {
      const backup = validateFullSiteBackup(decrypted.payload);
      if (backup.protectorWorkspaceId !== decrypted.metadata.workspaceId) {
        throw new LocalAuthError("WORKSPACE_MISMATCH", "The backup protector workspace is inconsistent");
      }

      const protectorWorkspace = backup.authentication.workspaces.find(
        (workspace) => workspace.workspaceId === backup.protectorWorkspaceId
      );
      const protectorBundle = backup.indexedDb.bundles.find(
        (bundle) => bundle.workspaceId === backup.protectorWorkspaceId
      );
      if (!protectorWorkspace || !protectorBundle?.workspaceRecord) {
        throw new LocalAuthError("BACKUP_INVALID", "The backup protector workspace is incomplete");
      }

      const packagedMasterKey = await unlockWorkspaceRecovery(protectorWorkspace, workspaceCode);
      try {
        if (!masterKeysMatch(packagedMasterKey, decrypted.masterKey)) {
          throw new LocalAuthError("WORKSPACE_MISMATCH", "The backup workspace keys do not match");
        }
      } finally {
        packagedMasterKey.fill(0);
      }

      // Authenticate and parse the protector workspace before any local data is
      // replaced. Other workspaces remain encrypted for their owners' passwords.
      await decryptWorkspaceRecord(protectorBundle.workspaceRecord, decrypted.masterKey);
      return backup;
    } finally {
      decrypted.masterKey.fill(0);
    }
  } catch (error) {
    if (error instanceof LocalAuthError) {
      throw error;
    }
    if (
      !envelopeDecrypted &&
      error instanceof WorkspaceCryptoError &&
      (error.code === "INVALID_WORKSPACE_CODE" || error.code === "RECOVERY_UNLOCK_FAILED")
    ) {
      throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The recovery key does not match this backup", {
        cause: error
      });
    }
    if (error instanceof WorkspaceCryptoError || error instanceof IndexedDbStorageError) {
      throw new LocalAuthError("BACKUP_INVALID", "The encrypted backup is damaged or incomplete", {
        cause: error
      });
    }
    throw error;
  }
}

/** Replaces the whole local device registry and encrypted database after confirmation. */
export async function restoreFullSiteBackup(
  backupValue: unknown,
  options: { requireEmptyDevice?: boolean } = {}
) {
  if (fullSiteRestoreInProgress) {
    throw new LocalAuthError("RESTORE_IN_PROGRESS", "A full-site restore is already in progress");
  }

  fullSiteRestoreInProgress = true;
  try {
    return await replaceLocalDeviceWithFullSiteBackup(backupValue, options);
  } finally {
    fullSiteRestoreInProgress = false;
  }
}

/** Restores an encrypted migration package on a clean login screen. */
export async function restoreFullSiteBackupOnEmptyDevice(
  envelopeValue: unknown,
  workspaceCode: string
) {
  if (fullSiteRestoreInProgress) {
    throw new LocalAuthError("RESTORE_IN_PROGRESS", "A full-site restore is already in progress");
  }

  fullSiteRestoreInProgress = true;
  try {
    const backup = await decryptFullSiteBackup(envelopeValue, workspaceCode);
    return await replaceLocalDeviceWithFullSiteBackup(backup, { requireEmptyDevice: true });
  } finally {
    fullSiteRestoreInProgress = false;
  }
}
