import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import type { Project, ProjectVersion, TestFlightReminder } from "@/lib/types";
import { isDateKey, todayDateKey } from "@/lib/utils/testflight";

const createReminderId = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure reminder identity generation is unavailable");
  }

  return `testflight_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
};

const findOfficialVersion = (project: Project) =>
  project.versions.find((version) => version.kind === "official");

/** An official release counts for TestFlight once it has a version, a date, and iOS among its platforms. */
const isIosOfficialRelease = (version: ProjectVersion | undefined): version is ProjectVersion =>
  Boolean(version?.versionNumber && isDateKey(version.releaseDate) && version.platforms?.includes("ios"));

/** The current 90-day window starts at the latest of the release date and any renewals. */
const currentWindowStart = (version: ProjectVersion) =>
  [version.releaseDate, ...(version.testflightRenewals ?? [])]
    .filter(isDateKey)
    .reduce((latest, date) => (date > latest ? date : latest));

/**
 * Keeps at most one reminder per project in step with its official iOS
 * release: a changed version replaces the old entry, a removed release drops
 * it, and a reminder the user deleted stays gone until the version changes.
 * Mutates the in-memory database only; callers persist.
 */
export const syncProjectTestflightReminder = (project: Project) => {
  const official = findOfficialVersion(project);
  const index = mockDatabase.testflightReminders.findIndex((reminder) => reminder.projectId === project.id);

  if (!isIosOfficialRelease(official)) {
    // Only entries that mirrored a release node disappear with it; hand-typed ones stay.
    if (index >= 0 && mockDatabase.testflightReminders[index].source === "release") {
      mockDatabase.testflightReminders.splice(index, 1);
    }
    return;
  }

  const versionNumber = official.versionNumber ?? "";
  if (project.testflightDismissedVersion && project.testflightDismissedVersion !== versionNumber) {
    delete project.testflightDismissedVersion;
  }

  if (index >= 0) {
    const reminder = mockDatabase.testflightReminders[index];
    const windowStart = currentWindowStart(official);
    reminder.name = project.name;
    // A hand-renewed entry for the same build keeps its later window start.
    reminder.releasedAt =
      reminder.versionNumber === versionNumber && reminder.releasedAt > windowStart
        ? reminder.releasedAt
        : windowStart;
    reminder.versionNumber = versionNumber;
    reminder.source = "release";
    return;
  }

  if (project.testflightDismissedVersion === versionNumber) {
    return;
  }

  mockDatabase.testflightReminders.unshift({
    id: createReminderId(),
    name: project.name,
    versionNumber,
    releasedAt: currentWindowStart(official),
    projectId: project.id,
    source: "release",
    createdAt: new Date().toISOString()
  });
};

const withLiveProjectName = (reminder: TestFlightReminder): TestFlightReminder => {
  const project = reminder.projectId
    ? mockDatabase.projects.find((item) => item.id === reminder.projectId)
    : undefined;
  return project ? { ...reminder, name: project.name } : { ...reminder };
};

export async function listTestflightReminders() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.testflightReminders.map(withLiveProjectName));
}

export type AddTestflightReminderInput = {
  name: string;
  versionNumber: string;
  releasedAt: string;
  projectId?: string;
};

export async function addTestflightReminder(input: AddTestflightReminderInput) {
  await hydrateMockDatabase();
  const project = input.projectId
    ? mockDatabase.projects.find((item) => item.id === input.projectId)
    : undefined;
  const name = (project?.name ?? input.name).trim();
  const versionNumber = input.versionNumber.trim();
  const releasedAt = input.releasedAt.trim();

  if (!name || !versionNumber || !isDateKey(releasedAt)) {
    throw new Error("A TestFlight reminder needs a name, a version, and a release date");
  }

  // One entry per project: re-adding a linked project updates it and un-dismisses it.
  const existing = project
    ? mockDatabase.testflightReminders.find((reminder) => reminder.projectId === project.id)
    : undefined;
  if (project) {
    delete project.testflightDismissedVersion;
  }

  let reminder: TestFlightReminder;
  if (existing) {
    existing.name = name;
    existing.versionNumber = versionNumber;
    existing.releasedAt = releasedAt;
    reminder = existing;
  } else {
    reminder = {
      id: createReminderId(),
      name,
      versionNumber,
      releasedAt,
      source: "manual",
      createdAt: new Date().toISOString(),
      ...(project ? { projectId: project.id } : {})
    };
    mockDatabase.testflightReminders.unshift(reminder);
  }

  await persistMockDatabase();
  return mockApi(withLiveProjectName(reminder));
}

/** Removes the dashboard entry only; a linked project keeps its release node and remembers the dismissal. */
export async function removeTestflightReminder(reminderId: string) {
  await hydrateMockDatabase();
  const reminder = mockDatabase.testflightReminders.find((item) => item.id === reminderId);
  if (!reminder) {
    return mockApi({ id: reminderId });
  }

  const project = reminder.projectId
    ? mockDatabase.projects.find((item) => item.id === reminder.projectId)
    : undefined;
  if (project) {
    project.testflightDismissedVersion = reminder.versionNumber;
  }
  mockDatabase.testflightReminders = mockDatabase.testflightReminders.filter((item) => item.id !== reminderId);

  await persistMockDatabase();
  return mockApi({ id: reminderId });
}

/** Restarts the 90 days from today; a linked project records the renewal on its official release. */
export async function renewTestflightReminder(reminderId: string) {
  await hydrateMockDatabase();
  const reminder = mockDatabase.testflightReminders.find((item) => item.id === reminderId);
  if (!reminder) {
    throw new Error(`TestFlight reminder not found: ${reminderId}`);
  }

  const today = todayDateKey();
  reminder.releasedAt = today;

  const project = reminder.projectId
    ? mockDatabase.projects.find((item) => item.id === reminder.projectId)
    : undefined;
  const official = project ? findOfficialVersion(project) : undefined;
  if (official && official.versionNumber === reminder.versionNumber) {
    const renewals = new Set(official.testflightRenewals ?? []);
    renewals.add(today);
    official.testflightRenewals = [...renewals].sort();
  }

  await persistMockDatabase();
  return mockApi(withLiveProjectName(reminder));
}

export type ProjectTestflightState = {
  /** The project's official release qualifies (version + date + iOS). */
  eligible: boolean;
  reminder: TestFlightReminder | null;
  /** The user removed this version's reminder from the dashboard. */
  dismissed: boolean;
};

export async function getProjectTestflightState(projectId: string): Promise<ProjectTestflightState> {
  await hydrateMockDatabase();
  const project = mockDatabase.projects.find((item) => item.id === projectId);
  const official = project ? findOfficialVersion(project) : undefined;
  const eligible = isIosOfficialRelease(official);
  const reminder = mockDatabase.testflightReminders.find((item) => item.projectId === projectId) ?? null;
  const dismissed = Boolean(
    project && eligible && !reminder && project.testflightDismissedVersion === official?.versionNumber
  );

  return mockApi({ eligible, reminder: reminder ? withLiveProjectName(reminder) : null, dismissed });
}

/** Re-creates a dismissed reminder from the project's official iOS release. */
export async function resyncProjectTestflightReminder(projectId: string) {
  await hydrateMockDatabase();
  const project = mockDatabase.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  delete project.testflightDismissedVersion;
  syncProjectTestflightReminder(project);
  await persistMockDatabase();

  return getProjectTestflightState(projectId);
}
