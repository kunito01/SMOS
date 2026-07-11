import {
  parseEncryptedWorkspaceRecord,
  validateWorkspaceId,
  WorkspaceCryptoError,
  type EncryptedWorkspaceRecord
} from "../security/workspace-crypto";

/**
 * Native IndexedDB persistence primitives for encrypted, offline-first data.
 *
 * The database is intentionally opened per operation and closed after the
 * transaction completes. This avoids relying on long-lived connections, which
 * are frequently suspended when an iOS/Safari PWA moves to the background.
 */

export const STUDIO_MAP_INDEXED_DB_NAME = "studio-map-os.local-data" as const;
export const STUDIO_MAP_INDEXED_DB_VERSION = 1 as const;
export const WORKSPACES_OBJECT_STORE = "workspaces" as const;
export const PUBLIC_SHARES_OBJECT_STORE = "publicShares" as const;
export const PUBLIC_SHARES_WORKSPACE_INDEX = "workspaceId" as const;

const WORKSPACE_SNAPSHOT_SCHEMA = "studio-map-os.encrypted-workspace-record-snapshot" as const;
const PUBLIC_SHARE_RECORD_SCHEMA = "studio-map-os.public-share-record" as const;
const PUBLIC_SHARE_SNAPSHOT_SCHEMA = "studio-map-os.public-share-records-snapshot" as const;
const WORKSPACE_BUNDLE_SNAPSHOT_SCHEMA =
  "studio-map-os.encrypted-workspace-bundle-snapshot" as const;
const ENCRYPTED_DATABASE_SNAPSHOT_SCHEMA =
  "studio-map-os.encrypted-database-snapshot" as const;
const STORAGE_SCHEMA_VERSION = 1 as const;
const INDEXED_DB_WATCHDOG_MS = 15_000;

export type EncryptedWorkspaceRecordSnapshot = {
  schema: typeof WORKSPACE_SNAPSHOT_SCHEMA;
  version: typeof STORAGE_SCHEMA_VERSION;
  workspaceId: string;
  record: EncryptedWorkspaceRecord | null;
};

/**
 * A capability share container. The share layer owns and validates `payload`;
 * this layer only persists a JSON-safe structured clone. Raw share tokens must
 * never be stored here: `tokenDigest` is a SHA-256 base64url digest.
 */
export type PublicShareRecord<TPayload = unknown> = {
  schema: typeof PUBLIC_SHARE_RECORD_SCHEMA;
  version: typeof STORAGE_SCHEMA_VERSION;
  tokenDigest: string;
  workspaceId: string;
  updatedAt: string;
  payload: TPayload;
};

export type PublicShareRecordsSnapshot<TPayload = unknown> = {
  schema: typeof PUBLIC_SHARE_SNAPSHOT_SCHEMA;
  version: typeof STORAGE_SCHEMA_VERSION;
  workspaceId: string;
  records: Array<PublicShareRecord<TPayload>>;
};

export type EncryptedWorkspaceBundle<TPayload = unknown> = {
  workspaceRecord: EncryptedWorkspaceRecord;
  publicShareRecords: Array<PublicShareRecord<TPayload>>;
};

export type EncryptedWorkspaceBundleSnapshot<TPayload = unknown> = {
  schema: typeof WORKSPACE_BUNDLE_SNAPSHOT_SCHEMA;
  version: typeof STORAGE_SCHEMA_VERSION;
  workspaceId: string;
  workspaceRecord: EncryptedWorkspaceRecord | null;
  publicShareRecords: Array<PublicShareRecord<TPayload>>;
};

/**
 * A complete, already-encrypted snapshot of this origin's Studio Map OS data.
 * It contains no workspace master keys. Authentication/recovery metadata lives
 * in the separately encrypted full-site archive payload.
 */
export type EncryptedDatabaseSnapshot<TPayload = unknown> = {
  schema: typeof ENCRYPTED_DATABASE_SNAPSHOT_SCHEMA;
  version: typeof STORAGE_SCHEMA_VERSION;
  bundles: Array<EncryptedWorkspaceBundleSnapshot<TPayload>>;
};

export type IndexedDbStorageErrorCode =
  | "INDEXED_DB_UNAVAILABLE"
  | "DATABASE_OPEN_FAILED"
  | "DATABASE_BLOCKED"
  | "SCHEMA_MISMATCH"
  | "TRANSACTION_FAILED"
  | "QUOTA_EXCEEDED"
  | "INVALID_WORKSPACE_ID"
  | "INVALID_WORKSPACE_RECORD"
  | "INVALID_PUBLIC_SHARE_RECORD"
  | "INVALID_SNAPSHOT"
  | "PUBLIC_SHARE_TOKEN_CONFLICT";

export class IndexedDbStorageError extends Error {
  readonly code: IndexedDbStorageErrorCode;

