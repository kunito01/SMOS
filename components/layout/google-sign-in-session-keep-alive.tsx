"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/app-providers";
import { preloadGoogleIdentity } from "@/lib/integrations/google-auth";
import {
  googleSignInTokenRefreshRetryMs,
  googleSignInTokenWatchdogIntervalMs,
  hasUsableGoogleSignInToken,
  maintainGoogleSignInSession,
  msUntilGoogleSignInTokenRefresh,
  readGoogleSignInSettings,
  shouldProactivelyRefreshGoogleSignInToken
} from "@/lib/integrations/google-signin";

/**
 * Headless: while a Google workspace stays open, refresh the sign-in access
 * token in the background before it expires so AuthGate never drops the user
 * to login for a routine hourly GIS expiry.
 */
export function GoogleSignInSessionKeepAlive() {
  const { user } = useAuth();
  const signsInWithGoogle = user?.accountKind === "google";

  useEffect(() => {
    if (!signsInWithGoogle) {
      return;
    }
    if (readGoogleSignInSettings().signedOut) {
      return;
    }

    let cancelled = false;
    let timer = 0;
    let watchdog = 0;

    const schedule = (delayMs: number) => {
      if (cancelled) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (cancelled) {
        return;
      }
      if (document.visibilityState !== "visible") {
        schedule(Math.min(msUntilGoogleSignInTokenRefresh() ?? 60_000, 60_000));
        return;
      }
      await maintainGoogleSignInSession();
      if (cancelled) {
        return;
      }
      const next = msUntilGoogleSignInTokenRefresh();
      schedule(next ?? googleSignInTokenRefreshRetryMs());
    };

    const runWatchdog = () => {
      if (
        cancelled ||
        document.visibilityState !== "visible" ||
        (!shouldProactivelyRefreshGoogleSignInToken() && hasUsableGoogleSignInToken())
      ) {
        return;
      }
      void maintainGoogleSignInSession();
    };

    void preloadGoogleIdentity().catch(() => undefined);

    const initialDelay = msUntilGoogleSignInTokenRefresh();
    if (initialDelay === 0 || shouldProactivelyRefreshGoogleSignInToken() || !hasUsableGoogleSignInToken()) {
      void tick();
    } else if (initialDelay !== null) {
      schedule(initialDelay);
    }

    watchdog = window.setInterval(runWatchdog, googleSignInTokenWatchdogIntervalMs());

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || cancelled) {
        return;
      }
      if (shouldProactivelyRefreshGoogleSignInToken() || !hasUsableGoogleSignInToken()) {
        void tick();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [signsInWithGoogle, user?.id]);

  return null;
}
