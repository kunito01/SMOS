"use client";

import { integrationsApi, projectsApi } from "@/lib/api";
import { getActiveMockDatabaseWorkspaceId } from "@/lib/api/mock-persistence";
import {
  GoogleAuthError,
  preloadGoogleIdentity,
  readGoogleToken,
  requestGoogleToken,
  revokeGoogleToken,
  writeGoogleToken,
  type GoogleStoredToken
} from "@/lib/integrations/google-auth";

import {
  forgetGoogleDriveAccessToken,
  isGoogleDriveConnected,
  readGoogleDriveSettings
} from "@/lib/storage/google-drive/google-drive-client";

// Shared Google Identity Services plumbing lives in google-auth.ts; these
// re-exports keep the Calendar card and auto-sync component unchanged.
export { preloadGoogleIdentity, GoogleAuthError as GoogleCalendarAuthError };
import type { Project } from "@/lib/types";
import { projectPath, withBasePath } from "@/lib/utils/app-routes";

/**
 * Google Calendar direct push.
 *
 * Runs entirely in the browser: Google Identity Services hands us a short-lived
 * access token, and we write project phases, deliverables, and releases into a
 * dedicated secondary calendar that SMOS creates. Event ids are derived from the
 * SMOS entity ids, so re-syncing updates in place and never duplicates. The
 * calendar binding lives in the synced workspace database, so every device
 * reuses the same calendar; only the OAuth token and the incremental-sync cache
 * stay on the device.
 */

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SUMMARY = "Studio Map OS";
const SETTINGS_KEY_PREFIX = "studio-map-os.google-calendar:";
const TOKEN_KEY_PREFIX = "studio-map-os.google-calendar-token:";
export const GOOGLE_CALENDAR_STATUS_EVENT = "smos:google-calendar-status";
export const DATABASE_PERSISTED_EVENT = "smos:database-persisted";

export type GoogleCalendarSettings = {
  clientId: string;
  /** Device-local mirror of the workspace binding, kept so sync checks stay synchronous. */
  calendarId: string;
  connectedAt: string;
  /** Set once Google has granted consent on this device, so later prompts skip the consent screen. */
  consentGranted: boolean;
  autoSync: boolean;
  lastSyncAt: string;
  /** Event id → content hash of what was last written, used for incremental sync. */
  syncedEvents: Record<string, string>;
};

export type GoogleCalendarSyncState = "idle" | "syncing" | "synced" | "reconnect" | "error";

export type GoogleCalendarStatus = {
  state: GoogleCalendarSyncState;
  message?: string;
  eventCount?: number;
  failedCount?: number;
};

type StoredToken = GoogleStoredToken;

const canUseBrowser = () => typeof window !== "undefined";

const defaultSettings = (): GoogleCalendarSettings => ({
  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  calendarId: "",
  connectedAt: "",
  consentGranted: false,
  autoSync: true,
  lastSyncAt: "",
  syncedEvents: {}
});

const settingsKey = (workspaceId: string) => `${SETTINGS_KEY_PREFIX}${workspaceId}`;
const tokenKey = (workspaceId: string) => `${TOKEN_KEY_PREFIX}${workspaceId}`;

export const readGoogleCalendarSettings = (workspaceId: string): GoogleCalendarSettings => {
  const fallback = defaultSettings();
  if (!canUseBrowser()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(settingsKey(workspaceId));
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<GoogleCalendarSettings>;
    return {
      clientId: typeof parsed.clientId === "string" && parsed.clientId ? parsed.clientId : fallback.clientId,
      calendarId: typeof parsed.calendarId === "string" ? parsed.calendarId : "",
      connectedAt: typeof parsed.connectedAt === "string" ? parsed.connectedAt : "",
      consentGranted: parsed.consentGranted === true,
      autoSync: parsed.autoSync !== false,
      lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : "",
      syncedEvents:
        parsed.syncedEvents && typeof parsed.syncedEvents === "object"
          ? Object.fromEntries(
              Object.entries(parsed.syncedEvents).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string"
              )
            )
          : {}
    };
  } catch {
    return fallback;
  }
};

