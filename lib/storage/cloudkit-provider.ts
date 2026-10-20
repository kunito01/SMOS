import {
  getCloudKitPrivateDatabase,
  type CloudKitDatabase,
  type CloudKitRecord,
  type CloudKitRecordField,
  type CloudKitResponseError
} from "@/lib/storage/cloudkit/cloudkit-client";
import {
  parseEncryptedWorkspaceBundleSnapshot,
  type EncryptedWorkspaceBundleSnapshot
} from "@/lib/storage/indexed-db";
import { validateWorkspaceId } from "@/lib/security/workspace-crypto";
import { CloudProviderError, type CloudProviderErrorCode } from "@/lib/storage/cloud-provider-error";

const MANIFEST_RECORD_TYPE = "SMOSWorkspaceManifest";
const CHUNK_RECORD_TYPE = "SMOSWorkspaceChunk";
const MANIFEST_SCHEMA = "studio-map-os.cloudkit-workspace-manifest";
const CHUNK_SCHEMA = "studio-map-os.cloudkit-workspace-chunk";
const CLOUDKIT_FORMAT_VERSION = "1";

// A CloudKit record may contain at most 1 MiB outside Asset fields. Chunks
// used to be 384 KiB (~512 KiB base64), but on the user's link to Apple the
// upload runs at 40-110 KB/s and Apple's edge drops request bodies that
// arrive too slowly (bare 400/404 without CORS headers, measured
// 2026-10-19). 96 KiB chunks (~128 KiB base64) keep even a single-record
// request under a few seconds. Older generations with larger chunks are
// still read back by name, so no migration is needed.
const CHUNK_BYTES = 96 * 1024;
const MAX_CHUNK_COUNT = 1_024;
const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
// records/modify and records/lookup accept up to 200 operations, but a single
// request carrying 150 base64 chunks is ~75 MB of JSON — far too much for a
// lossy or proxied link, where one dropped response costs the whole batch.
// Measured on 2026-10-18 through the user's proxy: a 6 MB POST takes ~12 s and
// a 20 MB one is rejected by Apple's edge after ~70 s. Writes are therefore
// bounded to ~2 MB (three chunks) and reads to six chunks per request; only
// name-only deletes still use the large batch.
const RECORD_BATCH_SIZE = 150;
const MAX_REQUEST_BYTES = 384 * 1024;
const LOOKUP_BATCH_SIZE = 4;
const CHUNK_LEDGER_KEY_PREFIX = "studio-map-os.cloudkit-chunk-ledger.v1:";
const CHUNK_LEDGER_LIMIT = 16;

export type CloudKitWorkspaceManifest = {
  workspaceId: string;
  generation: string;
  chunkCount: number;
  payloadByteLength: number;
  payloadSha256: string;
  updatedAt: string;
  workspaceUpdatedAt: string;
  recordName: string;
  recordChangeTag: string;
};

export type CloudKitWorkspaceDownload = {
  snapshot: EncryptedWorkspaceBundleSnapshot;
  manifest: CloudKitWorkspaceManifest;
};

export type CloudKitWorkspaceUpload = {
  manifest: CloudKitWorkspaceManifest;
  snapshot: EncryptedWorkspaceBundleSnapshot;
};

export type CloudKitWorkspaceUploadOptions = {
  /**
   * `undefined` accepts the latest server tag fetched immediately before the
   * upload. `null` requires that no remote manifest exists. A string requires
   * an exact optimistic-concurrency match.
   */
  expectedManifestChangeTag?: string | null;
};

export type CloudKitProviderErrorCode = CloudProviderErrorCode;

export class CloudKitProviderError extends CloudProviderError {
  constructor(code: CloudKitProviderErrorCode, message: string, options?: ErrorOptions) {
    super("cloudkit", code, message, options);
    this.name = "CloudKitProviderError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isCanonicalIsoDate = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + blockSize, bytes.length))
    );
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  // Character-class scan, NOT `(?:....{4})*`: the grouped-quantifier form
  // throws RangeError ("Maximum call stack size exceeded") on strings past
  // ~5 MB. `length % 4 === 0` plus the round-trip re-encode below still fully
  // guarantee canonical base64.
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "A CloudKit workspace chunk contains invalid base64 data."
    );
  }

  try {
    const binary = atob(value);
    const result = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytesToBase64(result) !== value) {
      throw new Error("Non-canonical base64");
    }
    return result;
  } catch (error) {
    if (error instanceof CloudKitProviderError) {
      throw error;
    }
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "A CloudKit workspace chunk could not be decoded.",
      { cause: error }
    );
  }
};

