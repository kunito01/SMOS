/**
 * Browser-only cryptographic primitives for Studio Map OS workspaces.
 *
 * The 16-digit workspace code is a recovery secret. It is never stored in the
 * returned metadata; only a PBKDF2-derived key can unwrap the random workspace
 * master key. Backup envelopes derive a fresh encryption key from that master
 * key for every export.
 */

export const WORKSPACE_CODE_LENGTH = 16 as const;

const MASTER_KEY_BYTES = 32;
const PBKDF2_SALT_BYTES = 16;
const HKDF_SALT_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BITS = 128;
const PBKDF2_ITERATIONS = 310_000;

const RECOVERY_SCHEMA = "studio-map-os.workspace-recovery" as const;
const PASSWORD_PROTECTION_SCHEMA = "studio-map-os.password-protected-master-key" as const;
const ENVELOPE_SCHEMA = "studio-map-os.encrypted-workspace-envelope" as const;
const WORKSPACE_RECORD_SCHEMA = "studio-map-os.encrypted-workspace-record" as const;
const CRYPTO_VERSION = 2 as const;
const WORKSPACE_RECORD_CRYPTO_VERSION = 1 as const;

const PBKDF2_NAME = "PBKDF2" as const;
const HKDF_NAME = "HKDF" as const;
const SHA_256 = "SHA-256" as const;
const AES_GCM = "AES-GCM" as const;

type OwnedBytes = Uint8Array<ArrayBuffer>;

export type WorkspaceMasterKey = OwnedBytes;
export type WorkspaceEnvelopeKind = "device" | "workspace" | "project";

type Pbkdf2Parameters = {
  name: typeof PBKDF2_NAME;
  hash: typeof SHA_256;
  iterations: number;
  salt: string;
};

type HkdfParameters = {
  name: typeof HKDF_NAME;
  hash: typeof SHA_256;
  salt: string;
};

type AesGcmCiphertext = {
  name: typeof AES_GCM;
  iv: string;
  ciphertext: string;
};

export type WorkspaceRecoveryMetadata = {
  schema: typeof RECOVERY_SCHEMA;
  version: typeof CRYPTO_VERSION;
  workspaceId: string;
  createdAt: string;
  keyDerivation: Pbkdf2Parameters;
  wrappedMasterKey: AesGcmCiphertext;
};

export type PasswordProtectedMasterKey = {
  schema: typeof PASSWORD_PROTECTION_SCHEMA;
  version: typeof CRYPTO_VERSION;
  workspaceId: string;
  createdAt: string;
  keyDerivation: Pbkdf2Parameters;
  wrappedMasterKey: AesGcmCiphertext;
};

export type EncryptedWorkspaceEnvelope = {
  schema: typeof ENVELOPE_SCHEMA;
  version: typeof CRYPTO_VERSION;
  kind: WorkspaceEnvelopeKind;
  exportedAt: string;
  metadata: WorkspaceRecoveryMetadata;
  keyDerivation: HkdfParameters;
  encryptedPayload: AesGcmCiphertext;
};

/**
 * An IndexedDB-safe encrypted workspace payload.
 *
 * Recovery metadata and the workspace master key are deliberately absent. The
 * caller must unlock the master key into memory before this record can be
 * decrypted.
 */
export type EncryptedWorkspaceRecord = {
  schema: typeof WORKSPACE_RECORD_SCHEMA;
  version: typeof WORKSPACE_RECORD_CRYPTO_VERSION;
  workspaceId: string;
  updatedAt: string;
  keyDerivation: HkdfParameters;
  encryptedPayload: AesGcmCiphertext;
};

export type WorkspaceCryptoErrorCode =
  | "CRYPTO_UNAVAILABLE"
  | "INVALID_WORKSPACE_CODE"
  | "INVALID_PASSWORD"
  | "INVALID_MASTER_KEY"
  | "INVALID_WORKSPACE_ID"
  | "INVALID_RECOVERY_METADATA"
  | "INVALID_PASSWORD_PROTECTION"
  | "INVALID_ENVELOPE"
  | "INVALID_WORKSPACE_RECORD"
  | "RECOVERY_UNLOCK_FAILED"
  | "PASSWORD_UNLOCK_FAILED"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "SERIALIZATION_FAILED";

export class WorkspaceCryptoError extends Error {
  readonly code: WorkspaceCryptoErrorCode;

