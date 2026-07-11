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
import { requestPersistentBrowserStorage } from "@/lib/storage/persistent-storage";
import {
  IndexedDbStorageError,
  captureEncryptedDatabaseSnapshot,
  parseEncryptedDatabaseSnapshot,
  replaceEncryptedDatabaseSnapshot,
  type EncryptedDatabaseSnapshot
} from "@/lib/storage/indexed-db";
import type { User } from "@/lib/types";
import { isMoneyCurrency, type MoneyCurrency } from "@/lib/utils/money";

export type AuthCredentials = {
  email: string;
  password: string;
};

export type WorkspaceRegistrationMode = "create" | "join";
export type LocalWorkspaceRole = "owner" | "member";

export type RegisterPayload = AuthCredentials & {
  name: string;
  workspaceCode: string;
  workspaceMode: WorkspaceRegistrationMode;
  workspaceBackup?: EncryptedWorkspaceEnvelope;
};

export type LocalAuthUser = User & {
  workspaceFingerprint: string;
  workspaceId: string;
  workspaceRole: LocalWorkspaceRole;
};

export type RegisterResult = {
  claimedLegacyData: boolean;
  joinedExistingWorkspace: boolean;
  restoredLanguage?: Language;
  token: string;
  user: LocalAuthUser;
};

export type LocalAuthErrorCode =
  | "ACCOUNT_EXISTS"
  | "BACKUP_INVALID"
  | "BACKUP_REQUIRED"
  | "BACKUP_TOO_LARGE"
  | "DEVICE_NOT_EMPTY"
  | "INVALID_CREDENTIALS"
  | "INVALID_WORKSPACE_CODE"
  | "NO_ACTIVE_SESSION"
  | "PASSWORD_TOO_SHORT"
  | "REGISTRATION_FAILED"
  | "RESTORE_IN_PROGRESS"
  | "SECURE_CONTEXT_REQUIRED"
  | "STORAGE_CORRUPT"
  | "STORAGE_UNAVAILABLE"
  | "WORKSPACE_CODE_IN_USE"
  | "WORKSPACE_MISMATCH"
  | "WORKSPACE_NOT_FOUND";

export type StoredLocalAccount = {
  id: string;
  avatar: string;
  createdAt: string;
  email: string;
  name: string;
  passwordProtection: PasswordProtectedMasterKey;
  workspaceId: string;
  workspaceRole: LocalWorkspaceRole;
};

export const fullSiteBackupSchema = "studio-map-os.full-site-device-backup" as const;
export const fullSiteBackupVersion = 1 as const;

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

let activeSession: ActiveAuthSession | null = null;
let fullSiteRestoreInProgress = false;

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

const isStoredLocalAccount = (value: unknown): value is StoredLocalAccount => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
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
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "exportedAt",
      "protectorWorkspaceId",
      "authentication",
      "indexedDb",
      "preferences"
    ]) ||
    value.schema !== fullSiteBackupSchema ||
    value.version !== fullSiteBackupVersion ||
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
      typeof value.preferences.lastAccountEmail !== "string")
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
    }
  };
}

const captureLocalDeviceStorage = async (): Promise<LocalDeviceStorageSnapshot> => ({
  accounts: readAccounts(),
  workspaces: readWorkspaces(),
  indexedDb: await captureEncryptedDatabaseSnapshot<EncryptedPublicSharePayload>(),
  language: window.localStorage.getItem(languageStorageKey),
  displayCurrency: window.localStorage.getItem(displayCurrencyStorageKey),
  lastAccountEmail: window.localStorage.getItem(lastEmailStorageKey),
  legacyPlaintextEntries: captureLegacyPlaintextEntries(),
  restoreRecoveryMarker: window.localStorage.getItem(restoreRecoveryStorageKey)
});

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

const restoreLocalDeviceStorage = async (snapshot: LocalDeviceStorageSnapshot) => {
  await replaceEncryptedDatabaseSnapshot(snapshot.indexedDb);
  writeArray(accountsStorageKey, snapshot.accounts);
  writeArray(workspacesStorageKey, snapshot.workspaces);
  restoreStoredValue(languageStorageKey, snapshot.language);
  restoreStoredValue(displayCurrencyStorageKey, snapshot.displayCurrency);
  restoreStoredValue(lastEmailStorageKey, snapshot.lastAccountEmail);
  restoreLegacyPlaintextEntries(snapshot.legacyPlaintextEntries);
  restoreStoredValue(restoreRecoveryStorageKey, snapshot.restoreRecoveryMarker);
};