const sha256Hex = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) {
    throw new CloudKitProviderError(
      "CRYPTO_UNAVAILABLE",
      "Web Crypto is required to verify CloudKit workspace data."
    );
  }

  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", ownedBytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const createGeneration = async (workspaceId: string) => {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) {
    throw new CloudKitProviderError(
      "CRYPTO_UNAVAILABLE",
      "Web Crypto is required to create a CloudKit workspace generation."
    );
  }

  const random = webCrypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return (await sha256Hex(textEncoder.encode(`${workspaceId}:${nonce}`))).slice(0, 32);
};

const getField = (record: CloudKitRecord, key: string): unknown => record.fields?.[key]?.value;

const stringField = (record: CloudKitRecord, key: string) => {
  const value = getField(record, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      `The CloudKit field ${key} is missing or invalid.`
    );
  }
  return value;
};

const parseNonNegativeInteger = (record: CloudKitRecord, key: string) => {
  const value = stringField(record, key);
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      `The CloudKit field ${key} is not a non-negative integer.`
    );
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      `The CloudKit field ${key} exceeds the supported integer range.`
    );
  }
  return number;
};

const field = (value: string): CloudKitRecordField => ({ value });

const normalizeErrorCode = (error: unknown) => {
  if (!isRecord(error)) {
    return "";
  }
  const code = error.ckErrorCode ?? error.serverErrorCode ?? error.code;
  return typeof code === "string" ? code.toUpperCase() : "";
};

const isNotFoundError = (error: unknown) => {
  const code = normalizeErrorCode(error);
  return code === "NOT_FOUND" || code === "UNKNOWN_ITEM" || code === "ZONE_NOT_FOUND";
};

const isConflictError = (error: unknown) => {
  const code = normalizeErrorCode(error);
  return code === "CONFLICT" || code === "SERVER_RECORD_CHANGED";
};

const isAuthenticationError = (error: unknown) => {
  const code = normalizeErrorCode(error);
  return (
    code === "AUTHENTICATION_REQUIRED" ||
    code === "AUTHENTICATION_FAILED" ||
    code === "SIGN_IN_FAILED" ||
    code === "ACCESS_DENIED"
  );
};

/** The user's iCloud storage is full; nothing can be written until space is freed. */
const isQuotaError = (error: unknown) => normalizeErrorCode(error) === "QUOTA_EXCEEDED";

/** Apple asked us to back off; the request itself was fine. */
const isThrottleError = (error: unknown) => {
  const code = normalizeErrorCode(error);
  return code === "THROTTLED" || code === "TRY_AGAIN_LATER" || code === "ZONE_BUSY";
};

/** A `create` hit a record that already exists (a retried batch that did commit). */
const isExistsError = (error: unknown) => normalizeErrorCode(error) === "EXISTS";

/**
 * The request never produced a usable answer: dropped connection, proxy
 * giving up mid-body, non-JSON gateway page, or our own request timeout.
 * Such failures are often size-dependent on lossy links, so callers may
 * retry with a smaller batch.
 */
const isTransportError = (error: unknown) => {
  const code = normalizeErrorCode(error);
  return (
    code === "NETWORK_ERROR" ||
    code === "UNEXPECTED_SERVER_RESPONSE" ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "TRY_AGAIN_LATER" ||
    error instanceof TypeError
  );
};

const errorText = (error: unknown) => {
  if (!isRecord(error)) {
    return typeof error === "string" ? error : "";
  }
  const text = error.reason ?? error.message;
  return typeof text === "string" ? text : "";
};

/** Prefix the server code unless the SDK text already starts with it. */
const withErrorCode = (code: string, text: string) => {
  if (!code) {
    return text;
  }
  if (!text) {
    return code;
  }
  return text.toUpperCase().startsWith(code) ? text : `${code}: ${text}`;
};