export const writeGoogleCalendarSettings = (
  workspaceId: string,
  patch: Partial<GoogleCalendarSettings>
): GoogleCalendarSettings => {
  const next = { ...readGoogleCalendarSettings(workspaceId), ...patch };
  if (canUseBrowser()) {
    window.localStorage.setItem(settingsKey(workspaceId), JSON.stringify(next));
  }
  return next;
};

export const isGoogleCalendarConnected = (settings: GoogleCalendarSettings) =>
  Boolean(settings.clientId && settings.calendarId && settings.connectedAt);

const readToken = (workspaceId: string): StoredToken | null => readGoogleToken(tokenKey(workspaceId));

const writeToken = (workspaceId: string, token: StoredToken | null) =>
  writeGoogleToken(tokenKey(workspaceId), token);

/** True while a usable token is cached, i.e. auto-sync can run without any popup. */
export const hasGoogleAccessToken = (workspaceId: string) => readToken(workspaceId) !== null;

/**
 * Returns a usable access token for the Calendar scope.
 *
 * `silent` never opens Google UI: it returns the cached token or rejects with
 * `interactive = true` so callers can ask for a click. `interactive` reuses a
 * cached token when there is one and otherwise opens Google's popup — only the
 * very first connection shows the full consent screen.
 */
export const requestGoogleAccessToken = async (
  workspaceId: string,
  clientId: string,
  mode: "interactive" | "silent"
): Promise<StoredToken> => {
  const { consentGranted } = readGoogleCalendarSettings(workspaceId);
  return requestGoogleToken({
    storageKey: tokenKey(workspaceId),
    clientId,
    scope: GOOGLE_CALENDAR_SCOPE,
    mode,
    consentGranted,
    onGranted: () => {
      writeGoogleCalendarSettings(workspaceId, { consentGranted: true });
    }
  });
};

/**
 * Drops the Calendar token. The OAuth grant is shared with Google Drive
 * storage, so it is only revoked when Drive is not connected on this device.
 */
export const revokeGoogleAccessToken = async (workspaceId: string) => {
  const drive = readGoogleDriveSettings(workspaceId);
  const revokeGrant = !(
    isGoogleDriveConnected(drive) && drive.clientId === readGoogleCalendarSettings(workspaceId).clientId
  );
  await revokeGoogleToken(tokenKey(workspaceId), { revokeGrant });
  if (revokeGrant) {
    forgetGoogleDriveAccessToken(workspaceId);
  }
};

class GoogleCalendarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string
  ) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

const RETRYABLE_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "backendError",
  "internalError"
]);

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const apiFetch = async (token: string, path: string, init: RequestInit = {}, attempt = 0): Promise<unknown> => {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    let detail = "";
    let reason = "";
    try {
      const body = (await response.json()) as {
        error?: { message?: string; errors?: { reason?: string }[]; status?: string };
      };
      detail = body.error?.message ?? "";
      reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? "";
    } catch {
      // Non-JSON error bodies carry nothing useful.
    }
    const retryable =
      response.status === 429 || response.status >= 500 || (response.status === 403 && RETRYABLE_REASONS.has(reason));
    if (retryable && attempt < 2) {
      await sleep(1_200 * (attempt + 1));
      return apiFetch(token, path, init, attempt + 1);
    }
    throw new GoogleCalendarApiError(
      detail || `Google Calendar request failed (${response.status})`,
      response.status,
      reason
    );
  }
  if (response.status === 204) {
    return null;
  }
  return (await response.json()) as unknown;
};

/** Verifies the bound calendar still exists, or creates the dedicated one. */
const ensureGoogleCalendar = async (token: string, existingCalendarId: string) => {
  if (existingCalendarId) {
    try {
      await apiFetch(token, `/calendars/${encodeURIComponent(existingCalendarId)}`);
      return existingCalendarId;
    } catch (error) {
      if (!(error instanceof GoogleCalendarApiError) || (error.status !== 404 && error.status !== 410)) {
        throw error;
      }
    }
  }

  const created = (await apiFetch(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: CALENDAR_SUMMARY })
  })) as { id?: string };
  if (!created.id) {
    throw new Error("Google Calendar did not return a calendar id");
  }
  return created.id;
};

