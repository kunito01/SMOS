import { validateWorkspaceId } from "@/lib/security/workspace-crypto";

export type WorkspaceStorageProvider = "indexeddb" | "cloudkit";

export type WorkspaceSyncStatus =
  | "idle"
  | "pending"
  | "syncing"
  | "synced"
  | "auth-required"
  | "account-mismatch"
  | "conflict"
  | "error";

export type WorkspaceStoragePreference = {
  workspaceId: string;
  provider: WorkspaceStorageProvider;
  status: WorkspaceSyncStatus;
  lastSyncAt: string | null;
  pendingUpload: boolean;
  lastError: string | null;
  cloudKitUserRecordName: string | null;
  cloudManifestChangeTag: string | null;
  updatedAt: string;
};

export type PortableWorkspaceStoragePreference = {
  workspaceId: string;
  provider: WorkspaceStorageProvider;
};

type WorkspaceStoragePreferenceRegistry = {
  schema: typeof STORAGE_PREFERENCES_SCHEMA;
  version: typeof STORAGE_PREFERENCES_VERSION;
  workspaces: Record<string, WorkspaceStoragePreference>;
};

type WorkspaceStoragePreferencePatch = Partial<
  Omit<WorkspaceStoragePreference, "workspaceId" | "updatedAt">
>;

const STORAGE_PREFERENCES_SCHEMA = "studio-map-os.workspace-storage-preferences" as const;
const STORAGE_PREFERENCES_VERSION = 1 as const;
const storagePreferencesKey = "studio-map-os.workspace-storage-preferences.v1";

