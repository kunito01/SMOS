/**
 * OS-level notification banners for reminders while the app is open (including
 * background tabs and the installed desktop PWA). This is deliberately not a
 * push system: with no server there is nothing that can wake the app once it
 * is fully closed, so banners fire only from a running page. iOS Safari (non
 * standalone) does not expose the Notification API at all and reports
 * "unsupported" here, which hides the feature there.
 */

export type SystemNotificationPermission =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

const notifiedStorageKey = (workspaceId: string) =>
  `studio-map-os.workspace.${workspaceId}.system-notified-reminders`;

const NOTIFIED_LEDGER_LIMIT = 300;

export const getSystemNotificationPermission = (): SystemNotificationPermission => {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
};

export const requestSystemNotificationPermission =
  async (): Promise<SystemNotificationPermission> => {
    if (getSystemNotificationPermission() === "unsupported") {
      return "unsupported";
    }
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  };

/**
 * Shows one banner. Prefers the service-worker registration (required for
 * installed PWAs on several platforms); falls back to a page-scoped
 * Notification. The tag deduplicates repeats of the same reminder.
 */
export const showSystemNotification = async (
  title: string,
  body: string,
  tag: string
): Promise<boolean> => {
  if (getSystemNotificationPermission() !== "granted") {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, { body, tag });
      return true;
    }
  } catch {
    // Fall through to the page-scoped constructor.
  }

  try {
    new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
};

/** Reminder ids that already produced a banner on this device. */
export const readNotifiedReminderIds = (workspaceId: string): Set<string> => {
  try {
    const stored = window.localStorage.getItem(notifiedStorageKey(workspaceId));
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : []
    );
  } catch {
    return new Set<string>();
  }
};

export const rememberNotifiedReminderIds = (
  workspaceId: string,
  reminderIds: Iterable<string>
): void => {
  try {
    const merged = [...readNotifiedReminderIds(workspaceId), ...reminderIds];
    window.localStorage.setItem(
      notifiedStorageKey(workspaceId),
      JSON.stringify(merged.slice(-NOTIFIED_LEDGER_LIMIT))
    );
  } catch {
    // Losing the ledger only risks a duplicate banner later; never throw.
  }
};
