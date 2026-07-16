const numberBeforeWordPattern = /(\d(?:[\d.,]*\d)?)[ \t]+(?=[\p{L}\p{M}%‰°])/gu;
const numberWordHyphenPattern = /(\d(?:[\d.,]*\d)?)-(?=[\p{L}\p{M}])/gu;

/**
 * Keeps compact numeric phrases such as "3 days", "64 MB", and "16-digit"
 * together while leaving the rest of a sentence free to wrap normally.
 */
export const keepNumericWordPairsTogether = (value: string) =>
  value
    .replace(numberBeforeWordPattern, "$1\u00a0")
    .replace(numberWordHyphenPattern, "$1\u2011");