  constructor(code: WorkspaceCryptoErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceCryptoError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type JsonRecord = Record<string, unknown>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function getWebCrypto(): Crypto {
  const webCrypto = globalThis.crypto;

  if (!webCrypto?.subtle || typeof webCrypto.getRandomValues !== "function") {
    throw new WorkspaceCryptoError(
      "CRYPTO_UNAVAILABLE",
      "This browser does not provide the Web Crypto API required to protect workspace data."
    );
  }

  return webCrypto;
}

function randomBytes(length: number): OwnedBytes {
  return getWebCrypto().getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(
  value: unknown,
  fieldName: string,
  expectedLength?: number,
  minimumLength?: number
): OwnedBytes {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new WorkspaceCryptoError("INVALID_ENVELOPE", `${fieldName} is not canonical base64.`);
  }

  let bytes: OwnedBytes;

  try {
    const binary = atob(value);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new WorkspaceCryptoError("INVALID_ENVELOPE", `${fieldName} is not valid base64.`);
  }

  if (bytesToBase64(bytes) !== value) {
    throw new WorkspaceCryptoError("INVALID_ENVELOPE", `${fieldName} is not canonical base64.`);
  }

  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new WorkspaceCryptoError("INVALID_ENVELOPE", `${fieldName} has an invalid byte length.`);
  }

  if (minimumLength !== undefined && bytes.length < minimumLength) {
    throw new WorkspaceCryptoError("INVALID_ENVELOPE", `${fieldName} is too short.`);
  }

  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

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

function isValidWorkspaceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function assertWorkspaceId(workspaceId: string): void {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new WorkspaceCryptoError("INVALID_WORKSPACE_ID", "The workspace ID is invalid.");
  }
}

function assertPassword(password: string): void {
  if (typeof password !== "string" || password.length === 0) {
    throw new WorkspaceCryptoError("INVALID_PASSWORD", "A non-empty password is required.");
  }
}

function copyMasterKey(masterKey: WorkspaceMasterKey): WorkspaceMasterKey {
  if (!(masterKey instanceof Uint8Array) || masterKey.byteLength !== MASTER_KEY_BYTES) {
    throw new WorkspaceCryptoError(
      "INVALID_MASTER_KEY",
      `The workspace master key must contain exactly ${MASTER_KEY_BYTES} bytes.`
    );
  }

  return new Uint8Array(masterKey);
}

function invalidMetadata(message: string): never {
  throw new WorkspaceCryptoError("INVALID_RECOVERY_METADATA", message);
}

function invalidPasswordProtection(message: string): never {
  throw new WorkspaceCryptoError("INVALID_PASSWORD_PROTECTION", message);
}

function invalidEnvelope(message: string): never {
  throw new WorkspaceCryptoError("INVALID_ENVELOPE", message);
}

function invalidWorkspaceRecord(message: string): never {
  throw new WorkspaceCryptoError("INVALID_WORKSPACE_RECORD", message);
}

function parsePbkdf2Parameters(
  value: unknown,
  error: (message: string) => never
): Pbkdf2Parameters {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["name", "hash", "iterations", "salt"]) ||
    value.name !== PBKDF2_NAME ||
    value.hash !== SHA_256 ||
    value.iterations !== PBKDF2_ITERATIONS
  ) {
    return error("The PBKDF2 parameters are invalid or unsupported.");
  }

  let salt: OwnedBytes;
  try {
    salt = base64ToBytes(value.salt, "PBKDF2 salt", PBKDF2_SALT_BYTES);
  } catch {
    return error("The PBKDF2 salt is invalid.");
  }

  return {
    name: PBKDF2_NAME,
    hash: SHA_256,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt)
  };
}

function parseAesGcmCiphertext(
  value: unknown,
  ciphertextLength: { exact?: number; minimum?: number },
  error: (message: string) => never
): AesGcmCiphertext {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["name", "iv", "ciphertext"]) ||
    value.name !== AES_GCM
  ) {
    return error("The AES-GCM parameters are invalid or unsupported.");
  }

  let iv: OwnedBytes;
  let ciphertext: OwnedBytes;

  try {
    iv = base64ToBytes(value.iv, "AES-GCM IV", AES_GCM_IV_BYTES);
    ciphertext = base64ToBytes(
      value.ciphertext,
      "AES-GCM ciphertext",
      ciphertextLength.exact,
      ciphertextLength.minimum
    );
  } catch {
    return error("The AES-GCM data is invalid.");
  }

  return {
    name: AES_GCM,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
}

function parseRecoveryMetadata(value: unknown): WorkspaceRecoveryMetadata {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "workspaceId",
      "createdAt",
      "keyDerivation",
      "wrappedMasterKey"
    ]) ||
    value.schema !== RECOVERY_SCHEMA ||
    value.version !== CRYPTO_VERSION ||
    !isValidWorkspaceId(value.workspaceId) ||
    !isCanonicalIsoDate(value.createdAt)
  ) {
    return invalidMetadata("The workspace recovery metadata is invalid or unsupported.");
  }

  return {
    schema: RECOVERY_SCHEMA,
    version: CRYPTO_VERSION,
    workspaceId: value.workspaceId,
    createdAt: value.createdAt,
    keyDerivation: parsePbkdf2Parameters(value.keyDerivation, invalidMetadata),
    wrappedMasterKey: parseAesGcmCiphertext(
      value.wrappedMasterKey,
      { exact: MASTER_KEY_BYTES + AES_GCM_TAG_BITS / 8 },
      invalidMetadata
    )
  };
}