/**
 * Resolves the calendar for this workspace + client: the synced workspace
 * binding wins, a pre-binding device-local id is migrated into it, and only
 * when neither exists is a new calendar created.
 */
const resolveCalendarBinding = async (workspaceId: string, clientId: string, token: string) => {
  const settings = readGoogleCalendarSettings(workspaceId);
  const link = await integrationsApi.getGoogleCalendarLink(clientId);
  const candidate = link?.calendarId || settings.calendarId;
  const calendarId = await ensureGoogleCalendar(token, candidate);
  const connectedAt = link?.connectedAt || settings.connectedAt || new Date().toISOString();

  if (!link || link.calendarId !== calendarId) {
    await integrationsApi.setGoogleCalendarLink(clientId, { calendarId, connectedAt });
  }
  const calendarChanged = settings.calendarId !== calendarId;
  writeGoogleCalendarSettings(workspaceId, {
    calendarId,
    connectedAt,
    ...(calendarChanged ? { syncedEvents: {} } : {})
  });
  return { calendarId, calendarChanged };
};

type CalendarEventPayload = {
  id: string;
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  status: "confirmed";
  transparency: "transparent";
  extendedProperties: { private: { smosKey: string } };
};

const isDateKey = (value: string | undefined): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");

/** Google all-day events end on the day AFTER the last day (exclusive). */
const nextDay = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Google event ids must match [a-v0-9]{5,1024}; hex output fits inside that alphabet. */
const eventIdFor = async (smosKey: string) => `smos${await sha256Hex(smosKey)}`;

const buildProjectEvents = async (project: Project): Promise<CalendarEventPayload[]> => {
  const events: CalendarEventPayload[] = [];
  const projectUrl = `${window.location.origin}${withBasePath(projectPath(project.id))}`;
  const push = async (
    key: string,
    summary: string,
    description: string,
    startDate: string,
    endDateInclusive: string
  ) => {
    events.push({
      id: await eventIdFor(key),
      summary,
      description: `${description}\n${projectUrl}`.trim(),
      start: { date: startDate },
      end: { date: nextDay(endDateInclusive < startDate ? startDate : endDateInclusive) },
      status: "confirmed",
      transparency: "transparent",
      extendedProperties: { private: { smosKey: key } }
    });
  };

  for (const phase of project.phases) {
    if (isDateKey(phase.startDate) && isDateKey(phase.endDate)) {
      await push(
        `phase:${phase.id}`,
        `${project.name} · ${phase.name || "Phase"}`,
        phase.description || "",
        phase.startDate,
        phase.endDate
      );
    }
    for (const deliverable of phase.deliverables) {
      // Timeline phases carry a blank placeholder deliverable; only named ones are real milestones.
      if (deliverable.title.trim() && isDateKey(deliverable.dueDate)) {
        await push(
          `deliverable:${deliverable.id}`,
          `📦 ${deliverable.title.trim()} · ${project.name}`,
          deliverable.description || "",
          deliverable.dueDate,
          deliverable.dueDate
        );
      }
    }
  }

  for (const version of project.versions ?? []) {
    if (isDateKey(version.releaseDate)) {
      await push(
        `release:${version.id}`,
        `🚀 ${version.name} · ${project.name}`,
        version.summary || "",
        version.releaseDate,
        version.releaseDate
      );
    }
  }

  return events;
};

const hashEvent = (event: Pick<CalendarEventPayload, "summary" | "description" | "start" | "end">) =>
  JSON.stringify([event.summary, event.description, event.start.date, event.end.date]);

