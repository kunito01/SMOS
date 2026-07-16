import { validateWorkspaceId } from "@/lib/security/workspace-crypto";

const localMutationQueues = new Map<string, Promise<void>>();
const localWorkspaceMutationEpochs = new Map<string, number>();
const databaseLockName = "studio-map-os.database-mutation";
const authLockName = "studio-map-os.auth-mutation";
const workspaceMutationEpochStorageKey =
  "studio-map-os.workspace-mutation-epochs.v1";

const lockName = (workspaceId: string) =>
  `studio-map-os.workspace-mutation.${workspaceId}`;

const withLocalMutationQueue = async <T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> => {
  const previous = localMutationQueues.get(name) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queue = previous.then(() => current);
  localMutationQueues.set(name, queue);

  await previous;
  try {
    return await operation();
  } finally {
    releaseCurrent();
    if (localMutationQueues.get(name) === queue) {
      localMutationQueues.delete(name);
    }
  }
};

const withNamedMutationLock = async <T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> => {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request<Promise<T>>(
      name,
      { mode: "exclusive" },
      () => operation()
    );
  }

  return withLocalMutationQueue(name, operation);
};

/** Serializes whole-database replacements against every workspace write. */
export function withDatabaseMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  return withNamedMutationLock(databaseLockName, operation);
}

/** Serializes account/workspace registry changes across tabs and PWA windows. */
export function withAuthMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  return withNamedMutationLock(authLockName, operation);
}

const readStoredMutationEpochs = (): Record<string, number> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(workspaceMutationEpochStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          Number.isSafeInteger(entry[1]) && (entry[1] as number) >= 0
      )
    );
  } catch {
    return {};
  }
};

export function getWorkspaceMutationEpoch(workspaceIdInput: string): number {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const stored = readStoredMutationEpochs()[workspaceId];
  return Math.max(stored ?? 0, localWorkspaceMutationEpochs.get(workspaceId) ?? 0);
}

/**
 * Must be called while the database mutation lock is already held so queued
 * writes can detect that a restore replaced their original storage baseline.
 */
export function bumpWorkspaceMutationEpoch(workspaceIdInput: string): number {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const epochs = readStoredMutationEpochs();
  const next =
    Math.max(
      epochs[workspaceId] ?? 0,
      localWorkspaceMutationEpochs.get(workspaceId) ?? 0
    ) + 1;
  epochs[workspaceId] = next;
  localWorkspaceMutationEpochs.set(workspaceId, next);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(workspaceMutationEpochStorageKey, JSON.stringify(epochs));
    } catch {
      // The in-memory epoch still protects this tab when storage is unavailable.
    }
  }

  return next;
}

/**
 * Serializes writes to one workspace across tabs/PWA windows when Web Locks are
 * available, with an in-process queue as the fallback for older browsers.
 */
export async function withWorkspaceMutationLock<T>(
  workspaceIdInput: string,
  operation: () => Promise<T>
): Promise<T> {
  const workspaceId = validateWorkspaceId(workspaceIdInput);

  return withDatabaseMutationLock(() =>
    withNamedMutationLock(lockName(workspaceId), operation)
  );
}
