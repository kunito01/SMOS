"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionConfirmDialog } from "@/components/ui/action-confirm-dialog";
import { useI18n } from "@/components/providers/app-providers";
import {
  WORKSPACE_CONFLICT_BLOCKED_EVENT,
  isWorkspaceSyncConflictError
} from "@/lib/storage/workspace-write-guard";

/**
 * App-wide dialog shown whenever a data mutation is refused because the active
 * cloud-backed workspace has an unresolved local/iCloud conflict.
 */
export function WorkspaceConflictGuardDialog() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    // Most mutation call sites do not catch save errors; the refusal is fully
    // handled by this dialog plus the persistence rollback, so keep the
    // expected rejections out of the console.
    const muteHandledRejection = (event: PromiseRejectionEvent) => {
      if (isWorkspaceSyncConflictError(event.reason)) {
        event.preventDefault();
      }
    };

    window.addEventListener(WORKSPACE_CONFLICT_BLOCKED_EVENT, show);
    window.addEventListener("unhandledrejection", muteHandledRejection);
    return () => {
      window.removeEventListener(WORKSPACE_CONFLICT_BLOCKED_EVENT, show);
      window.removeEventListener("unhandledrejection", muteHandledRejection);
    };
  }, []);

  return (
    <ActionConfirmDialog
      open={open}
      title={t("storageConflictBlockedTitle")}
      description={t("storageConflictBlockedBody")}
      confirmLabel={t("storageConflictBlockedAction")}
      cancelLabel={t("cancel")}
      onConfirm={() => {
        setOpen(false);
        router.push("/archive");
      }}
      onCancel={() => setOpen(false)}
    />
  );
}