async function replaceLocalDeviceWithFullSiteBackup(
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
    writeArray(accountsStorageKey, backup.authentication.accounts);
    writeArray(workspacesStorageKey, backup.authentication.workspaces);
    restoreStoredValue(languageStorageKey, backup.preferences.language ?? null);
    restoreStoredValue(displayCurrencyStorageKey, backup.preferences.displayCurrency ?? null);
    restoreStoredValue(
      lastEmailStorageKey,
      backup.preferences.lastAccountEmail ?? backup.authentication.accounts[0]?.email ?? null
    );
    window.localStorage.removeItem(legacyAuthStorageKey);
    clearLegacyPlaintextEntries();
    window.localStorage.removeItem(restoreRecoveryStorageKey);
  } catch (error) {
    let rollbackSucceeded = false;
    try {
      await restoreLocalDeviceStorage(previous);
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

const createWorkspaceFingerprint = (workspaceId: string) => {
  const compact = workspaceId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const fingerprint = compact.slice(-8).padStart(8, "0");

  return `SMOS-${fingerprint.slice(0, 4)}-${fingerprint.slice(4)}`;
};

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
  workspaceFingerprint: createWorkspaceFingerprint(workspace.workspaceId),
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
  rememberLastEmail(account.email);

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

export async function register(payload: RegisterPayload): Promise<RegisterResult> {
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
  let backupToRestore: ReturnType<typeof validateMockDatabaseBackup> | null = null;
  let discardCorruptBundleForVerifiedRecovery = false;

  try {
    const existingWorkspace = await findWorkspaceByCode(workspaceCode);
    const decodedBackup =
      payload.workspaceMode === "join" && payload.workspaceBackup
        ? await decodeRegistrationBackup(payload.workspaceBackup, workspaceCode)
        : null;

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
      joinedExistingWorkspace = true;
      let localWorkspaceDataStatus: "corrupt" | "missing" | "usable";

      try {
        localWorkspaceDataStatus = (await readMockDatabaseWorkspaceSnapshot(
          workspace.workspaceId,
          masterKey
        ))
          ? "usable"
          : "missing";
      } catch {
        localWorkspaceDataStatus = "corrupt";
      }

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
        workspaceRole: payload.workspaceMode === "create" ? "owner" : "member"
      };
    } catch (error) {
      masterKey.fill(0);
      throw error;
    }
    const claimedLegacyData =
      payload.workspaceMode === "create" && previousAccounts.length === 0 && hasLegacyMockDatabase();
    const workspaceStorageSnapshot = await captureMockDatabaseWorkspaceStorage(
      workspace.workspaceId,
      { discardCorruptBundleForVerifiedRecovery }
    );

    try {
      upsertWorkspace(workspace);
      writeArray(accountsStorageKey, [...previousAccounts, account]);
      await activateMockDatabaseWorkspace(workspace.workspaceId, masterKey, {
        allowCreate: payload.workspaceMode === "create",
        allowRecoveryOverwrite: Boolean(backupToRestore),
        claimLegacy: claimedLegacyData
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

      return mockApi({
        claimedLegacyData,
        joinedExistingWorkspace,
        ...(backupToRestore?.preferences?.language
          ? { restoredLanguage: backupToRestore.preferences.language }
          : {}),
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
        () => restoreMockDatabaseWorkspaceStorage(workspaceStorageSnapshot)
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

export async function login(payload: AuthCredentials) {
  requireStorage();
  requireCompletedRestoreState();

  const email = normalizeEmail(payload.email);
  const account = readAccounts().find((item) => normalizeEmail(item.email) === email);

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
      user = await setActiveSession(account, workspace, masterKey);
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

export async function logout() {
  activeSession?.masterKey.fill(0);
  activeSession = null;
  deactivateMockDatabaseWorkspace();

  if (canUseStorage()) {
    window.localStorage.removeItem(legacyAuthStorageKey);
  }

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

export function getActiveWorkspaceIdentity() {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  return {
    fingerprint: createWorkspaceFingerprint(activeSession.workspace.workspaceId),
    role: activeSession.account.workspaceRole,
    workspaceId: activeSession.workspace.workspaceId
  };
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
      if (
        decrypted.metadata.workspaceId !== activeSession.workspace.workspaceId ||
        !masterKeysMatch(decrypted.masterKey, activeSession.masterKey)
      ) {
        throw new LocalAuthError("WORKSPACE_MISMATCH", "This encrypted file belongs to another workspace");
      }

      return decrypted.payload;
    } finally {
      decrypted.masterKey.fill(0);
    }
  } catch (error) {
    if (error instanceof LocalAuthError) {
      throw error;
    }

    if (error instanceof WorkspaceCryptoError) {
      throw new LocalAuthError("BACKUP_INVALID", "The recovery key is incorrect or the file is damaged", {
        cause: error
      });
    }

    throw error;
  }
}

/** Builds an encrypted migration package for every local account and workspace. */
export async function createEncryptedFullSiteBackup(): Promise<EncryptedWorkspaceEnvelope> {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  await persistMockDatabase();
  const accounts = readAccounts();
  const workspaces = readWorkspaces();
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId));
  const capturedIndexedDb = await captureEncryptedDatabaseSnapshot<EncryptedPublicSharePayload>();
  const indexedDb = parseEncryptedDatabaseSnapshot<EncryptedPublicSharePayload>({
    ...capturedIndexedDb,
    bundles: capturedIndexedDb.bundles.filter((bundle) => workspaceIds.has(bundle.workspaceId))
  });
  const storedLanguage = window.localStorage.getItem(languageStorageKey);
  const storedDisplayCurrency = window.localStorage.getItem(displayCurrencyStorageKey);
  const lastAccountEmail = window.localStorage.getItem(lastEmailStorageKey);
  const backup = validateFullSiteBackup({
    schema: fullSiteBackupSchema,
    version: fullSiteBackupVersion,
    exportedAt: new Date().toISOString(),
    protectorWorkspaceId: activeSession.workspace.workspaceId,
    authentication: { accounts, workspaces },
    indexedDb,
    preferences: {
      ...(languages.includes(storedLanguage as Language) ? { language: storedLanguage } : {}),
      ...(isMoneyCurrency(storedDisplayCurrency)
        ? { displayCurrency: storedDisplayCurrency }
        : {}),
      ...(lastAccountEmail ? { lastAccountEmail } : {})
    }
  });

  return encryptWorkspaceEnvelope({
    kind: "device",
    payload: backup,
    metadata: activeSession.workspace,
    masterKey: activeSession.masterKey
  });
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
  try {
    const envelope = parseEncryptedWorkspaceEnvelope(envelopeValue, "device");
    const decrypted = await decryptWorkspaceEnvelope<unknown>(envelope, workspaceCode);

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
    if (error instanceof WorkspaceCryptoError || error instanceof IndexedDbStorageError) {
      throw new LocalAuthError("BACKUP_INVALID", "The recovery key is incorrect or the file is damaged", {
        cause: error
      });
    }
    throw error;
  }
}

/** Preflights a full-site package and confirms that it belongs to the active workspace. */
export async function decryptActiveFullSiteBackup(
  envelopeValue: unknown,
  workspaceCode: string
): Promise<FullSiteBackup> {
  if (!activeSession) {
    throw new LocalAuthError("NO_ACTIVE_SESSION", "No local workspace is unlocked");
  }

  const backup = await decryptFullSiteBackup(envelopeValue, workspaceCode);
  if (backup.protectorWorkspaceId !== activeSession.workspace.workspaceId) {
    throw new LocalAuthError("WORKSPACE_MISMATCH", "This full-site backup belongs to another workspace");
  }

  const protectorWorkspace = backup.authentication.workspaces.find(
    (workspace) => workspace.workspaceId === backup.protectorWorkspaceId
  );
  if (!protectorWorkspace) {
    throw new LocalAuthError("BACKUP_INVALID", "The backup protector workspace is missing");
  }

  const backupMasterKey = await unlockWorkspaceRecovery(protectorWorkspace, workspaceCode);
  try {
    if (!masterKeysMatch(backupMasterKey, activeSession.masterKey)) {
      throw new LocalAuthError("WORKSPACE_MISMATCH", "This full-site backup belongs to another workspace");
    }
  } finally {
    backupMasterKey.fill(0);
  }

  return backup;
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
