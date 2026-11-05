"use client";

import { authApi } from "@/lib/api";
import {
  googleDrivePolicyApplies,
  normalizeGoogleWorkspaceConflictPreference
} from "@/lib/storage/google-workspace-sync-policy";
import { getWorkspaceStoragePreference, isCloudStorageProvider } from "@/lib/storage/storage-preferences";

/**
 * Pulls the Google Drive copy when it is newer than the local one. Used when a
 * device comes back to the foreground and before every agent tool call, so
 * edits made elsewhere (by the user on another device, or by an agent) show
 * up without signing in again. Reloads the in-memory database in place instead
 * of refreshing the page so the unlocked session stays active.
 */

export const WORKSPACE_REPLACED_EVENT = "smos:workspace-replaced";

export type ForegroundPullResult =
  | { status: "skipped"; reason: "not-cloud" | "conflict" | "offline" | "throttled" | "unsaved-work" }
  | { status: "unchanged"; outcome: string }
  | { status: "replaced"; reloaded: boolean }
  | { status: "failed"; message: string };

const lastPullAt = new Map<string, number>();

export const pullWorkspaceFromCloud = async (
  workspaceId: string,
  options: { reloadPage?: boolean; minIntervalMs?: number; skipWhenUnsaved?: () => boolean } = {}
): Promise<ForegroundPullResult> => {
  normalizeGoogleWorkspaceConflictPreference(workspaceId);
  const preference = getWorkspaceStoragePreference(workspaceId);
  if (!isCloudStorageProvider(preference.provider)) {
    return { status: "skipped", reason: "not-cloud" };
  }
  if (preference.status === "conflict" && !googleDrivePolicyApplies(workspaceId, preference)) {
    return { status: "skipped", reason: "conflict" };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "skipped", reason: "offline" };
  }
  if (options.skipWhenUnsaved?.()) {
    return { status: "skipped", reason: "unsaved-work" };
  }
  const now = Date.now();
  if (options.minIntervalMs && now - (lastPullAt.get(workspaceId) ?? 0) < options.minIntervalMs) {
    return { status: "skipped", reason: "throttled" };
  }
  lastPullAt.set(workspaceId, now);

  try {
    const result = await authApi.syncActiveWorkspaceCloud();
    if (result.outcome === "synced" && result.didReplaceLocalBundle) {
      await authApi.reloadActiveWorkspaceDatabase();
      window.dispatchEvent(new CustomEvent(WORKSPACE_REPLACED_EVENT, { detail: { workspaceId } }));
      if (options.reloadPage) {
        window.location.reload();
      }
      return { status: "replaced", reloaded: Boolean(options.reloadPage) };
    }
    return { status: "unchanged", outcome: result.outcome };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : String(error) };
  }
};