/** "QUOTA_EXCEEDED: Quota exceeded" style line that keeps the server code visible. */
const describeResponseError = (error: CloudKitResponseError) =>
  withErrorCode(normalizeErrorCode(error), errorText(error)) || "CloudKit request failed";

const describeThrownError = (error: unknown) => {
  const code = normalizeErrorCode(error);
  const text = errorText(error) || (error instanceof Error ? `${error.name}: ${error.message}` : "");
  return withErrorCode(code, text) || "The CloudKit request failed.";
};

const throwRequestError = (error: unknown): never => {
  if (error instanceof CloudKitProviderError) {
    throw error;
  }
  if (isConflictError(error)) {
    throw new CloudKitProviderError(
      "CONFLICT",
      "The CloudKit workspace changed on another device.",
      { cause: error }
    );
  }
  if (isAuthenticationError(error)) {
    throw new CloudKitProviderError(
      "AUTH_REQUIRED",
      "Sign in to iCloud before accessing the private CloudKit workspace.",
      { cause: error }
    );
  }
  if (isQuotaError(error)) {
    throw new CloudKitProviderError("QUOTA_EXCEEDED", describeThrownError(error), {
      cause: error
    });
  }
  if (isThrottleError(error)) {
    throw new CloudKitProviderError("THROTTLED", describeThrownError(error), {
      cause: error
    });
  }
  throw new CloudKitProviderError("REQUEST_FAILED", describeThrownError(error), {
    cause: error
  });
};

const assertResponseSuccess = (
  errors: CloudKitResponseError[] | undefined,
  options: { allowNotFound?: boolean; allowExistingRecordNames?: Set<string> } = {}
) => {
  const relevant = (errors ?? []).filter(
    (error) =>
      !(options.allowNotFound && isNotFoundError(error)) &&
      !(
        options.allowExistingRecordNames &&
        isExistsError(error) &&
        typeof error.recordName === "string" &&
        options.allowExistingRecordNames.has(error.recordName)
      )
  );
  if (relevant.length === 0) {
    return;
  }

  const first = relevant[0];
  if (isConflictError(first)) {
    throw new CloudKitProviderError("CONFLICT", describeResponseError(first), { cause: first });
  }
  if (isAuthenticationError(first)) {
    throw new CloudKitProviderError("AUTH_REQUIRED", describeResponseError(first), {
      cause: first
    });
  }
  if (isQuotaError(first)) {
    throw new CloudKitProviderError("QUOTA_EXCEEDED", describeResponseError(first), {
      cause: first
    });
  }
  if (isThrottleError(first)) {
    throw new CloudKitProviderError("THROTTLED", describeResponseError(first), {
      cause: first
    });
  }
  throw new CloudKitProviderError("REQUEST_FAILED", describeResponseError(first), {
    cause: first
  });
};

/**
 * Chunk lookups are bounded by count (each chunk field is ~512 KiB) and
 * tolerate per-record NOT_FOUND so a missing chunk is reported as incomplete
 * remote data by the caller instead of as a generic request failure.
 */
const fetchRecordBatch = async (
  database: CloudKitDatabase,
  batch: string[],
  records: CloudKitRecord[]
): Promise<void> => {
  try {
    const response = await database.fetchRecords(batch);
    assertResponseSuccess(response.errors, { allowNotFound: true });
    records.push(...(response.records ?? []).filter((record) => !record.deleted));
  } catch (error) {
    if (batch.length > 1 && isTransportError(error)) {
      // The link may only manage smaller responses right now: halve and retry.
      const middle = Math.ceil(batch.length / 2);
      await fetchRecordBatch(database, batch.slice(0, middle), records);
      await fetchRecordBatch(database, batch.slice(middle), records);
      return;
    }
    throwRequestError(error);
  }
};

const fetchRecords = async (database: CloudKitDatabase, recordNames: string[]) => {
  const records: CloudKitRecord[] = [];

  for (let offset = 0; offset < recordNames.length; offset += LOOKUP_BATCH_SIZE) {
    await fetchRecordBatch(database, recordNames.slice(offset, offset + LOOKUP_BATCH_SIZE), records);
  }

  return records;
};

const approximateRecordBytes = (record: CloudKitRecord) => {
  let total = 256;
  for (const value of Object.values(record.fields ?? {})) {
    if (typeof value?.value === "string") {
      total += value.value.length;
    }
  }
  return total;
};

