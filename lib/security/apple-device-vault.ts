import {
  validateWorkspaceId,
  type WorkspaceMasterKey
} from "./workspace-crypto";

/**
 * Device-local Apple account unlock vault.
 *
 * This module deliberately uses a separate IndexedDB database so its
 * non-extractable wrapping keys can never be captured by the application's
 * encrypted workspace/full-site snapshot functions. The Apple account
 * fingerprint itself is not stored; callers must present the complete value
 * again so it can be included in AES-GCM additional authenticated data.
 */

export const APPLE_DEVICE_VAULT_DATABASE_NAME =
  "studio-map-os.apple-device-vault" as const;
export const APPLE_DEVICE_VAULT_DATABASE_VERSION = 1 as const;
export const APPLE_DEVICE_VAULT_OBJECT_STORE = "credentials" as const;

const VAULT_RECORD_SCHEMA = "studio-map-os.apple-device-vault-entry" as const;
const VAULT_RECORD_VERSION = 1 as const;
const AES_GCM = "AES-GCM" as const;
const AES_KEY_BITS = 256 as const;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BITS = 128;
const MASTER_KEY_BYTES = 32;
const ENCRYPTED_MASTER_KEY_BYTES = MASTER_KEY_BYTES + AES_GCM_TAG_BITS / 8;
const INDEXED_DB_WATCHDOG_MS = 15_000;
const MAX_ACCOUNT_FINGERPRINT_LENGTH = 1_024;

type OwnedBytes = Uint8Array<ArrayBuffer>;

type AppleDeviceVaultRecord = {
  id: string;
  schema: typeof VAULT_RECORD_SCHEMA;
  version: typeof VAULT_RECORD_VERSION;
  workspaceId: string;
  accountFingerprintDigest: string;
  createdAt: string;
  updatedAt: string;
  wrappingKey: CryptoKey;
  iv: OwnedBytes;
  encryptedMasterKey: OwnedBytes;
};

export type AppleDeviceVaultIdentity = {
  /** The complete, stable CloudKit/Apple account fingerprint. */
  appleAccountFingerprint: string;
  workspaceId: string;
};

export type AppleDeviceVaultErrorCode =
  | "CRYPTO_UNAVAILABLE"
  | "INDEXED_DB_UNAVAILABLE"
  | "INVALID_ACCOUNT_FINGERPRINT"
  | "INVALID_WORKSPACE_ID"
  | "INVALID_MASTER_KEY"
  | "DATABASE_OPEN_FAILED"
  | "DATABASE_BLOCKED"
  | "SCHEMA_MISMATCH"
  | "TRANSACTION_FAILED"
  | "QUOTA_EXCEEDED"
  | "DEVICE_KEY_STORAGE_UNAVAILABLE"
  | "INVALID_VAULT_RECORD"
  | "VAULT_ENTRY_NOT_FOUND"
  | "ENCRYPTION_FAILED"
  | "UNLOCK_FAILED";

export class AppleDeviceVaultError extends Error {
  readonly code: AppleDeviceVaultErrorCode;

  constructor(code: AppleDeviceVaultErrorCode, message: string) {
    super(message);
    this.name = "AppleDeviceVaultError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type ValidatedIdentity = {
  appleAccountFingerprint: string;
  workspaceId: string;
};

type VaultLookup = ValidatedIdentity & {
  id: string;
  accountFingerprintDigest: string;
  additionalData: OwnedBytes;
};

const textEncoder = new TextEncoder();

function getWebCrypto(): Crypto {
  const webCrypto = globalThis.crypto;

  if (!webCrypto?.subtle || typeof webCrypto.getRandomValues !== "function") {
    throw new AppleDeviceVaultError(
      "CRYPTO_UNAVAILABLE",
      "This browser does not provide the Web Crypto API required for Apple device unlock."
    );
  }

  return webCrypto;
}

function getIndexedDbFactory(): IDBFactory {
  if (typeof indexedDB === "undefined" || typeof indexedDB.open !== "function") {
    throw new AppleDeviceVaultError(
      "INDEXED_DB_UNAVAILABLE",
      "IndexedDB is unavailable, so this device cannot store an Apple unlock key."
    );
  }

  return indexedDB;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        return true;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }

  return false;
}

function validateAccountFingerprint(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ACCOUNT_FINGERPRINT_LENGTH ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value) ||
    hasUnpairedSurrogate(value)
  ) {
    throw new AppleDeviceVaultError(
      "INVALID_ACCOUNT_FINGERPRINT",
      "The Apple account fingerprint is invalid."
    );
  }

  return value;
}

function validateIdentity(identity: AppleDeviceVaultIdentity): ValidatedIdentity {
  if (identity === null || typeof identity !== "object") {
    throw new AppleDeviceVaultError(
      "INVALID_ACCOUNT_FINGERPRINT",
      "A complete Apple device vault identity is required."
    );
  }

  const appleAccountFingerprint = validateAccountFingerprint(
    identity.appleAccountFingerprint
  );

  let workspaceId: string;
  try {
    workspaceId = validateWorkspaceId(identity.workspaceId);
  } catch {
    throw new AppleDeviceVaultError(
      "INVALID_WORKSPACE_ID",
      "The workspace ID is invalid."
    );
  }

  return { appleAccountFingerprint, workspaceId };
}

function copyMasterKey(value: WorkspaceMasterKey): WorkspaceMasterKey {
  if (!(value instanceof Uint8Array) || value.byteLength !== MASTER_KEY_BYTES) {
    throw new AppleDeviceVaultError(
      "INVALID_MASTER_KEY",
      `The workspace master key must contain exactly ${MASTER_KEY_BYTES} bytes.`
    );
  }

  return new Uint8Array(value);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await getWebCrypto().subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function buildAdditionalData(identity: ValidatedIdentity): OwnedBytes {
  // JSON property order is intentionally fixed as part of the cryptographic format.
  return textEncoder.encode(
    JSON.stringify({
      schema: VAULT_RECORD_SCHEMA,
      version: VAULT_RECORD_VERSION,
      appleAccountFingerprint: identity.appleAccountFingerprint,
      workspaceId: identity.workspaceId
    })
  );
}

async function createLookup(identityInput: AppleDeviceVaultIdentity): Promise<VaultLookup> {
  const identity = validateIdentity(identityInput);
  const [id, accountFingerprintDigest] = await Promise.all([
    sha256Base64Url(
      JSON.stringify({
        schema: VAULT_RECORD_SCHEMA,
        version: VAULT_RECORD_VERSION,
        appleAccountFingerprint: identity.appleAccountFingerprint,
        workspaceId: identity.workspaceId
      })
    ),
    sha256Base64Url(identity.appleAccountFingerprint)
  ]);

  return {
    ...identity,
    id,
    accountFingerprintDigest,
    additionalData: buildAdditionalData(identity)
  };
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isExactByteArray(value: unknown, expectedLength: number): value is OwnedBytes {
  return value instanceof Uint8Array && value.byteLength === expectedLength;
}

function isValidWrappingKey(value: unknown): value is CryptoKey {
  if (value === null || typeof value !== "object") {
    return false;
  }

  if (typeof CryptoKey === "function" && !(value instanceof CryptoKey)) {
    return false;
  }

  const candidate = value as CryptoKey;
  const algorithm = candidate.algorithm as AesKeyAlgorithm | undefined;
  const usages = Array.from(candidate.usages ?? []).sort();

  return (
    candidate.type === "secret" &&
    candidate.extractable === false &&
    algorithm?.name === AES_GCM &&
    algorithm.length === AES_KEY_BITS &&
    usages.length === 2 &&
    usages[0] === "decrypt" &&
    usages[1] === "encrypt"
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function parseVaultRecord(value: unknown, lookup: VaultLookup): AppleDeviceVaultRecord {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "schema",
      "version",
      "workspaceId",
      "accountFingerprintDigest",
      "createdAt",
      "updatedAt",
      "wrappingKey",
      "iv",
      "encryptedMasterKey"
    ]) ||
    value.id !== lookup.id ||
    value.schema !== VAULT_RECORD_SCHEMA ||
    value.version !== VAULT_RECORD_VERSION ||
    value.workspaceId !== lookup.workspaceId ||
    value.accountFingerprintDigest !== lookup.accountFingerprintDigest ||
    !isCanonicalIsoDate(value.createdAt) ||
    !isCanonicalIsoDate(value.updatedAt) ||
    Date.parse(value.updatedAt) < Date.parse(value.createdAt) ||
    !isValidWrappingKey(value.wrappingKey) ||
    !isExactByteArray(value.iv, AES_GCM_IV_BYTES) ||
    !isExactByteArray(value.encryptedMasterKey, ENCRYPTED_MASTER_KEY_BYTES)
  ) {
    throw new AppleDeviceVaultError(
      "INVALID_VAULT_RECORD",
      "The Apple device unlock record is invalid, corrupted, or belongs to another identity."
    );
  }

  return {
    id: lookup.id,
    schema: VAULT_RECORD_SCHEMA,
    version: VAULT_RECORD_VERSION,
    workspaceId: lookup.workspaceId,
    accountFingerprintDigest: lookup.accountFingerprintDigest,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    wrappingKey: value.wrappingKey,
    iv: new Uint8Array(value.iv),
    encryptedMasterKey: new Uint8Array(value.encryptedMasterKey)
  };
}

function databaseError(
  error: unknown,
  fallbackCode: AppleDeviceVaultErrorCode,
  fallbackMessage: string
): AppleDeviceVaultError {
  if (error instanceof AppleDeviceVaultError) {
    return error;
  }

  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return new AppleDeviceVaultError(
        "QUOTA_EXCEEDED",
        "This device does not have enough browser storage for the Apple unlock key."
      );
    }
    if (error.name === "VersionError") {
      return new AppleDeviceVaultError(
        "SCHEMA_MISMATCH",
        "This device contains a newer, unsupported Apple device vault."
      );
    }
    if (error.name === "DataCloneError" || error.name === "NotSupportedError") {
      return new AppleDeviceVaultError(
        "DEVICE_KEY_STORAGE_UNAVAILABLE",
        "This browser cannot persist a non-extractable Apple device unlock key."
      );
    }
  }

  return new AppleDeviceVaultError(fallbackCode, fallbackMessage);
}

function assertDatabaseSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(APPLE_DEVICE_VAULT_OBJECT_STORE)) {
    throw new AppleDeviceVaultError(
      "SCHEMA_MISMATCH",
      "The Apple device vault object store is missing."
    );
  }

  const transaction = database.transaction(APPLE_DEVICE_VAULT_OBJECT_STORE, "readonly");
  const store = transaction.objectStore(APPLE_DEVICE_VAULT_OBJECT_STORE);
  if (store.keyPath !== "id") {
    transaction.abort();
    throw new AppleDeviceVaultError(
      "SCHEMA_MISMATCH",
      "The Apple device vault key path is incompatible."
    );
  }
}

function openDatabase(): Promise<IDBDatabase> {
  const factory = getIndexedDbFactory();

  return new Promise((resolve, reject) => {
    let settled = false;
    let upgradeError: AppleDeviceVaultError | null = null;
    let request: IDBOpenDBRequest;

    try {
      request = factory.open(
        APPLE_DEVICE_VAULT_DATABASE_NAME,
        APPLE_DEVICE_VAULT_DATABASE_VERSION
      );
    } catch (error) {
      reject(
        databaseError(
          error,
          "DATABASE_OPEN_FAILED",
          "The Apple device vault could not be opened."
        )
      );
      return;
    }

    const watchdog = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        request.transaction?.abort();
      } catch {
        // The request may not have an active upgrade transaction.
      }
      reject(
        new AppleDeviceVaultError(
          "DATABASE_OPEN_FAILED",
          "The browser did not open the Apple device vault within 15 seconds."
        )
      );
    }, INDEXED_DB_WATCHDOG_MS);

    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;

      if (!transaction) {
        upgradeError = new AppleDeviceVaultError(
          "SCHEMA_MISMATCH",
          "The Apple device vault upgrade transaction is unavailable."
        );
        return;
      }

      try {
        const store = database.objectStoreNames.contains(APPLE_DEVICE_VAULT_OBJECT_STORE)
          ? transaction.objectStore(APPLE_DEVICE_VAULT_OBJECT_STORE)
          : database.createObjectStore(APPLE_DEVICE_VAULT_OBJECT_STORE, { keyPath: "id" });

        if (store.keyPath !== "id") {
          throw new AppleDeviceVaultError(
            "SCHEMA_MISMATCH",
            "The Apple device vault key path is incompatible."
          );
        }
      } catch (error) {
        upgradeError = databaseError(
          error,
          "SCHEMA_MISMATCH",
          "The Apple device vault schema could not be created."
        );
        try {
          transaction.abort();
        } catch {
          // The upgrade may already have aborted.
        }
      }
    };

    request.onblocked = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      reject(
        new AppleDeviceVaultError(
          "DATABASE_BLOCKED",
          "Another tab is blocking the Apple device vault upgrade. Close other Studio Map OS tabs and try again."
        )
      );
    };

    request.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      reject(
        upgradeError ??
          databaseError(
            request.error,
            "DATABASE_OPEN_FAILED",
            "The Apple device vault could not be opened."
          )
      );
    };

    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }

      try {
        assertDatabaseSchema(request.result);
      } catch (error) {
        settled = true;
        clearTimeout(watchdog);
        request.result.close();
        reject(
          databaseError(
            error,
            "SCHEMA_MISMATCH",
            "The Apple device vault schema is incompatible."
          )
        );
        return;
      }

      settled = true;
      clearTimeout(watchdog);
      resolve(request.result);
    };
  });
}

