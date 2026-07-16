import {
  assertCloudKitAuthenticatedUser,
  getCloudKitPrivateDatabase,
  type CloudKitDatabase,
  type CloudKitRecord,
  type CloudKitRecordField,
  type CloudKitResponseError,
  type CloudKitUserIdentity
} from "@/lib/storage/cloudkit/cloudkit-client";
import {
  validateWorkspaceId,
  validateWorkspaceRecoveryMetadata,
  type WorkspaceRecoveryMetadata
} from "@/lib/security/workspace-crypto";

const PROFILE_RECORD_TYPE = "SMOSAppleAccountProfile";
const PROFILE_RECORD_NAME = "smos-apple-account-profile-v1";
const PROFILE_SCHEMA = "studio-map-os.apple-account-profile";
const PROFILE_VERSION = "2";

export type CloudKitAppleAccountProfileStatus = "provisioning" | "ready";

export type CloudKitAppleAccountProfile = {
  accountId: string;
  appleAccountFingerprint: string;
  createdAt: string;
  displayName: string;
  recordChangeTag: string;
  recordName: typeof PROFILE_RECORD_NAME;
  recoveryMetadata: WorkspaceRecoveryMetadata;
  status: CloudKitAppleAccountProfileStatus;
  updatedAt: string;
  workspaceId: string;
  workspaceRole: "owner";
};

export type CloudKitAppleAccountProfileInput = Omit<
  CloudKitAppleAccountProfile,
  "recordChangeTag" | "recordName"
>;

export type CloudKitAccountProviderErrorCode =
  | "AUTH_REQUIRED"
  | "ACCOUNT_MISMATCH"
  | "CONFLICT"
  | "INVALID_PROFILE"
  | "PROFILE_EXISTS"
  | "PROFILE_NOT_FOUND"
  | "REQUEST_FAILED";

export class CloudKitAccountProviderError extends Error {
  constructor(
    public readonly code: CloudKitAccountProviderErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "CloudKitAccountProviderError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const field = (value: string): CloudKitRecordField => ({ value });
const fieldValue = (record: CloudKitRecord, key: string) => record.fields?.[key]?.value;

const stringField = (record: CloudKitRecord, key: string) => {
  const value = fieldValue(record, key);
  if (typeof value !== "string" || !value) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      `The Apple account profile field ${key} is missing or invalid.`
    );
  }
  return value;
};

const isCanonicalIsoDate = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const validateAccountId = (value: string) => {
  if (!/^account-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account profile contains an invalid Studio Map OS account ID."
    );
  }
  return value;
};

const validateDisplayName = (value: string) => {
  const displayName = value.trim();
  if (!displayName || displayName.length > 80 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account profile name must contain between 1 and 80 characters."
    );
  }
  return displayName;
};

const validateAppleAccountFingerprint = (value: string) => {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account profile contains an invalid account binding."
    );
  }
  return value;
};

const parseProfile = (record: CloudKitRecord): CloudKitAppleAccountProfile => {
  if (
    record.recordType !== PROFILE_RECORD_TYPE ||
    record.recordName !== PROFILE_RECORD_NAME ||
    stringField(record, "schema") !== PROFILE_SCHEMA ||
    stringField(record, "formatVersion") !== PROFILE_VERSION
  ) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account profile format is unsupported."
    );
  }

  const recordChangeTag = record.recordChangeTag;
  const accountId = validateAccountId(stringField(record, "accountId"));
  const appleAccountFingerprint = validateAppleAccountFingerprint(
    stringField(record, "appleAccountFingerprint")
  );
  const displayName = validateDisplayName(stringField(record, "displayName"));
  const workspaceId = validateWorkspaceId(stringField(record, "workspaceId"));
  const workspaceRole = stringField(record, "workspaceRole");
  const createdAt = stringField(record, "createdAt");
  const updatedAt = stringField(record, "updatedAt");
  const status = stringField(record, "status");

  if (
    !recordChangeTag ||
    (status !== "provisioning" && status !== "ready") ||
    workspaceRole !== "owner" ||
    !isCanonicalIsoDate(createdAt) ||
    !isCanonicalIsoDate(updatedAt) ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account profile metadata is invalid."
    );
  }

  let recoveryValue: unknown;
  try {
    recoveryValue = JSON.parse(stringField(record, "recoveryMetadataJson")) as unknown;
  } catch (error) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account recovery metadata is not valid JSON.",
      { cause: error }
    );
  }

  let recoveryMetadata: WorkspaceRecoveryMetadata;
  try {
    recoveryMetadata = validateWorkspaceRecoveryMetadata(recoveryValue);
  } catch (error) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account recovery metadata is invalid.",
      { cause: error }
    );
  }
  if (recoveryMetadata.workspaceId !== workspaceId) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account recovery metadata belongs to another workspace."
    );
  }

  return {
    accountId,
    appleAccountFingerprint,
    createdAt,
    displayName,
    recordChangeTag,
    recordName: PROFILE_RECORD_NAME,
    recoveryMetadata,
    status,
    updatedAt,
    workspaceId,
    workspaceRole: "owner"
  };
};

