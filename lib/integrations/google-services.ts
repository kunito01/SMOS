"use client";

import { googleTokenOmitsScope, type GoogleStoredToken } from "@/lib/integrations/google-auth";
import {
  adoptGoogleSignInTokenForCalendar,
  bindGoogleCalendarFromSignIn,
  hasGoogleAccessToken,
  isGoogleCalendarConnected,
  readGoogleCalendarSettings
} from "@/lib/integrations/google-calendar";

export { bindGoogleCalendarFromSignIn } from "@/lib/integrations/google-calendar";
import {
  readGoogleSignInSettings,
  readGoogleSignInTokenRelaxed,
  requestGoogleSignIn,
  resolveGoogleClientId
} from "@/lib/integrations/google-signin";
import { CloudProviderError } from "@/lib/storage/cloud-provider-error";
import {
  GOOGLE_DRIVE_SCOPE,
  isGoogleDriveConnected,
  readGoogleDriveSettings,
  requireGoogleDriveAccessToken,
  seedGoogleDriveConnection
} from "@/lib/storage/google-drive/google-drive-client";

/**
 * One Google session for every Google feature of a workspace that signs in
 * with Google: the sign-in token is handed to Drive storage and Calendar push.
 * After the hourly expiry a silent refresh covers all of them; a popup is
 * only needed when Google itself rejects the grant.
 *
 * Drive verifies which Google account a token belongs to; Calendar only ever
 * takes a token that Drive accepted for this workspace, so a popup that picked
 * another account can never push events into that account's calendar.
 */

export const googleSignInClientId = () => readGoogleSignInSettings().clientId || resolveGoogleClientId();

export type GoogleServiceBinding = {
  drive: boolean;
  calendar: boolean;
  /** This attempt verified the Drive account and stored its token. */
  seeded: boolean;
};

const bindingInFlight = new Map<string, Promise<GoogleServiceBinding>>();

const bindGoogleServicesBody = async (
  workspaceId: string,
  token: GoogleStoredToken,
  clientId: string
): Promise<GoogleServiceBinding> => {
  let seeded = false;
  // A grant that explicitly left Drive unticked cannot seed it. An unknown
  // scope string is tried against the Drive API instead.
  if (!googleTokenOmitsScope(token, GOOGLE_DRIVE_SCOPE)) {
    try {
      await seedGoogleDriveConnection(workspaceId, token, clientId);
      seeded = true;
    } catch (error) {
      if (error instanceof CloudProviderError && error.code === "ACCOUNT_MISMATCH") {
        throw error;
      }
      // A timeout or a refused Drive call leaves the previous connection in
      // place. Sign-in still succeeds; a later launch tries again.
    }
  }
  const drive = isGoogleDriveConnected(readGoogleDriveSettings(workspaceId));
  // Calendar is created only after Drive has accepted this token, so a popup
  // that picked another Google account cannot open a calendar for it.
  let calendar = isGoogleCalendarConnected(readGoogleCalendarSettings(workspaceId));
  if (drive && !readGoogleCalendarSettings(workspaceId).pushDisabled) {
    try {
      calendar = await bindGoogleCalendarFromSignIn(workspaceId, token);
    } catch (error) {
      if (error instanceof CloudProviderError && error.code === "ACCOUNT_MISMATCH") {
        throw error;
      }
      calendar = isGoogleCalendarConnected(readGoogleCalendarSettings(workspaceId));
    }
  }
  return {
    drive,
    calendar,
    seeded
  };
};

/**
 * Persists Drive and Calendar as connected from a Google sign-in token.
 * One in-flight bind per workspace is shared, so sign-in and the next launch
 * do not create two calendars. A transient failure does not clear a binding
 * that was already stored.
 */
export const bindGoogleServicesFromSignIn = (
  workspaceId: string,
  token: GoogleStoredToken,
  clientId = googleSignInClientId()
) => {
  const current = bindingInFlight.get(workspaceId);
  if (current) {
    return current;
  }
  const run = bindGoogleServicesBody(workspaceId, token, clientId).finally(() => {
    if (bindingInFlight.get(workspaceId) === run) {
      bindingInFlight.delete(workspaceId);
    }
  });
  bindingInFlight.set(workspaceId, run);
  return run;
};

/**
 * Hands a fresh sign-in token to Drive (account-checked) and Calendar, and
 * creates or reuses the Studio Map OS calendar. Throws when Drive refuses
 * the token as a different account, so callers stop instead of retrying.
 */
export const adoptGoogleSignInTokenForWorkspace = (workspaceId: string, token: GoogleStoredToken) =>
  bindGoogleServicesFromSignIn(workspaceId, token);

/**
 * Calendar adopts the cached sign-in token only when Drive already holds that
 * same token for this workspace (i.e. its account was verified). Returns
 * whether Calendar has a usable token afterwards.
 */
export const adoptVerifiedSignInTokenForCalendar = (workspaceId: string) => {
  const token = readGoogleSignInTokenRelaxed();
  if (!token) {
    return hasGoogleAccessToken(workspaceId);
  }
  let driveToken: GoogleStoredToken | null = null;
  try {
    driveToken = requireGoogleDriveAccessToken(workspaceId);
  } catch {
    driveToken = null;
  }
  if (!driveToken || driveToken.accessToken !== token.accessToken) {
    return hasGoogleAccessToken(workspaceId);
  }
  return adoptGoogleSignInTokenForCalendar(workspaceId, token);
};

/**
 * Reconnects Drive and Calendar with one Google popup. Must be called from a
 * click handler before any other await, or the popup is blocked. Throws when
 * the token belongs to a different Google account. A timeout keeps the
 * previous binding instead of asking for another sign-in.
 */
export const reconnectGoogleServices = async (workspaceId: string) => {
  // Ask for a fresh token, but keep the previous one until Google actually
  // grants a replacement. A timed-out popup must not wipe a still-valid session.
  const token = await requestGoogleSignIn({
    clientId: googleSignInClientId(),
    mode: "interactive",
    ignoreCache: true
  });
  return bindGoogleServicesFromSignIn(workspaceId, token);
};