  constructor(code: IndexedDbStorageErrorCode, message: string) {
    super(message);
    this.name = "IndexedDbStorageError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type JsonRecord = Record<string, unknown>;

type TransactionController<T> = {
  setResult(value: T): void;
  fail(error: unknown): void;
};

function isRecord(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(record: JsonRecord, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function invalidPublicShareRecord(message: string): never {
  throw new IndexedDbStorageError("INVALID_PUBLIC_SHARE_RECORD", message);
}

function invalidSnapshot(message: string): never {
  throw new IndexedDbStorageError("INVALID_SNAPSHOT", message);
}

function parseWorkspaceId(value: unknown): string {
  try {
    return validateWorkspaceId(value);
  } catch {
    throw new IndexedDbStorageError("INVALID_WORKSPACE_ID", "The workspace ID is invalid.");
  }
}

/** Validates a canonical, unpadded base64url SHA-256 digest. */
export function validatePublicShareTokenDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new IndexedDbStorageError(
      "INVALID_PUBLIC_SHARE_RECORD",
      "The public share token digest must be an unpadded base64url SHA-256 digest."
    );
  }

  return value;
}

function isJsonSafe(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const visited = new WeakSet<object>();
  let visitedValues = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      break;
    }

    visitedValues += 1;
    if (visitedValues > 100_000 || current.depth > 100) {
      return false;
    }

    const currentValue = current.value;
    if (
      currentValue === null ||
      typeof currentValue === "string" ||
      typeof currentValue === "boolean"
    ) {
      continue;
    }

    if (typeof currentValue === "number") {
      if (!Number.isFinite(currentValue)) {
        return false;
      }
      continue;
    }

    if (typeof currentValue !== "object") {
      return false;
    }

    if (visited.has(currentValue)) {
      return false;
    }
    visited.add(currentValue);

    if (Array.isArray(currentValue)) {
      for (const item of currentValue) {
        pending.push({ value: item, depth: current.depth + 1 });
      }
      continue;
    }

    if (!isRecord(currentValue)) {
      return false;
    }

    for (const item of Object.values(currentValue)) {
      pending.push({ value: item, depth: current.depth + 1 });
    }
  }

  return true;
}

function cloneJsonPayload<TPayload>(payload: TPayload): TPayload {
  if (!isJsonSafe(payload)) {
    return invalidPublicShareRecord("The public share payload must be finite, acyclic JSON data.");
  }

  try {
    return JSON.parse(JSON.stringify(payload)) as TPayload;
  } catch {
    return invalidPublicShareRecord("The public share payload could not be serialized.");
  }
}

/** Strictly validates and clones one public share storage record. */
export function parsePublicShareRecord<TPayload = unknown>(
  value: unknown
): PublicShareRecord<TPayload> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "tokenDigest",
      "workspaceId",
      "updatedAt",
      "payload"
    ]) ||
    value.schema !== PUBLIC_SHARE_RECORD_SCHEMA ||
    value.version !== STORAGE_SCHEMA_VERSION ||
    !isCanonicalIsoDate(value.updatedAt)
  ) {
    return invalidPublicShareRecord("The public share record is invalid or unsupported.");
  }

  return {
    schema: PUBLIC_SHARE_RECORD_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    tokenDigest: validatePublicShareTokenDigest(value.tokenDigest),
    workspaceId: parseWorkspaceId(value.workspaceId),
    updatedAt: value.updatedAt,
    payload: cloneJsonPayload(value.payload) as TPayload
  };
}

/** Creates a validated public share record without persisting the raw token. */
export function createPublicShareRecord<TPayload>(input: {
  tokenDigest: string;
  workspaceId: string;
  payload: TPayload;
  updatedAt?: string;
}): PublicShareRecord<TPayload> {
  return parsePublicShareRecord<TPayload>({
    schema: PUBLIC_SHARE_RECORD_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    tokenDigest: input.tokenDigest,
    workspaceId: input.workspaceId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    payload: input.payload
  });
}

function parseStoredWorkspaceRecord(value: unknown): EncryptedWorkspaceRecord {
  try {
    return parseEncryptedWorkspaceRecord(value);
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      throw new IndexedDbStorageError("INVALID_WORKSPACE_RECORD", error.message);
    }
    throw new IndexedDbStorageError(
      "INVALID_WORKSPACE_RECORD",
      "The encrypted workspace record is invalid."
    );
  }
}

function parseWorkspaceSnapshot(value: unknown): EncryptedWorkspaceRecordSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schema", "version", "workspaceId", "record"]) ||
    value.schema !== WORKSPACE_SNAPSHOT_SCHEMA ||
    value.version !== STORAGE_SCHEMA_VERSION
  ) {
    return invalidSnapshot("The encrypted workspace snapshot is invalid or unsupported.");
  }

  const workspaceId = parseWorkspaceId(value.workspaceId);
  const record = value.record === null ? null : parseStoredWorkspaceRecord(value.record);

  if (record !== null && record.workspaceId !== workspaceId) {
    return invalidSnapshot("The encrypted record does not belong to the snapshot workspace.");
  }

  return {
    schema: WORKSPACE_SNAPSHOT_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    workspaceId,
    record
  };
}

function parsePublicShareSnapshot<TPayload = unknown>(
  value: unknown
): PublicShareRecordsSnapshot<TPayload> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schema", "version", "workspaceId", "records"]) ||
    value.schema !== PUBLIC_SHARE_SNAPSHOT_SCHEMA ||
    value.version !== STORAGE_SCHEMA_VERSION ||
    !Array.isArray(value.records)
  ) {
    return invalidSnapshot("The public share snapshot is invalid or unsupported.");
  }

  const workspaceId = parseWorkspaceId(value.workspaceId);
  const seenDigests = new Set<string>();
  const records = value.records.map((item) => {
    const record = parsePublicShareRecord<TPayload>(item);

    if (record.workspaceId !== workspaceId) {
      return invalidSnapshot("A public share record belongs to a different workspace.");
    }
    if (seenDigests.has(record.tokenDigest)) {
      return invalidSnapshot("The public share snapshot contains duplicate token digests.");
    }

    seenDigests.add(record.tokenDigest);
    return record;
  });

  return {
    schema: PUBLIC_SHARE_SNAPSHOT_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    workspaceId,
    records
  };
}