/** Split records into request batches that stay under MAX_REQUEST_BYTES. */
const splitRecordsByBytes = (records: CloudKitRecord[]) => {
  const batches: CloudKitRecord[][] = [];
  let current: CloudKitRecord[] = [];
  let currentBytes = 0;

  for (const record of records) {
    const bytes = approximateRecordBytes(record);
    if (
      current.length > 0 &&
      (currentBytes + bytes > MAX_REQUEST_BYTES || current.length >= RECORD_BATCH_SIZE)
    ) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(record);
    currentBytes += bytes;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
};

type SaveRecordsOptions = {
  /**
   * Treat per-record EXISTS as success. Generation-scoped chunk records are
   * immutable, so when a retried `create` finds its record already committed
   * (the response of the first attempt was lost), the content is identical.
   */
  tolerateExisting?: boolean;
};

const saveRecordBatch = async (
  database: CloudKitDatabase,
  batch: CloudKitRecord[],
  options: SaveRecordsOptions,
  saved: CloudKitRecord[]
): Promise<void> => {
  const batchNames = new Set(
    batch.flatMap((record) => (typeof record.recordName === "string" ? [record.recordName] : []))
  );
  try {
    const response = await database.saveRecords(batch);
    assertResponseSuccess(response.errors, {
      allowExistingRecordNames: options.tolerateExisting ? batchNames : undefined
    });
    saved.push(...(response.records ?? []));
  } catch (error) {
    if (options.tolerateExisting && isExistsError(error)) {
      return;
    }
    if (batch.length > 1 && isTransportError(error)) {
      // A multi-record POST died in transit; the records that did commit
      // answer EXISTS on the retry (tolerated), the rest go in smaller bodies.
      const middle = Math.ceil(batch.length / 2);
      await saveRecordBatch(database, batch.slice(0, middle), options, saved);
      await saveRecordBatch(database, batch.slice(middle), options, saved);
      return;
    }
    throwRequestError(error);
  }
};

const saveRecords = async (
  database: CloudKitDatabase,
  records: CloudKitRecord[],
  options: SaveRecordsOptions = {}
) => {
  const saved: CloudKitRecord[] = [];

  for (const batch of splitRecordsByBytes(records)) {
    await saveRecordBatch(database, batch, options, saved);
  }

  return saved;
};

const deleteRecordsBestEffort = async (
  database: CloudKitDatabase,
  recordNames: string[]
) => {
  for (let offset = 0; offset < recordNames.length; offset += RECORD_BATCH_SIZE) {
    const batch = recordNames.slice(offset, offset + RECORD_BATCH_SIZE);
    try {
      const response = await database.deleteRecords(batch);
      assertResponseSuccess(response.errors, { allowNotFound: true });
    } catch {
      // The newly committed manifest never references these records. A cleanup
      // failure may consume extra quota, but it must not turn a successful sync
      // into an apparent data-loss failure.
    }
  }
};

const requirePrivateDatabase = async () => {
  try {
    return await getCloudKitPrivateDatabase();
  } catch (error) {
    return throwRequestError(error);
  }
};

const manifestRecordName = async (workspaceId: string) =>
  `smos-workspace-${(await sha256Hex(textEncoder.encode(workspaceId))).slice(0, 40)}`;

const chunkRecordName = (workspaceHash: string, generation: string, index: number) =>
  `smos-chunk-${workspaceHash}-${generation}-${String(index).padStart(4, "0")}`;

type ChunkLedgerEntry = { generation: string; chunkCount: number };

/**
 * Every upload writes a brand-new generation of chunk records before the
 * manifest commits. If the chunk save or the manifest save fails, those chunks
 * stay in the user's private database and count against their iCloud quota.
 * This device-local ledger remembers generations it started so the next upload
 * can delete them first instead of leaking a full workspace per failed attempt.
 */
const chunkLedgerKey = (workspaceHash: string) => `${CHUNK_LEDGER_KEY_PREFIX}${workspaceHash}`;

const readChunkLedger = (workspaceHash: string): ChunkLedgerEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(chunkLedgerKey(workspaceHash));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is ChunkLedgerEntry =>
        isRecord(entry) &&
        typeof entry.generation === "string" &&
        /^[0-9a-f]{32}$/.test(entry.generation) &&
        typeof entry.chunkCount === "number" &&
        Number.isInteger(entry.chunkCount) &&
        entry.chunkCount > 0 &&
        entry.chunkCount <= MAX_CHUNK_COUNT
    );
  } catch {
    return [];
  }
};