function parsePasswordProtection(value: unknown): PasswordProtectedMasterKey {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "workspaceId",
      "createdAt",
      "keyDerivation",
      "wrappedMasterKey"
    ]) ||
    value.schema !== PASSWORD_PROTECTION_SCHEMA ||
    value.version !== CRYPTO_VERSION ||
    !isValidWorkspaceId(value.workspaceId) ||
    !isCanonicalIsoDate(value.createdAt)
  ) {
    return invalidPasswordProtection("The password-protected master key is invalid or unsupported.");
  }

  return {
    schema: PASSWORD_PROTECTION_SCHEMA,
    version: CRYPTO_VERSION,
    workspaceId: value.workspaceId,
    createdAt: value.createdAt,
    keyDerivation: parsePbkdf2Parameters(value.keyDerivation, invalidPasswordProtection),
    wrappedMasterKey: parseAesGcmCiphertext(
      value.wrappedMasterKey,
      { exact: MASTER_KEY_BYTES + AES_GCM_TAG_BITS / 8 },
      invalidPasswordProtection
    )
  };
}

function parseWorkspaceRecord(value: unknown): EncryptedWorkspaceRecord {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "workspaceId",
      "updatedAt",
      "keyDerivation",
      "encryptedPayload"
    ]) ||
    value.schema !== WORKSPACE_RECORD_SCHEMA ||
    value.version !== WORKSPACE_RECORD_CRYPTO_VERSION ||
    !isValidWorkspaceId(value.workspaceId) ||
    !isCanonicalIsoDate(value.updatedAt)
  ) {
    return invalidWorkspaceRecord("The encrypted workspace record is invalid or unsupported.");
  }

  if (
    !isRecord(value.keyDerivation) ||
    !hasExactKeys(value.keyDerivation, ["name", "hash", "salt"]) ||
    value.keyDerivation.name !== HKDF_NAME ||
    value.keyDerivation.hash !== SHA_256
  ) {
    return invalidWorkspaceRecord(
      "The encrypted workspace record uses invalid or unsupported HKDF parameters."
    );
  }

  let salt: OwnedBytes;
  try {
    salt = base64ToBytes(value.keyDerivation.salt, "workspace record HKDF salt", HKDF_SALT_BYTES);
  } catch {
    return invalidWorkspaceRecord("The encrypted workspace record HKDF salt is invalid.");
  }

  const encryptedPayload = parseAesGcmCiphertext(
    value.encryptedPayload,
    { minimum: AES_GCM_TAG_BITS / 8 + 1 },
    invalidWorkspaceRecord
  );

  return {
    schema: WORKSPACE_RECORD_SCHEMA,
    version: WORKSPACE_RECORD_CRYPTO_VERSION,
    workspaceId: value.workspaceId,
    updatedAt: value.updatedAt,
    keyDerivation: {
      name: HKDF_NAME,
      hash: SHA_256,
      salt: bytesToBase64(salt)
    },
    encryptedPayload
  };
}

function recoveryAdditionalData(metadata: WorkspaceRecoveryMetadata): OwnedBytes {
  return textEncoder.encode(
    JSON.stringify([
      metadata.schema,
      metadata.version,
      metadata.workspaceId,
      metadata.createdAt,
      metadata.keyDerivation.name,
      metadata.keyDerivation.hash,
      metadata.keyDerivation.iterations,
      metadata.keyDerivation.salt,
      metadata.wrappedMasterKey.name,
      metadata.wrappedMasterKey.iv
    ])
  );
}

function passwordAdditionalData(protection: PasswordProtectedMasterKey): OwnedBytes {
  return textEncoder.encode(
    JSON.stringify([
      protection.schema,
      protection.version,
      protection.workspaceId,
      protection.createdAt,
      protection.keyDerivation.name,
      protection.keyDerivation.hash,
      protection.keyDerivation.iterations,
      protection.keyDerivation.salt,
      protection.wrappedMasterKey.name,
      protection.wrappedMasterKey.iv
    ])
  );
}

function hkdfInfo(kind: WorkspaceEnvelopeKind, workspaceId: string): OwnedBytes {
  return textEncoder.encode(
    JSON.stringify([ENVELOPE_SCHEMA, CRYPTO_VERSION, kind, workspaceId, "backup-encryption-key"])
  );
}

function envelopeAdditionalData(envelope: EncryptedWorkspaceEnvelope): OwnedBytes {
  const metadata = envelope.metadata;

  return textEncoder.encode(
    JSON.stringify([
      envelope.schema,
      envelope.version,
      envelope.kind,
      envelope.exportedAt,
      metadata.schema,
      metadata.version,
      metadata.workspaceId,
      metadata.createdAt,
      metadata.keyDerivation.name,
      metadata.keyDerivation.hash,
      metadata.keyDerivation.iterations,
      metadata.keyDerivation.salt,
      metadata.wrappedMasterKey.name,
      metadata.wrappedMasterKey.iv,
      metadata.wrappedMasterKey.ciphertext,
      envelope.keyDerivation.name,
      envelope.keyDerivation.hash,
      envelope.keyDerivation.salt,
      envelope.encryptedPayload.name,
      envelope.encryptedPayload.iv
    ])
  );
}

