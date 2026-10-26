"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { authApi } from "@/lib/api";
import { LocalAuthError } from "@/lib/api/auth";
import { GoogleAuthError, preloadGoogleIdentity } from "@/lib/integrations/google-auth";
import {
  forgetGoogleSignInToken,
  rememberGoogleClientId,
  requestGoogleSignIn,
  resolveGoogleClientId
} from "@/lib/integrations/google-signin";
import {
  getWorkspaceStoragePreference,
  subscribeWorkspaceStoragePreferences,
  type WorkspaceStoragePreference
} from "@/lib/storage/storage-preferences";
import { readGoogleDriveSettings } from "@/lib/storage/google-drive/google-drive-client";
import { cn } from "@/lib/utils/cn";

type MigrateAppleToGoogleCardProps = {
  workspaceId: string;
  /** The archive page's view of the recovery key: only a saved key unlocks the switch. */
  recoveryKeyReady?: boolean;
};

type RecoveryState = Awaited<ReturnType<typeof authApi.getActiveAppleWorkspaceRecoveryState>>;

/** Drive must be the live, healthy storage before the Google wrap is written there. */
const isDriveSynced = (preference: WorkspaceStoragePreference) =>
  preference.provider === "gdrive" &&
  preference.status !== "conflict" &&
  preference.status !== "error" &&
  preference.status !== "account-mismatch";

const RECHECK_THROTTLE_MS = 2_000;