const writeChunkLedger = (workspaceHash: string, entries: ChunkLedgerEntry[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(chunkLedgerKey(workspaceHash));
    } else {
      window.localStorage.setItem(
        chunkLedgerKey(workspaceHash),
        JSON.stringify(entries.slice(-CHUNK_LEDGER_LIMIT))
      );
    }
  } catch {
    // Storage quota or privacy mode: cleanup is best effort.
  }
};

const rememberPendingGeneration = (workspaceHash: string, entry: ChunkLedgerEntry) =>
  writeChunkLedger(workspaceHash, [
    ...readChunkLedger(workspaceHash).filter((item) => item.generation !== entry.generation),
    entry
  ]);

const forgetGeneration = (workspaceHash: string, generation: string) =>
  writeChunkLedger(
    workspaceHash,
    readChunkLedger(workspaceHash).filter((item) => item.generation !== generation)
  );

/** Delete chunk generations that earlier failed uploads left behind. */
const sweepLeakedGenerations = async (
  database: CloudKitDatabase,
  workspaceHash: string,
  liveGeneration: string | null
) => {
  const stale = readChunkLedger(workspaceHash).filter(
    (entry) => entry.generation !== liveGeneration
  );
  for (const entry of stale) {
    const names = Array.from({ length: entry.chunkCount }, (_, index) =>
      chunkRecordName(workspaceHash, entry.generation, index)
    );
    await deleteRecordsBestEffort(database, names);
    forgetGeneration(workspaceHash, entry.generation);
  }
  if (liveGeneration) {
    forgetGeneration(workspaceHash, liveGeneration);
  }
};

const parseManifest = (record: CloudKitRecord): CloudKitWorkspaceManifest => {
  if (
    record.recordType !== MANIFEST_RECORD_TYPE ||
    stringField(record, "schema") !== MANIFEST_SCHEMA ||
    stringField(record, "formatVersion") !== CLOUDKIT_FORMAT_VERSION
  ) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit workspace manifest version is unsupported."
    );
  }

  const workspaceId = validateWorkspaceId(stringField(record, "workspaceId"));
  const chunkCount = parseNonNegativeInteger(record, "chunkCount");
  const payloadByteLength = parseNonNegativeInteger(record, "payloadByteLength");
  const updatedAt = stringField(record, "updatedAt");
  const workspaceUpdatedAt = stringField(record, "workspaceUpdatedAt");
  const recordName = record.recordName;
  const recordChangeTag = record.recordChangeTag;

  if (
    chunkCount < 1 ||
    chunkCount > MAX_CHUNK_COUNT ||
    payloadByteLength > MAX_PAYLOAD_BYTES ||
    !isCanonicalIsoDate(updatedAt) ||
    !isCanonicalIsoDate(workspaceUpdatedAt) ||
    !recordName ||
    !recordChangeTag
  ) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit workspace manifest is incomplete or invalid."
    );
  }

  const payloadSha256 = stringField(record, "payloadSha256");
  if (!/^[a-f0-9]{64}$/.test(payloadSha256)) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit workspace checksum is invalid."
    );
  }

  const generation = stringField(record, "generation");
  if (!/^[a-f0-9]{32}$/.test(generation)) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit workspace generation is invalid."
    );
  }

  return {
    workspaceId,
    generation,
    chunkCount,
    payloadByteLength,
    payloadSha256,
    updatedAt,
    workspaceUpdatedAt,
    recordName,
    recordChangeTag
  };
};