function workspaceRecordHkdfInfo(workspaceId: string): OwnedBytes {
  return textEncoder.encode(
    JSON.stringify([
      WORKSPACE_RECORD_SCHEMA,
      WORKSPACE_RECORD_CRYPTO_VERSION,
      workspaceId,
      "indexeddb-workspace-record-encryption-key"
    ])
  );
}

function workspaceRecordAdditionalData(record: EncryptedWorkspaceRecord): OwnedBytes {
  return textEncoder.encode(
    JSON.stringify([
      record.schema,
      record.version,
      record.workspaceId,
      record.updatedAt,
      record.keyDerivation.name,
      record.keyDerivation.hash,
      record.keyDerivation.salt,
      record.encryptedPayload.name,
      record.encryptedPayload.iv
    ])
  );
}

async function derivePbkdf2Key(secret: string, parameters: Pbkdf2Parameters): Promise<CryptoKey> {
  const secretBytes = textEncoder.encode(secret);

  try {
    const sourceKey = await getWebCrypto().subtle.importKey(
      "raw",
      secretBytes,
      PBKDF2_NAME,
      false,
      ["deriveKey"]
    );

    return await getWebCrypto().subtle.deriveKey(
      {
        name: PBKDF2_NAME,
        hash: parameters.hash,
        iterations: parameters.iterations,
        salt: base64ToBytes(parameters.salt, "PBKDF2 salt", PBKDF2_SALT_BYTES)
      },
      sourceKey,
      { name: AES_GCM, length: MASTER_KEY_BYTES * 8 },
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    secretBytes.fill(0);
  }
}

async function deriveEnvelopeKey(
  masterKey: WorkspaceMasterKey,
  kind: WorkspaceEnvelopeKind,
  workspaceId: string,
  salt: OwnedBytes
): Promise<CryptoKey> {
  const sourceKey = await getWebCrypto().subtle.importKey("raw", masterKey, HKDF_NAME, false, ["deriveKey"]);

  return getWebCrypto().subtle.deriveKey(
    {
      name: HKDF_NAME,
      hash: SHA_256,
      salt,
      info: hkdfInfo(kind, workspaceId)
    },
    sourceKey,
    { name: AES_GCM, length: MASTER_KEY_BYTES * 8 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveWorkspaceRecordKey(
  masterKey: WorkspaceMasterKey,
  workspaceId: string,
  salt: OwnedBytes
): Promise<CryptoKey> {
  const sourceKey = await getWebCrypto().subtle.importKey("raw", masterKey, HKDF_NAME, false, ["deriveKey"]);

  return getWebCrypto().subtle.deriveKey(
    {
      name: HKDF_NAME,
      hash: SHA_256,
      salt,
      info: workspaceRecordHkdfInfo(workspaceId)
    },
    sourceKey,
    { name: AES_GCM, length: MASTER_KEY_BYTES * 8 },
    false,
    ["encrypt", "decrypt"]
  );
}

function createPbkdf2Parameters(): Pbkdf2Parameters {
  return {
    name: PBKDF2_NAME,
    hash: SHA_256,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(randomBytes(PBKDF2_SALT_BYTES))
  };
}

function createEmptyCiphertext(iv: OwnedBytes): AesGcmCiphertext {
  return {
    name: AES_GCM,
    iv: bytesToBase64(iv),
    ciphertext: ""
  };
}

function isWorkspaceEnvelopeKind(value: unknown): value is WorkspaceEnvelopeKind {
  return value === "device" || value === "workspace" || value === "project";
}

/** Strictly validates persisted recovery metadata without exposing the recovery code. */
export function validateWorkspaceRecoveryMetadata(value: unknown): WorkspaceRecoveryMetadata {
  return parseRecoveryMetadata(value);
}

/** Strictly validates a password-wrapped workspace master key. */
export function validatePasswordProtectedMasterKey(value: unknown): PasswordProtectedMasterKey {
  return parsePasswordProtection(value);
}

/** Strictly validates an IndexedDB encrypted workspace record. */
export function parseEncryptedWorkspaceRecord(value: unknown): EncryptedWorkspaceRecord {
  return parseWorkspaceRecord(value);
}

/** Validates and returns a canonical workspace identifier. */
export function validateWorkspaceId(value: unknown): string {
  if (!isValidWorkspaceId(value)) {
    throw new WorkspaceCryptoError("INVALID_WORKSPACE_ID", "The workspace ID is invalid.");
  }

  return value;
}

/** Generates a uniformly distributed 16-digit workspace recovery code. */
export function generateWorkspaceCode(): string {
  let result = "";

  // 250 is the largest multiple of 10 below 256. Discarding 250..255 avoids
  // modulo bias while retaining one random decimal digit per accepted byte.
  while (result.length < WORKSPACE_CODE_LENGTH) {
    const remaining = WORKSPACE_CODE_LENGTH - result.length;
    const random = randomBytes(Math.max(remaining, 8));

    for (const value of random) {
      if (value < 250) {
        result += String(value % 10);
        if (result.length === WORKSPACE_CODE_LENGTH) {
          break;
        }
      }
    }
  }

  return result;
}

/** Removes visual whitespace and hyphen separators without hiding other invalid characters. */
export function normalizeWorkspaceCode(value: string): string {
  return typeof value === "string" ? value.replace(/[\s-]+/g, "") : "";
}

/** Formats a code in wallet-like 4-4-4-4 groups. Partial input is supported for form fields. */
export function formatWorkspaceCode(value: string): string {
  const normalized = normalizeWorkspaceCode(value);
  return normalized.match(/.{1,4}/g)?.join("-") ?? "";
}

export function isValidWorkspaceCode(value: string): boolean {
  return new RegExp(`^\\d{${WORKSPACE_CODE_LENGTH}}$`).test(normalizeWorkspaceCode(value));
}

export async function createWorkspaceRecovery(
  code: string
): Promise<{ metadata: WorkspaceRecoveryMetadata; masterKey: WorkspaceMasterKey }> {
  const normalizedCode = normalizeWorkspaceCode(code);
  if (!isValidWorkspaceCode(normalizedCode)) {
    throw new WorkspaceCryptoError(
      "INVALID_WORKSPACE_CODE",
      `The workspace code must contain exactly ${WORKSPACE_CODE_LENGTH} digits.`
    );
  }

  const masterKey = randomBytes(MASTER_KEY_BYTES);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const metadata: WorkspaceRecoveryMetadata = {
    schema: RECOVERY_SCHEMA,
    version: CRYPTO_VERSION,
    workspaceId: `ws_${bytesToBase64Url(randomBytes(16))}`,
    createdAt: new Date().toISOString(),
    keyDerivation: createPbkdf2Parameters(),
    wrappedMasterKey: createEmptyCiphertext(iv)
  };

  try {
    const wrappingKey = await derivePbkdf2Key(normalizedCode, metadata.keyDerivation);
    const ciphertext = await getWebCrypto().subtle.encrypt(
      {
        name: AES_GCM,
        iv,
        additionalData: recoveryAdditionalData(metadata),
        tagLength: AES_GCM_TAG_BITS
      },
      wrappingKey,
      masterKey
    );

    metadata.wrappedMasterKey.ciphertext = bytesToBase64(new Uint8Array(ciphertext));
    return { metadata, masterKey };
  } catch (error) {
    masterKey.fill(0);
    if (error instanceof WorkspaceCryptoError) {
      throw error;
    }
    throw new WorkspaceCryptoError("ENCRYPTION_FAILED", "The workspace master key could not be protected.");
  }
}

export async function unlockWorkspaceRecovery(
  metadata: WorkspaceRecoveryMetadata,
  code: string
): Promise<WorkspaceMasterKey> {
  const parsedMetadata = parseRecoveryMetadata(metadata);
  const normalizedCode = normalizeWorkspaceCode(code);

  if (!isValidWorkspaceCode(normalizedCode)) {
    throw new WorkspaceCryptoError(
      "INVALID_WORKSPACE_CODE",
      `The workspace code must contain exactly ${WORKSPACE_CODE_LENGTH} digits.`
    );
  }

  try {
    const wrappingKey = await derivePbkdf2Key(normalizedCode, parsedMetadata.keyDerivation);
    const plaintext = await getWebCrypto().subtle.decrypt(
      {
        name: AES_GCM,
        iv: base64ToBytes(parsedMetadata.wrappedMasterKey.iv, "AES-GCM IV", AES_GCM_IV_BYTES),
        additionalData: recoveryAdditionalData(parsedMetadata),
        tagLength: AES_GCM_TAG_BITS
      },
      wrappingKey,
      base64ToBytes(
        parsedMetadata.wrappedMasterKey.ciphertext,
        "wrapped master key",
        MASTER_KEY_BYTES + AES_GCM_TAG_BITS / 8
      )
    );
    const masterKey = new Uint8Array(plaintext);

    if (masterKey.byteLength !== MASTER_KEY_BYTES) {
      masterKey.fill(0);
      throw new Error("Invalid decrypted master key length.");
    }

    return masterKey;
  } catch (error) {
    if (error instanceof WorkspaceCryptoError && error.code === "CRYPTO_UNAVAILABLE") {
      throw error;
    }
    throw new WorkspaceCryptoError(
      "RECOVERY_UNLOCK_FAILED",
      "The workspace code does not match this recovery metadata, or the metadata is damaged."
    );
  }
}

export async function protectMasterKeyWithPassword(
  masterKey: WorkspaceMasterKey,
  password: string,
  workspaceId: string
): Promise<PasswordProtectedMasterKey> {
  const masterKeyCopy = copyMasterKey(masterKey);
  assertPassword(password);
  assertWorkspaceId(workspaceId);

  const iv = randomBytes(AES_GCM_IV_BYTES);
  const protection: PasswordProtectedMasterKey = {
    schema: PASSWORD_PROTECTION_SCHEMA,
    version: CRYPTO_VERSION,
    workspaceId,
    createdAt: new Date().toISOString(),
    keyDerivation: createPbkdf2Parameters(),
    wrappedMasterKey: createEmptyCiphertext(iv)
  };

  try {
    const wrappingKey = await derivePbkdf2Key(password, protection.keyDerivation);
    const ciphertext = await getWebCrypto().subtle.encrypt(
      {
        name: AES_GCM,
        iv,
        additionalData: passwordAdditionalData(protection),
        tagLength: AES_GCM_TAG_BITS
      },
      wrappingKey,
      masterKeyCopy
    );

    protection.wrappedMasterKey.ciphertext = bytesToBase64(new Uint8Array(ciphertext));
    return protection;
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      throw error;
    }
    throw new WorkspaceCryptoError("ENCRYPTION_FAILED", "The workspace master key could not be password-protected.");
  } finally {
    masterKeyCopy.fill(0);
  }
}

export async function unlockMasterKeyWithPassword(
  protection: PasswordProtectedMasterKey,
  password: string,
  workspaceId: string
): Promise<WorkspaceMasterKey> {
  const parsedProtection = parsePasswordProtection(protection);
  assertPassword(password);
  assertWorkspaceId(workspaceId);

  if (parsedProtection.workspaceId !== workspaceId) {
    throw new WorkspaceCryptoError(
      "PASSWORD_UNLOCK_FAILED",
      "This password-protected key belongs to a different workspace."
    );
  }

  try {
    const wrappingKey = await derivePbkdf2Key(password, parsedProtection.keyDerivation);
    const plaintext = await getWebCrypto().subtle.decrypt(
      {
        name: AES_GCM,
        iv: base64ToBytes(parsedProtection.wrappedMasterKey.iv, "AES-GCM IV", AES_GCM_IV_BYTES),
        additionalData: passwordAdditionalData(parsedProtection),
        tagLength: AES_GCM_TAG_BITS
      },
      wrappingKey,
      base64ToBytes(
        parsedProtection.wrappedMasterKey.ciphertext,
        "password-protected master key",
        MASTER_KEY_BYTES + AES_GCM_TAG_BITS / 8
      )
    );
    const masterKey = new Uint8Array(plaintext);

    if (masterKey.byteLength !== MASTER_KEY_BYTES) {
      masterKey.fill(0);
      throw new Error("Invalid decrypted master key length.");
    }

    return masterKey;
  } catch (error) {
    if (error instanceof WorkspaceCryptoError && error.code === "CRYPTO_UNAVAILABLE") {
      throw error;
    }
    throw new WorkspaceCryptoError(
      "PASSWORD_UNLOCK_FAILED",
      "The password is incorrect, or the protected master key is damaged."
    );
  }
}

export async function encryptWorkspaceEnvelope<T>(input: {
  kind: WorkspaceEnvelopeKind;
  payload: T;
  metadata: WorkspaceRecoveryMetadata;
  masterKey: WorkspaceMasterKey;
}): Promise<EncryptedWorkspaceEnvelope> {
  if (!isWorkspaceEnvelopeKind(input.kind)) {
    throw new WorkspaceCryptoError(
      "INVALID_ENVELOPE",
      "The backup kind must be device, workspace, or project."
    );
  }

  const metadata = parseRecoveryMetadata(input.metadata);
  const masterKey = copyMasterKey(input.masterKey);
  let plaintext: OwnedBytes;

  try {
    const serialized = JSON.stringify(input.payload);
    if (serialized === undefined) {
      throw new Error("The payload is not JSON serializable.");
    }
    plaintext = textEncoder.encode(serialized);
  } catch {
    masterKey.fill(0);
    throw new WorkspaceCryptoError(
      "SERIALIZATION_FAILED",
      "The backup payload must be valid JSON data."
    );
  }

  const salt = randomBytes(HKDF_SALT_BYTES);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const envelope: EncryptedWorkspaceEnvelope = {
    schema: ENVELOPE_SCHEMA,
    version: CRYPTO_VERSION,
    kind: input.kind,
    exportedAt: new Date().toISOString(),
    metadata,
    keyDerivation: {
      name: HKDF_NAME,
      hash: SHA_256,
      salt: bytesToBase64(salt)
    },
    encryptedPayload: createEmptyCiphertext(iv)
  };

  try {
    const encryptionKey = await deriveEnvelopeKey(masterKey, input.kind, metadata.workspaceId, salt);
    const ciphertext = await getWebCrypto().subtle.encrypt(
      {
        name: AES_GCM,
        iv,
        additionalData: envelopeAdditionalData(envelope),
        tagLength: AES_GCM_TAG_BITS
      },
      encryptionKey,
      plaintext
    );

    envelope.encryptedPayload.ciphertext = bytesToBase64(new Uint8Array(ciphertext));
    return envelope;
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      throw error;
    }
    throw new WorkspaceCryptoError("ENCRYPTION_FAILED", "The backup payload could not be encrypted.");
  } finally {
    masterKey.fill(0);
    plaintext.fill(0);
  }
}

export function parseEncryptedWorkspaceEnvelope(
  value: unknown,
  expectedKind?: WorkspaceEnvelopeKind
): EncryptedWorkspaceEnvelope {
  if (expectedKind !== undefined && !isWorkspaceEnvelopeKind(expectedKind)) {
    return invalidEnvelope("The expected backup kind is invalid.");
  }

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return invalidEnvelope("The backup file is not valid JSON.");
    }
  }

  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, [
      "schema",
      "version",
      "kind",
      "exportedAt",
      "metadata",
      "keyDerivation",
      "encryptedPayload"
    ]) ||
    parsed.schema !== ENVELOPE_SCHEMA ||
    parsed.version !== CRYPTO_VERSION ||
    !isWorkspaceEnvelopeKind(parsed.kind) ||
    !isCanonicalIsoDate(parsed.exportedAt)
  ) {
    return invalidEnvelope("The encrypted backup envelope is invalid or unsupported.");
  }

  if (expectedKind !== undefined && parsed.kind !== expectedKind) {
    return invalidEnvelope(`Expected a ${expectedKind} backup, but received a ${parsed.kind} backup.`);
  }

  let metadata: WorkspaceRecoveryMetadata;
  try {
    metadata = parseRecoveryMetadata(parsed.metadata);
  } catch {
    return invalidEnvelope("The envelope contains invalid recovery metadata.");
  }

  if (
    !isRecord(parsed.keyDerivation) ||
    !hasExactKeys(parsed.keyDerivation, ["name", "hash", "salt"]) ||
    parsed.keyDerivation.name !== HKDF_NAME ||
    parsed.keyDerivation.hash !== SHA_256
  ) {
    return invalidEnvelope("The envelope HKDF parameters are invalid or unsupported.");
  }

  let hkdfSalt: OwnedBytes;
  try {
    hkdfSalt = base64ToBytes(parsed.keyDerivation.salt, "HKDF salt", HKDF_SALT_BYTES);
  } catch {
    return invalidEnvelope("The envelope HKDF salt is invalid.");
  }

  const encryptedPayload = parseAesGcmCiphertext(
    parsed.encryptedPayload,
    { minimum: AES_GCM_TAG_BITS / 8 + 1 },
    invalidEnvelope
  );

  return {
    schema: ENVELOPE_SCHEMA,
    version: CRYPTO_VERSION,
    kind: parsed.kind,
    exportedAt: parsed.exportedAt,
    metadata,
    keyDerivation: {
      name: HKDF_NAME,
      hash: SHA_256,
      salt: bytesToBase64(hkdfSalt)
    },
    encryptedPayload
  };
}