function parseWorkspaceBundleSnapshot<TPayload = unknown>(
  value: unknown
): EncryptedWorkspaceBundleSnapshot<TPayload> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "workspaceId",
      "workspaceRecord",
      "publicShareRecords"
    ]) ||
    value.schema !== WORKSPACE_BUNDLE_SNAPSHOT_SCHEMA ||
    value.version !== STORAGE_SCHEMA_VERSION ||
    !Array.isArray(value.publicShareRecords)
  ) {
    return invalidSnapshot("The encrypted workspace bundle snapshot is invalid or unsupported.");
  }

  const workspaceId = parseWorkspaceId(value.workspaceId);
  const workspaceRecord =
    value.workspaceRecord === null ? null : parseStoredWorkspaceRecord(value.workspaceRecord);

  if (workspaceRecord !== null && workspaceRecord.workspaceId !== workspaceId) {
    return invalidSnapshot("The encrypted record does not belong to the bundle snapshot workspace.");
  }

  let publicShareRecords: Array<PublicShareRecord<TPayload>>;
  try {
    publicShareRecords = validatePublicShareCollection<TPayload>(
      workspaceId,
      value.publicShareRecords as Array<PublicShareRecord<TPayload>>
    ).records;
  } catch (error) {
    if (error instanceof IndexedDbStorageError) {
      return invalidSnapshot(error.message);
    }
    return invalidSnapshot("The bundle snapshot contains invalid public share records.");
  }

  return {
    schema: WORKSPACE_BUNDLE_SNAPSHOT_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    workspaceId,
    workspaceRecord,
    publicShareRecords
  };
}

/** Strictly validates and clones one complete encrypted IndexedDB snapshot. */
export function parseEncryptedDatabaseSnapshot<TPayload = unknown>(
  value: unknown
): EncryptedDatabaseSnapshot<TPayload> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schema", "version", "bundles"]) ||
    value.schema !== ENCRYPTED_DATABASE_SNAPSHOT_SCHEMA ||
    value.version !== STORAGE_SCHEMA_VERSION ||
    !Array.isArray(value.bundles)
  ) {
    return invalidSnapshot("The encrypted database snapshot is invalid or unsupported.");
  }

  const seenWorkspaceIds = new Set<string>();
  const seenTokenDigests = new Set<string>();
  const bundles = value.bundles.map((item) => {
    const bundle = parseWorkspaceBundleSnapshot<TPayload>(item);

    if (seenWorkspaceIds.has(bundle.workspaceId)) {
      return invalidSnapshot("The encrypted database snapshot contains a duplicate workspace.");
    }
    seenWorkspaceIds.add(bundle.workspaceId);

    for (const record of bundle.publicShareRecords) {
      if (seenTokenDigests.has(record.tokenDigest)) {
        return invalidSnapshot("The encrypted database snapshot contains a duplicate share token.");
      }
      seenTokenDigests.add(record.tokenDigest);
    }

    return bundle;
  });

  bundles.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));

  return {
    schema: ENCRYPTED_DATABASE_SNAPSHOT_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    bundles
  };
}

function storageErrorFromDomException(
  error: unknown,
  fallbackCode: IndexedDbStorageErrorCode,
  fallbackMessage: string
): IndexedDbStorageError {
  if (error instanceof IndexedDbStorageError) {
    return error;
  }

  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return new IndexedDbStorageError(
        "QUOTA_EXCEEDED",
        "The browser does not have enough storage space for this local workspace data."
      );
    }
    if (error.name === "VersionError") {
      return new IndexedDbStorageError(
        "SCHEMA_MISMATCH",
        "This browser contains a newer, unsupported Studio Map OS database version."
      );
    }
  }

  return new IndexedDbStorageError(fallbackCode, fallbackMessage);
}

function getIndexedDbFactory(): IDBFactory {
  if (typeof indexedDB === "undefined" || typeof indexedDB.open !== "function") {
    throw new IndexedDbStorageError(
      "INDEXED_DB_UNAVAILABLE",
      "IndexedDB is unavailable in this browser context."
    );
  }

  return indexedDB;
}

function assertDatabaseSchema(database: IDBDatabase): void {
  if (
    !database.objectStoreNames.contains(WORKSPACES_OBJECT_STORE) ||
    !database.objectStoreNames.contains(PUBLIC_SHARES_OBJECT_STORE)
  ) {
    throw new IndexedDbStorageError(
      "SCHEMA_MISMATCH",
      "The Studio Map OS IndexedDB object stores are missing."
    );
  }

  const transaction = database.transaction(
    [WORKSPACES_OBJECT_STORE, PUBLIC_SHARES_OBJECT_STORE],
    "readonly"
  );
  const workspaceStore = transaction.objectStore(WORKSPACES_OBJECT_STORE);
  const publicShareStore = transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE);

  if (workspaceStore.keyPath !== "workspaceId" || publicShareStore.keyPath !== "tokenDigest") {
    throw new IndexedDbStorageError(
      "SCHEMA_MISMATCH",
      "The Studio Map OS IndexedDB object store key paths are incompatible."
    );
  }

  if (!publicShareStore.indexNames.contains(PUBLIC_SHARES_WORKSPACE_INDEX)) {
    throw new IndexedDbStorageError(
      "SCHEMA_MISMATCH",
      "The public share workspace index is missing."
    );
  }

  const workspaceIndex = publicShareStore.index(PUBLIC_SHARES_WORKSPACE_INDEX);
  if (workspaceIndex.keyPath !== "workspaceId" || workspaceIndex.unique) {
    throw new IndexedDbStorageError(
      "SCHEMA_MISMATCH",
      "The public share workspace index is incompatible."
    );
  }
}

