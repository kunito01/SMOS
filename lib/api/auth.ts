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
  isValidWorkspaceCode,
  parseEncryptedWorkspaceEnvelope,
  protectMasterKeyWithPassword,
  unlockMasterKeyWithPassword,
  unlockWorkspaceRecovery,
  validatePasswordProtectedMasterKey,
  validateWorkspaceRecoveryMetadata,
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
  type WorkspaceStoragePreference
} from "@/lib/storage/storage-preferences";
import {
  connectWorkspaceCloudKit,
  manualSyncWorkspace,
  pullWorkspaceFromCloudOnLogin,
  resolveWorkspaceCloudConflict,
  type WorkspaceConflictResolution
} from "@/lib/storage/workspace-sync-coordinator";
import {
  bumpWorkspaceMutationEpoch,
  withAuthMutationLock,
  withDatabaseMutationLock
} from "@/lib/storage/workspace-mutation-lock";
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

export type LocalAuthUser = User & {
  workspaceId: string;
  workspaceRole: LocalWorkspaceRole;
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
      kind: "needs-recovery";
      displayName: string;
    }
  | {
      kind: "ready";
      user: LocalAuthUser;
    };

export type AppleAccountSetupPayload = {
  identity: CloudKitUserIdentity;
  name: string;
  workspaceCode: string;
};

export type AppleAccountRecoveryPayload = {
  identity: CloudKitUserIdentity;
  workspaceCode: string;
};

export type LocalAuthErrorCode =
  | "ACCOUNT_EXISTS"
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

export type StoredLocalAccount = StoredPasswordAccount | StoredAppleAccount;

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

const isStoredLocalAccount = (value: unknown): value is StoredLocalAccount =>
  isStoredPasswordAccount(value) || isStoredAppleAccount(value);

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

const readAccounts = () => readArray(accountsStorageKey, isStoredLocalAccount);
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
  writeArray(accountsStorageKey, snapshot.accounts);
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
  workspaceRole: account.workspaceRole
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
    mockDatabase.users[index] = member;
  } else {
    mockDatabase.users.unshift(member);
  }

  await persistMockDatabase();
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
      writeArray(accountsStorageKey, [...previousAccounts, account]);
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
        () => writeArray(accountsStorageKey, previousAccounts),
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
  writeArray(accountsStorageKey, [...next, account]);
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

const activateAppleAccountSession = async (input: {
  account: StoredAppleAccount;
  identity: CloudKitUserIdentity;
  masterKey: WorkspaceMasterKey;
  workspace: WorkspaceRecoveryMetadata;
}) => {
  const { account, identity, masterKey, workspace } = input;
  const currentPreference = getWorkspaceStoragePreference(workspace.workspaceId);
  if (currentPreference.provider !== "cloudkit") {
    setWorkspaceStorageProvider(workspace.workspaceId, "cloudkit");
  }

  let user: LocalAuthUser;
  let recoveredMissingLocalBundle = false;
  try {
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

  void requestPersistentBrowserStorage();
  return session.user;
};

const debugAppleAuth = (step: string) => {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[apple-auth] ${step}`);
  }
};

/** Resolves an authenticated Apple identity into setup, recovery, or login. */
async function inspectAppleAccountUnlocked(
  identityInput: CloudKitUserIdentity
): Promise<AppleAccountLoginResolution> {
  debugAppleAuth("inspect: start");
  requireStorage();
  requireCompletedRestoreState();

  const identity = await assertCloudKitAuthenticatedUser(identityInput);
  debugAppleAuth("inspect: identity asserted");
  const fingerprint = await requireAppleFingerprint(identity);
  const profile = await fetchCloudKitAppleAccountProfile(identity);
  debugAppleAuth(`inspect: profile ${profile ? profile.status : "not found"}`);
  if (!profile) {
    return {
      kind: "needs-setup",
      suggestedName: appleSuggestedName(identity)
    };
  }
  assertAppleProfileOwnership(profile, fingerprint);

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
      debugAppleAuth(`inspect: vault miss (${error.code}) -> needs-recovery`);
      return { kind: "needs-recovery", displayName: profile.displayName };
    }
    throw error;
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
  if (!isValidWorkspaceCode(payload.workspaceCode)) {
    throw new LocalAuthError("INVALID_WORKSPACE_CODE", "The recovery key must contain 16 digits.");
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
    workspace = profile.recoveryMetadata;
    account = createStoredAppleAccount(profile, fingerprint);
    try {
      masterKey = await unlockWorkspaceRecovery(workspace, payload.workspaceCode);
    } catch (error) {
      if (error instanceof WorkspaceCryptoError) {
        throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The 16-digit recovery key is incorrect.", { cause: error });
      }
      throw error;
    }
  } else if (existingLocalAccount) {
    const localWorkspace = previousWorkspaces.find(
      (item) => item.workspaceId === existingLocalAccount.workspaceId
    );
    if (!localWorkspace) {
      throw new LocalAuthError("WORKSPACE_NOT_FOUND", "The local Apple workspace is unavailable.");
    }
    workspace = localWorkspace;
    account = existingLocalAccount;
    try {
      masterKey = await unlockWorkspaceRecovery(workspace, payload.workspaceCode);
    } catch (error) {
      if (error instanceof WorkspaceCryptoError) {
        throw new LocalAuthError("RECOVERY_KEY_MISMATCH", "The 16-digit recovery key is incorrect.", { cause: error });
      }
      throw error;
    }
  } else {
    const existingWorkspace = await findWorkspaceByCode(payload.workspaceCode);
    if (existingWorkspace) {
      existingWorkspace.masterKey.fill(0);
      throw new LocalAuthError("WORKSPACE_CODE_IN_USE", "This recovery key already unlocks a local workspace.");
    }
    const createdWorkspace = await createWorkspaceRecovery(payload.workspaceCode);
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
      writeArray(accountsStorageKey, previousAccounts);
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
    return mockApi({ token: "apple-cloudkit-workspace-session", user });
  } catch (error) {
    if (activeSession?.masterKey === masterKey) {
      activeSession.masterKey.fill(0);
      activeSession = null;
      deactivateMockDatabaseWorkspace();
    } else {
      masterKey.fill(0);
    }
    writeArray(accountsStorageKey, previousAccounts);
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
        if (storagePreference.provider !== "cloudkit") {
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

export async function logout() {
  const wasAppleBacked = Boolean(
    activeSession && isStoredAppleAccount(activeSession.account)
  );
  clearLocalSession();

  if (wasAppleBacked) {
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

  // CloudKit itself reported the sign-out, so only local state needs clearing.
  clearLocalSession();
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

  let recoveredMasterKey: WorkspaceMasterKey;
  try {
    recoveredMasterKey = await unlockWorkspaceRecovery(activeSession.workspace, workspaceCode);
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
  await persistMockDatabase();
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
