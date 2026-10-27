/**
 * Which identity providers the login page offers.
 *
 * Google is the sign-in. Apple ID sign-in is retired: Apple's web services
 * refuse private-database requests for this app's users. It stays available
 * only where it is still needed:
 * - on a device that holds an Apple ID account whose workspace has not
 *   switched to Google yet (otherwise that workspace could not be opened);
 * - in a build with NEXT_PUBLIC_APPLE_SIGNIN=on (rollback path; the CloudKit
 *   code stays in place behind this switch for now).
 */

const ACCOUNTS_KEY = "studio-map-os.local-accounts.v1";

type AccountLike = { authMethod?: unknown; workspaceId?: unknown };

const hasUnmigratedAppleAccount = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return false;
    }
    const records = parsed.filter(
      (item): item is AccountLike => Boolean(item) && typeof item === "object"
    );
    const googleWorkspaces = new Set(
      records
        .filter((item) => item.authMethod === "google" && typeof item.workspaceId === "string")
        .map((item) => item.workspaceId)
    );
    return records.some(
      (item) =>
        item.authMethod === "apple-cloudkit" &&
        typeof item.workspaceId === "string" &&
        !googleWorkspaces.has(item.workspaceId)
    );
  } catch {
    return false;
  }
};

export const isAppleSignInEnabled = () =>
  process.env.NEXT_PUBLIC_APPLE_SIGNIN === "on" || hasUnmigratedAppleAccount();