function openDatabase(): Promise<IDBDatabase> {
  const factory = getIndexedDbFactory();

  return new Promise((resolve, reject) => {
    let settled = false;
    let upgradeError: IndexedDbStorageError | null = null;
    let request: IDBOpenDBRequest;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const clearWatchdog = () => {
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
        watchdog = undefined;
      }
    };

    try {
      request = factory.open(STUDIO_MAP_INDEXED_DB_NAME, STUDIO_MAP_INDEXED_DB_VERSION);
    } catch (error) {
      reject(
        storageErrorFromDomException(
          error,
          "DATABASE_OPEN_FAILED",
          "The Studio Map OS local database could not be opened."
        )
      );
      return;
    }

    watchdog = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      try {
        request.transaction?.abort();
      } catch {
        // The open request may not currently have an upgrade transaction.
      }
      try {
        request.result.close();
      } catch {
        // Accessing result before the open request succeeds throws InvalidStateError.
      }
      reject(
        new IndexedDbStorageError(
          "DATABASE_OPEN_FAILED",
          "The browser did not open the local database within 15 seconds."
        )
      );
    }, INDEXED_DB_WATCHDOG_MS);

    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;

      if (!transaction) {
        upgradeError = new IndexedDbStorageError(
          "SCHEMA_MISMATCH",
          "The IndexedDB upgrade transaction is unavailable."
        );
        return;
      }

      try {
        let workspaceStore: IDBObjectStore;
        if (database.objectStoreNames.contains(WORKSPACES_OBJECT_STORE)) {
          workspaceStore = transaction.objectStore(WORKSPACES_OBJECT_STORE);
        } else {
          workspaceStore = database.createObjectStore(WORKSPACES_OBJECT_STORE, {
            keyPath: "workspaceId"
          });
        }

        if (workspaceStore.keyPath !== "workspaceId") {
          throw new IndexedDbStorageError(
            "SCHEMA_MISMATCH",
            "The workspace object store has an incompatible key path."
          );
        }

        let publicShareStore: IDBObjectStore;
        if (database.objectStoreNames.contains(PUBLIC_SHARES_OBJECT_STORE)) {
          publicShareStore = transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE);
        } else {
          publicShareStore = database.createObjectStore(PUBLIC_SHARES_OBJECT_STORE, {
            keyPath: "tokenDigest"
          });
        }

        if (publicShareStore.keyPath !== "tokenDigest") {
          throw new IndexedDbStorageError(
            "SCHEMA_MISMATCH",
            "The public share object store has an incompatible key path."
          );
        }

        if (!publicShareStore.indexNames.contains(PUBLIC_SHARES_WORKSPACE_INDEX)) {
          publicShareStore.createIndex(PUBLIC_SHARES_WORKSPACE_INDEX, "workspaceId", {
            unique: false
          });
        } else {
          const index = publicShareStore.index(PUBLIC_SHARES_WORKSPACE_INDEX);
          if (index.keyPath !== "workspaceId" || index.unique) {
            throw new IndexedDbStorageError(
              "SCHEMA_MISMATCH",
              "The public share workspace index is incompatible."
            );
          }
        }
      } catch (error) {
        upgradeError = storageErrorFromDomException(
          error,
          "SCHEMA_MISMATCH",
          "The Studio Map OS IndexedDB schema could not be upgraded."
        );
        try {
          transaction.abort();
        } catch {
          // The request error handler below will still report the upgrade error.
        }
      }
    };

    request.onblocked = () => {
      if (!settled) {
        settled = true;
        clearWatchdog();
        reject(
          new IndexedDbStorageError(
            "DATABASE_BLOCKED",
            "Another Studio Map OS tab is blocking the local database upgrade. Close older tabs and try again."
          )
        );
      }
    };

    request.onerror = () => {
      if (!settled) {
        settled = true;
        clearWatchdog();
        reject(
          upgradeError ??
            storageErrorFromDomException(
              request.error,
              "DATABASE_OPEN_FAILED",
              "The Studio Map OS local database could not be opened."
            )
        );
      }
    };

    request.onsuccess = () => {
      const database = request.result;

      if (settled) {
        database.close();
        return;
      }

      try {
        assertDatabaseSchema(database);
      } catch (error) {
        settled = true;
        clearWatchdog();
        database.close();
        reject(
          storageErrorFromDomException(
            error,
            "SCHEMA_MISMATCH",
            "The Studio Map OS IndexedDB schema is incompatible."
          )
        );
        return;
      }

      database.onversionchange = () => database.close();
      settled = true;
      clearWatchdog();
      resolve(database);
    };
  });
}

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openDatabase();

  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

function runTransaction<T>(
  database: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  setup: (transaction: IDBTransaction, controller: TransactionController<T>) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let result: T | undefined;
    let hasResult = false;
    let manualError: IndexedDbStorageError | null = null;
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const clearWatchdog = () => {
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
        watchdog = undefined;
      }
    };

    const settleReject = (error: IndexedDbStorageError) => {
      if (!settled) {
        settled = true;
        clearWatchdog();
        reject(error);
      }
    };

    try {
      transaction = database.transaction(storeNames, mode);
    } catch (error) {
      settleReject(
        storageErrorFromDomException(
          error,
          "TRANSACTION_FAILED",
          "The local database transaction could not be started."
        )
      );
      return;
    }

    watchdog = setTimeout(() => {
      const timeoutError = new IndexedDbStorageError(
        "TRANSACTION_FAILED",
        "The browser did not finish the local database transaction within 15 seconds."
      );
      manualError = timeoutError;
      try {
        transaction.abort();
      } catch {
        // The database connection is closed by withDatabase after rejection.
      }
      settleReject(timeoutError);
    }, INDEXED_DB_WATCHDOG_MS);

    const controller: TransactionController<T> = {
      setResult(value) {
        result = value;
        hasResult = true;
      },
      fail(error) {
        if (manualError) {
          return;
        }

        manualError = storageErrorFromDomException(
          error,
          "TRANSACTION_FAILED",
          "The local database transaction failed."
        );
        try {
          transaction.abort();
        } catch {
          settleReject(manualError);
        }
      }
    };

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }

      if (manualError) {
        settleReject(manualError);
      } else if (!hasResult) {
        settleReject(
          new IndexedDbStorageError(
            "TRANSACTION_FAILED",
            "The local database transaction completed without a result."
          )
        );
      } else {
        settled = true;
        clearWatchdog();
        resolve(result as T);
      }
    };

    transaction.onabort = () => {
      settleReject(
        manualError ??
          storageErrorFromDomException(
            transaction.error,
            "TRANSACTION_FAILED",
            "The local database transaction was aborted."
          )
      );
    };

    transaction.onerror = () => {
      // IndexedDB will abort the transaction; onabort supplies the final error.
    };

    try {
      setup(transaction, controller);
    } catch (error) {
      controller.fail(error);
    }
  });
}

