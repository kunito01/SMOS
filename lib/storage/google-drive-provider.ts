"use client";

import { GoogleApiError, describeGoogleErrorResponse, googleFetch } from "@/lib/integrations/google-auth";
import { CloudProviderError } from "@/lib/storage/cloud-provider-error";
import {
  forgetGoogleDriveAccessToken,
  requireGoogleDriveAccessToken
} from "@/lib/storage/google-drive/google-drive-client";
import {
  parseEncryptedWorkspaceBundleSnapshot,
  type EncryptedWorkspaceBundleSnapshot
} from "@/lib/storage/indexed-db";
import { validateWorkspaceId } from "@/lib/security/workspace-crypto";

/**
 * Stores the encrypted workspace bundle as ONE file in Google Drive's hidden
 * application data folder and reads it back.
 *
 * Mirrors the CloudKit provider contract: download returns the snapshot plus a
 * manifest whose `recordChangeTag` identifies the exact file revision
 * (`<fileId>:<version>`), and upload takes the expected tag for optimistic
 * concurrency. Drive has no conditional write, so the tag is checked right
 * before the session opens, again right before the final chunk commits, and
 * the committed content hash is compared afterwards; a mismatch at any point
 * surfaces as CONFLICT instead of a silent overwrite.
 *
 * Uploads use Drive's resumable protocol in 512 KiB pieces (a multiple of the
 * required 256 KiB) so a lossy or slow link only ever retries one piece.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const APP_DATA_SPACE = "appDataFolder";
const FILE_SCHEMA = "studio-map-os.google-drive-workspace";
const FILE_FORMAT_VERSION = "1";
const UPLOAD_CHUNK_BYTES = 512 * 1024;
// Matches the CloudKit payload ceiling with headroom; the whole file is
// decoded and parsed in memory, so this must stay far below what a phone tab
// can hold.
const MAX_PAYLOAD_BYTES = 128 * 1024 * 1024;
const UPLOAD_MAX_ATTEMPTS = 8;
const UPLOAD_RETRY_BASE_DELAY_MS = 800;
// An upload must not start on a token that will expire before it can finish.
const MIN_TOKEN_LIFETIME_FOR_UPLOAD_MS = 5 * 60_000;
const FILE_FIELDS = "id,name,version,size,sha256Checksum,modifiedTime,appProperties";

export type GoogleDriveWorkspaceManifest = {
  workspaceId: string;
  fileId: string;
  payloadByteLength: number;
  payloadSha256: string;
  updatedAt: string;
  workspaceUpdatedAt: string;
  /** `<fileId>:<version>`; unique per revision even across duplicate files. */
  recordChangeTag: string;
};

export type GoogleDriveWorkspaceDownload = {
  snapshot: EncryptedWorkspaceBundleSnapshot;
  manifest: GoogleDriveWorkspaceManifest;
};

export type GoogleDriveWorkspaceUpload = {
  manifest: GoogleDriveWorkspaceManifest;
  snapshot: EncryptedWorkspaceBundleSnapshot;
};

export type GoogleDriveWorkspaceUploadOptions = {
  /**
   * `undefined` accepts whatever revision Drive holds right now. `null`
   * requires that no file exists yet. A string requires an exact match with
   * the current revision tag.
   */
  expectedManifestChangeTag?: string | null;
  /** Progress callback, 0-1, for the upload body. */
  onProgress?: (fraction: number) => void;
};

type DriveFile = {
  id: string;
  name?: string;
  version?: string;
  size?: string;
  sha256Checksum?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
};

type ResumeProbe = { offset: number } | { done: DriveFile };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const providerError = (
  code: CloudProviderError["code"],
  message: string,
  cause?: unknown
) => new CloudProviderError("gdrive", code, message, cause ? { cause } : undefined);

