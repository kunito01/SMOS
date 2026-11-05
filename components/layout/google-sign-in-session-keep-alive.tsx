"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/app-providers";
import { preloadGoogleIdentity } from "@/lib/integrations/google-auth";
import {
  googleSignInTokenRefreshRetryMs,
  hasUsableGoogleSignInToken,
  msUntilGoogleSignInTokenRefresh,
  readGoogleSignInSettings,
  refreshGoogleSignInTokenSilently
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
        schedule(msUntilGoogleSignInTokenRefresh() ?? googleSignInTokenRefreshRetryMs());
        return;
      }
      await refreshGoogleSignInTokenSilently();
      if (cancelled) {
        return;
      }
      const next = msUntilGoogleSignInTokenRefresh();
      schedule(next ?? googleSignInTokenRefreshRetryMs());
    };

    void preloadGoogleIdentity().catch(() => undefined);

    const initialDelay = msUntilGoogleSignInTokenRefresh();
    if (initialDelay === 0 || !hasUsableGoogleSignInToken()) {
      void tick();
    } else if (initialDelay !== null) {
      schedule(initialDelay);
    }

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || cancelled) {
        return;
      }
      if (!hasUsableGoogleSignInToken()) {
        void tick();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [signsInWithGoogle, user?.id]);

  return null;
}