export async function decryptWorkspaceEnvelope<T = unknown>(
  envelope: EncryptedWorkspaceEnvelope,
  code: string
): Promise<{
  payload: T;
  masterKey: WorkspaceMasterKey;
  metadata: WorkspaceRecoveryMetadata;
}> {
  const parsedEnvelope = parseEncryptedWorkspaceEnvelope(envelope);
  const masterKey = await unlockWorkspaceRecovery(parsedEnvelope.metadata, code);

  try {
    const salt = base64ToBytes(parsedEnvelope.keyDerivation.salt, "HKDF salt", HKDF_SALT_BYTES);
    const decryptionKey = await deriveEnvelopeKey(
      masterKey,
      parsedEnvelope.kind,
      parsedEnvelope.metadata.workspaceId,
      salt
    );
    const plaintextBuffer = await getWebCrypto().subtle.decrypt(
      {
        name: AES_GCM,
        iv: base64ToBytes(parsedEnvelope.encryptedPayload.iv, "AES-GCM IV", AES_GCM_IV_BYTES),
        additionalData: envelopeAdditionalData(parsedEnvelope),
        tagLength: AES_GCM_TAG_BITS
      },
      decryptionKey,
      base64ToBytes(
        parsedEnvelope.encryptedPayload.ciphertext,
        "encrypted payload",
        undefined,
        AES_GCM_TAG_BITS / 8 + 1
      )
    );
    const plaintext = new Uint8Array(plaintextBuffer);

    try {
      const payload = JSON.parse(textDecoder.decode(plaintext)) as T;
      return {
        payload,
        masterKey,
        metadata: parsedEnvelope.metadata
      };
    } finally {
      plaintext.fill(0);
    }
  } catch (error) {
    masterKey.fill(0);
    if (error instanceof WorkspaceCryptoError && error.code === "CRYPTO_UNAVAILABLE") {
      throw error;
    }
    throw new WorkspaceCryptoError(
      "DECRYPTION_FAILED",
      "The encrypted backup is damaged or does not match this workspace."
    );
  }
}

