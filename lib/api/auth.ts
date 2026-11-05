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
import type { CloudUserIdentity } from "@/lib/storage/cloud-user-identity";
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
  isGoogleDriveConnected,
  readGoogleDriveSettings,
  requireGoogleDriveAccessToken,
  seedGoogleDriveConnection
} from "@/lib/storage/google-drive/google-drive-client";
import {
  GoogleApiError,
  GoogleAuthError,
  writeGoogleToken,
  type GoogleStoredToken
} from "@/lib/integrations/google-auth";
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
  requestGoogleSignIn,
  resolveGoogleClientId,
  type GoogleUserInfo
} from "@/lib/integrations/google-signin";
import { bindGoogleCalendarFromSignIn, bindGoogleServicesFromSignIn } from "@/lib/integrations/google-services";
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
  identity: CloudUserIdentity;
  name: string;
};

export type AppleAccountRecoveryPayload = {
  identity: CloudUserIdentity;
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


const debugAppleAuth = (step: string) => {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[auth] ${step}`);
  }
};

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

/**
 * Legacy Apple recovery UI is removed; Google workspaces report "has-key".
 */
export async function getActiveAppleWorkspaceRecoveryState(): Promise<AppleWorkspaceRecoveryState> {
  const session = activeSession;
  if (!session) {
    return "not-apple";
  }
  if (isStoredGoogleAccount(session.account)) {
    refreshActiveSessionWorkspaceFromRegistry(session);
    return "has-key";
  }
  return "not-apple";
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
    if (!session || !isStoredGoogleAccount(session.account)) {
      throw new LocalAuthError("NO_ACTIVE_SESSION", "No Google workspace is unlocked.");
    }
    const registryCopy = refreshActiveSessionWorkspaceFromRegistry(session);
    if (!options.replace) {
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

/**
 * A Google account always syncs through Drive. Putting the preference back
 * does not clear a pending upload or the change tag, so local edits stay
 * queued instead of turning into a conflict.
 */
const pinGoogleWorkspaceToDrive = (workspaceId: string, lastError?: string | null) => {
  const preference = getWorkspaceStoragePreference(workspaceId);
  if (preference.provider === "gdrive" && preference.status !== "idle") {
    if (preference.status === "conflict") {
      return updateWorkspaceStoragePreference(workspaceId, {
        status: "pending",
        pendingUpload: true,
        lastError: lastError === undefined ? null : lastError
      });
    }
    if (lastError === undefined) {
      return preference;
    }
    return updateWorkspaceStoragePreference(workspaceId, { lastError });
  }
  const wasConflict = preference.status === "conflict";
  return updateWorkspaceStoragePreference(workspaceId, {
    provider: "gdrive",
    status:
      preference.status === "account-mismatch"
        ? "account-mismatch"
        : "pending",
    ...(wasConflict || preference.pendingUpload ? { pendingUpload: true } : {}),
    ...(wasConflict
      ? { lastError: null }
      : lastError !== undefined
        ? { lastError }
        : {})
  });
};

const isTransientActivationError = (error: unknown) => {
  if (error instanceof CloudProviderError) {
    return error.code === "REQUEST_FAILED" || error.code === "THROTTLED";
  }
  if (error instanceof GoogleAuthError) {
    return error.transient;
  }
  if (error instanceof GoogleApiError) {
    return error.status === 0 || error.status === 429 || error.status >= 500;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "TIMEOUT"
  ) {
    return true;
  }
  return error instanceof Error && /timed out|timeout|network|failed to fetch|offline/i.test(error.message);
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
  let localSessionReady = false;
  try {
    // Drive is best effort here: a device that already holds the workspace
    // must get in even while Google's API is unreachable (the storage card
    // reports the sync state). Only a token for a different account than the
    // one this workspace is bound to is a hard stop.
    try {
      // Drive is verified before the workspace opens. Calendar is bound after
      // the encrypted database is active, further down, so a timeout here
      // still lets the workspace open and does not drop an existing binding.
      await seedGoogleDriveConnection(workspace.workspaceId, token, clientId);
      seeded = true;
    } catch (error) {
      if (error instanceof CloudProviderError && error.code === "ACCOUNT_MISMATCH") {
        throw error;
      }
      debugAppleAuth("google: Drive could not be connected at sign-in; continuing locally");
    }
    if (getWorkspaceStoragePreference(workspace.workspaceId).provider !== "gdrive") {
      const before = getWorkspaceStoragePreference(workspace.workspaceId);
      const keepHistory = before.pendingUpload || before.cloudManifestChangeTag !== null;
      setWorkspaceStorageProvider(workspace.workspaceId, "gdrive");
      // First contact with Drive, and this device has nothing waiting to
      // upload: compare the two bundles. An existing change tag or a pending
      // local edit is kept, so a later timeout cannot turn those edits into
      // a conflict or drop the workspace back to local storage.
      if (!keepHistory) {
        updateWorkspaceStoragePreference(workspace.workspaceId, {
          pendingUpload: false,
          cloudManifestChangeTag: null
        });
      }
      switchedProvider = true;
    }

    try {
      user = await setActiveSession(account, workspace, masterKey);
      localSessionReady = true;
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
      localSessionReady = true;
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
    if (seeded || isGoogleDriveConnected(readGoogleDriveSettings(workspace.workspaceId))) {
      try {
        await bindGoogleCalendarFromSignIn(workspace.workspaceId, token);
      } catch {
        // Calendar retries on the next launch. A timeout must not sign the user out.
      }
    }
    return user;
  } catch (error) {
    const openSession = activeSession;
    const sessionReady =
      localSessionReady &&
      openSession?.workspace.workspaceId === workspace.workspaceId &&
      isStoredGoogleAccount(openSession.account);
    const wrongAccount = error instanceof CloudProviderError && error.code === "ACCOUNT_MISMATCH";
    // The local workspace is already open. A Drive timeout, a 401 that can
    // still be refreshed, or a profile write failure must not sign the user
    // out or throw away the edits they just made.
    if (sessionReady && openSession && !wrongAccount) {
      pinGoogleWorkspaceToDrive(
        workspace.workspaceId,
        error instanceof Error ? error.message : "Google Drive sync will retry."
      );
      return openSession.user;
    }

    activeSession?.masterKey.fill(0);
    masterKey.fill(0);
    activeSession = null;
    deactivateMockDatabaseWorkspace();
    if (switchedProvider) {
      // A failed Google attempt must not take away a cloud this device used
      // before. IndexedDB is not one of those: a Google account that briefly
      // reached Drive must not fall back to local storage.
      if (storedPreference && storedPreference.provider !== "indexeddb") {
        restoreWorkspaceStoragePreference(workspace.workspaceId, storedPreference);
      } else {
        pinGoogleWorkspaceToDrive(
          workspace.workspaceId,
          error instanceof Error ? error.message : null
        );
      }
    }
    if (seeded && !isTransientActivationError(error)) {
      // No session survives this attempt, so no Drive-capable token may either.
      // A timeout still has a usable token; dropping it is what forced a re-login.
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

export type UnlockGoogleAccountLocallyOptions = {
  allowWithoutToken?: boolean;
  /**
   * When true (default), unlock from the device vault immediately and refresh
   * Google/Drive in the background so reloads and the login screen do not block
   * on GIS or a Drive download.
   */
  deferCloudSync?: boolean;
};

const resolveStoredGoogleAccountForLocalEntry = () => {
  const settings = readGoogleSignInSettings();
  if (settings.signedOut) {
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
  return { account, settings, workspace };
};

const refreshGoogleSignInTokenForLocalEntry = async (options: {
  allowWithoutToken?: boolean;
  clientId: string;
}) => {
  let token = readGoogleSignInToken();
  if (token !== null && hasUsableGoogleSignInToken()) {
    return token;
  }
  if (!options.clientId) {
    return options.allowWithoutToken ? token : null;
  }
  try {
    token = await requestGoogleSignIn({ clientId: options.clientId, mode: "silent" });
    return hasUsableGoogleSignInToken() ? token : options.allowWithoutToken ? token : null;
  } catch (error) {
    const transient = error instanceof GoogleAuthError && error.transient;
    if (!options.allowWithoutToken && !transient) {
      return null;
    }
    return readGoogleSignInToken();
  }
};

const syncGoogleDriveAfterLocalEntry = async (input: {
  account: StoredGoogleAccount;
  workspaceId: string;
  clientId: string;
  token: GoogleStoredToken | null;
  allowWithoutToken?: boolean;
}) => {
  let token = input.token;
  if (!token) {
    token = await refreshGoogleSignInTokenForLocalEntry({
      allowWithoutToken: input.allowWithoutToken,
      clientId: input.clientId
    });
  }
  if (!token) {
    return;
  }

  const session = activeSession;
  if (!session || session.workspace.workspaceId !== input.workspaceId) {
    return;
  }

  let replaced = false;
  try {
    await bindGoogleServicesFromSignIn(input.workspaceId, token, input.clientId);
    const pull = await pullWorkspaceFromCloudOnLogin(input.workspaceId, {
      downloadTimeoutMs: LOCAL_ENTRY_PULL_TIMEOUT_MS,
      validateRemoteBundle: (snapshot) => validateCloudBundleForSession(snapshot, session)
    });
    replaced = pull.didReplaceLocalBundle;
    const profile = await readGoogleAccountProfile(token.accessToken, input.workspaceId);
    const shared =
      profile &&
      profile.profile.ownerDigest === input.account.googleAccountDigest &&
      profile.profile.status === "ready"
        ? profile.profile.wraps.code
        : null;
    const kept = await reconcileRecoveryWrap(input.workspaceId, shared);
    if (shared && kept && kept.wrappedMasterKey.ciphertext === shared.wrappedMasterKey.ciphertext) {
      upsertWorkspace(kept);
      markRecoveryWrapShared(input.workspaceId, kept);
      if (activeSession && activeSession.workspace.workspaceId === input.workspaceId) {
        activeSession.workspace = kept;
      }
    }
  } catch {
    // Sync stays pending until the user reconnects Google.
  }
  if (replaced && activeSession?.workspace.workspaceId === input.workspaceId) {
    try {
      await activateMockDatabaseWorkspace(input.workspaceId, activeSession.masterKey);
    } catch {
      // Keep the unlocked session; the storage card reports sync state.
    }
  }
};

/**
 * Entry without asking Google: the device vault holds the key for a Google
 * account that signed in here before and has not signed out. With a live
 * sign-in token the Drive connection is seeded and the usual login pull runs
 * (bounded); without one the session is local until the user reconnects.
 */
async function unlockGoogleAccountLocallyUnlocked(
  options: UnlockGoogleAccountLocallyOptions
): Promise<{ user: LocalAuthUser } | null> {
  requireStorage();
  requireCompletedRestoreState();

  const deferCloudSync = options.deferCloudSync !== false;
  const resolved = resolveStoredGoogleAccountForLocalEntry();
  if (!resolved) {
    return null;
  }
  const { account, settings, workspace } = resolved;
  const clientId = settings.clientId || resolveGoogleClientId();

  let token: GoogleStoredToken | null = null;
  if (!deferCloudSync) {
    token = await refreshGoogleSignInTokenForLocalEntry({
      allowWithoutToken: options.allowWithoutToken,
      clientId
    });
    if (!token && !options.allowWithoutToken) {
      return null;
    }
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
  pinGoogleWorkspaceToDrive(workspace.workspaceId);

  if (deferCloudSync) {
    void syncGoogleDriveAfterLocalEntry({
      account,
      workspaceId: workspace.workspaceId,
      clientId,
      token: readGoogleSignInToken(),
      allowWithoutToken: options.allowWithoutToken
    });
    return mockApi({ user }, 0);
  }

  if (token) {
    await syncGoogleDriveAfterLocalEntry({
      account,
      workspaceId: workspace.workspaceId,
      clientId,
      token,
      allowWithoutToken: options.allowWithoutToken
    });
  }
  return mockApi({ user }, 0);
}

/**
 * Re-opens the last Google workspace from this device's vault after a reload
 * or PWA restart, without blocking on Google Identity Services or Drive.
 */
export async function restorePersistedLocalSession(): Promise<LocalAuthUser | null> {
  if (activeSession?.user) {
    return mockApi(activeSession.user, 0);
  }
  const result = await unlockGoogleAccountLocally({
    allowWithoutToken: true,
    deferCloudSync: true
  });
  return result?.user ?? null;
}

export async function unlockGoogleAccountLocally(
  options: UnlockGoogleAccountLocallyOptions = {}
): Promise<{ user: LocalAuthUser } | null> {
  return withAuthMutationLock(() => unlockGoogleAccountLocallyUnlocked(options));
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
  const workspaceId = activeSession?.workspace.workspaceId ?? null;
  const records = identityRecordsForWorkspace(workspaceId);
  clearLocalSession();
  if (workspaceId) {
    forgetGoogleDriveAccessToken(workspaceId);
  }
  forgetGoogleSignInToken();
  if (workspaceId) {
    writeGoogleToken(`studio-map-os.google-calendar-token:${workspaceId}`, null);
  }
  await closeGoogleSilentEntry(records.google);

  return mockApi({ ok: true });
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
  authenticatedUser?: CloudUserIdentity
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
  authenticatedUser?: CloudUserIdentity
) {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  if (provider !== "gdrive") {
    throw new LocalAuthError(
      "CLOUD_REQUIRED",
      "Only Google Drive cloud sync is supported. Switch this workspace to Google Drive in Archive settings."
    );
  }

  const session = activeSession;
  const workspaceId = session.workspace.workspaceId;
  return connectWorkspaceCloud(workspaceId, "gdrive", {
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
  return disconnectWorkspaceCloud(workspaceId);
}

/** Resolves a CloudKit conflict without exposing the active workspace key. */
export async function resolveActiveWorkspaceCloudConflict(
  resolution: WorkspaceConflictResolution,
  authenticatedUser?: CloudUserIdentity
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
