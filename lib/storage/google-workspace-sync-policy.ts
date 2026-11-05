"use client";

import {
  getWorkspaceStoragePreference,
  updateWorkspaceStoragePreference,
  type WorkspaceStoragePreference
} from "@/lib/storage/storage-preferences";

const ACCOUNTS_KEY = "studio-map-os.local-accounts.v1";

const canUseBrowser = () => typeof window !== "undefined";

/**
 * Workspaces owned by a Google account on this device always keep a local
 * cache and upload to Drive when they can. They never ask the user to pick
 * "local" versus Drive for the same edit.
 */
export const workspaceUsesGoogleDrivePolicy = (workspaceId: string) => {
  if (!canUseBrowser()) {
    return false;
  }
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return false;
    }
    return parsed.some(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as { authMethod?: string; workspaceId?: string }).authMethod === "google" &&
        (item as { workspaceId?: string }).workspaceId === workspaceId
    );
  } catch {
    return false;
  }
};

export const googleDrivePolicyApplies = (
  workspaceId: string,
  preference: WorkspaceStoragePreference = getWorkspaceStoragePreference(workspaceId)
) => preference.provider === "gdrive" && workspaceUsesGoogleDrivePolicy(workspaceId);

/**
 * An unresolved "conflict" on a Google workspace is treated as pending upload:
 * local edits stay authoritative until Drive accepts them.
 */
export const normalizeGoogleWorkspaceConflictPreference = (workspaceId: string) => {
  if (!googleDrivePolicyApplies(workspaceId)) {
    return getWorkspaceStoragePreference(workspaceId);
  }
  const preference = getWorkspaceStoragePreference(workspaceId);
  if (preference.status !== "conflict") {
    return preference;
  }
  return updateWorkspaceStoragePreference(workspaceId, {
    status: "pending",
    pendingUpload: true,
    lastError: null
  });
};