/**
 * Encrypts one workspace payload for durable local storage.
 *
 * A new HKDF salt and AES-GCM IV are generated for every call. The supplied
 * master key is copied only for the duration of the operation and is never
 * included in the returned record.
 */
export async function encryptWorkspaceRecord<T>(input: {
  workspaceId: string;
  payload: T;
  masterKey: WorkspaceMasterKey;
}): Promise<EncryptedWorkspaceRecord> {
  const workspaceId = validateWorkspaceId(input.workspaceId);
  const masterKey = copyMasterKey(input.masterKey);
  let plaintext: OwnedBytes;

  try {
    const serialized = JSON.stringify(input.payload);
    if (serialized === undefined) {
      throw new Error("The payload is not JSON serializable.");
    }
    plaintext = textEncoder.encode(serialized);
  } catch {
    masterKey.fill(0);
    throw new WorkspaceCryptoError(
      "SERIALIZATION_FAILED",
      "The workspace payload must be valid JSON data."
    );
  }

  const salt = randomBytes(HKDF_SALT_BYTES);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const record: EncryptedWorkspaceRecord = {
    schema: WORKSPACE_RECORD_SCHEMA,
    version: WORKSPACE_RECORD_CRYPTO_VERSION,
    workspaceId,
    updatedAt: new Date().toISOString(),
    keyDerivation: {
      name: HKDF_NAME,
      hash: SHA_256,
      salt: bytesToBase64(salt)
    },
    encryptedPayload: createEmptyCiphertext(iv)
  };

  try {
    const encryptionKey = await deriveWorkspaceRecordKey(masterKey, workspaceId, salt);
    const ciphertext = await getWebCrypto().subtle.encrypt(
      {
        name: AES_GCM,
        iv,
        additionalData: workspaceRecordAdditionalData(record),
        tagLength: AES_GCM_TAG_BITS
      },
      encryptionKey,
      plaintext
    );

    record.encryptedPayload.ciphertext = bytesToBase64(new Uint8Array(ciphertext));
    return record;
  } catch (error) {
    if (error instanceof WorkspaceCryptoError) {
      throw error;
    }
    throw new WorkspaceCryptoError(
      "ENCRYPTION_FAILED",
      "The workspace payload could not be encrypted for local storage."
    );
  } finally {
    masterKey.fill(0);
    plaintext.fill(0);
  }
}