const sha256Hex = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) {
    throw providerError("CRYPTO_UNAVAILABLE", "Web Crypto is required to verify Google Drive data.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const workspaceDigest = async (workspaceId: string) =>
  (await sha256Hex(textEncoder.encode(workspaceId))).slice(0, 40);

const workspaceFileName = async (workspaceId: string) =>
  `smos-workspace-${await workspaceDigest(workspaceId)}.json`;

const revisionTag = (file: DriveFile) => `${file.id}:${file.version ?? ""}`;

/** Maps Google's HTTP answers onto the shared provider error codes. */
const translateApiError = (error: unknown, workspaceId: string): never => {
  if (error instanceof CloudProviderError) {
    throw error;
  }
  if (error instanceof GoogleApiError) {
    if (error.status === 401) {
      forgetGoogleDriveAccessToken(workspaceId);
      throw providerError("AUTH_REQUIRED", `Google sign-in expired (${error.message})`, error);
    }
    if (error.status === 403 && /storageQuotaExceeded|quotaExceeded/i.test(error.reason)) {
      throw providerError("QUOTA_EXCEEDED", error.message, error);
    }
    if (error.status === 429 || (error.status === 403 && /rateLimit/i.test(error.reason))) {
      throw providerError("THROTTLED", `THROTTLED: ${error.message}`, error);
    }
    if (error.status === 412) {
      throw providerError("CONFLICT", "The Google Drive copy changed on another device.", error);
    }
    throw providerError(
      "REQUEST_FAILED",
      `HTTP ${error.status}${error.reason ? ` ${error.reason}` : ""}: ${error.message}`,
      error
    );
  }
  throw providerError(
    "REQUEST_FAILED",
    error instanceof Error ? `${error.name}: ${error.message}` : "The Google Drive request failed.",
    error
  );
};

const escapeQueryValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const listWorkspaceFiles = async (token: string, workspaceId: string): Promise<DriveFile[]> => {
  const name = await workspaceFileName(workspaceId);
  const query = `name = '${escapeQueryValue(name)}' and trashed = false`;
  const url =
    `${DRIVE_API}/files?spaces=${APP_DATA_SPACE}&pageSize=10` +
    `&q=${encodeURIComponent(query)}&fields=${encodeURIComponent(`files(${FILE_FIELDS})`)}`;
  const response = await googleFetch(token, url);
  const body = (await response.json()) as { files?: DriveFile[] };
  const files = (body.files ?? []).filter((file) => typeof file.id === "string" && file.id);
  // Two devices racing a first upload can leave duplicates; the newest wins
  // and the others are trashed after the next successful upload.
  files.sort((left, right) => (right.modifiedTime ?? "").localeCompare(left.modifiedTime ?? ""));
  return files;
};

const findWorkspaceFile = async (token: string, workspaceId: string): Promise<DriveFile | null> =>
  (await listWorkspaceFiles(token, workspaceId))[0] ?? null;

const fetchFileMetadata = async (token: string, fileId: string): Promise<DriveFile> => {
  const response = await googleFetch(
    token,
    `${DRIVE_API}/files/${fileId}?fields=${encodeURIComponent(FILE_FIELDS)}`
  );
  return (await response.json()) as DriveFile;
};

const manifestFromFile = (
  workspaceId: string,
  file: DriveFile,
  payload: { byteLength: number; sha256: string; workspaceUpdatedAt: string }
): GoogleDriveWorkspaceManifest => ({
  workspaceId,
  fileId: file.id,
  payloadByteLength: payload.byteLength,
  payloadSha256: payload.sha256,
  updatedAt: file.modifiedTime ?? new Date().toISOString(),
  workspaceUpdatedAt: payload.workspaceUpdatedAt,
  recordChangeTag: revisionTag(file)
});

/** Every file this provider writes carries these; anything else is not ours. */
const assertFileMetadata = async (file: DriveFile, workspaceId: string) => {
  const props = file.appProperties ?? {};
  if (
    props.smosSchema !== FILE_SCHEMA ||
    props.smosFormat !== FILE_FORMAT_VERSION ||
    props.smosWorkspace !== (await workspaceDigest(workspaceId)) ||
    !/^[0-9a-f]{64}$/.test(props.smosSha256 ?? "")
  ) {
    throw providerError(
      "INVALID_REMOTE_DATA",
      "The Google Drive workspace file is missing its Studio Map OS metadata."
    );
  }
  return props.smosSha256 as string;
};

export async function downloadEncryptedWorkspaceBundleFromGoogleDrive(
  workspaceIdInput: string
): Promise<GoogleDriveWorkspaceDownload | null> {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  const token = requireGoogleDriveAccessToken(workspaceId).accessToken;

  try {
    const file = await findWorkspaceFile(token, workspaceId);
    if (!file) {
      return null;
    }
    if (!file.version) {
      throw providerError("INVALID_REMOTE_DATA", "Google Drive did not report a file version.");
    }
    const expectedSha = await assertFileMetadata(file, workspaceId);
    const declaredSize = Number(file.size);
    if (!Number.isFinite(declaredSize) || declaredSize > MAX_PAYLOAD_BYTES) {
      throw providerError(
        "PAYLOAD_TOO_LARGE",
        "The Google Drive workspace file is larger than the supported limit."
      );
    }

    const media = await googleFetch(token, `${DRIVE_API}/files/${file.id}?alt=media`, {}, { retries: 3 });
    const contentLength = Number(media.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      throw providerError(
        "PAYLOAD_TOO_LARGE",
        "The Google Drive workspace file is larger than the supported limit."
      );
    }
    const bytes = new Uint8Array(await media.arrayBuffer());
    if (bytes.length > MAX_PAYLOAD_BYTES) {
      throw providerError(
        "PAYLOAD_TOO_LARGE",
        "The Google Drive workspace file is larger than the supported limit."
      );
    }

    // The metadata was read before the body: make sure no other device
    // committed a new revision in between, or the tag would be wrong.
    const latest = await fetchFileMetadata(token, file.id);
    if (latest.version !== file.version) {
      throw providerError(
        "CONFLICT",
        "The Google Drive copy changed while it was being downloaded. Sync again."
      );
    }

    const sha256 = await sha256Hex(bytes);
    if (expectedSha !== sha256 || (file.sha256Checksum && file.sha256Checksum !== sha256)) {
      throw providerError(
        "INVALID_REMOTE_DATA",
        "The Google Drive workspace file failed checksum verification."
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(textDecoder.decode(bytes)) as unknown;
    } catch (error) {
      throw providerError("INVALID_REMOTE_DATA", "The Google Drive workspace file is not valid JSON.", error);
    }
    const snapshot = parseEncryptedWorkspaceBundleSnapshot(parsedJson);
    if (snapshot.workspaceId !== workspaceId || snapshot.workspaceRecord === null) {
      throw providerError(
        "INVALID_REMOTE_DATA",
        "The Google Drive file does not contain the expected encrypted workspace."
      );
    }

    return {
      snapshot,
      manifest: manifestFromFile(workspaceId, file, {
        byteLength: bytes.length,
        sha256,
        workspaceUpdatedAt: snapshot.workspaceRecord.updatedAt
      })
    };
  } catch (error) {
    return translateApiError(error, workspaceId);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseRangeEnd = (range: string | null) => {
  // "bytes=0-524287" → next byte to send is 524288.
  const match = range?.match(/bytes=\d+-(\d+)/);
  return match ? Number(match[1]) + 1 : 0;
};

/** Asks Drive how much of the session it already holds, or whether it finished. */
const queryResumableOffset = async (
  token: string,
  sessionUri: string,
  total: number,
  fallbackOffset: number
): Promise<ResumeProbe> => {
  try {
    const response = await fetch(sessionUri, {
      method: "PUT",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Range": `bytes */${total}`
      }
    });
    if (response.status === 308) {
      const range = response.headers.get("Range");
      return { offset: range ? parseRangeEnd(range) : 0 };
    }
    if (response.ok) {
      // The last chunk did land; only its response was lost.
      return { done: (await response.json().catch(() => ({}))) as DriveFile };
    }
  } catch {
    // Fall through: resend from the last offset we believed in.
  }
  return { offset: fallbackOffset };
};

/**
 * Drives one resumable session to completion, resuming from the server's
 * confirmed offset after every transport failure. `beforeFinalChunk` runs
 * right before the chunk that commits the file, so the caller can abort when
 * another device wrote in the meantime.
 */
const uploadResumableBody = async (
  token: string,
  sessionUri: string,
  payload: Uint8Array,
  beforeFinalChunk: () => Promise<void>,
  onProgress?: (fraction: number) => void
): Promise<DriveFile> => {
  const total = payload.length;
  let offset = 0;
  let attempt = 0;

  const resumeAfterFailure = async (): Promise<DriveFile | null> => {
    attempt += 1;
    if (attempt >= UPLOAD_MAX_ATTEMPTS) {
      throw providerError(
        "REQUEST_FAILED",
        `NETWORK_ERROR: the upload to Google Drive was interrupted ${attempt} times.`
      );
    }
    await sleep(UPLOAD_RETRY_BASE_DELAY_MS * attempt);
    const probe = await queryResumableOffset(token, sessionUri, total, offset);
    if ("done" in probe) {
      return probe.done;
    }
    offset = probe.offset;
    return null;
  };

  while (true) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, total);
    if (end === total) {
      await beforeFinalChunk();
    }
    const chunk = payload.slice(offset, end);
    let response: Response;
    try {
      response = await fetch(sessionUri, {
        method: "PUT",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Range": `bytes ${offset}-${end - 1}/${total}`
        },
        body: chunk
      });
    } catch {
      const finished = await resumeAfterFailure();
      if (finished) {
        onProgress?.(1);
        return finished;
      }
      continue;
    }

    if (response.status === 308) {
      // Drive confirms how far it got; a 308 without Range means nothing stored yet.
      const range = response.headers.get("Range");
      const next = range ? parseRangeEnd(range) : 0;
      if (next <= offset) {
        // Not a single byte advanced: count it as a failed attempt instead
        // of looping forever on a server that keeps answering the same Range.
        attempt += 1;
        if (attempt >= UPLOAD_MAX_ATTEMPTS) {
          throw providerError("REQUEST_FAILED", "Google Drive is not acknowledging uploaded bytes.");
        }
        await sleep(UPLOAD_RETRY_BASE_DELAY_MS * attempt);
      } else {
        attempt = 0;
      }
      offset = next;
      onProgress?.(offset / total);
      continue;
    }
    if (response.ok) {
      onProgress?.(1);
      return (await response.json().catch(() => ({}))) as DriveFile;
    }

    if (response.status === 404 || response.status === 410) {
      throw providerError("REQUEST_FAILED", "The Google Drive upload session expired. Sync again.");
    }
    const { detail, reason } = await describeGoogleErrorResponse(response);
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 403 && /rateLimit/i.test(reason));
    if (retryable) {
      const finished = await resumeAfterFailure();
      if (finished) {
        onProgress?.(1);
        return finished;
      }
      continue;
    }
    throw new GoogleApiError(
      detail || `Google Drive upload failed (${response.status})`,
      response.status,
      reason
    );
  }
};

