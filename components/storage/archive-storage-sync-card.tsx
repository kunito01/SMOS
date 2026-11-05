"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  CalendarDays,
  FolderSync,
  HardDrive,
  Link2,
  RefreshCw,
  ShieldCheck,
  Unplug
} from "lucide-react";
import { useCloudKitAuth } from "@/components/providers/cloudkit-auth-provider";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { GoogleCalendarSyncCard } from "@/components/storage/google-calendar-sync-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { useCloudKitAccountDisplay } from "@/components/storage/use-cloudkit-account-display";
import { authApi } from "@/lib/api";
import { isAppleSignInEnabled } from "@/lib/auth/sign-in-options";
import { bindGoogleServicesFromSignIn, reconnectGoogleServices } from "@/lib/integrations/google-services";
import { readGoogleSignInToken } from "@/lib/integrations/google-signin";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import {
  GOOGLE_CALENDAR_SCOPE,
  googleTokenOmitsScope,
  preloadGoogleIdentity
} from "@/lib/integrations/google-auth";
import {
  disableGoogleCalendarPush,
  enableGoogleCalendarPush,
  getGoogleCalendarStatus,
  hasGoogleAccessToken,
  isGoogleCalendarConnected,
  readGoogleCalendarSettings,
  subscribeGoogleCalendarStatus,
  syncGoogleCalendar,
  writeGoogleCalendarSettings,
  type GoogleCalendarStatus
} from "@/lib/integrations/google-calendar";
import {
  CLOUDKIT_SIGN_IN_BUTTON_ID,
  CLOUDKIT_SIGN_OUT_BUTTON_ID
} from "@/lib/storage/cloudkit/cloudkit-client";
import {
  connectGoogleDriveAccount,
  getGoogleDriveTokenUsableUntil,
  GOOGLE_DRIVE_SCOPE,
  hasGoogleDriveAccessToken,
  isGoogleDriveConnected,
  readGoogleDriveSettings,
  requestGoogleDriveAccessToken,
  subscribeGoogleDriveStatus,
  type GoogleDriveSettings
} from "@/lib/storage/google-drive/google-drive-client";
import {
  describeWorkspaceSyncFailure,
  getWorkspaceCloudSyncAvailability,
  type WorkspaceConflictResolution,
  type WorkspaceSyncResult
} from "@/lib/storage/workspace-sync-coordinator";
import {
  getWorkspaceStoragePreference,
  subscribeWorkspaceStoragePreferences,
  type WorkspaceStoragePreference,
  type WorkspaceStorageProvider
} from "@/lib/storage/storage-preferences";
import { cn } from "@/lib/utils/cn";

type ArchiveStorageSyncCardProps = {
  workspaceId: string;
};

type StorageNotice = {
  message: string;
  tone: "error" | "success";
};

