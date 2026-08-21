"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Link2, RefreshCw, Unplug } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleCalendarLinkForClient,
  getGoogleCalendarStatus,
  hasGoogleAccessToken,
  isGoogleCalendarConnected,
  preloadGoogleIdentity,
  readGoogleCalendarSettings,
  subscribeGoogleCalendarStatus,
  syncGoogleCalendar,
  writeGoogleCalendarSettings,
  type GoogleCalendarStatus
} from "@/lib/integrations/google-calendar";
import { cn } from "@/lib/utils/cn";

type GoogleCalendarSyncCardProps = {
  workspaceId: string;
};

export function GoogleCalendarSyncCard({ workspaceId }: GoogleCalendarSyncCardProps) {
  const { language, t } = useI18n();
  const [settings, setSettings] = useState(() => readGoogleCalendarSettings(workspaceId));
  const [clientIdDraft, setClientIdDraft] = useState(settings.clientId);
  const [status, setStatus] = useState<GoogleCalendarStatus>(() => getGoogleCalendarStatus());
  const [hasToken, setHasToken] = useState(() => hasGoogleAccessToken(workspaceId));
  const [boundElsewhere, setBoundElsewhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = readGoogleCalendarSettings(workspaceId);
    setSettings(next);
    setClientIdDraft(next.clientId);
    setHasToken(hasGoogleAccessToken(workspaceId));
    // Warm the sign-in script so the Connect / Reconnect click opens the popup without waiting.
    void preloadGoogleIdentity().catch(() => undefined);
  }, [workspaceId]);

  useEffect(
    () =>
      subscribeGoogleCalendarStatus((nextStatus) => {
        setStatus(nextStatus);
        setSettings(readGoogleCalendarSettings(workspaceId));
        setHasToken(hasGoogleAccessToken(workspaceId));
      }),
    [workspaceId]
  );

  const connected = isGoogleCalendarConnected(settings);

  useEffect(() => {
    if (connected) {
      setBoundElsewhere(false);
      return;
    }
    let cancelled = false;
    void getGoogleCalendarLinkForClient(clientIdDraft.trim())
      .then((link) => {
        if (!cancelled) {
          setBoundElsewhere(Boolean(link));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clientIdDraft, connected, workspaceId]);

  const eventCount = status.eventCount ?? Object.keys(settings.syncedEvents).length;
  const needsReconnect = connected && (status.state === "reconnect" || !hasToken);

  const run = async (action: () => Promise<GoogleCalendarStatus | void>) => {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (result && (result.state === "error" || result.state === "reconnect") && result.message) {
        setError(result.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSettings(readGoogleCalendarSettings(workspaceId));
      setHasToken(hasGoogleAccessToken(workspaceId));
      setBusy(false);
    }
  };

  const connect = () => run(() => connectGoogleCalendar(workspaceId, clientIdDraft));
  const syncNow = () => run(() => syncGoogleCalendar(workspaceId, { mode: "interactive" }));
  const disconnect = () => run(() => disconnectGoogleCalendar(workspaceId));

  const statusLabel = (() => {
    if (!connected) {
      return t("googleCalendarStatusIdle");
    }
    switch (status.state) {
      case "syncing":
        return t("googleCalendarStatusSyncing");
      case "error":
        return t("googleCalendarStatusError").replace("{message}", status.message ?? "");
      default:
        return needsReconnect
          ? t("googleCalendarStatusReconnect")
          : t("googleCalendarStatusSynced").replace("{count}", String(eventCount));
    }
  })();
  const statusTone = !connected
    ? "bg-ink/[0.06] text-muted"
    : status.state === "error"
      ? "bg-coral/15 text-coral"
      : status.state === "syncing"
        ? "bg-aqua/60 text-ink"
        : needsReconnect
          ? "bg-[#ffc700]/40 text-ink"
          : "bg-[#97EECE] text-[#12263A]";

  return (
    <Card tone="glass" className="overflow-hidden bg-white/[0.76] p-5 sm:p-6">
      <SectionHeader eyebrow={t("googleCalendarEyebrow")} title={t("googleCalendarTitle")} />
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">{t("googleCalendarBody")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-black", statusTone)}>
          <CalendarDays size={14} />
          {statusLabel}
        </span>
        {connected ? (
          <span className="text-xs font-bold text-muted">{t("googleCalendarTarget").replace("{name}", "Studio Map OS")}</span>
        ) : null}
        {connected && settings.lastSyncAt ? (
          <span className="text-xs font-bold text-muted">
            {t("googleCalendarLastSync").replace(
              "{time}",
              formatLocalizedDate(settings.lastSyncAt, language, { dateStyle: "medium", timeStyle: "short" })
            )}
          </span>
        ) : null}
      </div>

      {!connected ? (
        <div className="mt-4 grid gap-2">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-muted">{t("googleCalendarClientIdLabel")}</span>
            <input
              value={clientIdDraft}
              onChange={(event) => setClientIdDraft(event.target.value)}
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              spellCheck={false}
              autoComplete="off"
              className="h-11 w-full rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06] focus:ring-coral"
            />
          </label>
          <p className="text-xs font-bold leading-5 text-muted">
            {boundElsewhere ? t("googleCalendarBoundElsewhere") : t("googleCalendarClientIdHint")}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => void syncNow()}>
              <RefreshCw size={16} className={status.state === "syncing" ? "animate-spin" : undefined} />
              {needsReconnect ? t("googleCalendarReconnect") : t("googleCalendarSyncNow")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>
              <Unplug size={16} />
              {t("googleCalendarDisconnect")}
            </Button>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-black text-ink/70">
              <input
                type="checkbox"
                checked={settings.autoSync}
                onChange={(event) =>
                  setSettings(writeGoogleCalendarSettings(workspaceId, { autoSync: event.target.checked }))
                }
                className="size-4 accent-coral"
              />
              {t("googleCalendarAutoSync")}
            </label>
          </>
        ) : (
          <Button type="button" size="sm" disabled={busy || !clientIdDraft.trim()} onClick={() => void connect()}>
            <Link2 size={16} />
            {t("googleCalendarConnect")}
          </Button>
        )}
      </div>

      <p className="mt-3 text-xs font-bold leading-5 text-muted">{t("googleCalendarScopeNote")}</p>
      {error ? <p className="mt-2 text-sm font-black text-coral">{error}</p> : null}
    </Card>
  );
}