const normalizeErrorCode = (error: unknown) => {
  if (!isRecord(error)) {
    return "";
  }
  const code = error.ckErrorCode ?? error.serverErrorCode ?? error.code;
  return typeof code === "string" ? code.toUpperCase() : "";
};

const isNotFound = (error: unknown) => {
  const code = normalizeErrorCode(error);
  return code === "NOT_FOUND" || code === "UNKNOWN_ITEM" || code === "ZONE_NOT_FOUND";
};

const mapRequestError = (error: unknown): never => {
  if (error instanceof CloudKitAccountProviderError) {
    throw error;
  }
  const code = normalizeErrorCode(error);
  if (code === "CONFLICT" || code === "SERVER_RECORD_CHANGED") {
    throw new CloudKitAccountProviderError("CONFLICT", "The Apple account profile changed on another device.", { cause: error });
  }
  if (code === "ACCOUNT_MISMATCH") {
    throw new CloudKitAccountProviderError(
      "ACCOUNT_MISMATCH",
      "The active Apple ID account changed before the request completed.",
      { cause: error }
    );
  }
  if (["AUTHENTICATION_REQUIRED", "AUTHENTICATION_FAILED", "SIGN_IN_FAILED", "ACCESS_DENIED"].includes(code)) {
    throw new CloudKitAccountProviderError("AUTH_REQUIRED", "Sign in with Apple ID to access this account.", { cause: error });
  }
  throw new CloudKitAccountProviderError("REQUEST_FAILED", "The Apple account profile request failed.", { cause: error });
};

const firstRelevantError = (errors: CloudKitResponseError[] | undefined) =>
  (errors ?? []).find((error) => !isNotFound(error));

const requireDatabase = async (
  authenticatedUser: CloudKitUserIdentity
): Promise<CloudKitDatabase> => {
  try {
    await assertCloudKitAuthenticatedUser(authenticatedUser);
    return await getCloudKitPrivateDatabase();
  } catch (error) {
    return mapRequestError(error);
  }
};

export async function fetchCloudKitAppleAccountProfile(
  authenticatedUser: CloudKitUserIdentity
): Promise<CloudKitAppleAccountProfile | null> {
  const database = await requireDatabase(authenticatedUser);
  try {
    const response = await database.fetchRecords(PROFILE_RECORD_NAME);
    const error = firstRelevantError(response.errors);
    if (error) {
      mapRequestError(error);
    }
    const record = (response.records ?? []).find(
      (item) => !item.deleted && item.recordName === PROFILE_RECORD_NAME
    );
    return record ? parseProfile(record) : null;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    return mapRequestError(error);
  }
}