export function ArchiveStorageSyncCard({ workspaceId }: ArchiveStorageSyncCardProps) {
  const { language, t } = useI18n();
  const { user } = useAuth();
  const cloudRequired = Boolean(user?.cloudRequired);
  // Ownership belongs to the workspace, not to the account used to enter it:
  // after a switch to Google the Apple record stays, and an Apple session must
  // not move the workspace off Drive either.
  const googleOwned =
    user?.accountKind === "google" || authApi.getGoogleAccountForWorkspace(workspaceId) !== null;
  const {
    configured: cloudKitConfigured,
    error: cloudKitAuthError,
    identity: cloudKitIdentity,
    refresh: refreshCloudKitAuth
  } = useCloudKitAuth();
  const availability = useMemo(() => getWorkspaceCloudSyncAvailability(), []);
  const [preference, setPreference] = useState<WorkspaceStoragePreference>(() =>
    getWorkspaceStoragePreference(workspaceId)
  );
  const [switchTarget, setSwitchTarget] = useState<WorkspaceStorageProvider | null>(null);
  const [conflictResolution, setConflictResolution] =
    useState<WorkspaceConflictResolution | null>(null);
  const [busy, setBusy] = useState<"auth" | "resolve" | "switch" | "sync" | null>(null);
  const [notice, setNotice] = useState<StorageNotice | null>(null);
  const { account: cloudKitAccount, accountTag: cloudKitAccountTag } =
    useCloudKitAccountDisplay(cloudKitIdentity);
  const authState = {
    configured: cloudKitConfigured,
    signedIn: Boolean(cloudKitIdentity),
    user: cloudKitIdentity,
    error: cloudKitAuthError
  };

  // Google Drive connection state is device-bound (localStorage), like the
  // CloudKit session: the OAuth client id, the connected account, and whether
  // a usable token is still cached.
  const [drive, setDrive] = useState<GoogleDriveSettings>(() => readGoogleDriveSettings(workspaceId));
  const [driveHasToken, setDriveHasToken] = useState(() => hasGoogleDriveAccessToken(workspaceId));
  const [driveClientIdDraft, setDriveClientIdDraft] = useState(
    () => readGoogleDriveSettings(workspaceId).clientId
  );
  const [driveBindPending, setDriveBindPending] = useState(false);
  const [calendarSettings, setCalendarSettings] = useState(() => readGoogleCalendarSettings(workspaceId));
  const [calendarStatus, setCalendarStatus] = useState<GoogleCalendarStatus>(() => getGoogleCalendarStatus());
  const [calendarHasToken, setCalendarHasToken] = useState(() => hasGoogleAccessToken(workspaceId));
  const refreshDrive = useCallback(() => {
    const next = readGoogleDriveSettings(workspaceId);
    setDrive(next);
    setDriveHasToken(hasGoogleDriveAccessToken(workspaceId));
    setDriveClientIdDraft((draft) => (draft.trim() ? draft : next.clientId));
  }, [workspaceId]);

  useEffect(() => {
    refreshDrive();
    // Load Google Identity Services early so the connect click can open the popup synchronously.
    void preloadGoogleIdentity().catch(() => undefined);
    return subscribeGoogleDriveStatus(refreshDrive);
  }, [refreshDrive]);

  useEffect(
    () =>
      subscribeGoogleCalendarStatus((nextStatus) => {
        setCalendarStatus(nextStatus);
        setCalendarSettings(readGoogleCalendarSettings(workspaceId));
        setCalendarHasToken(hasGoogleAccessToken(workspaceId));
      }),
    [workspaceId]
  );

  // Google tokens live about an hour. Try a silent refresh before showing
  // "reconnect", and flip the card once the cached one actually lapses.
  const silentDriveRefreshAttempted = useRef(false);
  useEffect(() => {
    if (!driveHasToken) {
      if (silentDriveRefreshAttempted.current) {
        return;
      }
      silentDriveRefreshAttempted.current = true;
      const settings = readGoogleDriveSettings(workspaceId);
      if (!settings.clientId || (!settings.consentGranted && !settings.connectedAt)) {
        return;
      }
      void requestGoogleDriveAccessToken(workspaceId, "silent")
        .then(() => refreshDrive())
        .catch(() => refreshDrive());
      return;
    }
    silentDriveRefreshAttempted.current = false;
    const usableUntil = getGoogleDriveTokenUsableUntil(workspaceId);
    if (usableUntil === null) {
      refreshDrive();
      return;
    }
    const timer = window.setTimeout(refreshDrive, Math.max(1_000, usableUntil - Date.now() + 500));
    return () => window.clearTimeout(timer);
  }, [driveHasToken, refreshDrive, workspaceId]);

  const driveConfigured = Boolean(drive.clientId.trim());
  const driveConnected = isGoogleDriveConnected(drive);
  const driveNeedsReconnect = driveConnected && !driveHasToken;
  const calendarConnected = isGoogleCalendarConnected(calendarSettings);
  const calendarPushDisabled = calendarSettings.pushDisabled;
  const calendarActive = calendarConnected && !calendarPushDisabled;
  const calendarNeedsReconnect =
    calendarActive && (calendarStatus.state === "reconnect" || !calendarHasToken);
  const calendarEventCount =
    calendarStatus.eventCount ?? Object.keys(calendarSettings.syncedEvents).length;
  const isDriveProvider = preference.provider === "gdrive";
  const isCloudKitProvider = preference.provider === "cloudkit";
  // Apple ID is retired: the iCloud option only stays visible on a device that
  // still stores this workspace in iCloud, so it can move to Google Drive.
  const showICloudBox = isAppleSignInEnabled() || isCloudKitProvider;

  const refreshPreference = useCallback(() => {
    const next = getWorkspaceStoragePreference(workspaceId);
    setPreference(next);
    return next;
  }, [workspaceId]);

  useEffect(() => {
    setPreference(getWorkspaceStoragePreference(workspaceId));
  }, [workspaceId]);

  // Keep the status badge and "last sync" time live: the background cloud
  // auto-upload updates the stored preference without any user action, so
  // re-read it whenever it changes (this tab), another tab/window writes it
  // (storage event), or the user returns to this tab.
  useEffect(() => {
    const refresh = () => {
      const next = getWorkspaceStoragePreference(workspaceId);
      setPreference((prev) =>
        prev.updatedAt === next.updatedAt && prev.status === next.status ? prev : next
      );
      refreshDrive();
    };

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key.includes("workspace-storage-preferences") ||
        event.key.includes("google-drive")
      ) {
        refresh();
      }
    };
    const onVisibility = () => {
      if (!document.hidden) {
        refresh();
      }
    };

    const unsubscribe = subscribeWorkspaceStoragePreferences(refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshDrive, workspaceId]);

  useEffect(() => {
    if (availability.available) {
      void refreshCloudKitAuth();
    }
  }, [availability.available, refreshCloudKitAuth]);

  // Scope picks the headline: which cloud was syncing, or the Google account
  // step itself. The detail is the coordinator's scrubbed description, so a
  // token or upload session id can never end up on screen.
  const describeFailure = useCallback(
    (error: unknown, scope: WorkspaceStorageProvider | "google-account" = preference.provider) => {
      const headline =
        scope === "google-account"
          ? t("storageGoogleDriveConnectFailed")
          : scope === "gdrive"
            ? t("storageGoogleDriveSyncFailed")
            : t("storageSyncFailed");
      const detail = describeWorkspaceSyncFailure(error);
      return detail ? `${headline} (${detail})` : headline;
    },
    [preference.provider, t]
  );

  const finishSyncResult = useCallback(
    async (result: WorkspaceSyncResult, successMessage: string) => {
      setPreference(result.preference);
      const resultIsDrive = result.preference.provider === "gdrive";
      if (result.outcome === "auth-required") {
        if (resultIsDrive) {
          refreshDrive();
        } else {
          void refreshCloudKitAuth();
        }
      }

      if (result.outcome === "synced") {
        setNotice({ message: successMessage, tone: "success" });
        if (result.didReplaceLocalBundle) {
          await authApi.reloadActiveWorkspaceDatabase();
          window.location.reload();
        }
        return true;
      }

      setNotice({
        message:
          result.outcome === "auth-required"
            ? resultIsDrive
              ? t("storageGoogleDriveSignInRequired")
              : t("storageCloudKitSignInRequired")
            : result.outcome === "account-mismatch"
              ? resultIsDrive
                ? t("storageGoogleDriveAccountMismatch")
                : t("storageCloudKitAccountMismatch")
              : result.preference.lastError || t("storageSyncFailed"),
        tone: "error"
      });
      return false;
    },
    [refreshCloudKitAuth, refreshDrive, t]
  );

  /** Must run inside a click handler: Google's popup needs the user gesture. */
  const signsInWithGoogle = user?.accountKind === "google";
  const ensureDriveToken = useCallback(async () => {
    if (!hasGoogleDriveAccessToken(workspaceId)) {
      if (signsInWithGoogle) {
        const token = readGoogleSignInToken();
        if (token && !googleTokenOmitsScope(token, GOOGLE_DRIVE_SCOPE)) {
          // The sign-in token already covers Drive. A timeout retries that
          // token instead of opening another Google prompt.
          await bindGoogleServicesFromSignIn(workspaceId, token);
        } else {
          // One popup refreshes Drive and Calendar together.
          await reconnectGoogleServices(workspaceId);
        }
      } else {
        await requestGoogleDriveAccessToken(workspaceId, "interactive");
      }
    }
    refreshDrive();
  }, [refreshDrive, signsInWithGoogle, workspaceId]);

  // A Google account does not connect Drive on its own. Retry the sign-in
  // token while the session is still valid; this effect never opens a popup.
  useEffect(() => {
    if (!signsInWithGoogle || driveConnected) {
      return;
    }
    const token = readGoogleSignInToken();
    if (!token || googleTokenOmitsScope(token, GOOGLE_DRIVE_SCOPE)) {
      return;
    }
    let cancelled = false;
    setDriveBindPending(true);
    void bindGoogleServicesFromSignIn(workspaceId, token)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setDriveBindPending(false);
          refreshDrive();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [driveConnected, refreshDrive, signsInWithGoogle, workspaceId]);

  const switchProvider = useCallback(
    async (target: WorkspaceStorageProvider) => {
      setBusy("switch");
      setNotice(null);

      try {
        if (target === "indexeddb") {
          const next = await authApi.disconnectActiveWorkspaceCloud();
          setPreference(next);
          setNotice({ message: t("storageSwitchSuccess"), tone: "success" });
          return;
        }

        if (target === "gdrive") {
          if (!driveConfigured) {
            setNotice({ message: t("storageGoogleDriveUnavailable"), tone: "error" });
            return;
          }
          if (!driveConnected) {
            setNotice({ message: t("storageGoogleDriveSignInRequired"), tone: "error" });
            return;
          }
          await ensureDriveToken();
          const result = await authApi.connectActiveWorkspaceCloud("gdrive");
          const synced = await finishSyncResult(result, t("storageSwitchSuccess"));
          if (!synced) {
            refreshPreference();
          }
          return;
        }

        if (!availability.available) {
          setNotice({ message: t("storageCloudKitUnavailable"), tone: "error" });
          return;
        }

        const user = cloudKitIdentity ?? await refreshCloudKitAuth();
        if (!user) {
          setNotice({ message: t("storageCloudKitSignInRequired"), tone: "error" });
          return;
        }

        const result = await authApi.connectActiveWorkspaceCloud("cloudkit", user);
        const synced = await finishSyncResult(result, t("storageSwitchSuccess"));
        if (!synced) {
          refreshPreference();
        }
      } catch (error) {
        refreshPreference();
        refreshDrive();
        setNotice({ message: describeFailure(error, target), tone: "error" });
      } finally {
        setBusy(null);
      }
    },
    [
      availability.available,
      cloudKitIdentity,
      describeFailure,
      driveConfigured,
      driveConnected,
      ensureDriveToken,
      finishSyncResult,
      refreshCloudKitAuth,
      refreshDrive,
      refreshPreference,
      t
    ]
  );

  const ensureCalendarTokenForSync = useCallback(async () => {
    if (!calendarActive) {
      return;
    }
    if (hasGoogleAccessToken(workspaceId)) {
      return;
    }
    if (!signsInWithGoogle) {
      return;
    }
    const token = readGoogleSignInToken();
    if (
      !token ||
      googleTokenOmitsScope(token, GOOGLE_CALENDAR_SCOPE) ||
      googleTokenOmitsScope(token, GOOGLE_DRIVE_SCOPE)
    ) {
      await reconnectGoogleServices(workspaceId);
      return;
    }
    await bindGoogleServicesFromSignIn(workspaceId, token);
  }, [calendarActive, signsInWithGoogle, workspaceId]);

  const syncGoogleCalendarIfActive = useCallback(async () => {
    if (!calendarActive) {
      return null;
    }
    await ensureCalendarTokenForSync();
    return syncGoogleCalendar(workspaceId, {
      mode: signsInWithGoogle ? "silent" : "interactive"
    });
  }, [calendarActive, ensureCalendarTokenForSync, signsInWithGoogle, workspaceId]);

  const syncNow = async () => {
    setBusy("sync");
    setNotice(null);

    try {
      if (preference.provider === "gdrive") {
        await ensureDriveToken();
      }
      await finishSyncResult(
        await authApi.syncActiveWorkspaceCloud(
          preference.provider === "cloudkit" ? (cloudKitIdentity ?? undefined) : undefined
        ),
        t("storageSyncSuccess")
      );
      const calendarResult = await syncGoogleCalendarIfActive();
      if (
        calendarResult &&
        (calendarResult.state === "error" || calendarResult.state === "reconnect") &&
        calendarResult.message
      ) {
        setNotice({ message: calendarResult.message, tone: "error" });
      }
    } catch (error) {
      refreshPreference();
      refreshDrive();
      setNotice({ message: describeFailure(error), tone: "error" });
    } finally {
      setCalendarSettings(readGoogleCalendarSettings(workspaceId));
      setCalendarHasToken(hasGoogleAccessToken(workspaceId));
      setBusy(null);
    }
  };

  const turnOffCalendarPush = async () => {
    setBusy("auth");
    setNotice(null);
    try {
      disableGoogleCalendarPush(workspaceId);
      setCalendarSettings(readGoogleCalendarSettings(workspaceId));
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setBusy(null);
    }
  };

  const turnOnCalendarPush = async () => {
    setBusy("auth");
    setNotice(null);
    try {
      if (getWorkspaceStoragePreference(workspaceId).status === "conflict") {
        setNotice({ message: t("storageConflictBlockedBody"), tone: "error" });
        return;
      }
      enableGoogleCalendarPush(workspaceId);
      const token = readGoogleSignInToken();
      if (
        !token ||
        googleTokenOmitsScope(token, GOOGLE_CALENDAR_SCOPE) ||
        googleTokenOmitsScope(token, GOOGLE_DRIVE_SCOPE)
      ) {
        await reconnectGoogleServices(workspaceId);
      } else {
        await bindGoogleServicesFromSignIn(workspaceId, token);
      }
      if (!hasGoogleAccessToken(workspaceId)) {
        setNotice({ message: t("googleCalendarScopeMissing"), tone: "error" });
        return;
      }
      const result = await syncGoogleCalendar(workspaceId, { mode: "silent" });
      if (
        (result.state === "error" || result.state === "reconnect") &&
        result.message
      ) {
        setNotice({ message: result.message, tone: "error" });
      }
    } catch (error) {
      setNotice({ message: describeFailure(error, "google-account"), tone: "error" });
    } finally {
      setCalendarSettings(readGoogleCalendarSettings(workspaceId));
      setCalendarHasToken(hasGoogleAccessToken(workspaceId));
      setBusy(null);
    }
  };

  const resolveConflict = useCallback(
    async (resolution: WorkspaceConflictResolution) => {
      setBusy("resolve");
      setNotice(null);

      try {
        if (preference.provider === "gdrive") {
          await ensureDriveToken();
        }
        const resolved = await finishSyncResult(
          await authApi.resolveActiveWorkspaceCloudConflict(
            resolution,
            preference.provider === "cloudkit" ? (cloudKitIdentity ?? undefined) : undefined
          ),
          t("storageSyncSuccess")
        );
        if (!resolved) {
          refreshPreference();
        }
      } catch (error) {
        refreshPreference();
        refreshDrive();
        setNotice({ message: describeFailure(error), tone: "error" });
      } finally {
        setBusy(null);
        setConflictResolution(null);
      }
    },
    [
      cloudKitIdentity,
      describeFailure,
      ensureDriveToken,
      finishSyncResult,
      preference.provider,
      refreshDrive,
      refreshPreference,
      t
    ]
  );

  const connectDrive = async () => {
    setBusy("auth");
    setNotice(null);
    try {
      await connectGoogleDriveAccount(workspaceId, driveClientIdDraft);
      refreshDrive();
      setNotice({ message: t("storageGoogleDriveConnected"), tone: "success" });
    } catch (error) {
      refreshDrive();
      setNotice({ message: describeFailure(error, "google-account"), tone: "error" });
      setBusy(null);
      return;
    }
    setBusy(null);
    // Drive was already this workspace's storage (disconnect → connect, or a
    // mismatch fixed by picking the right account): resume straight away.
    if (preference.provider === "gdrive") {
      await syncNow();
    }
  };

  const reconnectDrive = async () => {
    setBusy("auth");
    setNotice(null);
    try {
      await ensureDriveToken();
    } catch (error) {
      refreshDrive();
      setNotice({ message: describeFailure(error, "google-account"), tone: "error" });
      setBusy(null);
      return;
    }
    setBusy(null);
    if (preference.provider === "gdrive") {
      await syncNow();
    }
  };

  const disconnectDrive = async () => {
    setBusy("auth");
    setNotice(null);
    try {
      await authApi.disconnectActiveWorkspaceGoogleDrive();
      refreshDrive();
      refreshPreference();
    } catch (error) {
      refreshDrive();
      setNotice({ message: describeFailure(error, "google-account"), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const calendarStatusLabel = (() => {
    if (calendarPushDisabled) {
      return null;
    }
    if (!calendarConnected) {
      return signsInWithGoogle ? null : t("googleCalendarStatusIdle");
    }
    switch (calendarStatus.state) {
      case "syncing":
        return t("googleCalendarStatusSyncing");
      case "error":
        return t("googleCalendarStatusError").replace("{message}", calendarStatus.message ?? "");
      default:
        return calendarNeedsReconnect
          ? t("googleCalendarStatusReconnect")
          : t("googleCalendarStatusSynced").replace("{count}", String(calendarEventCount));
    }
  })();
  const googleSyncBusy = busy === "sync" || calendarStatus.state === "syncing";
  const providerTitle =
    preference.provider === "cloudkit"
      ? t("storageCloudKitTitle")
      : preference.provider === "gdrive"
        ? t("storageGoogleDriveTitle")
        : t("storageIndexedDbTitle");
  const lastSync = preference.lastSyncAt
    ? formatLocalizedDate(preference.lastSyncAt, language, {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : t("storageNeverSynced");
  const syncStatus = (() => {
    if (preference.provider === "indexeddb") {
      return { label: t("storageUpToDate"), tone: "success" as const };
    }
    const working =
      busy === "sync" ||
      busy === "switch" ||
      busy === "resolve" ||
      preference.status === "syncing";

    if (isDriveProvider) {
      if (!driveConfigured) {
        return { label: t("storageGoogleDriveUnavailable"), tone: "error" as const };
      }
      if (working) {
        return { label: t("storageSyncing"), tone: "pending" as const };
      }
      if (driveNeedsReconnect) {
        return { label: t("storageGoogleDriveTokenExpired"), tone: "pending" as const };
      }
      if (preference.status === "auth-required" || !driveConnected) {
        return { label: t("storageGoogleDriveSignInRequired"), tone: "error" as const };
      }
      if (preference.status === "account-mismatch") {
        return { label: t("storageGoogleDriveAccountMismatch"), tone: "error" as const };
      }
    } else {
      if (!availability.available) {
        return { label: t("storageCloudKitUnavailable"), tone: "error" as const };
      }
      if (working) {
        return { label: t("storageSyncing"), tone: "pending" as const };
      }
      if (authState.error) {
        return { label: t("storageSyncFailed"), tone: "error" as const };
      }
      if (preference.status === "auth-required" || !authState.signedIn) {
        return { label: t("storageCloudKitSignInRequired"), tone: "error" as const };
      }
      if (preference.status === "account-mismatch") {
        return { label: t("storageCloudKitAccountMismatch"), tone: "error" as const };
      }
    }
    if (preference.status === "conflict" || preference.status === "error") {
      return {
        label:
          preference.lastError ||
          (isDriveProvider ? t("storageGoogleDriveSyncFailed") : t("storageSyncFailed")),
        tone: "error" as const
      };
    }
    if (preference.pendingUpload || preference.status === "pending") {
      // A login-time pull that failed is stored as pending so uploads keep
      // scheduling; still show what went wrong instead of a bare "pending".
      if (preference.lastError) {
        return { label: preference.lastError, tone: "error" as const };
      }
      return { label: t("storagePendingUpload"), tone: "pending" as const };
    }
    return { label: t("storageUpToDate"), tone: "success" as const };
  })();

  return (
    <>
      <Card tone="glass" className="overflow-hidden bg-white/[0.76] p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.44fr)]">
          <div className="min-w-0">
            <SectionHeader
              eyebrow={t("storageSyncEyebrow")}
              title={t("storageSyncTitle")}
            />
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-muted">
              {t("storageSyncBody")}
            </p>
          </div>

          <div className="rounded-studio bg-ink p-4 text-white shadow-soft">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-white/52">
              {t("storageCurrentLocation")}
            </p>
            <div className="mt-3 flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-limepop text-ink">
                {isCloudKitProvider ? (
                  <Cloud size={20} />
                ) : isDriveProvider ? (
                  <FolderSync size={20} />
                ) : (
                  <HardDrive size={20} />
                )}
              </span>
              <p className="min-w-0 text-lg font-black leading-tight">{providerTitle}</p>
            </div>
            <div
              className={cn(
                "mt-4 flex items-start gap-2 rounded-studio p-3 text-xs font-black leading-5",
                syncStatus.tone === "success" && "bg-limepop/14 text-limepop",
                syncStatus.tone === "pending" && "bg-[#ffc700]/14 text-[#ffe16a]",
                syncStatus.tone === "error" && "bg-coral/16 text-[#ffb7a8]"
              )}
            >
              {syncStatus.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
              ) : syncStatus.tone === "pending" ? (
                <RefreshCw className="mt-0.5 shrink-0" size={16} />
              ) : (
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              )}
              <span className="min-w-0 break-words">{syncStatus.label}</span>
            </div>
            <p className="mt-3 text-xs font-bold leading-5 text-white/58">
              {t("storageLastSync")}: <span className="text-white/82">{lastSync}</span>
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <StorageOption
            active={preference.provider === "indexeddb"}
            icon={<Database size={22} />}
            title={t("storageIndexedDbTitle")}
            body={t("storageIndexedDbBody")}
            warning={t("storageIndexedDbWarning")}
            action={
              preference.provider !== "indexeddb" ? (
                cloudRequired ? (
                  <p className="rounded-studio bg-ink/[0.06] p-3 text-xs font-bold leading-5 text-muted">
                    {user?.accountKind === "google"
                      ? t("storageGoogleCloudRequired")
                      : t("storageAppleCloudRequired")}
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    size="md"
                    disabled={Boolean(busy)}
                    onClick={() => setSwitchTarget("indexeddb")}
                    className="w-full sm:w-auto"
                  >
                    <CloudOff size={17} />
                    {isDriveProvider ? t("storageGoogleDriveStopSync") : t("storageCloudKitDisconnect")}
                  </Button>
                )
              ) : null
            }
          />
        </div>

        {showICloudBox ? (
        <div className="mt-4 grid gap-4 rounded-studio-lg bg-ink/[0.055] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.45fr)]">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-limepop text-ink">
                <ShieldCheck size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black">
                  {availability.available
                    ? authState.error
                      ? t("storageSyncFailed")
                      : authState.signedIn
                      ? t("storageCloudKitConnected")
                      : t("storageCloudKitSignInRequired")
                    : t("storageCloudKitUnavailable")}
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-muted">
                  {t("storageCloudKitSameAppleIdOnly")}
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-coral">
                  {t("storageNewDeviceRestoreWarning")}
                </p>
              </div>
            </div>
          </div>

          {availability.available ? (
            <div className="grid min-h-12 content-center justify-stretch gap-3 rounded-studio bg-white p-3 shadow-sm ring-1 ring-black/[0.05]">
              {authState.signedIn && cloudKitAccount ? (
                <div className="min-w-0 rounded-studio bg-aqua/45 p-3 ring-1 ring-black/[0.05]">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-muted">
                    {t("storageCloudKitAccountTitle")}
                  </p>
                  <p className="mt-2 text-[0.68rem] font-bold text-muted">
                    {t("storageCloudKitSignedInAs")}
                  </p>
                  <p
                    className="mt-0.5 truncate text-sm font-black text-ink"
                  >
                    {cloudKitAccount.displayName ??
                      cloudKitAccount.maskedEmailAddress ??
                      t("storageCloudKitConnected")}
                  </p>
                  {cloudKitAccount.maskedEmailAddress && cloudKitAccount.displayName ? (
                    <p className="mt-1 truncate text-xs font-bold text-muted">
                      {cloudKitAccount.maskedEmailAddress}
                    </p>
                  ) : null}
                  {cloudKitAccountTag ? (
                    <div className="mt-3 border-t border-black/10 pt-2">
                      <p className="text-[0.66rem] font-black text-muted">
                        {t("storageCloudKitAccountIdentifier")}
                      </p>
                      <code className="mt-1 block whitespace-nowrap text-xs font-black text-ink">
                        {cloudKitAccountTag}
                      </code>
                    </div>
                  ) : null}
                  {!isCloudKitProvider ? (
                    <p className="mt-3 rounded-studio bg-limepop/45 p-2 text-[0.68rem] font-bold leading-5 text-ink">
                      {t("storageCloudKitConfirmChoice")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-center text-xs font-black text-muted">
                  {t("storageCloudKitConnect")}
                </p>
              )}
              {authState.signedIn ? (
                <div className="grid w-full gap-2">
                  {!isCloudKitProvider && !googleOwned ? (
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={Boolean(busy) || !availability.available}
                      onClick={() => setSwitchTarget("cloudkit")}
                      className="w-full"
                    >
                      <Cloud size={17} />
                      {t("storageSwitchAction")}
                    </Button>
                  ) : preference.status === "account-mismatch" ? (
                    <p className="flex items-start gap-2 rounded-studio bg-coral/10 p-3 text-xs font-black leading-5 text-coral">
                      <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                      <span>{t("storageCloudKitAccountMismatch")}</span>
                    </p>
                  ) : preference.status === "conflict" ? (
                    <>
                      <Button
                        variant="secondary"
                        size="md"
                        disabled={Boolean(busy) || !availability.available}
                        onClick={() => setConflictResolution("keep-local")}
                        className="w-full"
                      >
                        <HardDrive size={17} />
                        {t("storageKeepLocal")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="md"
                        disabled={Boolean(busy) || !availability.available}
                        onClick={() => setConflictResolution("use-cloud")}
                        className="w-full"
                      >
                        <Cloud size={17} />
                        {t("storageUseCloud")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={Boolean(busy) || !availability.available}
                      onClick={() => void syncNow()}
                      className="w-full"
                    >
                      <RefreshCw className={cn(busy === "sync" && "animate-spin")} size={17} />
                      {busy === "sync" ? t("storageSyncing") : t("storageSyncNow")}
                    </Button>
                  )}
                </div>
              ) : null}
              <div
                className={cn(
                  "flex justify-center [&_.apple-auth-button]:!rounded-full",
                  authState.signedIn && "hidden"
                )}
              >
                <div id={CLOUDKIT_SIGN_IN_BUTTON_ID} />
              </div>
              <div
                className={cn(
                  "grid gap-2 [&_.apple-auth-button]:!rounded-full",
                  !authState.signedIn && "hidden"
                )}
              >
                <p className="text-center text-xs font-black text-muted">
                  {t("storageCloudKitSignOut")}
                </p>
                <div className="flex justify-center">
                  <div id={CLOUDKIT_SIGN_OUT_BUTTON_ID} />
                </div>
                <p className="text-center text-[0.66rem] font-bold leading-5 text-muted">
                  {t("storageCloudKitSignOutBody")}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        ) : null}

        <div className="mt-4 grid gap-4 rounded-studio-lg bg-ink/[0.055] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.45fr)]">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-limepop text-ink">
                <FolderSync size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black">
                  {!driveConfigured
                    ? t("storageGoogleDriveUnavailable")
                    : driveConnected
                      ? driveNeedsReconnect
                        ? t("storageGoogleDriveTokenExpired")
                        : t("storageGoogleDriveConnected")
                      : t("storageGoogleDriveTitle")}
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-muted">
                  {t("storageGoogleDriveBody")}
                </p>
                {signsInWithGoogle && driveConnected ? (
                  <p className="mt-1 text-xs font-bold leading-5 text-muted">{t("googleCalendarViaSignIn")}</p>
                ) : (
                  <p className="mt-1 text-xs font-bold leading-5 text-muted">
                    {t("storageGoogleDriveSameAccountOnly")}
                  </p>
                )}
                <p className="mt-1 text-xs font-bold leading-5 text-coral">
                  {t("storageGoogleDriveWarning")}
                </p>
                {driveConnected && signsInWithGoogle ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {calendarPushDisabled ? null : calendarActive ? (
                      <>
                        <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-ink/[0.06] px-3 text-xs font-black text-muted">
                          <CalendarDays size={14} />
                          {t("googleCalendarTarget").replace("{name}", "Studio Map OS")}
                        </span>
                        {calendarStatusLabel ? (
                          <span
                            className={cn(
                              "inline-flex min-h-8 items-center rounded-full px-3 text-xs font-black",
                              calendarStatus.state === "error"
                                ? "bg-coral/15 text-coral"
                                : calendarStatus.state === "syncing"
                                  ? "bg-aqua/60 text-ink"
                                  : calendarNeedsReconnect
                                    ? "bg-[#ffc700]/40 text-ink"
                                    : "bg-[#97EECE] text-[#12263A]"
                            )}
                          >
                            {calendarStatusLabel}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
                <p className="mt-2 text-xs font-bold leading-5 text-muted">{t("googleCalendarScopeNote")}</p>
              </div>
            </div>
          </div>

          <div className="grid min-h-12 content-center justify-stretch gap-3 rounded-studio bg-white p-3 shadow-sm ring-1 ring-black/[0.05]">
            {driveConnected ? (
              <div className="min-w-0 rounded-studio bg-aqua/45 p-3 ring-1 ring-black/[0.05]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-muted">
                  {t("storageGoogleDriveAccountTitle")}
                </p>
                <p className="mt-2 text-[0.68rem] font-bold text-muted">
                  {t("storageCloudKitSignedInAs")}
                </p>
                <p className="mt-0.5 truncate text-sm font-black text-ink">
                  {drive.accountName || drive.accountEmail || t("storageGoogleDriveConnected")}
                </p>
                {drive.accountEmail && drive.accountName ? (
                  <p className="mt-1 truncate text-xs font-bold text-muted">{drive.accountEmail}</p>
                ) : null}
                {!isDriveProvider ? (
                  <p className="mt-3 rounded-studio bg-limepop/45 p-2 text-[0.68rem] font-bold leading-5 text-ink">
                    {t("storageGoogleDriveConfirmChoice")}
                  </p>
                ) : null}
              </div>
            ) : signsInWithGoogle ? (
              <div className="grid gap-2">
                {!driveBindPending && !driveHasToken ? (
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={Boolean(busy)}
                    onClick={() => void reconnectDrive()}
                    className="w-full"
                  >
                    <RefreshCw size={17} />
                    {t("storageGoogleDriveReconnect")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-muted">
                    {t("googleCalendarClientIdLabel")}
                  </span>
                  <input
                    value={driveClientIdDraft}
                    onChange={(event) => setDriveClientIdDraft(event.target.value)}
                    placeholder="xxxxxxxx.apps.googleusercontent.com"
                    spellCheck={false}
                    autoComplete="off"
                    className="h-11 w-full rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                  />
                </label>
                <p className="text-[0.66rem] font-bold leading-5 text-muted">
                  {t("storageGoogleDriveClientIdHint")}
                </p>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={Boolean(busy) || !driveClientIdDraft.trim()}
                  onClick={() => void connectDrive()}
                  className="w-full"
                >
                  <Link2 size={17} />
                  {t("storageGoogleDriveConnect")}
                </Button>
              </div>
            )}
            {driveConnected ? (
              <div className="grid w-full gap-2">
                {!isDriveProvider ? (
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={Boolean(busy) || !driveConfigured}
                    onClick={() => setSwitchTarget("gdrive")}
                    className="w-full"
                  >
                    <FolderSync size={17} />
                    {t("storageSwitchAction")}
                  </Button>
                ) : preference.status === "account-mismatch" ? (
                  <>
                    <p className="flex items-start gap-2 rounded-studio bg-coral/10 p-3 text-xs font-black leading-5 text-coral">
                      <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                      <span>{t("storageGoogleDriveAccountMismatch")}</span>
                    </p>
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={Boolean(busy)}
                      onClick={() => void syncNow()}
                      className="w-full"
                    >
                      <RefreshCw className={cn(googleSyncBusy && "animate-spin")} size={17} />
                      {googleSyncBusy ? t("storageSyncing") : t("storageSyncNow")}
                    </Button>
                  </>
                ) : preference.status === "conflict" ? (
                  <>
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={Boolean(busy)}
                      onClick={() => setConflictResolution("keep-local")}
                      className="w-full"
                    >
                      <HardDrive size={17} />
                      {t("storageKeepLocal")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="md"
                      disabled={Boolean(busy)}
                      onClick={() => setConflictResolution("use-cloud")}
                      className="w-full"
                    >
                      <FolderSync size={17} />
                      {t("storageUseGoogleDrive")}
                    </Button>
                  </>
                ) : driveNeedsReconnect ? (
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={Boolean(busy)}
                    onClick={() => void reconnectDrive()}
                    className="w-full"
                  >
                    <RefreshCw size={17} />
                    {t("storageGoogleDriveReconnect")}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={Boolean(busy)}
                      onClick={() => void syncNow()}
                      className="w-full"
                    >
                      <RefreshCw className={cn(googleSyncBusy && "animate-spin")} size={17} />
                      {googleSyncBusy ? t("storageSyncing") : t("storageSyncNow")}
                    </Button>
                    {isDriveProvider && calendarActive ? (
                      <label className="flex cursor-pointer items-center gap-2 rounded-studio bg-ink/[0.04] p-3 text-xs font-black text-ink/70">
                        <input
                          type="checkbox"
                          checked={calendarSettings.autoSync}
                          disabled={Boolean(busy)}
                          onChange={(event) =>
                            setCalendarSettings(
                              writeGoogleCalendarSettings(workspaceId, { autoSync: event.target.checked })
                            )
                          }
                          className="size-4 accent-coral"
                        />
                        {t("googleCalendarAutoSync")}
                      </label>
                    ) : null}
                    {signsInWithGoogle && calendarActive ? (
                      <Button
                        variant="ghost"
                        size="md"
                        disabled={Boolean(busy)}
                        onClick={() => void turnOffCalendarPush()}
                        className="w-full"
                      >
                        <Unplug size={17} />
                        {t("googleCalendarTurnOff")}
                      </Button>
                    ) : null}
                    {signsInWithGoogle && calendarPushDisabled ? (
                      <Button
                        variant="ghost"
                        size="md"
                        disabled={Boolean(busy)}
                        onClick={() => void turnOnCalendarPush()}
                        className="w-full"
                      >
                        <Link2 size={17} />
                        {t("googleCalendarTurnOn")}
                      </Button>
                    ) : null}
                  </>
                )}
                {googleOwned ? (
                  <p className="rounded-studio bg-ink/[0.06] p-3 text-xs font-bold leading-5 text-muted">
                    {t("storageGoogleCloudRequired")}
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    size="md"
                    disabled={Boolean(busy)}
                    onClick={() => void disconnectDrive()}
                    className="w-full"
                  >
                    <Unplug size={17} />
                    {t("storageGoogleDriveDisconnect")}
                  </Button>
                )}
                <p className="text-center text-[0.66rem] font-bold leading-5 text-muted">
                  {t("storageGoogleDriveDisconnectBody")}
                </p>
              </div>
            ) : null}
          </div>

          {!signsInWithGoogle && driveConnected && !calendarConnected ? (
            <div className="border-t border-black/10 pt-4 lg:col-span-2">
              <GoogleCalendarSyncCard workspaceId={workspaceId} embedded hideSyncControls />
            </div>
          ) : null}
        </div>

        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "mt-4 rounded-studio p-3 text-sm font-black",
              notice.tone === "error"
                ? "bg-coral/12 text-coral"
                : "bg-limepop/20 text-[#566000]"
            )}
          >
            {notice.message}
          </p>
        ) : null}
      </Card>

      <DeleteConfirmDialog
        open={Boolean(switchTarget)}
        busy={busy === "switch"}
        acknowledgementLabel={t("storageSwitchAcknowledgement")}
        title={t("storageSwitchTitle")}
        description={
          switchTarget === "cloudkit"
            ? t("storageSwitchToCloudKitBody")
            : switchTarget === "gdrive"
              ? t("storageSwitchToGoogleDriveBody")
              : isDriveProvider
                ? t("storageSwitchToIndexedDbFromGoogleDriveBody")
                : t("storageSwitchToIndexedDbBody")
        }
        warning={t("storageSwitchWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("storageSwitchAction")}
        onCancel={() => setSwitchTarget(null)}
        onConfirm={() => {
          const target = switchTarget;
          setSwitchTarget(null);
          if (target) {
            void switchProvider(target);
          }
        }}
      />

      <DeleteConfirmDialog
        open={Boolean(conflictResolution)}
        busy={busy === "resolve"}
        acknowledgementLabel={t("storageSwitchAcknowledgement")}
        title={isDriveProvider ? t("storageGoogleDriveConflictTitle") : t("storageConflictTitle")}
        description={
          conflictResolution === "keep-local"
            ? isDriveProvider
              ? t("storageGoogleDriveConflictKeepLocalBody")
              : t("storageConflictKeepLocalBody")
            : isDriveProvider
              ? t("storageGoogleDriveConflictUseCloudBody")
              : t("storageConflictUseCloudBody")
        }
        warning={t("storageConflictWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={
          conflictResolution === "keep-local"
            ? t("storageKeepLocal")
            : isDriveProvider
              ? t("storageUseGoogleDrive")
              : t("storageUseCloud")
        }
        onCancel={() => setConflictResolution(null)}
        onConfirm={() => {
          const resolution = conflictResolution;
          if (resolution) {
            void resolveConflict(resolution);
          }
        }}
      />
    </>
  );
}

type StorageOptionProps = {
  active: boolean;
  action: React.ReactNode;
  body: string;
  icon: React.ReactNode;
  title: string;
  warning: string;
};

function StorageOption({ active, action, body, icon, title, warning }: StorageOptionProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-studio-lg border p-4 transition sm:p-5",
        active
          ? "border-ink bg-[#E2DAC2] shadow-soft"
          : "border-black/[0.06] bg-white/[0.72]"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            active ? "bg-ink text-white" : "bg-aqua text-ink"
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-black leading-tight">{title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted">{body}</p>
        </div>
      </div>
      <p className="mt-4 rounded-studio bg-coral/[0.09] p-3 text-xs font-bold leading-5 text-coral">
        {warning}
      </p>
      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </div>
  );
}
