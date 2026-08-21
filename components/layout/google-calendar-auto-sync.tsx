"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/app-providers";
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
  }, [workspaceId]);

  return null;
}