export function MigrateAppleToGoogleCard({ workspaceId, recoveryKeyReady }: MigrateAppleToGoogleCardProps) {
  const { t } = useI18n();
  const { user, commitAppleAccountUser } = useAuth();

  const [recoveryState, setRecoveryState] = useState<RecoveryState | "checking">("checking");
  const [existingGoogle, setExistingGoogle] = useState<{ email: string; name: string } | null>(() =>
    authApi.getGoogleAccountForWorkspace(workspaceId)
  );
  const [preference, setPreference] = useState<WorkspaceStoragePreference>(() =>
    getWorkspaceStoragePreference(workspaceId)
  );
  // The OAuth client id is shared with Calendar and Drive; the input only
  // appears when none of them has recorded one on this device yet.
  // The workspace's own Drive client comes first: another client would mean
  // another app data folder.
  const [storedClientId] = useState(
    () => readGoogleDriveSettings(workspaceId).clientId.trim() || resolveGoogleClientId()
  );
  const [clientIdDraft, setClientIdDraft] = useState(storedClientId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneEmail, setDoneEmail] = useState<string | null>(null);
  const lastRecheckAt = useRef(0);

  // Preflight: the recovery key is the user's way back in if Google ever
  // refuses, and Drive must already hold the workspace so the Google-wrapped
  // key lands next to data it can actually open.
  const runPreflight = useCallback(() => {
    let cancelled = false;
    setPreference(getWorkspaceStoragePreference(workspaceId));
    setExistingGoogle(authApi.getGoogleAccountForWorkspace(workspaceId));
    void authApi
      .getActiveAppleWorkspaceRecoveryState()
      .then((state) => {
        if (!cancelled) {
          setRecoveryState(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecoveryState("unknown");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    let cancelPending = runPreflight();
    const refresh = () => {
      cancelPending();
      cancelPending = runPreflight();
    };
    const onVisibility = () => {
      if (!document.hidden) {
        refresh();
      }
    };

    // Warm the sign-in script so the click can open the popup without waiting.
    void preloadGoogleIdentity().catch(() => undefined);

    const unsubscribe = subscribeWorkspaceStoragePreferences(refresh);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);

    return () => {
      cancelPending();
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [runPreflight]);

  // The archive page reports when the key is created and confirmed saved.
  useEffect(() => {
    const cancel = runPreflight();
    return cancel;
  }, [recoveryKeyReady, runPreflight]);

  // The recovery key is created further down this same page, which fires no
  // storage event. Re-check when the user comes back to this card.
  const recheckOnReturn = () => {
    const now = Date.now();
    if (now - lastRecheckAt.current < RECHECK_THROTTLE_MS) {
      return;
    }
    lastRecheckAt.current = now;
    runPreflight();
  };

  const hasRecoveryKey = recoveryState === "has-key" && recoveryKeyReady !== false;
  const driveReady = isDriveSynced(preference);
  const clientId = clientIdDraft.trim();
  const canMigrate = hasRecoveryKey && driveReady && Boolean(clientId) && !busy;

  const migrate = () => {
    if (!canMigrate) {
      return;
    }
    setBusy(true);
    setError("");
    rememberGoogleClientId(clientId);

    // The popup needs the click's user gesture: request the token before any await.
    const tokenRequest = requestGoogleSignIn({ clientId, mode: "interactive" });

    void (async () => {
      try {
        const token = await tokenRequest;
        const result = await authApi.migrateAppleAccountToGoogle({ token, clientId });
        commitAppleAccountUser(result.user);
        setDoneEmail(result.email);
        if (result.workspaceReplaced) {
          // The switch pulled a newer copy from Drive; reload so every page
          // shows it instead of what was on screen before.
          window.location.reload();
        }
      } catch (caught) {
        // A failed switch must not leave a Drive-capable token behind; the
        // next attempt opens Google's chooser again.
        forgetGoogleSignInToken();
        if (caught instanceof GoogleAuthError) {
          setError(t("loginGoogleCancelled"));
        } else if (caught instanceof LocalAuthError) {
          setError(`${t("migrateGoogleFailed")} (${caught.message})`);
        } else {
          setError(`${t("migrateGoogleFailed")} (${String(caught)})`);
        }
      } finally {
        setBusy(false);
      }
    })();
  };

  const isDone = doneEmail !== null || user?.accountKind === "google" || existingGoogle !== null;
  const doneAccountEmail =
    doneEmail ?? existingGoogle?.email ?? authApi.getStoredGoogleAccountSummary()?.email ?? user?.email ?? "";

  if (isDone) {
    return (
      <Card tone="glass" className="overflow-hidden bg-white/[0.76] p-5 sm:p-6">
        <SectionHeader eyebrow={t("loginGoogleTitle")} title={t("migrateGoogleTitle")} />
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-studio bg-limepop/20 p-4 text-sm font-black leading-6 text-[#566000]"
        >
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <div className="min-w-0">
            <p>{t("migrateGoogleDone")}</p>
            {doneAccountEmail ? (
              <p className="mt-1 truncate text-xs font-bold text-ink">{doneAccountEmail}</p>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  const blockers: string[] = [];
  if (recoveryState !== "checking" && !hasRecoveryKey) {
    blockers.push(t("migrateGoogleRequiresKey"));
  }
  if (!driveReady) {
    blockers.push(t("migrateGoogleRequiresDrive"));
  }

  return (
    <Card
      tone="glass"
      className="overflow-hidden bg-white/[0.76] p-5 sm:p-6"
      onPointerEnter={recheckOnReturn}
      onFocusCapture={recheckOnReturn}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.44fr)]">
        <div className="min-w-0">
          <SectionHeader eyebrow={t("loginGoogleTitle")} title={t("migrateGoogleTitle")} />
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-muted">
            {t("migrateGoogleBody")}
          </p>
          <p className="mt-3 flex max-w-3xl items-start gap-2 text-xs font-bold leading-5 text-muted">
            <ShieldAlert className="mt-0.5 shrink-0" size={15} />
            <span>{t("migrateGoogleTrustNote")}</span>
          </p>
        </div>

        <div className="grid min-h-12 content-center justify-stretch gap-3 rounded-studio bg-white p-3 shadow-sm ring-1 ring-black/[0.05]">
          {blockers.length > 0 ? (
            <div className="grid gap-2">
              {blockers.map((message) => (
                <p
                  key={message}
                  className="flex items-start gap-2 rounded-studio bg-coral/10 p-3 text-xs font-black leading-5 text-coral"
                >
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                  <span>{message}</span>
                </p>
              ))}
            </div>
          ) : recoveryState === "checking" ? (
            <p className="text-center text-xs font-black text-muted">{t("loading")}</p>
          ) : null}

          {!storedClientId ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-muted">
                  {t("googleCalendarClientIdLabel")}
                </span>
                <input
                  value={clientIdDraft}
                  onChange={(event) => setClientIdDraft(event.target.value)}
                  placeholder="xxxxxxxx.apps.googleusercontent.com"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={busy}
                  className="h-11 w-full rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                />
              </label>
              <p className="text-[0.66rem] font-bold leading-5 text-muted">
                {t("loginGoogleClientIdHint")}
              </p>
            </div>
          ) : null}

          <Button
            variant="secondary"
            size="md"
            disabled={!canMigrate}
            onClick={migrate}
            className="w-full"
          >
            <ArrowLeftRight className={cn(busy && "animate-pulse")} size={17} />
            {busy ? t("saving") : t("migrateGoogleTitle")}
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-studio bg-coral/12 p-3 text-sm font-black text-coral">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