const fetchManifest = async (
  database: CloudKitDatabase,
  workspaceId: string
): Promise<CloudKitWorkspaceManifest | null> => {
  const recordName = await manifestRecordName(workspaceId);

  try {
    const response = await database.fetchRecords(recordName);
    const nonNotFoundErrors = (response.errors ?? []).filter((error) => !isNotFoundError(error));
    assertResponseSuccess(nonNotFoundErrors);
    const record = (response.records ?? []).find(
      (item) => !item.deleted && item.recordName === recordName
    );
    if (!record) {
      return null;
    }

    const manifest = parseManifest(record);
    if (manifest.workspaceId !== workspaceId) {
      throw new CloudKitProviderError(
        "INVALID_REMOTE_DATA",
        "The CloudKit manifest belongs to another workspace."
      );
    }
    return manifest;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    return throwRequestError(error);
  }
};

export async function downloadEncryptedWorkspaceBundleFromCloudKit(
  workspaceIdInput: string
): Promise<CloudKitWorkspaceDownload | null> {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const database = await requirePrivateDatabase();

  const manifest = await fetchManifest(database, workspaceId);
  if (!manifest) {
    return null;
  }

  const workspaceHash = (await sha256Hex(textEncoder.encode(workspaceId))).slice(0, 40);
  const expectedNames = Array.from({ length: manifest.chunkCount }, (_, index) =>
    chunkRecordName(workspaceHash, manifest.generation, index)
  );
  const records = await fetchRecords(database, expectedNames);
  const recordsByName = new Map(records.map((record) => [record.recordName, record]));
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (let index = 0; index < manifest.chunkCount; index += 1) {
    const record = recordsByName.get(expectedNames[index]);
    if (!record) {
      throw new CloudKitProviderError(
        "INVALID_REMOTE_DATA",
        "The CloudKit workspace is missing an encrypted chunk."
      );
    }
    if (
      record.recordType !== CHUNK_RECORD_TYPE ||
      stringField(record, "schema") !== CHUNK_SCHEMA ||
      stringField(record, "formatVersion") !== CLOUDKIT_FORMAT_VERSION ||
      stringField(record, "workspaceId") !== workspaceId ||
      stringField(record, "generation") !== manifest.generation ||
      parseNonNegativeInteger(record, "chunkIndex") !== index
    ) {
      throw new CloudKitProviderError(
        "INVALID_REMOTE_DATA",
        "A CloudKit workspace chunk has inconsistent metadata."
      );
    }

    const chunk = base64ToBytes(stringField(record, "payloadBase64"));
    if ((await sha256Hex(chunk)) !== stringField(record, "chunkSha256")) {
      throw new CloudKitProviderError(
        "INVALID_REMOTE_DATA",
        "A CloudKit workspace chunk failed checksum verification."
      );
    }
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  if (totalLength !== manifest.payloadByteLength) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit workspace byte length is inconsistent."
    );
  }

  const payload = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.length;
  }

  if ((await sha256Hex(payload)) !== manifest.payloadSha256) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit workspace failed checksum verification."
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(textDecoder.decode(payload)) as unknown;
  } catch (error) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit workspace payload is not valid UTF-8 JSON.",
      { cause: error }
    );
  }

  const snapshot = parseEncryptedWorkspaceBundleSnapshot(parsedJson);
  if (
    snapshot.workspaceId !== workspaceId ||
    snapshot.workspaceRecord === null ||
    snapshot.workspaceRecord.updatedAt !== manifest.workspaceUpdatedAt
  ) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "The CloudKit payload does not contain the expected encrypted workspace."
    );
  }

  return { snapshot, manifest };
}