async function readVaultRecord(lookup: VaultLookup): Promise<AppleDeviceVaultRecord | null> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    let settled = false;
    const transaction = database.transaction(APPLE_DEVICE_VAULT_OBJECT_STORE, "readonly");
    const request = transaction.objectStore(APPLE_DEVICE_VAULT_OBJECT_STORE).get(lookup.id);
    let result: AppleDeviceVaultRecord | null = null;

    request.onsuccess = () => {
      if (request.result === undefined) {
        result = null;
        return;
      }

      try {
        result = parseVaultRecord(request.result, lookup);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be complete.
        }
        if (!settled) {
          settled = true;
          database.close();
          reject(error);
        }
      }
    };

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }
      settled = true;
      database.close();
      resolve(result);
    };

    transaction.onabort = transaction.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      database.close();
      reject(
        databaseError(
          transaction.error ?? request.error,
          "TRANSACTION_FAILED",
          "The Apple device vault could not be read."
        )
      );
    };
  });
}

/**
 * Creates or replaces this device's Apple unlock credential for one workspace.
 * A fresh non-extractable AES-GCM key and IV are generated for every update.
 */
export async function createOrUpdateAppleDeviceVaultEntry(input: {
  appleAccountFingerprint: string;
  workspaceId: string;
  masterKey: WorkspaceMasterKey;
}): Promise<void> {
  const lookup = await createLookup(input);
  const masterKey = copyMasterKey(input.masterKey);
  const webCrypto = getWebCrypto();

  let wrappingKey: CryptoKey;
  let iv: OwnedBytes;
  let encryptedMasterKey: OwnedBytes;

  try {
    wrappingKey = (await webCrypto.subtle.generateKey(
      { name: AES_GCM, length: AES_KEY_BITS },
      false,
      ["encrypt", "decrypt"]
    )) as CryptoKey;
    iv = webCrypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
    encryptedMasterKey = new Uint8Array(
      await webCrypto.subtle.encrypt(
        {
          name: AES_GCM,
          iv,
          additionalData: lookup.additionalData,
          tagLength: AES_GCM_TAG_BITS
        },
        wrappingKey,
        masterKey
      )
    );
  } catch {
    throw new AppleDeviceVaultError(
      "ENCRYPTION_FAILED",
      "The workspace key could not be protected for Apple device unlock."
    );
  } finally {
    masterKey.fill(0);
  }

  if (!isExactByteArray(encryptedMasterKey, ENCRYPTED_MASTER_KEY_BYTES)) {
    throw new AppleDeviceVaultError(
      "ENCRYPTION_FAILED",
      "The protected workspace key has an unexpected length."
    );
  }

  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let operationError: unknown;
    const transaction = database.transaction(APPLE_DEVICE_VAULT_OBJECT_STORE, "readwrite");
    const store = transaction.objectStore(APPLE_DEVICE_VAULT_OBJECT_STORE);
    const readRequest = store.get(lookup.id);

    readRequest.onsuccess = () => {
      let createdAt = new Date().toISOString();

      if (readRequest.result !== undefined) {
        try {
          createdAt = parseVaultRecord(readRequest.result, lookup).createdAt;
        } catch (error) {
          operationError = error;
          transaction.abort();
          return;
        }
      }

      const updatedAt = new Date().toISOString();
      const record: AppleDeviceVaultRecord = {
        id: lookup.id,
        schema: VAULT_RECORD_SCHEMA,
        version: VAULT_RECORD_VERSION,
        workspaceId: lookup.workspaceId,
        accountFingerprintDigest: lookup.accountFingerprintDigest,
        createdAt,
        updatedAt,
        wrappingKey,
        iv,
        encryptedMasterKey
      };

      try {
        const putRequest = store.put(record);
        putRequest.onerror = () => {
          operationError = putRequest.error;
        };
      } catch (error) {
        operationError = error;
        transaction.abort();
      }
    };

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }
      settled = true;
      database.close();
      resolve();
    };

    transaction.onabort = transaction.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      database.close();
      reject(
        databaseError(
          operationError ?? transaction.error ?? readRequest.error,
          "TRANSACTION_FAILED",
          "The Apple device unlock credential could not be saved."
        )
      );
    };
  });
}

