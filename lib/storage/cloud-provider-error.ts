/**
 * One error shape for every cloud storage provider so the sync coordinator can
 * classify failures (auth, conflict, quota…) without knowing which backend
 * raised them. CloudKit and Google Drive both throw subclasses of this.
 */
export type CloudProviderErrorCode =
  | "ACCOUNT_MISMATCH"
  | "AUTH_REQUIRED"
  | "CONFLICT"
  | "CRYPTO_UNAVAILABLE"
  | "INVALID_REMOTE_DATA"
  | "PAYLOAD_TOO_LARGE"
  | "QUOTA_EXCEEDED"
  | "THROTTLED"
  | "REQUEST_FAILED";

export type CloudProviderKind = "cloudkit" | "gdrive";

export const cloudProviderLabel = (provider: CloudProviderKind) =>
  provider === "gdrive" ? "Google Drive" : "iCloud";

/** Google identities carry this prefix so they can never collide with a CloudKit record name. */
export const GOOGLE_DRIVE_IDENTITY_PREFIX = "gdrive:";

/** Which cloud produced a stored account binding. */
export const cloudProviderOfIdentity = (userRecordName: string | null): CloudProviderKind | null =>
  userRecordName === null
    ? null
    : userRecordName.startsWith(GOOGLE_DRIVE_IDENTITY_PREFIX)
      ? "gdrive"
      : "cloudkit";

export class CloudProviderError extends Error {
  constructor(
    public readonly provider: CloudProviderKind,
    public readonly code: CloudProviderErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "CloudProviderError";
  }
}