/**
 * Decrypts one local workspace record with an in-memory master key.
 * Application payload validation remains the caller's responsibility.
 */
export async function decryptWorkspaceRecord<T = unknown>(
  record: EncryptedWorkspaceRecord,
  masterKeyInput: WorkspaceMasterKey,
  expectedWorkspaceId?: string
): Promise<T> {
  const parsedRecord = parseWorkspaceRecord(record);

  if (
    expectedWorkspaceId !== undefined &&
    parsedRecord.workspaceId !== validateWorkspaceId(expectedWorkspaceId)
  ) {
    throw new WorkspaceCryptoError(
      "INVALID_WORKSPACE_RECORD",
      "The encrypted record belongs to a different workspace."
    );
  }

  const masterKey = copyMasterKey(masterKeyInput);

  try {
    const salt = base64ToBytes(
      parsedRecord.keyDerivation.salt,
      "workspace record HKDF salt",
      HKDF_SALT_BYTES
    );
    const decryptionKey = await deriveWorkspaceRecordKey(
      masterKey,
      parsedRecord.workspaceId,
      salt
    );
    const plaintextBuffer = await getWebCrypto().subtle.decrypt(
      {
        name: AES_GCM,
        iv: base64ToBytes(
          parsedRecord.encryptedPayload.iv,
          "workspace record AES-GCM IV",
          AES_GCM_IV_BYTES
        ),
        additionalData: workspaceRecordAdditionalData(parsedRecord),
        tagLength: AES_GCM_TAG_BITS
      },
      decryptionKey,
      base64ToBytes(
        parsedRecord.encryptedPayload.ciphertext,
        "encrypted workspace payload",
        undefined,
        AES_GCM_TAG_BITS / 8 + 1
      )
    );
    const plaintext = new Uint8Array(plaintextBuffer);

    try {
      return JSON.parse(textDecoder.decode(plaintext)) as T;
    } finally {
      plaintext.fill(0);
    }
  } catch (error) {
    if (error instanceof WorkspaceCryptoError && error.code === "CRYPTO_UNAVAILABLE") {
      throw error;
    }
    throw new WorkspaceCryptoError(
      "DECRYPTION_FAILED",
      "The encrypted local workspace data is damaged or does not match this workspace key."
    );
  } finally {
    masterKey.fill(0);
  }
}
