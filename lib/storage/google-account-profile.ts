"use client";

import { GoogleApiError, googleFetch } from "@/lib/integrations/google-auth";
import { CloudProviderError, type CloudProviderErrorCode } from "@/lib/storage/cloud-provider-error";
import {
  validateWorkspaceId,
  validateWorkspaceRecoveryMetadata,
  type WorkspaceRecoveryMetadata
} from "@/lib/security/workspace-crypto";

/**
 * The Google account profile: one small JSON file per workspace in the Drive
 * app data folder, next to the encrypted workspace itself. It carries both
 * wraps of the workspace master key (the account wrap that the Google
 * identity unlocks, and the recovery-key wrap the user holds), so a new
 * device needs nothing but a Google sign-in, and every device shares the same
 * recovery key. The master key itself never appears here.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const APP_DATA_SPACE = "appDataFolder";
export const GOOGLE_ACCOUNT_PROFILE_SCHEMA = "studio-map-os.google-account-profile";
const FILE_PREFIX = "smos-account-profile-";
const FILE_FIELDS = "id,name,version,modifiedTime,appProperties";
const MAX_PROFILE_BYTES = 64 * 1024;

export type GoogleAccountProfileStatus = "migrating" | "ready";

export type GoogleAccountProfile = {
  schema: typeof GOOGLE_ACCOUNT_PROFILE_SCHEMA;
  formatVersion: 1;
  status: GoogleAccountProfileStatus;
  accountId: string;
  /** Digest of the account fingerprint; the fingerprint itself is never stored. */
  ownerDigest: string;
  displayName: string;
  email: string;
  workspaceId: string;
  workspaceRole: "owner";
  wraps: {
    account: WorkspaceRecoveryMetadata;
    code: WorkspaceRecoveryMetadata | null;
  };
  migratedFrom: "apple-cloudkit" | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredGoogleAccountProfile = {
  profile: GoogleAccountProfile;
  fileId: string;
  /** `<fileId>:<version>`, unique per revision. */
  tag: string;
};

type DriveFile = {
  id: string;
  name?: string;
  version?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
};

const providerError = (code: CloudProviderErrorCode, message: string, cause?: unknown) =>
  new CloudProviderError("gdrive", code, message, cause ? { cause } : undefined);

