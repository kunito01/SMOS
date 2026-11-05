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

export type CloudProviderKind = "gdrive";

export const cloudProviderLabel = (_provider: CloudProviderKind) => "Google Drive";

/** Google identities carry this prefix in stored sync bindings. */
export const GOOGLE_DRIVE_IDENTITY_PREFIX = "gdrive:";

/** Which cloud produced a stored account binding (legacy non-prefixed ids are ignored). */
export const cloudProviderOfIdentity = (userRecordName: string | null): CloudProviderKind | null =>
  userRecordName !== null && userRecordName.startsWith(GOOGLE_DRIVE_IDENTITY_PREFIX)
    ? "gdrive"
    : null;

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
