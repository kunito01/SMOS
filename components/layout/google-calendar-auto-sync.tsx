"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/app-providers";
import { adoptVerifiedSignInTokenForCalendar } from "@/lib/integrations/google-services";
import { getWorkspaceStoragePreference } from "@/lib/storage/storage-preferences";
import {
  DATABASE_PERSISTED_EVENT,
  hasGoogleAccessToken,
  isGoogleCalendarConnected,
  preloadGoogleIdentity,
  readGoogleCalendarSettings,
  syncGoogleCalendar
} from "@/lib/integrations/google-calendar";

/**
 * Headless: once a workspace is connected to Google Calendar, every persisted
 * save schedules a debounced push. Pushes only happen while a token is cached;
 * after it expires the card asks for one click, which also flushes the backlog.
 */
export function GoogleCalendarAutoSync() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId;
  const signsInWithGoogle = user?.accountKind === "google";

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    // Google accounts: Calendar rides on the sign-in. Adopt its token and,
    // the first time, bind the "Studio Map OS" calendar without a popup (the
    // token is cached, so interactive mode does not open any Google UI).
    if (signsInWithGoogle && adoptVerifiedSignInTokenForCalendar(workspaceId)) {
      const current = readGoogleCalendarSettings(workspaceId);
      // While a storage conflict blocks writes the binding cannot be saved;
      // binding then would only leave an orphan calendar behind.
      const writable = getWorkspaceStoragePreference(workspaceId).status !== "conflict";
      if (writable && !current.pushDisabled && !isGoogleCalendarConnected(current)) {
        void syncGoogleCalendar(workspaceId, { mode: "interactive" });
      }
    }

    const settings = readGoogleCalendarSettings(workspaceId);
    if (isGoogleCalendarConnected(settings)) {
      // Keep the sign-in script warm so a reconnect click can open the popup immediately.
      void preloadGoogleIdentity().catch(() => undefined);
    }

    let timer = 0;
    const schedule = (delay: number) => {
      const current = readGoogleCalendarSettings(workspaceId);
      if (!current.autoSync || !isGoogleCalendarConnected(current) || !navigator.onLine) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void syncGoogleCalendar(workspaceId, { mode: "silent" });
      }, delay);
    };
    const onPersisted = () => schedule(4_000);

    window.addEventListener(DATABASE_PERSISTED_EVENT, onPersisted);
    // Catch up on anything edited while the token was missing or on another device.
    if (hasGoogleAccessToken(workspaceId)) {
      schedule(2_500);
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DATABASE_PERSISTED_EVENT, onPersisted);
    };
  }, [signsInWithGoogle, workspaceId]);

  return null;
}
