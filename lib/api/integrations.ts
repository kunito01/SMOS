import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import type { GoogleCalendarLink } from "@/lib/types";

/** The Google calendar SMOS created for this workspace under the given OAuth client. */
export async function getGoogleCalendarLink(clientId: string) {
  await hydrateMockDatabase();
  const link = mockDatabase.integrations?.googleCalendars?.[clientId];
  return mockApi(link ? { ...link } : null);
}

export async function setGoogleCalendarLink(clientId: string, link: GoogleCalendarLink | null) {
  await hydrateMockDatabase();
  const googleCalendars = { ...(mockDatabase.integrations?.googleCalendars ?? {}) };
  if (link) {
    googleCalendars[clientId] = { calendarId: link.calendarId, connectedAt: link.connectedAt };
  } else {
    delete googleCalendars[clientId];
  }
  const previous = mockDatabase.integrations;
  mockDatabase.integrations = Object.keys(googleCalendars).length ? { googleCalendars } : undefined;

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.integrations = previous;
    throw error;
  }

  return mockApi(link ? { ...link } : null);
}
