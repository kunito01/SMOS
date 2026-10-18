"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/app-providers";
import { pullWorkspaceFromCloud } from "@/lib/storage/workspace-foreground-sync";
import { hasUnsavedWork } from "@/lib/utils/unsaved-work";

const FOREGROUND_PULL_INTERVAL_MS = 60_000;

/**
 * Headless: when the app returns to the foreground, fetch a newer CloudKit
 * copy and reload so changes from other devices or agents appear. Skipped
 * while an editor has unsaved work or a dialog is open.
 */
export function WorkspaceForegroundSync() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId;

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    let inFlight = false;
    const pull = () => {
      if (document.visibilityState !== "visible" || inFlight) {
        return;
      }
      inFlight = true;
      void pullWorkspaceFromCloud(workspaceId, {
        reloadPage: true,
        minIntervalMs: FOREGROUND_PULL_INTERVAL_MS,
        skipWhenUnsaved: hasUnsavedWork
      }).finally(() => {
        inFlight = false;
      });
    };

    document.addEventListener("visibilitychange", pull);
    return () => {
      document.removeEventListener("visibilitychange", pull);
    };
  }, [workspaceId]);

  return null;
}