function validatePublicShareCollection<TPayload>(
  workspaceIdInput: unknown,
  recordsInput: ReadonlyArray<PublicShareRecord<TPayload>>
): { workspaceId: string; records: Array<PublicShareRecord<TPayload>> } {
  const workspaceId = parseWorkspaceId(workspaceIdInput);
  const seenDigests = new Set<string>();
  const records = recordsInput.map((item) => {
    const record = parsePublicShareRecord<TPayload>(item);

    if (record.workspaceId !== workspaceId) {
      throw new IndexedDbStorageError(
        "INVALID_PUBLIC_SHARE_RECORD",
        "A public share record belongs to a different workspace."
      );
    }
    if (seenDigests.has(record.tokenDigest)) {
      throw new IndexedDbStorageError(
        "INVALID_PUBLIC_SHARE_RECORD",
        "The public share records contain a duplicate token digest."
      );
    }

    seenDigests.add(record.tokenDigest);
    return record;
  });

  return { workspaceId, records };
}

function preflightPublicShareTokenOwnership<TPayload, TResult>(input: {
  store: IDBObjectStore;
  workspaceId: string;
  records: Array<PublicShareRecord<TPayload>>;
  controller: TransactionController<TResult>;
  onComplete(): void;
}): void {
  if (input.records.length === 0) {
    input.onComplete();
    return;
  }

  let remaining = input.records.length;

  for (const record of input.records) {
    const request = input.store.get(record.tokenDigest);
    request.onsuccess = () => {
      try {
        if (request.result !== undefined) {
          const existing = parsePublicShareRecord(request.result);
          if (existing.workspaceId !== input.workspaceId) {
            throw new IndexedDbStorageError(
              "PUBLIC_SHARE_TOKEN_CONFLICT",
              "A public share token digest is already owned by another workspace."
            );
          }
        }

        remaining -= 1;
        if (remaining === 0) {
          input.onComplete();
        }
      } catch (error) {
        input.controller.fail(error);
      }
    };
  }
}

function replacePublicSharesInTransaction<TPayload, TResult>(input: {
  store: IDBObjectStore;
  workspaceId: string;
  records: Array<PublicShareRecord<TPayload>>;
  controller: TransactionController<TResult>;
  result: TResult;
}): void {
  preflightPublicShareTokenOwnership({
    store: input.store,
    workspaceId: input.workspaceId,
    records: input.records,
    controller: input.controller,
    onComplete: () => {
      const cursorRequest = input.store
        .index(PUBLIC_SHARES_WORKSPACE_INDEX)
        .openCursor(input.workspaceId);

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          try {
            const existing = parsePublicShareRecord(cursor.value);
            if (existing.workspaceId !== input.workspaceId) {
              throw new IndexedDbStorageError(
                "INVALID_PUBLIC_SHARE_RECORD",
                "The public share workspace index contains inconsistent data."
              );
            }
            cursor.delete();
            cursor.continue();
          } catch (error) {
            input.controller.fail(error);
          }
          return;
        }

        for (const record of input.records) {
          input.store.put(record);
        }
        input.controller.setResult(input.result);
      };
    }
  });
}

export async function getEncryptedWorkspaceRecord(
  workspaceIdInput: string
): Promise<EncryptedWorkspaceRecord | null> {
  const workspaceId = parseWorkspaceId(workspaceIdInput);

  return withDatabase((database) =>
    runTransaction(database, WORKSPACES_OBJECT_STORE, "readonly", (transaction, controller) => {
      const request = transaction.objectStore(WORKSPACES_OBJECT_STORE).get(workspaceId);
      request.onsuccess = () => {
        try {
          if (request.result === undefined) {
            controller.setResult(null);
            return;
          }

          const record = parseStoredWorkspaceRecord(request.result);
          if (record.workspaceId !== workspaceId) {
            throw new IndexedDbStorageError(
              "INVALID_WORKSPACE_RECORD",
              "The workspace object store key does not match its encrypted record."
            );
          }
          controller.setResult(record);
        } catch (error) {
          controller.fail(error);
        }
      };
    })
  );
}

export async function putEncryptedWorkspaceRecord(
  recordInput: EncryptedWorkspaceRecord
): Promise<EncryptedWorkspaceRecord> {
  const record = parseStoredWorkspaceRecord(recordInput);

  return withDatabase((database) =>
    runTransaction(database, WORKSPACES_OBJECT_STORE, "readwrite", (transaction, controller) => {
      const request = transaction.objectStore(WORKSPACES_OBJECT_STORE).put(record);
      request.onsuccess = () => controller.setResult(record);
    })
  );
}