/** Fresh devices rebuild the incremental cache from the calendar itself instead of re-pushing everything. */
const readCalendarEventHashes = async (token: string, calendarPath: string) => {
  const found: Record<string, string> = {};
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "false",
      fields: "nextPageToken,items(id,summary,description,start,end)"
    });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }
    const page = (await apiFetch(token, `${calendarPath}?${query.toString()}`)) as {
      items?: { id?: string; summary?: string; description?: string; start?: { date?: string }; end?: { date?: string } }[];
      nextPageToken?: string;
    };
    for (const item of page.items ?? []) {
      if (item.id?.startsWith("smos")) {
        found[item.id] = hashEvent({
          summary: item.summary ?? "",
          description: item.description ?? "",
          start: { date: item.start?.date ?? "" },
          end: { date: item.end?.date ?? "" }
        });
      }
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return found;
};

const statusListeners = new Set<(status: GoogleCalendarStatus) => void>();
let latestStatus: GoogleCalendarStatus = { state: "idle" };

export const getGoogleCalendarStatus = () => latestStatus;

export const subscribeGoogleCalendarStatus = (listener: (status: GoogleCalendarStatus) => void) => {
  statusListeners.add(listener);
  listener(latestStatus);
  return () => {
    statusListeners.delete(listener);
  };
};

const publishStatus = (status: GoogleCalendarStatus) => {
  latestStatus = status;
  statusListeners.forEach((listener) => listener(status));
  if (canUseBrowser()) {
    window.dispatchEvent(new CustomEvent(GOOGLE_CALENDAR_STATUS_EVENT, { detail: status }));
  }
};

const assertWorkspaceStillActive = (workspaceId: string) => {
  if (getActiveMockDatabaseWorkspaceId() !== workspaceId) {
    throw new Error("The workspace changed while Google Calendar was syncing");
  }
};

type SyncMode = "interactive" | "silent";

const runSync = async (workspaceId: string, mode: SyncMode): Promise<GoogleCalendarStatus> => {
  const settings = readGoogleCalendarSettings(workspaceId);
  if (!settings.clientId || (mode === "silent" && !isGoogleCalendarConnected(settings))) {
    const status: GoogleCalendarStatus = { state: "idle" };
    publishStatus(status);
    return status;
  }

  const knownCount = Object.keys(settings.syncedEvents).length;
  let token: StoredToken;
  try {
    token = await requestGoogleAccessToken(workspaceId, settings.clientId, mode);
  } catch (error) {
    const status: GoogleCalendarStatus = {
      state: "reconnect",
      message: error instanceof Error ? error.message : String(error),
      eventCount: knownCount
    };
    publishStatus(status);
    return status;
  }

  publishStatus({ state: "syncing", eventCount: knownCount });

  try {
    assertWorkspaceStillActive(workspaceId);
    const { calendarId, calendarChanged } = await resolveCalendarBinding(workspaceId, settings.clientId, token.accessToken);
    const calendarPath = `/calendars/${encodeURIComponent(calendarId)}/events`;

    assertWorkspaceStillActive(workspaceId);
    const projects = await projectsApi.listProjects();
    assertWorkspaceStillActive(workspaceId);

    const desired = new Map<string, CalendarEventPayload>();
    for (const project of projects) {
      if (project.isExample || project.archivedAt) {
        continue;
      }
      for (const event of await buildProjectEvents(project)) {
        desired.set(event.id, event);
      }
    }

    const localCache = calendarChanged ? {} : readGoogleCalendarSettings(workspaceId).syncedEvents;
    const previous = Object.keys(localCache).length
      ? { ...localCache }
      : await readCalendarEventHashes(token.accessToken, calendarPath);
    const next: Record<string, string> = {};
    const failures: string[] = [];

    for (const [id, event] of desired) {
      const hash = hashEvent(event);
      if (previous[id] === hash) {
        next[id] = hash;
        continue;
      }
      try {
        try {
          await apiFetch(token.accessToken, calendarPath, { method: "POST", body: JSON.stringify(event) });
        } catch (error) {
          if (error instanceof GoogleCalendarApiError && error.status === 409) {
            // PATCH leaves Google's sequence number alone and un-cancels an event the user removed.
            await apiFetch(token.accessToken, `${calendarPath}/${id}`, {
              method: "PATCH",
              body: JSON.stringify(event)
            });
          } else {
            throw error;
          }
        }
        next[id] = hash;
        // Persist progress as we go so an interrupted sync never re-creates what already landed.
        writeGoogleCalendarSettings(workspaceId, { syncedEvents: { ...previous, ...next } });
      } catch (error) {
        if (error instanceof GoogleCalendarApiError && error.status === 401) {
          throw error;
        }
        failures.push(event.summary);
      }
    }

    for (const id of Object.keys(previous)) {
      if (desired.has(id)) {
        continue;
      }
      try {
        await apiFetch(token.accessToken, `${calendarPath}/${id}`, { method: "DELETE" });
      } catch (error) {
        if (error instanceof GoogleCalendarApiError && (error.status === 404 || error.status === 410)) {
          continue;
        }
        if (error instanceof GoogleCalendarApiError && error.status === 401) {
          throw error;
        }
        // Keep the id so the next run retries the deletion.
        next[id] = previous[id];
        failures.push(id);
      }
    }

    writeGoogleCalendarSettings(workspaceId, { syncedEvents: next, lastSyncAt: new Date().toISOString() });
    const status: GoogleCalendarStatus = failures.length
      ? {
          state: "error",
          message: failures.slice(0, 3).join(", "),
          eventCount: Object.keys(next).length,
          failedCount: failures.length
        }
      : { state: "synced", eventCount: Object.keys(next).length };
    publishStatus(status);
    return status;
  } catch (error) {
    if (error instanceof GoogleCalendarApiError && error.status === 401) {
      writeToken(workspaceId, null);
      const status: GoogleCalendarStatus = { state: "reconnect", message: error.message, eventCount: knownCount };
      publishStatus(status);
      return status;
    }
    const status: GoogleCalendarStatus = {
      state: "error",
      message: error instanceof Error ? error.message : String(error),
      eventCount: knownCount
    };
    publishStatus(status);
    return status;
  }
};

