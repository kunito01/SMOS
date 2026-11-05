"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/app-providers";
import { bindGoogleServicesFromSignIn } from "@/lib/integrations/google-services";
import { readGoogleSignInToken } from "@/lib/integrations/google-signin";
import {
  DATABASE_PERSISTED_EVENT,
  hasGoogleAccessToken,
  isGoogleCalendarConnected,
  preloadGoogleIdentity,
  readGoogleCalendarSettings,
  syncGoogleCalendar
} from "@/lib/integrations/google-calendar";

/**
 * Headless: a Google sign-in binds Calendar without another popup, and every
 * persisted save schedules a debounced push. Pushes only happen while a token
 * is cached; after it expires the card asks for one click, which also flushes
 * the backlog. A timeout does not clear the binding.
 */
export function GoogleCalendarAutoSync() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId;
  const signsInWithGoogle = user?.accountKind === "google";

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    const settings = readGoogleCalendarSettings(workspaceId);
    if (isGoogleCalendarConnected(settings)) {
      // Keep the sign-in script warm so a reconnect click can open the popup immediately.
      void preloadGoogleIdentity().catch(() => undefined);
    }

    let timer = 0;
    let cancelled = false;
    const schedule = (delay: number) => {
      const current = readGoogleCalendarSettings(workspaceId);
      if (!current.autoSync || !isGoogleCalendarConnected(current) || !navigator.onLine) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!cancelled) {
          void syncGoogleCalendar(workspaceId, { mode: "silent" });
        }
      }, delay);
    };

    // Restore Drive and Calendar from the sign-in token. This never opens a
    // popup: interactive consent already happened at sign-in. A timeout keeps
    // a binding that was already stored and retries on the next launch.
    const initiallyConnected = isGoogleCalendarConnected(settings);
    if (signsInWithGoogle) {
      const token = readGoogleSignInToken();
      if (token) {
        void bindGoogleServicesFromSignIn(workspaceId, token).finally(() => {
          if (!cancelled && !initiallyConnected) {
            schedule(500);
          }
        });
      }
    }

    const onPersisted = () => schedule(4_000);

    window.addEventListener(DATABASE_PERSISTED_EVENT, onPersisted);
    // Catch up on anything edited while the token was missing or on another device.
    if (hasGoogleAccessToken(workspaceId)) {
      schedule(2_500);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(DATABASE_PERSISTED_EVENT, onPersisted);
    };
  }, [signsInWithGoogle, workspaceId]);

  return null;
}
