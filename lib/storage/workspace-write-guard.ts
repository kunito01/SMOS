import { getWorkspaceStoragePreference } from "@/lib/storage/storage-preferences";

export const WORKSPACE_CONFLICT_BLOCKED_EVENT = "smos:workspace-conflict-blocked";

export class WorkspaceSyncConflictError extends Error {
  public readonly code = "WORKSPACE_SYNC_CONFLICT" as const;

  constructor() {
    super("Resolve the iCloud storage conflict before creating or changing anything");
    this.name = "WorkspaceSyncConflictError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const isWorkspaceSyncConflictError = (value: unknown): value is WorkspaceSyncConflictError =>
  value instanceof WorkspaceSyncConflictError ||
  (typeof value === "object" &&
    value !== null &&
    (value as { code?: unknown }).code === "WORKSPACE_SYNC_CONFLICT");

/** Tells the app shell to show the blocking "resolve the storage conflict first" dialog. */
export const notifyWorkspaceConflictBlocked = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_CONFLICT_BLOCKED_EVENT));
  }
};

/**
 * Cloud-backed workspaces with an unresolved local/iCloud conflict refuse every
 * data mutation until the user picks a side, so the two copies cannot drift
 * further apart while the decision is pending.
 *
 * Callers that deliberately tolerate the refusal (login bookkeeping, backup
 * flushes) pass notify=false so the blocking dialog only appears for writes
 * that actually fail from the user's point of view.
 */
export function assertWorkspaceWritable(
  workspaceId: string,
  { notify = true }: { notify?: boolean } = {}
) {
  const preference = getWorkspaceStoragePreference(workspaceId);

  if (preference.provider === "cloudkit" && preference.status === "conflict") {
    if (notify) {
      notifyWorkspaceConflictBlocked();
    }
    throw new WorkspaceSyncConflictError();
  }
}