export async function uploadEncryptedWorkspaceBundleToCloudKit(
  snapshotInput: EncryptedWorkspaceBundleSnapshot,
  options: CloudKitWorkspaceUploadOptions = {}
): Promise<CloudKitWorkspaceUpload> {
  const snapshot = parseEncryptedWorkspaceBundleSnapshot(snapshotInput);
  if (snapshot.workspaceRecord === null) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "An empty workspace bundle cannot be uploaded to CloudKit."
    );
  }

  const database = await requirePrivateDatabase();

  const existingManifest = await fetchManifest(database, snapshot.workspaceId);
  const existingManifestChangeTag = existingManifest?.recordChangeTag ?? null;
  if (
    options.expectedManifestChangeTag !== undefined &&
    options.expectedManifestChangeTag !== existingManifestChangeTag
  ) {
    throw new CloudKitProviderError(
      "CONFLICT",
      "The CloudKit workspace changed since the last successful sync."
    );
  }

  const payload = textEncoder.encode(JSON.stringify(snapshot));
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new CloudKitProviderError(
      "PAYLOAD_TOO_LARGE",
      "The encrypted workspace is larger than the supported 64 MB CloudKit sync limit."
    );
  }
  const chunkCount = Math.ceil(payload.length / CHUNK_BYTES);
  if (chunkCount < 1 || chunkCount > MAX_CHUNK_COUNT) {
    throw new CloudKitProviderError(
      "PAYLOAD_TOO_LARGE",
      "The encrypted workspace is too large for the configured CloudKit chunk limit."
    );
  }

  const generation = await createGeneration(snapshot.workspaceId);
  const workspaceHash = (await sha256Hex(textEncoder.encode(snapshot.workspaceId))).slice(0, 40);
  // Reclaim quota from generations a previous attempt on this device left
  // behind, then record the one about to be written so a failure here is
  // cleaned up by the next attempt.
  await sweepLeakedGenerations(database, workspaceHash, existingManifest?.generation ?? null);
  rememberPendingGeneration(workspaceHash, { generation, chunkCount });
  const chunkRecords: CloudKitRecord[] = [];

  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = payload.slice(index * CHUNK_BYTES, Math.min((index + 1) * CHUNK_BYTES, payload.length));
    chunkRecords.push({
      recordType: CHUNK_RECORD_TYPE,
      recordName: chunkRecordName(workspaceHash, generation, index),
      fields: {
        schema: field(CHUNK_SCHEMA),
        formatVersion: field(CLOUDKIT_FORMAT_VERSION),
        workspaceId: field(snapshot.workspaceId),
        generation: field(generation),
        chunkIndex: field(String(index)),
        chunkSha256: field(await sha256Hex(chunk)),
        payloadBase64: field(bytesToBase64(chunk))
      }
    });
  }

  // Generation-specific chunks are immutable. The manifest is committed only
  // after every encrypted chunk has been accepted, so readers never observe a
  // partially uploaded workspace. A retried batch whose first attempt did
  // commit answers EXISTS for identical content, which counts as success.
  await saveRecords(database, chunkRecords, { tolerateExisting: true });

  const now = new Date().toISOString();
  const manifestName = await manifestRecordName(snapshot.workspaceId);
  const manifestRecord: CloudKitRecord = {
    recordType: MANIFEST_RECORD_TYPE,
    recordName: manifestName,
    ...(existingManifest?.recordChangeTag
      ? { recordChangeTag: existingManifest.recordChangeTag }
      : {}),
    fields: {
      schema: field(MANIFEST_SCHEMA),
      formatVersion: field(CLOUDKIT_FORMAT_VERSION),
      workspaceId: field(snapshot.workspaceId),
      generation: field(generation),
      chunkCount: field(String(chunkCount)),
      payloadByteLength: field(String(payload.length)),
      payloadSha256: field(await sha256Hex(payload)),
      updatedAt: field(now),
      workspaceUpdatedAt: field(snapshot.workspaceRecord.updatedAt)
    }
  };
  const savedManifest = (await saveRecords(database, [manifestRecord]))[0];
  const recordChangeTag = savedManifest?.recordChangeTag;

  if (!recordChangeTag) {
    throw new CloudKitProviderError(
      "INVALID_REMOTE_DATA",
      "CloudKit did not return a change tag for the saved workspace manifest."
    );
  }

  // The manifest now references the new generation; this device no longer
  // needs to clean it up.
  forgetGeneration(workspaceHash, generation);

  if (existingManifest && existingManifest.generation !== generation) {
    const previousGenerationRecordNames = Array.from(
      { length: existingManifest.chunkCount },
      (_, index) => chunkRecordName(workspaceHash, existingManifest.generation, index)
    );
    await deleteRecordsBestEffort(database, previousGenerationRecordNames);
  }

  return {
    snapshot,
    manifest: {
      workspaceId: snapshot.workspaceId,
      generation,
      chunkCount,
      payloadByteLength: payload.length,
      payloadSha256: await sha256Hex(payload),
      updatedAt: now,
      workspaceUpdatedAt: snapshot.workspaceRecord.updatedAt,
      recordName: savedManifest.recordName ?? manifestName,
      recordChangeTag
    }
  };
}