export async function deleteEncryptedWorkspaceRecord(workspaceIdInput: string): Promise<boolean> {
  const workspaceId = parseWorkspaceId(workspaceIdInput);

  return withDatabase((database) =>
    runTransaction(database, WORKSPACES_OBJECT_STORE, "readwrite", (transaction, controller) => {
      const store = transaction.objectStore(WORKSPACES_OBJECT_STORE);
      const getRequest = store.get(workspaceId);

      getRequest.onsuccess = () => {
        try {
          if (getRequest.result === undefined) {
            controller.setResult(false);
            return;
          }
          parseStoredWorkspaceRecord(getRequest.result);
          const deleteRequest = store.delete(workspaceId);
          deleteRequest.onsuccess = () => controller.setResult(true);
        } catch (error) {
          controller.fail(error);
        }
      };
    })
  );
}

export async function captureEncryptedWorkspaceRecord(
  workspaceIdInput: string
): Promise<EncryptedWorkspaceRecordSnapshot> {
  const workspaceId = parseWorkspaceId(workspaceIdInput);
  const record = await getEncryptedWorkspaceRecord(workspaceId);

  return {
    schema: WORKSPACE_SNAPSHOT_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    workspaceId,
    record
  };
}

export async function restoreEncryptedWorkspaceRecord(
  snapshotInput: EncryptedWorkspaceRecordSnapshot
): Promise<void> {
  const snapshot = parseWorkspaceSnapshot(snapshotInput);

  await withDatabase((database) =>
    runTransaction(database, WORKSPACES_OBJECT_STORE, "readwrite", (transaction, controller) => {
      const store = transaction.objectStore(WORKSPACES_OBJECT_STORE);
      const request =
        snapshot.record === null ? store.delete(snapshot.workspaceId) : store.put(snapshot.record);
      request.onsuccess = () => controller.setResult(undefined);
    })
  );
}

export async function getPublicShareRecord<TPayload = unknown>(
  tokenDigestInput: string
): Promise<PublicShareRecord<TPayload> | null> {
  const tokenDigest = validatePublicShareTokenDigest(tokenDigestInput);

  return withDatabase((database) =>
    runTransaction(database, PUBLIC_SHARES_OBJECT_STORE, "readonly", (transaction, controller) => {
      const request = transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE).get(tokenDigest);
      request.onsuccess = () => {
        try {
          if (request.result === undefined) {
            controller.setResult(null);
            return;
          }

          const record = parsePublicShareRecord<TPayload>(request.result);
          if (record.tokenDigest !== tokenDigest) {
            throw new IndexedDbStorageError(
              "INVALID_PUBLIC_SHARE_RECORD",
              "The public share object store key does not match its record."
            );
          }
          controller.setResult(record);
        } catch (error) {
          controller.fail(error);
        }
      };
    })
  );
}

export async function putPublicShareRecord<TPayload>(
  recordInput: PublicShareRecord<TPayload>
): Promise<PublicShareRecord<TPayload>> {
  const record = parsePublicShareRecord<TPayload>(recordInput);

  return withDatabase((database) =>
    runTransaction(database, PUBLIC_SHARES_OBJECT_STORE, "readwrite", (transaction, controller) => {
      const store = transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE);

      preflightPublicShareTokenOwnership({
        store,
        workspaceId: record.workspaceId,
        records: [record],
        controller,
        onComplete: () => {
          const request = store.put(record);
          request.onsuccess = () => controller.setResult(record);
        }
      });
    })
  );
}

export async function deletePublicShareRecord(tokenDigestInput: string): Promise<boolean> {
  const tokenDigest = validatePublicShareTokenDigest(tokenDigestInput);

  return withDatabase((database) =>
    runTransaction(database, PUBLIC_SHARES_OBJECT_STORE, "readwrite", (transaction, controller) => {
      const store = transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE);
      const getRequest = store.get(tokenDigest);

      getRequest.onsuccess = () => {
        try {
          if (getRequest.result === undefined) {
            controller.setResult(false);
            return;
          }
          parsePublicShareRecord(getRequest.result);
          const deleteRequest = store.delete(tokenDigest);
          deleteRequest.onsuccess = () => controller.setResult(true);
        } catch (error) {
          controller.fail(error);
        }
      };
    })
  );
}

export async function listPublicShareRecordsByWorkspace<TPayload = unknown>(
  workspaceIdInput: string
): Promise<Array<PublicShareRecord<TPayload>>> {
  const workspaceId = parseWorkspaceId(workspaceIdInput);

  return withDatabase((database) =>
    runTransaction(database, PUBLIC_SHARES_OBJECT_STORE, "readonly", (transaction, controller) => {
      const records: Array<PublicShareRecord<TPayload>> = [];
      const request = transaction
        .objectStore(PUBLIC_SHARES_OBJECT_STORE)
        .index(PUBLIC_SHARES_WORKSPACE_INDEX)
        .openCursor(workspaceId);

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          records.sort((left, right) => left.tokenDigest.localeCompare(right.tokenDigest));
          controller.setResult(records);
          return;
        }

        try {
          const record = parsePublicShareRecord<TPayload>(cursor.value);
          if (record.workspaceId !== workspaceId) {
            throw new IndexedDbStorageError(
              "INVALID_PUBLIC_SHARE_RECORD",
              "The public share workspace index contains inconsistent data."
            );
          }
          records.push(record);
          cursor.continue();
        } catch (error) {
          controller.fail(error);
        }
      };
    })
  );
}

export async function capturePublicShareRecords<TPayload = unknown>(
  workspaceIdInput: string
): Promise<PublicShareRecordsSnapshot<TPayload>> {
  const workspaceId = parseWorkspaceId(workspaceIdInput);
  const records = await listPublicShareRecordsByWorkspace<TPayload>(workspaceId);

  return {
    schema: PUBLIC_SHARE_SNAPSHOT_SCHEMA,
    version: STORAGE_SCHEMA_VERSION,
    workspaceId,
    records
  };
}