const sha256Hex = async (text: string) => {
  if (!globalThis.crypto?.subtle) {
    throw providerError("CRYPTO_UNAVAILABLE", "Web Crypto is required for the Google account profile.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** The owner marker written into the profile; derived, never the secret itself. */
export const googleAccountOwnerDigest = async (fingerprint: string) =>
  (await sha256Hex(fingerprint)).slice(0, 40);

const profileFileName = async (workspaceId: string) =>
  `${FILE_PREFIX}${(await sha256Hex(workspaceId)).slice(0, 40)}.json`;

const revisionTag = (file: DriveFile) => `${file.id}:${file.version ?? ""}`;

const translateError = (error: unknown): never => {
  if (error instanceof CloudProviderError) {
    throw error;
  }
  if (error instanceof GoogleApiError) {
    if (error.status === 401) {
      throw providerError("AUTH_REQUIRED", `Google sign-in expired (${error.message})`, error);
    }
    if (error.status === 403 && /storageQuotaExceeded|quotaExceeded/i.test(error.reason)) {
      throw providerError("QUOTA_EXCEEDED", error.message, error);
    }
    if (error.status === 429 || (error.status === 403 && /rateLimit/i.test(error.reason))) {
      throw providerError("THROTTLED", `THROTTLED: ${error.message}`, error);
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isCanonicalIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

/** Strict parse: anything that is not exactly a profile we wrote is rejected. */
export const parseGoogleAccountProfile = (value: unknown): GoogleAccountProfile => {
  const invalid = (detail: string) =>
    providerError("INVALID_REMOTE_DATA", `The Google account profile is invalid: ${detail}.`);
  if (!isRecord(value)) {
    throw invalid("not an object");
  }
  if (value.schema !== GOOGLE_ACCOUNT_PROFILE_SCHEMA || value.formatVersion !== 1) {
    throw invalid("unknown schema");
  }
  if (value.status !== "migrating" && value.status !== "ready") {
    throw invalid("unknown status");
  }
  if (typeof value.accountId !== "string" || !/^account-[0-9a-f-]{36}$/i.test(value.accountId)) {
    throw invalid("account id");
  }
  if (typeof value.ownerDigest !== "string" || !/^[0-9a-f]{40}$/.test(value.ownerDigest)) {
    throw invalid("owner digest");
  }
  if (typeof value.displayName !== "string" || typeof value.email !== "string") {
    throw invalid("display fields");
  }
  if (value.workspaceRole !== "owner") {
    throw invalid("role");
  }
  if (value.migratedFrom !== null && value.migratedFrom !== "apple-cloudkit") {
    throw invalid("origin");
  }
  if (!isCanonicalIsoDate(value.createdAt) || !isCanonicalIsoDate(value.updatedAt)) {
    throw invalid("timestamps");
  }
  let workspaceId: string;
  try {
    workspaceId = validateWorkspaceId(value.workspaceId);
  } catch (error) {
    throw providerError("INVALID_REMOTE_DATA", "The Google account profile has an invalid workspace id.", error);
  }
  if (!isRecord(value.wraps)) {
    throw invalid("wraps");
  }
  let account: WorkspaceRecoveryMetadata;
  let code: WorkspaceRecoveryMetadata | null = null;
  try {
    account = validateWorkspaceRecoveryMetadata(value.wraps.account);
    if (value.wraps.code !== null && value.wraps.code !== undefined) {
      code = validateWorkspaceRecoveryMetadata(value.wraps.code);
    }
  } catch (error) {
    throw providerError("INVALID_REMOTE_DATA", "The Google account profile holds an invalid key wrap.", error);
  }
  if (account.workspaceId !== workspaceId || (code && code.workspaceId !== workspaceId)) {
    throw invalid("wrap belongs to another workspace");
  }
  return {
    schema: GOOGLE_ACCOUNT_PROFILE_SCHEMA,
    formatVersion: 1,
    status: value.status,
    accountId: value.accountId,
    ownerDigest: value.ownerDigest,
    displayName: value.displayName,
    email: value.email,
    workspaceId,
    workspaceRole: "owner",
    wraps: { account, code },
    migratedFrom: value.migratedFrom,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

const escapeQueryValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const listFiles = async (token: string, query: string): Promise<DriveFile[]> => {
  const url =
    `${DRIVE_API}/files?spaces=${APP_DATA_SPACE}&pageSize=50` +
    `&q=${encodeURIComponent(`${query} and trashed = false`)}` +
    `&fields=${encodeURIComponent(`files(${FILE_FIELDS})`)}`;
  const response = await googleFetch(token, url);
  const body = (await response.json()) as { files?: DriveFile[] };
  const files = (body.files ?? []).filter((file) => typeof file.id === "string" && file.id);
  files.sort((left, right) => (right.modifiedTime ?? "").localeCompare(left.modifiedTime ?? ""));
  return files;
};

const downloadProfile = async (token: string, file: DriveFile): Promise<StoredGoogleAccountProfile> => {
  const media = await googleFetch(token, `${DRIVE_API}/files/${file.id}?alt=media`, {}, { retries: 3 });
  const text = await media.text();
  if (text.length > MAX_PROFILE_BYTES) {
    throw providerError("PAYLOAD_TOO_LARGE", "The Google account profile is unexpectedly large.");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text) as unknown;
  } catch (error) {
    throw providerError("INVALID_REMOTE_DATA", "The Google account profile is not valid JSON.", error);
  }
  return { profile: parseGoogleAccountProfile(parsedJson), fileId: file.id, tag: revisionTag(file) };
};

/** Every readable profile this Google account holds (a new device picks by owner digest). */
export const listGoogleAccountProfiles = async (token: string): Promise<StoredGoogleAccountProfile[]> => {
  try {
    const files = await listFiles(token, `name contains '${FILE_PREFIX}'`);
    const profiles: StoredGoogleAccountProfile[] = [];
    for (const file of files) {
      if (!(file.name ?? "").startsWith(FILE_PREFIX)) {
        continue;
      }
      try {
        profiles.push(await downloadProfile(token, file));
      } catch (error) {
        // A damaged or foreign file must not hide the valid ones.
        if (error instanceof CloudProviderError && error.code === "INVALID_REMOTE_DATA") {
          continue;
        }
        throw error;
      }
    }
    return profiles;
  } catch (error) {
    return translateError(error);
  }
};

/** The profile for one workspace, or null when this account has none for it. */
export const readGoogleAccountProfile = async (
  token: string,
  workspaceIdInput: string
): Promise<StoredGoogleAccountProfile | null> => {
  const workspaceId = validateWorkspaceId(workspaceIdInput);
  try {
    const name = await profileFileName(workspaceId);
    const file = (await listFiles(token, `name = '${escapeQueryValue(name)}'`))[0];
    return file ? await downloadProfile(token, file) : null;
  } catch (error) {
    return translateError(error);
  }
};

/**
 * Creates or replaces the profile. `expectedTag` is the revision the caller
 * read (null for "no profile yet"); any other revision means another device
 * wrote in between, which surfaces as CONFLICT instead of a silent overwrite.
 */
export const writeGoogleAccountProfile = async (
  token: string,
  profile: GoogleAccountProfile,
  options: { expectedTag: string | null }
): Promise<StoredGoogleAccountProfile> => {
  try {
    const name = await profileFileName(profile.workspaceId);
    const existing = (await listFiles(token, `name = '${escapeQueryValue(name)}'`))[0] ?? null;
    const currentTag = existing ? revisionTag(existing) : null;
    if (currentTag !== options.expectedTag) {
      throw providerError("CONFLICT", "The Google account profile changed on another device.");
    }
    const content = JSON.stringify(profile);
    let file: DriveFile;
    if (existing) {
      const response = await googleFetch(
        token,
        `${UPLOAD_API}/files/${existing.id}?uploadType=media&fields=${encodeURIComponent(FILE_FIELDS)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: content }
      );
      file = (await response.json()) as DriveFile;
    } else {
      const boundary = `smos-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      const metadata = {
        name,
        mimeType: "application/json",
        parents: [APP_DATA_SPACE],
        appProperties: {
          smosSchema: GOOGLE_ACCOUNT_PROFILE_SCHEMA,
          smosFormat: "1",
          smosOwner: profile.ownerDigest
        }
      };
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      const response = await googleFetch(
        token,
        `${UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`,
        { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }
      );
      file = (await response.json()) as DriveFile;
    }
    if (!file?.id) {
      throw providerError("REQUEST_FAILED", "Google Drive did not return the written profile.");
    }
    return { profile, fileId: file.id, tag: revisionTag(file) };
  } catch (error) {
    return translateError(error);
  }
};