const validateProfileInput = (
  input: CloudKitAppleAccountProfileInput
): CloudKitAppleAccountProfileInput => {
  const accountId = validateAccountId(input.accountId);
  const appleAccountFingerprint = validateAppleAccountFingerprint(
    input.appleAccountFingerprint
  );
  const displayName = validateDisplayName(input.displayName);
  const workspaceId = validateWorkspaceId(input.workspaceId);
  const recoveryMetadata = validateWorkspaceRecoveryMetadata(input.recoveryMetadata);
  if (
    (input.status !== "provisioning" && input.status !== "ready") ||
    input.workspaceRole !== "owner" ||
    recoveryMetadata.workspaceId !== workspaceId ||
    !isCanonicalIsoDate(input.createdAt) ||
    !isCanonicalIsoDate(input.updatedAt) ||
    Date.parse(input.updatedAt) < Date.parse(input.createdAt)
  ) {
    throw new CloudKitAccountProviderError(
      "INVALID_PROFILE",
      "The Apple account profile input is invalid."
    );
  }
  return {
    ...input,
    accountId,
    appleAccountFingerprint,
    displayName,
    workspaceId,
    recoveryMetadata
  };
};

const saveProfile = async (
  database: CloudKitDatabase,
  inputValue: CloudKitAppleAccountProfileInput,
  authenticatedUser: CloudKitUserIdentity,
  recordChangeTag?: string
) => {
  const input = validateProfileInput(inputValue);
  const record: CloudKitRecord = {
    recordType: PROFILE_RECORD_TYPE,
    recordName: PROFILE_RECORD_NAME,
    ...(recordChangeTag ? { recordChangeTag } : {}),
    fields: {
      schema: field(PROFILE_SCHEMA),
      formatVersion: field(PROFILE_VERSION),
      status: field(input.status),
      accountId: field(input.accountId),
      appleAccountFingerprint: field(input.appleAccountFingerprint),
      displayName: field(input.displayName),
      workspaceId: field(input.workspaceId),
      workspaceRole: field(input.workspaceRole),
      recoveryMetadataJson: field(JSON.stringify(input.recoveryMetadata)),
      createdAt: field(input.createdAt),
      updatedAt: field(input.updatedAt)
    }
  };

  try {
    const response = await database.saveRecords(record);
    const error = firstRelevantError(response.errors);
    if (error) {
      mapRequestError(error);
    }
    const saved = (response.records ?? []).find(
      (item) => !item.deleted && item.recordName === PROFILE_RECORD_NAME
    );
    if (!saved) {
      throw new CloudKitAccountProviderError(
        "REQUEST_FAILED",
        "CloudKit did not return the saved Apple account profile."
      );
    }
    const profile = parseProfile(saved);
    await assertCloudKitAuthenticatedUser(authenticatedUser);
    return profile;
  } catch (error) {
    return mapRequestError(error);
  }
};

export async function createCloudKitAppleAccountProfile(
  input: CloudKitAppleAccountProfileInput,
  authenticatedUser: CloudKitUserIdentity
): Promise<CloudKitAppleAccountProfile> {
  const database = await requireDatabase(authenticatedUser);
  const existing = await fetchCloudKitAppleAccountProfile(authenticatedUser);
  if (existing) {
    throw new CloudKitAccountProviderError(
      "PROFILE_EXISTS",
      "This Apple ID account already has a Studio Map OS profile."
    );
  }
  return saveProfile(database, input, authenticatedUser);
}

export async function saveCloudKitAppleAccountProfile(
  input: CloudKitAppleAccountProfileInput,
  authenticatedUser: CloudKitUserIdentity,
  options: { expectedRecordChangeTag?: string } = {}
): Promise<CloudKitAppleAccountProfile> {
  const database = await requireDatabase(authenticatedUser);
  const existing = await fetchCloudKitAppleAccountProfile(authenticatedUser);
  if (!existing) {
    throw new CloudKitAccountProviderError(
      "PROFILE_NOT_FOUND",
      "No Studio Map OS profile exists for this Apple ID account."
    );
  }
  if (
    options.expectedRecordChangeTag !== undefined &&
    options.expectedRecordChangeTag !== existing.recordChangeTag
  ) {
    throw new CloudKitAccountProviderError(
      "CONFLICT",
      "The Apple account profile changed before it could be saved."
    );
  }
  return saveProfile(database, input, authenticatedUser, existing.recordChangeTag);
}
