/**
 * Single source of truth for user-uploaded image size limits. Large embedded
 * images inflate the encrypted workspace payload (base64 +33%, then AES-GCM,
 * then chunked CloudKit upload on every sync), so uploads are capped tightly.
 * UI inputs validate the raw file; the API layer re-validates the stored data
 * URL so no code path can smuggle an oversized image into the workspace.
 */
export const MAX_UPLOAD_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024);

/** Approximate decoded byte length of a data: URL's base64 payload. */
export const dataUrlByteLength = (dataUrl: string): number => {
  const separatorIndex = dataUrl.indexOf(",");
  if (separatorIndex === -1) {
    return dataUrl.length;
  }
  const base64 = dataUrl.slice(separatorIndex + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

/**
 * True when a stored image value stays within the upload limit. Non-data URLs
 * (bundled asset paths, https references) pass through untouched.
 */
export const isStoredImageWithinLimit = (value: string): boolean => {
  if (!value.startsWith("data:")) {
    return true;
  }
  return dataUrlByteLength(value) <= MAX_UPLOAD_IMAGE_BYTES;
};

/**
 * Hard backstop for the data layer: throws when an uploaded image exceeds the
 * limit, so oversized images cannot enter the workspace through any code path
 * even if a UI check is bypassed.
 */
export const assertUploadedImageWithinLimit = (
  value: string | null | undefined
): void => {
  if (value && !isStoredImageWithinLimit(value)) {
    throw new Error("The uploaded image exceeds the 1.5 MB size limit.");
  }
};
