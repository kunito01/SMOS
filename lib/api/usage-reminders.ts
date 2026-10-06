import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import type { UsageReminder } from "@/lib/types";
import { isDateKey } from "@/lib/utils/testflight";

const createReminderId = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure reminder identity generation is unavailable");
  }

  return `usage_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
};

export async function listUsageReminders() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.usageReminders.map((reminder) => ({ ...reminder })));
}

export type AddUsageReminderInput = {
  name: string;
  startDate: string;
};

export async function addUsageReminder(input: AddUsageReminderInput) {
  await hydrateMockDatabase();
  const name = input.name.trim();
  const startDate = input.startDate.trim();

  if (!name || !isDateKey(startDate)) {
    throw new Error("A usage reminder needs a name and a start date");
  }

  const reminder: UsageReminder = {
    id: createReminderId(),
    name,
    startDate,
    createdAt: new Date().toISOString()
  };
  mockDatabase.usageReminders.push(reminder);
  await persistMockDatabase();

  return mockApi({ ...reminder });
}

/** Restarts the cycle from the given day. */
export async function updateUsageReminderStart(reminderId: string, startDate: string) {
  await hydrateMockDatabase();
  const reminder = mockDatabase.usageReminders.find((item) => item.id === reminderId);
  if (!reminder) {
    throw new Error(`Usage reminder not found: ${reminderId}`);
  }
  if (!isDateKey(startDate)) {
    throw new Error("A usage reminder start must be a yyyy-mm-dd date");
  }

  reminder.startDate = startDate;
  await persistMockDatabase();

  return mockApi({ ...reminder });
}

export async function removeUsageReminders(reminderIds: ReadonlyArray<string>) {
  await hydrateMockDatabase();
  const ids = new Set(reminderIds);
  mockDatabase.usageReminders = mockDatabase.usageReminders.filter((item) => !ids.has(item.id));
  await persistMockDatabase();

  return mockApi({ ids: [...ids] });
}