export async function restorePublicShareRecords<TPayload = unknown>(
  snapshotInput: PublicShareRecordsSnapshot<TPayload>
): Promise<void> {
  const snapshot = parsePublicShareSnapshot<TPayload>(snapshotInput);

  await withDatabase((database) =>
    runTransaction(database, PUBLIC_SHARES_OBJECT_STORE, "readwrite", (transaction, controller) => {
      replacePublicSharesInTransaction({
        store: transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE),
        workspaceId: snapshot.workspaceId,
        records: snapshot.records,
        controller,
        result: undefined
      });
    })
  );
}

/** Captures one workspace plus all of its public share records in one readonly transaction. */
export async function captureEncryptedWorkspaceBundle<TPayload = unknown>(
  workspaceIdInput: string
): Promise<EncryptedWorkspaceBundleSnapshot<TPayload>> {
  const workspaceId = parseWorkspaceId(workspaceIdInput);

  return withDatabase((database) =>
    runTransaction(
      database,
      [WORKSPACES_OBJECT_STORE, PUBLIC_SHARES_OBJECT_STORE],
      "readonly",
      (transaction, controller) => {
        let workspaceRecord: EncryptedWorkspaceRecord | null = null;
        const publicShareRecords: Array<PublicShareRecord<TPayload>> = [];
        let workspaceComplete = false;
        let publicSharesComplete = false;
        let resultSet = false;

        const finishIfComplete = () => {
          if (!workspaceComplete || !publicSharesComplete || resultSet) {
            return;
          }

          resultSet = true;
          publicShareRecords.sort((left, right) =>
            left.tokenDigest.localeCompare(right.tokenDigest)
          );
          controller.setResult({
            schema: WORKSPACE_BUNDLE_SNAPSHOT_SCHEMA,
            version: STORAGE_SCHEMA_VERSION,
            workspaceId,
            workspaceRecord,
            publicShareRecords
          });
        };

        const workspaceRequest = transaction
          .objectStore(WORKSPACES_OBJECT_STORE)
          .get(workspaceId);
        workspaceRequest.onsuccess = () => {
          try {
            if (workspaceRequest.result !== undefined) {
              workspaceRecord = parseStoredWorkspaceRecord(workspaceRequest.result);
              if (workspaceRecord.workspaceId !== workspaceId) {
                throw new IndexedDbStorageError(
                  "INVALID_WORKSPACE_RECORD",
                  "The workspace object store key does not match its encrypted record."
                );
              }
            }
            workspaceComplete = true;
            finishIfComplete();
          } catch (error) {
            controller.fail(error);
          }
        };

        const publicShareRequest = transaction
          .objectStore(PUBLIC_SHARES_OBJECT_STORE)
          .index(PUBLIC_SHARES_WORKSPACE_INDEX)
          .openCursor(workspaceId);
        publicShareRequest.onsuccess = () => {
          const cursor = publicShareRequest.result;
          if (!cursor) {
            publicSharesComplete = true;
            finishIfComplete();
            return;
          }

          try {
            const record = parsePublicShareRecord<TPayload>(cursor.value);
            if (record.workspaceId !== workspaceId) {
              throw new IndexedDbStorageError(
                "INVALID_PUBLIC_SHARE_RECORD",
                "The public share workspace index contains inconsistent data."
              );
            }
            publicShareRecords.push(record);
            cursor.continue();
          } catch (error) {
            controller.fail(error);
          }
        };
      }
    )
  );
}

/** Captures every encrypted workspace and public share in one readonly transaction. */
export async function captureEncryptedDatabaseSnapshot<TPayload = unknown>(): Promise<
  EncryptedDatabaseSnapshot<TPayload>
> {
  return withDatabase((database) =>
    runTransaction(
      database,
      [WORKSPACES_OBJECT_STORE, PUBLIC_SHARES_OBJECT_STORE],
      "readonly",
      (transaction, controller) => {
        let workspaceValues: unknown[] | null = null;
        let publicShareValues: unknown[] | null = null;

        const finishIfComplete = () => {
          if (workspaceValues === null || publicShareValues === null) {
            return;
          }

          try {
            const bundlesByWorkspace = new Map<
              string,
              EncryptedWorkspaceBundleSnapshot<TPayload>
            >();
            const ensureBundle = (workspaceId: string) => {
              const existing = bundlesByWorkspace.get(workspaceId);
              if (existing) {
                return existing;
              }

              const bundle: EncryptedWorkspaceBundleSnapshot<TPayload> = {
                schema: WORKSPACE_BUNDLE_SNAPSHOT_SCHEMA,
                version: STORAGE_SCHEMA_VERSION,
                workspaceId,
                workspaceRecord: null,
                publicShareRecords: []
              };
              bundlesByWorkspace.set(workspaceId, bundle);
              return bundle;
            };

            for (const value of workspaceValues) {
              const record = parseStoredWorkspaceRecord(value);
              const bundle = ensureBundle(record.workspaceId);
              if (bundle.workspaceRecord !== null) {
                throw new IndexedDbStorageError(
                  "INVALID_WORKSPACE_RECORD",
                  "The workspace store contains a duplicate encrypted record."
                );
              }
              bundle.workspaceRecord = record;
            }

            for (const value of publicShareValues) {
              const record = parsePublicShareRecord<TPayload>(value);
              ensureBundle(record.workspaceId).publicShareRecords.push(record);
            }

            const snapshot = parseEncryptedDatabaseSnapshot<TPayload>({
              schema: ENCRYPTED_DATABASE_SNAPSHOT_SCHEMA,
              version: STORAGE_SCHEMA_VERSION,
              bundles: [...bundlesByWorkspace.values()]
            });
            controller.setResult(snapshot);
          } catch (error) {
            controller.fail(error);
          }
        };

        const workspaceRequest = transaction
          .objectStore(WORKSPACES_OBJECT_STORE)
          .getAll();
        workspaceRequest.onsuccess = () => {
          workspaceValues = workspaceRequest.result;
          finishIfComplete();
        };

        const publicShareRequest = transaction
          .objectStore(PUBLIC_SHARES_OBJECT_STORE)
          .getAll();
        publicShareRequest.onsuccess = () => {
          publicShareValues = publicShareRequest.result;
          finishIfComplete();
        };
      }
    )
  );
}

