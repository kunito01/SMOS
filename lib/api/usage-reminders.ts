import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import type { UsageCycle, UsageReminder } from "@/lib/types";
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
  cycle?: UsageCycle;
};

const isUsageCycle = (value: unknown): value is UsageCycle => value === "weekly" || value === "monthly";

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
    cycle: isUsageCycle(input.cycle) ? input.cycle : "weekly",
    createdAt: new Date().toISOString()
  };
  mockDatabase.usageReminders.push(reminder);
  await persistMockDatabase();

  return mockApi({ ...reminder });
}

export type UpdateUsageReminderInput = {
  startDate: string;
  cycle?: UsageCycle;
};

/** Restarts the cycle from the given day, optionally switching its length. */
export async function updateUsageReminder(reminderId: string, input: UpdateUsageReminderInput) {
  await hydrateMockDatabase();
  const reminder = mockDatabase.usageReminders.find((item) => item.id === reminderId);
  if (!reminder) {
    throw new Error(`Usage reminder not found: ${reminderId}`);
  }
  if (!isDateKey(input.startDate)) {
    throw new Error("A usage reminder start must be a yyyy-mm-dd date");
  }

  reminder.startDate = input.startDate;
  if (isUsageCycle(input.cycle)) {
    reminder.cycle = input.cycle;
  }
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