/** Best-effort removal of duplicate workspace files left by a first-upload race. */
const trashDuplicateFiles = async (token: string, workspaceId: string, keepId: string) => {
  try {
    const files = await listWorkspaceFiles(token, workspaceId);
    for (const file of files) {
      if (file.id !== keepId) {
        await googleFetch(token, `${DRIVE_API}/files/${file.id}`, { method: "DELETE" }, { retries: 1 });
      }
    }
  } catch {
    // Duplicates only cost quota; the newest file keeps winning until cleaned.
  }
};

export async function uploadEncryptedWorkspaceBundleToGoogleDrive(
  snapshotInput: EncryptedWorkspaceBundleSnapshot,
  options: GoogleDriveWorkspaceUploadOptions = {}
): Promise<GoogleDriveWorkspaceUpload> {
  const snapshot = parseEncryptedWorkspaceBundleSnapshot(snapshotInput);
  if (snapshot.workspaceRecord === null) {
    throw providerError("INVALID_REMOTE_DATA", "An empty workspace bundle cannot be uploaded to Google Drive.");
  }
  const workspaceId = snapshot.workspaceId;
  const tokenRecord = requireGoogleDriveAccessToken(workspaceId);
  if (tokenRecord.expiresAt - Date.now() < MIN_TOKEN_LIFETIME_FOR_UPLOAD_MS) {
    // Ask for a fresh token before streaming megabytes that would be cut off
    // by expiry halfway through.
    throw providerError("AUTH_REQUIRED", "Google sign-in is about to expire; reconnect before uploading.");
  }
  const token = tokenRecord.accessToken;

  try {
    const existing = await findWorkspaceFile(token, workspaceId);
    const existingTag = existing ? revisionTag(existing) : null;
    if (
      options.expectedManifestChangeTag !== undefined &&
      options.expectedManifestChangeTag !== existingTag
    ) {
      throw providerError("CONFLICT", "The Google Drive copy changed since the last successful sync.");
    }

    const payload = textEncoder.encode(JSON.stringify(snapshot));
    if (payload.length > MAX_PAYLOAD_BYTES) {
      throw providerError("PAYLOAD_TOO_LARGE", "The encrypted workspace is larger than the supported Google Drive limit.");
    }
    const sha256 = await sha256Hex(payload);
    const name = await workspaceFileName(workspaceId);
    const metadata = {
      name,
      mimeType: "application/json",
      // appProperties entries are capped at 124 bytes (key + value): store a
      // fixed-length digest of the workspace id, never the id itself.
      appProperties: {
        smosSchema: FILE_SCHEMA,
        smosFormat: FILE_FORMAT_VERSION,
        smosWorkspace: await workspaceDigest(workspaceId),
        smosSha256: sha256,
        smosUpdatedAt: snapshot.workspaceRecord.updatedAt
      },
      ...(existing ? {} : { parents: [APP_DATA_SPACE] })
    };

    const sessionUrl = existing
      ? `${UPLOAD_API}/files/${existing.id}?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`
      : `${UPLOAD_API}/files?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`;
    const session = await googleFetch(token, sessionUrl, {
      method: existing ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/json",
        "X-Upload-Content-Length": String(payload.length)
      },
      body: JSON.stringify(metadata)
    });
    const sessionUri = session.headers.get("Location");
    if (!sessionUri) {
      throw providerError("REQUEST_FAILED", "Google Drive did not open an upload session.");
    }

    // Drive cannot reject a write for us: re-check the revision right before
    // the chunk that commits the file, which shrinks the race to one request.
    const beforeFinalChunk = async () => {
      if (!existing) {
        return;
      }
      const latest = await fetchFileMetadata(token, existing.id);
      if (revisionTag(latest) !== existingTag) {
        throw providerError(
          "CONFLICT",
          "Another device wrote to the Google Drive copy during this upload."
        );
      }
    };

    const uploaded = await uploadResumableBody(token, sessionUri, payload, beforeFinalChunk, options.onProgress);
    const uploadedId = uploaded.id ?? existing?.id;
    if (!uploadedId) {
      throw providerError("REQUEST_FAILED", "Google Drive did not return the uploaded file.");
    }
    // The final response may omit fields on some paths; confirm from metadata.
    const confirmed =
      uploaded.id && uploaded.version && uploaded.sha256Checksum
        ? uploaded
        : await fetchFileMetadata(token, uploadedId);
    if (!confirmed.version) {
      throw providerError("INVALID_REMOTE_DATA", "Google Drive did not return a file version for the upload.");
    }
    if (existingTag !== null && revisionTag(confirmed) === existingTag) {
      throw providerError("REQUEST_FAILED", "Google Drive reported no new version after the upload.");
    }
    if (confirmed.sha256Checksum && confirmed.sha256Checksum !== sha256) {
      // Someone else's bytes won: never mark this device as synced.
      throw providerError(
        "CONFLICT",
        "Another device wrote to the Google Drive copy during this upload."
      );
    }

    await trashDuplicateFiles(token, workspaceId, confirmed.id);

    return {
      snapshot,
      manifest: manifestFromFile(workspaceId, confirmed, {
        byteLength: payload.length,
        sha256,
        workspaceUpdatedAt: snapshot.workspaceRecord.updatedAt
      })
    };
  } catch (error) {
    return translateApiError(error, workspaceId);
  }
}