/**
 * Replaces the complete encrypted IndexedDB contents in one transaction.
 * All validation finishes before the existing stores are cleared.
 */
export async function replaceEncryptedDatabaseSnapshot<TPayload = unknown>(
  snapshotInput: EncryptedDatabaseSnapshot<TPayload>
): Promise<void> {
  const snapshot = parseEncryptedDatabaseSnapshot<TPayload>(snapshotInput);

  await withDatabase((database) =>
    runTransaction(
      database,
      [WORKSPACES_OBJECT_STORE, PUBLIC_SHARES_OBJECT_STORE],
      "readwrite",
      (transaction, controller) => {
        const workspaceStore = transaction.objectStore(WORKSPACES_OBJECT_STORE);
        const publicShareStore = transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE);
        let clearedStores = 0;

        const populateAfterClear = () => {
          clearedStores += 1;
          if (clearedStores !== 2) {
            return;
          }

          for (const bundle of snapshot.bundles) {
            if (bundle.workspaceRecord !== null) {
              workspaceStore.put(bundle.workspaceRecord);
            }
            for (const record of bundle.publicShareRecords) {
              publicShareStore.put(record);
            }
          }

          controller.setResult(undefined);
        };

        workspaceStore.clear().onsuccess = populateAfterClear;
        publicShareStore.clear().onsuccess = populateAfterClear;
      }
    )
  );
}

/** Restores or removes a workspace and replaces its public shares atomically. */
export async function restoreEncryptedWorkspaceBundle<TPayload = unknown>(
  snapshotInput: EncryptedWorkspaceBundleSnapshot<TPayload>
): Promise<void> {
  const snapshot = parseWorkspaceBundleSnapshot<TPayload>(snapshotInput);

  await withDatabase((database) =>
    runTransaction(
      database,
      [WORKSPACES_OBJECT_STORE, PUBLIC_SHARES_OBJECT_STORE],
      "readwrite",
      (transaction, controller) => {
        const workspaceStore = transaction.objectStore(WORKSPACES_OBJECT_STORE);
        if (snapshot.workspaceRecord === null) {
          workspaceStore.delete(snapshot.workspaceId);
        } else {
          workspaceStore.put(snapshot.workspaceRecord);
        }

        replacePublicSharesInTransaction({
          store: transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE),
          workspaceId: snapshot.workspaceId,
          records: snapshot.publicShareRecords,
          controller,
          result: undefined
        });
      }
    )
  );
}

/**
 * Removes a workspace record and every public capability snapshot atomically.
 * This intentionally does not parse existing values so a user-authorized,
 * verified backup can recover an otherwise unreadable local database.
 */
export async function deleteEncryptedWorkspaceBundle(
  workspaceIdInput: string
): Promise<void> {
  const workspaceId = parseWorkspaceId(workspaceIdInput);

  await withDatabase((database) =>
    runTransaction(
      database,
      [WORKSPACES_OBJECT_STORE, PUBLIC_SHARES_OBJECT_STORE],
      "readwrite",
      (transaction, controller) => {
        transaction.objectStore(WORKSPACES_OBJECT_STORE).delete(workspaceId);
        const cursorRequest = transaction
          .objectStore(PUBLIC_SHARES_OBJECT_STORE)
          .index(PUBLIC_SHARES_WORKSPACE_INDEX)
          .openCursor(workspaceId);

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            controller.setResult(undefined);
            return;
          }

          cursor.delete();
          cursor.continue();
        };
      }
    )
  );
}

/**
 * Atomically replaces a workspace and all capability-share snapshots that
 * belong to it. Encryption must finish before this function is called so the
 * IndexedDB transaction never waits on Web Crypto promises (important on
 * Safari, where an idle transaction can auto-commit aggressively).
 */
export async function replaceEncryptedWorkspaceBundle<TPayload = unknown>(
  input: EncryptedWorkspaceBundle<TPayload>
): Promise<EncryptedWorkspaceBundle<TPayload>> {
  const workspaceRecord = parseStoredWorkspaceRecord(input.workspaceRecord);
  const { records: publicShareRecords } = validatePublicShareCollection(
    workspaceRecord.workspaceId,
    input.publicShareRecords
  );
  const result: EncryptedWorkspaceBundle<TPayload> = {
    workspaceRecord,
    publicShareRecords
  };

  return withDatabase((database) =>
    runTransaction(
      database,
      [WORKSPACES_OBJECT_STORE, PUBLIC_SHARES_OBJECT_STORE],
      "readwrite",
      (transaction, controller) => {
        transaction.objectStore(WORKSPACES_OBJECT_STORE).put(workspaceRecord);
        replacePublicSharesInTransaction({
          store: transaction.objectStore(PUBLIC_SHARES_OBJECT_STORE),
          workspaceId: workspaceRecord.workspaceId,
          records: publicShareRecords,
          controller,
          result
        });
      }
    )
  );
}