/** Unlocks and returns a new in-memory copy of the 32-byte workspace master key. */
export async function unlockAppleDeviceVaultEntry(
  identity: AppleDeviceVaultIdentity
): Promise<WorkspaceMasterKey> {
  const lookup = await createLookup(identity);
  const record = await readVaultRecord(lookup);

  if (record === null) {
    throw new AppleDeviceVaultError(
      "VAULT_ENTRY_NOT_FOUND",
      "This device has no Apple unlock credential for that account and workspace."
    );
  }

  try {
    const decrypted = new Uint8Array(
      await getWebCrypto().subtle.decrypt(
        {
          name: AES_GCM,
          iv: record.iv,
          additionalData: lookup.additionalData,
          tagLength: AES_GCM_TAG_BITS
        },
        record.wrappingKey,
        record.encryptedMasterKey
      )
    );

    if (decrypted.byteLength !== MASTER_KEY_BYTES) {
      decrypted.fill(0);
      throw new Error("Unexpected decrypted key length.");
    }

    return decrypted;
  } catch {
    throw new AppleDeviceVaultError(
      "UNLOCK_FAILED",
      "The Apple device unlock credential is corrupted or does not match this account and workspace."
    );
  }
}

/** Returns true only when a valid credential exists for the exact identity. */
export async function hasAppleDeviceVaultEntry(
  identity: AppleDeviceVaultIdentity
): Promise<boolean> {
  const lookup = await createLookup(identity);
  return (await readVaultRecord(lookup)) !== null;
}

/** Deletes only the exact account/workspace credential and reports whether it existed. */
export async function deleteAppleDeviceVaultEntry(
  identity: AppleDeviceVaultIdentity
): Promise<boolean> {
  const lookup = await createLookup(identity);
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    let settled = false;
    let existed = false;
    const transaction = database.transaction(APPLE_DEVICE_VAULT_OBJECT_STORE, "readwrite");
    const store = transaction.objectStore(APPLE_DEVICE_VAULT_OBJECT_STORE);
    const readRequest = store.getKey(lookup.id);

    readRequest.onsuccess = () => {
      existed = readRequest.result !== undefined;
      if (existed) {
        store.delete(lookup.id);
      }
    };

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }
      settled = true;
      database.close();
      resolve(existed);
    };

    transaction.onabort = transaction.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      database.close();
      reject(
        databaseError(
          transaction.error ?? readRequest.error,
          "TRANSACTION_FAILED",
          "The Apple device unlock credential could not be deleted."
        )
      );
    };
  });
}