const syncStatuses = new Set<WorkspaceSyncStatus>([
  "idle",
  "pending",
  "syncing",
  "synced",
  "auth-required",
  "account-mismatch",
  "conflict",
  "error"
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isCanonicalIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

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

const createDefaultPreference = (workspaceIdInput: string): WorkspaceStoragePreference => {
  const workspaceId = validateWorkspaceId(workspaceIdInput);

  return {
    workspaceId,
    provider: "indexeddb",
    status: "idle",
    lastSyncAt: null,
    pendingUpload: false,
    lastError: null,
    cloudKitUserRecordName: null,
    cloudManifestChangeTag: null,
    updatedAt: new Date(0).toISOString()
  };
};

const parsePreference = (
  value: unknown,
  expectedWorkspaceId: string
): WorkspaceStoragePreference | null => {
  if (
    !isRecord(value) ||
    value.workspaceId !== expectedWorkspaceId ||
    (value.provider !== "indexeddb" && value.provider !== "cloudkit") ||
    typeof value.status !== "string" ||
    !syncStatuses.has(value.status as WorkspaceSyncStatus) ||
    typeof value.pendingUpload !== "boolean" ||
    (value.lastSyncAt !== null && !isCanonicalIsoDate(value.lastSyncAt)) ||
    (value.lastError !== null && typeof value.lastError !== "string") ||
    (value.cloudKitUserRecordName !== null &&
      typeof value.cloudKitUserRecordName !== "string") ||
    (value.cloudManifestChangeTag !== null &&
      typeof value.cloudManifestChangeTag !== "string") ||
    !isCanonicalIsoDate(value.updatedAt)
  ) {
    return null;
  }

  const status = value.status as WorkspaceSyncStatus;

  return {
    workspaceId: expectedWorkspaceId,
    provider: value.provider,
    // A browser may close while a sync is in flight. Resume it as pending on
    // the next launch instead of presenting a permanently stuck state.
    status: status === "syncing" ? "pending" : status,
    lastSyncAt: value.lastSyncAt as string | null,
    pendingUpload: value.pendingUpload,
    lastError: value.lastError as string | null,
    cloudKitUserRecordName: value.cloudKitUserRecordName as string | null,
    cloudManifestChangeTag: value.cloudManifestChangeTag as string | null,
    updatedAt: value.updatedAt
  };
};

const emptyRegistry = (): WorkspaceStoragePreferenceRegistry => ({
  schema: STORAGE_PREFERENCES_SCHEMA,
  version: STORAGE_PREFERENCES_VERSION,
  workspaces: {}
});

const readRegistry = (): WorkspaceStoragePreferenceRegistry => {
  if (!canUseStorage()) {
    return emptyRegistry();
  }

  const raw = window.localStorage.getItem(storagePreferencesKey);
  if (!raw) {
    return emptyRegistry();
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (
      !isRecord(value) ||
      value.schema !== STORAGE_PREFERENCES_SCHEMA ||
      value.version !== STORAGE_PREFERENCES_VERSION ||
      !isRecord(value.workspaces)
    ) {
      return emptyRegistry();
    }

    const workspaces: Record<string, WorkspaceStoragePreference> = {};
    for (const [workspaceIdInput, preferenceValue] of Object.entries(value.workspaces)) {
      let workspaceId: string;
      try {
        workspaceId = validateWorkspaceId(workspaceIdInput);
      } catch {
        continue;
      }

      const preference = parsePreference(preferenceValue, workspaceId);
      if (preference) {
        workspaces[workspaceId] = preference;
      }
    }

    return {
      schema: STORAGE_PREFERENCES_SCHEMA,
      version: STORAGE_PREFERENCES_VERSION,
      workspaces
    };
  } catch {
    return emptyRegistry();
  }
};

const writeRegistry = (registry: WorkspaceStoragePreferenceRegistry) => {
  if (!canUseStorage()) {
    throw new Error("Workspace storage preferences are unavailable in this browser context.");
  }

  window.localStorage.setItem(storagePreferencesKey, JSON.stringify(registry));
};

export function getStoredWorkspaceStoragePreference(
  workspaceIdInput: string
): WorkspaceStoragePreference | null {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  return readRegistry().workspaces[workspaceId] ?? null;
}

export function getWorkspaceStoragePreference(
  workspaceIdInput: string
): WorkspaceStoragePreference {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  return getStoredWorkspaceStoragePreference(workspaceId) ?? createDefaultPreference(workspaceId);
}

export function listWorkspaceStoragePreferences(): WorkspaceStoragePreference[] {
  return Object.values(readRegistry().workspaces).sort((left, right) =>
    left.workspaceId.localeCompare(right.workspaceId)
  );
}

export function capturePortableWorkspaceStoragePreferences(
  workspaceIdsInput: string[]
): PortableWorkspaceStoragePreference[] {
  const seen = new Set<string>();

  return workspaceIdsInput
    .map((workspaceIdInput) => validateWorkspaceId(workspaceIdInput))
    .filter((workspaceId) => {
      if (seen.has(workspaceId)) {
        return false;
      }
      seen.add(workspaceId);
      return true;
    })
    .sort((left, right) => left.localeCompare(right))
    .map((workspaceId) => ({
      workspaceId,
      provider: getWorkspaceStoragePreference(workspaceId).provider
    }));
}

export function parsePortableWorkspaceStoragePreference(
  value: unknown
): PortableWorkspaceStoragePreference {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !("workspaceId" in value) ||
    !("provider" in value) ||
    (value.provider !== "indexeddb" && value.provider !== "cloudkit")
  ) {
    throw new Error("The portable workspace storage preference is invalid.");
  }

  return {
    workspaceId: validateWorkspaceId(value.workspaceId),
    provider: value.provider
  };
}

export function replaceWorkspaceStoragePreferences(
  preferences: WorkspaceStoragePreference[]
) {
  const registry = emptyRegistry();

  for (const preference of preferences) {
    const workspaceId = validateWorkspaceId(preference.workspaceId);
    const parsed = parsePreference(preference, workspaceId);
    if (!parsed || registry.workspaces[workspaceId]) {
      throw new Error("The workspace storage preference registry is invalid.");
    }
    registry.workspaces[workspaceId] = parsed;
  }

  writeRegistry(registry);
}

export function replaceWorkspaceStoragePreferencesFromBackup(
  preferencesInput: PortableWorkspaceStoragePreference[]
) {
  const registry = emptyRegistry();
  const now = new Date().toISOString();

  for (const preferenceInput of preferencesInput) {
    const preference = parsePortableWorkspaceStoragePreference(preferenceInput);
    if (registry.workspaces[preference.workspaceId]) {
      throw new Error("The backup contains duplicate workspace storage preferences.");
    }

    registry.workspaces[preference.workspaceId] = {
      workspaceId: preference.workspaceId,
      provider: preference.provider,
      status: preference.provider === "cloudkit" ? "auth-required" : "idle",
      lastSyncAt: null,
      pendingUpload: false,
      lastError:
        preference.provider === "cloudkit"
          ? "Reconnect iCloud on this device before syncing the restored workspace."
          : null,
      // CloudKit identities, server change tags, session tokens, and other
      // device-bound authentication state are deliberately never portable.
      cloudKitUserRecordName: null,
      cloudManifestChangeTag: null,
      updatedAt: now
    };
  }

  writeRegistry(registry);
}

export function updateWorkspaceStoragePreference(
  workspaceIdInput: string,
  patch: WorkspaceStoragePreferencePatch
): WorkspaceStoragePreference {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const registry = readRegistry();
  const current = registry.workspaces[workspaceId] ?? createDefaultPreference(workspaceId);
  const next: WorkspaceStoragePreference = {
    ...current,
    ...patch,
    workspaceId,
    updatedAt: new Date().toISOString()
  };

  registry.workspaces[workspaceId] = next;
  writeRegistry(registry);
  return structuredClone(next);
}

export function setWorkspaceStorageProvider(
  workspaceIdInput: string,
  provider: WorkspaceStorageProvider
): WorkspaceStoragePreference {
  if (provider === "indexeddb") {
    return updateWorkspaceStoragePreference(workspaceIdInput, {
      provider,
      status: "idle",
      pendingUpload: false,
      lastError: null
    });
  }

  return updateWorkspaceStoragePreference(workspaceIdInput, {
    provider,
    status: "pending",
    pendingUpload: true,
    lastError: null
  });
}

export function restoreWorkspaceStoragePreference(
  workspaceIdInput: string,
  preference: WorkspaceStoragePreference | null
) {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const registry = readRegistry();

  if (preference === null) {
    delete registry.workspaces[workspaceId];
  } else {
    const parsed = parsePreference(preference, workspaceId);
    if (!parsed) {
      throw new Error("The workspace storage preference is invalid.");
    }
    registry.workspaces[workspaceId] = parsed;
  }

  writeRegistry(registry);
}

export function removeWorkspaceStoragePreference(workspaceIdInput: string) {
  restoreWorkspaceStoragePreference(workspaceIdInput, null);
}
