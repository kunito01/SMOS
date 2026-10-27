"use client";

import type { GoogleStoredToken } from "@/lib/integrations/google-auth";
import {
  adoptGoogleSignInTokenForCalendar,
  hasGoogleAccessToken
} from "@/lib/integrations/google-calendar";
import {
  forgetGoogleSignInToken,
  readGoogleSignInSettings,
  readGoogleSignInToken,
  requestGoogleSignIn,
  resolveGoogleClientId
} from "@/lib/integrations/google-signin";
import {
  requireGoogleDriveAccessToken,
  seedGoogleDriveConnection
} from "@/lib/storage/google-drive/google-drive-client";

/**
 * One Google session for every Google feature of a workspace that signs in
 * with Google: the sign-in token is handed to Drive storage and Calendar push,
 * so a single popup (and, after the hourly expiry, a single click) covers all.
 *
 * Drive verifies which Google account a token belongs to; Calendar only ever
 * takes a token that Drive accepted for this workspace, so a popup that picked
 * another account can never push events into that account's calendar.
 */

export const googleSignInClientId = () => readGoogleSignInSettings().clientId || resolveGoogleClientId();

/**
 * Hands a fresh sign-in token to Drive (account-checked) and then Calendar.
 * Throws when Drive refuses the token, so callers stop instead of retrying.
 */
export const adoptGoogleSignInTokenForWorkspace = async (workspaceId: string, token: GoogleStoredToken) => {
  await seedGoogleDriveConnection(workspaceId, token, googleSignInClientId());
  const calendar = adoptGoogleSignInTokenForCalendar(workspaceId, token);
  return { drive: true, calendar };
};

/**
 * Calendar adopts the cached sign-in token only when Drive already holds that
 * same token for this workspace (i.e. its account was verified). Returns
 * whether Calendar has a usable token afterwards.
 */
export const adoptVerifiedSignInTokenForCalendar = (workspaceId: string) => {
  const token = readGoogleSignInToken();
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
 * Drive does not accept the new token (wrong account, Drive unticked, network),
 * so no caller goes on to request another token outside the click.
 */
export const reconnectGoogleServices = async (workspaceId: string) => {
  // A fresh token every time: the cached one may be the very token Google
  // just rejected.
  forgetGoogleSignInToken();
  const token = await requestGoogleSignIn({ clientId: googleSignInClientId(), mode: "interactive" });
  return adoptGoogleSignInTokenForWorkspace(workspaceId, token);
};
