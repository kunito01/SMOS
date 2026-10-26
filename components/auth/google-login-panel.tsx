"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LogIn, ShieldCheck } from "lucide-react";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";
import { LocalAuthError, type LocalAuthUser } from "@/lib/api/auth";
import { GoogleAuthError, preloadGoogleIdentity } from "@/lib/integrations/google-auth";
import {
  forgetGoogleSignInToken,
  hasUsableGoogleSignInToken,
  rememberGoogleClientId,
  requestGoogleSignIn,
  resolveGoogleClientId
} from "@/lib/integrations/google-signin";

type GoogleLoginFlow =
  | { phase: "idle" }
  | { phase: "needs-setup"; email: string };

type KnownGoogleAccount = { email: string; name: string };

const GOOGLE_CLIENT_ID_PLACEHOLDER = "xxxxxxxx.apps.googleusercontent.com";

export function GoogleLoginPanel() {
  const router = useRouter();
  const { t } = useI18n();
  const { commitAppleAccountUser, signInWithGoogle, unlockGoogleAccountLocally, user } = useAuth();
  const [flow, setFlow] = useState<GoogleLoginFlow>({ phase: "idle" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // `null` until the browser-only lookup ran, so the client-id input never
  // flashes during server rendering and disappears a frame later.
  const [storedClientId, setStoredClientId] = useState<string | null>(null);
  const [clientIdInput, setClientIdInput] = useState("");
  const [knownAccount, setKnownAccount] = useState<KnownGoogleAccount | null>(null);
  const requestSequenceRef = useRef(0);
  const autoUnlockAttemptedRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const describeError = (error: unknown) => {
    if (error instanceof GoogleAuthError) {
      return t("loginGoogleCancelled");
    }
    if (error instanceof LocalAuthError) {
      if (error.code === "STORAGE_CORRUPT") {
        return t("loginRestoreRequired");
      }
      if (error.code === "CLOUD_AUTH_REQUIRED") {
        return t("loginCloudReconnectRequired");
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    return `${t("loginGoogleFailed")} (${message})`;
  };

  const logFailure = (stage: string, error: unknown) => {
    // Codes and messages only; token values never reach the console.
    const detail =
      error instanceof Error
        ? `${(error as { code?: string }).code ?? error.name}: ${error.message}`
        : String(error);
    console.warn(`[google-auth] ${stage} failed:`, detail);
  };

  useEffect(() => {
    void preloadGoogleIdentity().catch(() => undefined);
    setStoredClientId(resolveGoogleClientId());
    setKnownAccount(authApi.getStoredGoogleAccountSummary());
  }, []);

  useEffect(() => {
    // A device that already holds this Google workspace enters it without a
    // popup when a usable sign-in token is cached. Runs once per mount.
    if (autoUnlockAttemptedRef.current || user) {
      return;
    }
    autoUnlockAttemptedRef.current = true;
    // Without a live token the silent entry cannot start sync; the stored
    // account is served by the "continue on this device" button instead.
    if (!hasUsableGoogleSignInToken()) {
      return;
    }

    const requestSequence = ++requestSequenceRef.current;
    setBusy(true);
    void unlockGoogleAccountLocally({ allowWithoutToken: false })
      .then((result: { user: LocalAuthUser } | null) => {
        if (requestSequence !== requestSequenceRef.current || userRef.current) {
          return;
        }
        if (result) {
          commitAppleAccountUser(result.user);
          router.replace("/dashboard");
        }
      })
      .catch((error: unknown) => {
        // The interactive button stays available; a silent entry is best effort.
        logFailure("local unlock", error);
      })
      .finally(() => {
        if (requestSequence === requestSequenceRef.current) {
          setBusy(false);
        }
      });
  }, [commitAppleAccountUser, router, unlockGoogleAccountLocally, user]);

  const effectiveClientId = (storedClientId || clientIdInput).trim();

  const startGoogleSignIn = async (clientId: string) => {
    // Google's popup only opens inside the user gesture, so the token request
    // is issued before anything awaits.
    const tokenRequest = requestGoogleSignIn({ clientId, mode: "interactive" });
    rememberGoogleClientId(clientId);
    const requestSequence = ++requestSequenceRef.current;
    setBusy(true);
    setActionError(null);
    setFlow({ phase: "idle" });
    try {
      const token = await tokenRequest;
      const resolution = await signInWithGoogle({ token, clientId });
      if (requestSequence !== requestSequenceRef.current || userRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[google-auth] panel: stale sign-in result discarded", {
            expectedSequence: requestSequence,
            currentSequence: requestSequenceRef.current
          });
        }
        return;
      }
      if (resolution.kind === "ready") {
        commitAppleAccountUser(resolution.user);
        router.replace("/dashboard");
        return;
      }
      // Drop the token so the next click opens Google's chooser again: the
      // user may simply have picked the wrong account.
      forgetGoogleSignInToken();
      setFlow({ phase: "needs-setup", email: resolution.email });
    } catch (error) {
      logFailure("sign-in", error);
      if (!(error instanceof GoogleAuthError)) {
        forgetGoogleSignInToken();
      }
      if (requestSequence === requestSequenceRef.current) {
        setActionError(describeError(error));
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setBusy(false);
      }
    }
  };

  const continueOnDevice = async () => {
    const requestSequence = ++requestSequenceRef.current;
    setBusy(true);
    setActionError(null);
    setFlow({ phase: "idle" });
    try {
      const result = await unlockGoogleAccountLocally({ allowWithoutToken: true });
      if (requestSequence !== requestSequenceRef.current || userRef.current) {
        return;
      }
      if (!result) {
        setActionError(t("loginGoogleContinueUnavailable"));
        return;
      }
      commitAppleAccountUser(result.user);
      router.replace("/dashboard");
    } catch (error) {
      logFailure("continue on device", error);
      if (requestSequence === requestSequenceRef.current) {
        setActionError(describeError(error));
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setBusy(false);
      }
    }
  };

  const needsClientIdInput = storedClientId === "";
  const canSignIn = !busy && effectiveClientId.length > 0;

  return (
    <section className="mt-5 overflow-hidden rounded-studio-lg bg-[#1c2328] text-white shadow-soft ring-1 ring-black/10">
      <div className="flex items-start gap-3 border-b border-white/10 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-limepop text-ink">
          <LogIn size={19} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-black">{t("loginGoogleTitle")}</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-white/62">
            {t("loginGoogleBody")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        {needsClientIdInput ? (
          <label className="block">
            <span className="mb-2 block text-xs font-black text-white/68">
              {t("googleCalendarClientIdLabel")}
            </span>
            <input
              type="text"
              value={clientIdInput}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => {
                setClientIdInput(event.target.value);
                setActionError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSignIn) {
                  event.preventDefault();
                  void startGoogleSignIn(effectiveClientId);
                }
              }}
              placeholder={GOOGLE_CLIENT_ID_PLACEHOLDER}
              className="h-12 w-full rounded-full border-0 bg-white/[0.08] px-4 text-sm font-bold text-white outline-none ring-1 ring-white/12 transition placeholder:text-white/35 focus:ring-2 focus:ring-limepop disabled:opacity-50"
            />
            <span className="mt-2 block text-[0.68rem] font-bold leading-5 text-white/50">
              {t("loginGoogleClientIdHint")}
            </span>
          </label>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!canSignIn}
          onClick={() => {
            if (canSignIn) {
              void startGoogleSignIn(effectiveClientId);
            }
          }}
        >
          {busy ? (
            <>
              <LoaderCircle className="animate-spin" size={18} />
              {t("loading")}
            </>
          ) : (
            <>
              {t("loginGoogleButton")}
              <ArrowRight size={18} />
            </>
          )}
        </Button>

        {knownAccount ? (
          <div className="rounded-studio bg-white/[0.07] p-4 ring-1 ring-white/10">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-white/52">
              {t("loginGoogleKnownAccount")}
            </p>
            <p className="mt-1 truncate text-sm font-black">{knownAccount.email}</p>
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="mt-3 w-full bg-white/10 text-white hover:bg-white/15 hover:text-white"
              disabled={busy}
              onClick={() => void continueOnDevice()}
            >
              {busy ? t("loading") : t("loginGoogleContinueOnDevice")}
            </Button>
          </div>
        ) : null}

        {flow.phase === "needs-setup" ? (
          <div role="status" className="rounded-studio-lg bg-[#f4f0e8] p-4 text-ink">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0" size={22} />
              <div>
                <h4 className="text-base font-black">{t("loginGoogleNoWorkspaceTitle")}</h4>
                {flow.email ? (
                  <p className="mt-1 truncate text-xs font-black text-ink">{flow.email}</p>
                ) : null}
                <p className="mt-1 text-xs font-bold leading-5 text-muted">
                  {t("loginGoogleNoWorkspaceBody")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {actionError ? (
          <div className="rounded-studio bg-coral/16 p-3 text-sm font-black text-[#ffb7a8]">
            <p role="alert">{actionError}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