let inFlight: Promise<GoogleCalendarStatus> | null = null;
let pendingMode: SyncMode | null = null;

/**
 * Pushes every project phase, deliverable, and release into the connected
 * calendar, updating changed events and deleting ones that disappeared. A
 * request that arrives mid-run queues one follow-up run so nothing is dropped.
 */
export const syncGoogleCalendar = (
  workspaceId: string,
  options: { mode?: SyncMode } = {}
): Promise<GoogleCalendarStatus> => {
  const mode = options.mode ?? "silent";
  if (inFlight) {
    pendingMode = pendingMode === "interactive" || mode === "interactive" ? "interactive" : "silent";
    return inFlight;
  }

  inFlight = (async () => {
    let currentMode: SyncMode = mode;
    let status = await runSync(workspaceId, currentMode);
    while (pendingMode) {
      currentMode = pendingMode;
      pendingMode = null;
      status = await runSync(workspaceId, currentMode);
    }
    return status;
  })();

  return inFlight.finally(() => {
    inFlight = null;
  });
};

/** Interactive connection: consent, bind (or reuse) the calendar, then sync. */
export const connectGoogleCalendar = async (workspaceId: string, clientId: string) => {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new GoogleAuthError("Missing Google OAuth client id", true);
  }
  writeGoogleCalendarSettings(workspaceId, { clientId: trimmedClientId });
  return syncGoogleCalendar(workspaceId, { mode: "interactive" });
};

/**
 * Forgets the connection on this device and revokes its token. The calendar
 * binding stays in the workspace so reconnecting (here or elsewhere) reuses it.
 */
export const disconnectGoogleCalendar = async (workspaceId: string) => {
  await revokeGoogleAccessToken(workspaceId);
  const settings = readGoogleCalendarSettings(workspaceId);
  writeGoogleCalendarSettings(workspaceId, {
    clientId: settings.clientId,
    calendarId: "",
    connectedAt: "",
    lastSyncAt: "",
    syncedEvents: {}
  });
  publishStatus({ state: "idle" });
};

/** Whether another device already bound a calendar for this client id (so Connect will reuse it). */
export const getGoogleCalendarLinkForClient = (clientId: string) =>
  clientId ? integrationsApi.getGoogleCalendarLink(clientId) : Promise.resolve(null);
