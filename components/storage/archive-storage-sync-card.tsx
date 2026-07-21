"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  HardDrive,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { useCloudKitAuth } from "@/components/providers/cloudkit-auth-provider";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { useCloudKitAccountDisplay } from "@/components/storage/use-cloudkit-account-display";
import { authApi } from "@/lib/api";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import {
  CLOUDKIT_SIGN_IN_BUTTON_ID,
  CLOUDKIT_SIGN_OUT_BUTTON_ID
} from "@/lib/storage/cloudkit/cloudkit-client";
import {
  getWorkspaceCloudSyncAvailability,
  type WorkspaceConflictResolution,
  type WorkspaceSyncResult
} from "@/lib/storage/workspace-sync-coordinator";
import {
  getWorkspaceStoragePreference,
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
  const isAppleAccount = Boolean(user?.isAppleAccount);
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

  const refreshPreference = useCallback(() => {
    const next = getWorkspaceStoragePreference(workspaceId);
    setPreference(next);
    return next;
  }, [workspaceId]);

  useEffect(() => {
    setPreference(getWorkspaceStoragePreference(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (availability.available) {
      void refreshCloudKitAuth();
    }
  }, [availability.available, refreshCloudKitAuth]);

  const finishSyncResult = useCallback(
    async (result: WorkspaceSyncResult, successMessage: string) => {
      setPreference(result.preference);
      if (result.outcome === "auth-required") {
        void refreshCloudKitAuth();
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
            ? t("storageCloudKitSignInRequired")
            : result.outcome === "account-mismatch"
              ? t("storageCloudKitAccountMismatch")
            : result.preference.lastError || t("storageSyncFailed"),
        tone: "error"
      });
      return false;
    },
    [refreshCloudKitAuth, t]
  );

  const switchProvider = useCallback(
    async (target: WorkspaceStorageProvider) => {
      setBusy("switch");
      setNotice(null);

      try {
        if (target === "indexeddb") {
          const next = await authApi.disconnectActiveWorkspaceCloudKit();
          setPreference(next);
          setNotice({ message: t("storageSwitchSuccess"), tone: "success" });
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

        const result = await authApi.connectActiveWorkspaceCloudKit(user);
        const synced = await finishSyncResult(result, t("storageSwitchSuccess"));
        if (!synced) {
          refreshPreference();
        }
      } catch {
        refreshPreference();
        setNotice({ message: t("storageSyncFailed"), tone: "error" });
      } finally {
        setBusy(null);
      }
    },
    [availability.available, cloudKitIdentity, finishSyncResult, refreshCloudKitAuth, refreshPreference, t]
  );

  const syncNow = async () => {
    setBusy("sync");
    setNotice(null);

    try {
      await finishSyncResult(
        await authApi.syncActiveWorkspaceCloud(cloudKitIdentity ?? undefined),
        t("storageSyncSuccess")
      );
    } catch {
      refreshPreference();
      setNotice({ message: t("storageSyncFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const resolveConflict = useCallback(
    async (resolution: WorkspaceConflictResolution) => {
      setBusy("resolve");
      setNotice(null);

      try {
        const resolved = await finishSyncResult(
          await authApi.resolveActiveWorkspaceCloudConflict(
            resolution,
            cloudKitIdentity ?? undefined
          ),
          t("storageSyncSuccess")
        );
        if (!resolved) {
          refreshPreference();
        }
      } catch {
        refreshPreference();
        setNotice({ message: t("storageSyncFailed"), tone: "error" });
      } finally {
        setBusy(null);
        setConflictResolution(null);
      }
    },
    [cloudKitIdentity, finishSyncResult, refreshPreference, t]
  );

  const providerTitle =
    preference.provider === "cloudkit"
      ? t("storageCloudKitTitle")
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
    if (!availability.available) {
      return { label: t("storageCloudKitUnavailable"), tone: "error" as const };
    }
    if (
      busy === "sync" ||
      busy === "switch" ||
      busy === "resolve" ||
      preference.status === "syncing"
    ) {
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
    if (preference.status === "conflict" || preference.status === "error") {
      return {
        label: preference.lastError || t("storageSyncFailed"),
        tone: "error" as const
      };
    }
    if (preference.pendingUpload || preference.status === "pending") {
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
                {preference.provider === "cloudkit" ? <Cloud size={20} /> : <HardDrive size={20} />}
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
              preference.provider === "cloudkit" ? (
                isAppleAccount ? (
                  <p className="rounded-studio bg-ink/[0.06] p-3 text-xs font-bold leading-5 text-muted">
                    {t("storageAppleAlwaysCloud")}
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
                    {t("storageCloudKitDisconnect")}
                  </Button>
                )
              ) : null
            }
          />
        </div>

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
                  {preference.provider !== "cloudkit" ? (
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
                  {preference.provider !== "cloudkit" ? (
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
        title={t("storageConflictTitle")}
        description={
          conflictResolution === "keep-local"
            ? t("storageConflictKeepLocalBody")
            : t("storageConflictUseCloudBody")
        }
        warning={t("storageConflictWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={
          conflictResolution === "keep-local"
            ? t("storageKeepLocal")
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
