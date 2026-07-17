"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Cloud, LoaderCircle, ShieldCheck } from "lucide-react";
import { useCloudKitAuth } from "@/components/providers/cloudkit-auth-provider";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { useCloudKitAccountDisplay } from "@/components/storage/use-cloudkit-account-display";
import { Button } from "@/components/ui/button";
import {
  CLOUDKIT_SIGN_IN_BUTTON_ID,
  CLOUDKIT_SIGN_OUT_BUTTON_ID,
  type CloudKitUserIdentity
} from "@/lib/storage/cloudkit/cloudkit-client";
import { cn } from "@/lib/utils/cn";

type AppleAccountFlow =
  | { phase: "idle" }
  | { phase: "resolving" }
  | { phase: "needs-setup"; suggestedName: string }
  | { phase: "error"; message: string };

export function AppleCloudKitLoginPanel() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    commitAppleAccountUser,
    inspectAppleAccount,
    provisionAppleAccount,
    signOut,
    unlockAppleAccountOffline,
    user
  } = useAuth();
  const {
    configured,
    error: cloudKitError,
    identity,
    noteSignInStarted,
    phase: cloudKitPhase,
    refresh
  } = useCloudKitAuth();
  const { account, accountTag } = useCloudKitAccountDisplay(identity);
  const [flow, setFlow] = useState<AppleAccountFlow>({ phase: "idle" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolvedIdentityRef = useRef<string | null>(null);
  const currentIdentityKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);

  const resolveIdentity = useCallback(async (
    appleIdentity: CloudKitUserIdentity,
    force = false
  ) => {
    const identityKey = appleIdentity.userRecordName;
    if (!force && resolvedIdentityRef.current === identityKey) {
      return;
    }

    const requestSequence = ++requestSequenceRef.current;
    resolvedIdentityRef.current = identityKey;
    setActionError(null);
    setFlow({ phase: "resolving" });
    try {
      const resolution = await inspectAppleAccount(appleIdentity);
      if (
        requestSequence !== requestSequenceRef.current ||
        currentIdentityKeyRef.current !== identityKey
      ) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[apple-auth] panel: stale inspect result discarded", {
            expectedSequence: requestSequence,
            currentSequence: requestSequenceRef.current
          });
        }
        return;
      }
      if (process.env.NODE_ENV === "development") {
        console.debug(`[apple-auth] panel: resolution ${resolution.kind}`);
      }
      if (resolution.kind === "ready") {
        commitAppleAccountUser(resolution.user);
        router.replace("/dashboard");
        return;
      }
      setName(resolution.suggestedName);
      setFlow({ phase: "needs-setup", suggestedName: resolution.suggestedName });
    } catch (error) {
      const detail =
        error instanceof Error
          ? `${(error as { code?: string }).code ?? error.name}: ${error.message}`
          : String(error);
      console.warn("[apple-auth] inspect failed:", detail);
      if (
        requestSequence === requestSequenceRef.current &&
        currentIdentityKeyRef.current === identityKey
      ) {
        setFlow({ phase: "error", message: t("loginAppleSetupFailed") });
      }
    }
  }, [commitAppleAccountUser, inspectAppleAccount, router, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const offlineUnlockAttemptedRef = useRef(false);

  useEffect(() => {
    // A joined device may enter its Apple-backed workspace while CloudKit is
    // unreachable. This runs only for connectivity failures (phase "error");
    // an online signed-out answer still requires a fresh Apple sign-in.
    if (cloudKitPhase !== "error") {
      offlineUnlockAttemptedRef.current = false;
      return;
    }
    if (offlineUnlockAttemptedRef.current || identity || user) {
      return;
    }
    offlineUnlockAttemptedRef.current = true;

    void unlockAppleAccountOffline()
      .then((result) => {
        // A non-null result means the local session is already active, so it
        // must reach React state even if this effect re-ran in the meantime.
        if (result) {
          commitAppleAccountUser(result.user);
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        // The regular error message stays visible; online sign-in remains
        // available as soon as connectivity returns.
      });
  }, [cloudKitPhase, commitAppleAccountUser, identity, router, unlockAppleAccountOffline, user]);

  useEffect(() => {
    const identityKey = identity?.userRecordName ?? null;
    if (currentIdentityKeyRef.current === identityKey) {
      return;
    }

    requestSequenceRef.current += 1;
    currentIdentityKeyRef.current = identityKey;
    setActionError(null);
    if (!identity) {
      resolvedIdentityRef.current = null;
      setFlow({ phase: "idle" });
      setBusy(false);
      return;
    }
    void resolveIdentity(identity);
  }, [identity, resolveIdentity]);

  const completeSetup = async () => {
    if (!identity || busy || !name.trim()) {
      return;
    }
    const identityKey = identity.userRecordName;
    if (currentIdentityKeyRef.current !== identityKey) {
      return;
    }
    const requestSequence = ++requestSequenceRef.current;
    setBusy(true);
    setActionError(null);
    try {
      const result = await provisionAppleAccount({ identity, name });
      if (
        requestSequence !== requestSequenceRef.current ||
        currentIdentityKeyRef.current !== identityKey
      ) {
        await signOut();
        return;
      }
      commitAppleAccountUser(result.user);
      router.replace("/dashboard");
    } catch {
      if (
        requestSequence === requestSequenceRef.current &&
        currentIdentityKeyRef.current === identityKey
      ) {
        setActionError(t("loginAppleSetupFailed"));
      }
    } finally {
      if (
        requestSequence === requestSequenceRef.current &&
        currentIdentityKeyRef.current === identityKey
      ) {
        setBusy(false);
      }
    }
  };

  const isChecking = cloudKitPhase === "checking" || cloudKitPhase === "signing-in";
  const isResolving = flow.phase === "resolving";
  const displayedError =
    flow.phase === "error"
      ? flow.message
      : actionError ?? (cloudKitError ? t("storageSyncFailed") : null);

  return (
    <section className="mt-5 overflow-hidden rounded-studio-lg bg-[#1c2328] text-white shadow-soft ring-1 ring-black/10">
      <div className="flex items-start gap-3 border-b border-white/10 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-aqua text-ink">
          <Cloud size={19} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-black">{t("loginAppleTitle")}</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-white/62">
            {t("loginAppleBody")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        {!configured ? (
          <p role="alert" className="rounded-studio bg-coral/16 p-3 text-sm font-black text-[#ffb7a8]">
            {t("storageCloudKitUnavailable")}
          </p>
        ) : null}

        <div
          data-cloudkit-auth-shell="sign-in"
          className={cn(
            "grid min-h-11 place-items-center [&_.apple-auth-button]:!rounded-full",
            identity && "hidden"
          )}
          onClickCapture={() => {
            noteSignInStarted();
          }}
        >
          <div id={CLOUDKIT_SIGN_IN_BUTTON_ID} />
          {isChecking ? (
            <span className="flex items-center gap-2 py-2 text-xs font-black text-white/60">
              <LoaderCircle className="animate-spin" size={16} />
              {t("loading")}
            </span>
          ) : null}
        </div>

        {identity ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-studio bg-white/[0.07] p-4 ring-1 ring-white/10"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-limepop text-ink">
                <Check size={17} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-white/52">
                  {t("storageCloudKitConnected")}
                </p>
                <p className="mt-1 truncate text-sm font-black">
                  {account?.displayName ?? account?.maskedEmailAddress ?? t("storageCloudKitAccountTitle")}
                </p>
                {account?.maskedEmailAddress && account.displayName ? (
                  <p className="mt-1 truncate text-xs font-bold text-white/55">
                    {account.maskedEmailAddress}
                  </p>
                ) : null}
                {accountTag ? (
                  <code className="mt-2 block whitespace-nowrap text-xs font-black text-white/60">
                    {accountTag}
                  </code>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div
          aria-hidden={!identity}
          className={cn(
            "mt-3 grid gap-2 [&_.apple-auth-button]:!rounded-full",
            !identity && "hidden",
            busy && "pointer-events-none opacity-50"
          )}
        >
          <p className="text-center text-[0.68rem] font-bold text-white/50">
            {t("storageCloudKitSignOut")}
          </p>
          <div className="flex justify-center">
            <div id={CLOUDKIT_SIGN_OUT_BUTTON_ID} />
          </div>
        </div>

        {isResolving ? (
          <p role="status" className="flex items-center justify-center gap-2 rounded-studio bg-white/[0.06] p-4 text-sm font-black text-white/72">
            <LoaderCircle className="animate-spin" size={18} />
            {t("loading")}
          </p>
        ) : null}

        {flow.phase === "needs-setup" ? (
          <div className="rounded-studio-lg bg-[#f4f0e8] p-4 text-ink">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0" size={22} />
              <div>
                <h4 className="text-base font-black">{t("loginAppleFirstTimeTitle")}</h4>
                <p className="mt-1 text-xs font-bold leading-5 text-muted">
                  {t("loginAppleFirstTimeBody")}
                </p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black">{t("loginAppleNameLabel")}</span>
              <input
                value={name}
                maxLength={80}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                placeholder={t("loginAppleNamePlaceholder")}
                className="h-12 w-full rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-coral"
              />
            </label>
            <Button
              type="button"
              size="lg"
              className="mt-4 w-full"
              disabled={busy || !name.trim()}
              onClick={() => void completeSetup()}
            >
              {busy ? t("saving") : t("loginAppleContinue")}
              <ArrowRight size={18} />
            </Button>
          </div>
        ) : null}

        {displayedError ? (
          <div className="rounded-studio bg-coral/16 p-3 text-sm font-black text-[#ffb7a8]">
            <p role="alert">{displayedError}</p>
            {identity && flow.phase === "error" ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="mt-3 w-full bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={() => void resolveIdentity(identity, true)}
              >
                {t("loginAppleRetry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
