import { createProjectPayments, mockDatabase } from "@/lib/mock";
import { languages, type Language } from "@/lib/i18n/translations";
import type { Company, CostLibraryItem, Person, Project, ProjectGroup, ProjectVersion, ShareLink, Tool, User } from "@/lib/types";
import { isMoneyCurrency, type MoneyCurrency } from "@/lib/utils/money";

const storageKey = "studio-map-os.mock-database";
let hydrated = false;

type PersistedProjectGroup = ProjectGroup & {
  companyId?: string;
};

export type PersistedMockDatabase = {
  users: User[];
  companies: Company[];
  groups: PersistedProjectGroup[];
  projects: Project[];
  people: Person[];
  tools: Tool[];
  costLibrary: CostLibraryItem[];
  shareLinks: ShareLink[];
};

export const mockDatabaseBackupSchema = "studio-map-os.database-backup" as const;
export const mockDatabaseBackupVersion = 1 as const;

export type MockDatabaseBackup = {
  schema: typeof mockDatabaseBackupSchema;
  version: typeof mockDatabaseBackupVersion;
  exportedAt: string;
  database: PersistedMockDatabase;
  preferences?: {
    language?: Language;
    displayCurrency?: MoneyCurrency;
  };
};

const languageStorageKey = "studio-map-os.language";
const displayCurrencyStorageKey = "studio-map-os.display-currency";

const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasStrings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof value[key] === "string");

const isEntityArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.id === "string");

const isCompany = (value: unknown) =>
  isRecord(value) && hasStrings(value, ["id", "name", "description", "coverImage", "createdAt"]);

const isUser = (value: unknown) =>
  isRecord(value) && hasStrings(value, ["id", "name", "email", "avatar", "createdAt"]);

const isProjectGroup = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasStrings(value, ["id", "name", "description", "coverImage", "colorTheme", "createdAt"])
  ) {
    return false;
  }

  return (
    value.nameI18n === undefined ||
    (isRecord(value.nameI18n) && Object.values(value.nameI18n).every((name) => typeof name === "string"))
  );
};

const isPerson = (value: unknown) =>
  isRecord(value) && hasStrings(value, ["id", "name", "role", "avatar", "type"]);

const isTool = (value: unknown) =>
  isRecord(value) && hasStrings(value, ["id", "name", "category"]);

const isCostLibraryItem = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "name", "category", "currency", "billingType"]) &&
  typeof value.amount === "number" &&
  typeof value.isActual === "boolean";

const isShareLink = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "projectId", "token", "createdAt"]) &&
  typeof value.allowCostPreview === "boolean";

const isPhaseArray = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    (phase) =>
      isRecord(phase) &&
      hasStrings(phase, ["id", "projectId", "name", "description", "startDate", "endDate", "status"]) &&
      Array.isArray(phase.deliverables) &&
      phase.deliverables.every(
        (deliverable) =>
          isRecord(deliverable) &&
          typeof deliverable.id === "string" &&
          isEntityArray(deliverable.tasks)
      )
  );

const isShareSettings = (value: unknown) =>
  isRecord(value) &&
  [
    "isEnabled",
    "allowCostPreview",
    "showPeople",
    "showTools",
    "showTimeline",
    "showDeliverables",
    "showMaterials",
    "showVersions"
  ].every((key) => typeof value[key] === "boolean");

const isProject = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, [
    "id",
    "companyId",
    "groupId",
    "name",
    "description",
    "coverImage",
    "startDate",
    "endDate",
    "currentPhaseId",
    "status"
  ]) &&
  typeof value.progress === "number" &&
  isEntityArray(value.tools) &&
  isEntityArray(value.people) &&
  isPhaseArray(value.phases) &&
  isEntityArray(value.costs) &&
  isEntityArray(value.payments) &&
  isEntityArray(value.materials) &&
  isEntityArray(value.versions) &&
  isEntityArray(value.activity) &&
  (value.timelineRows === undefined || isEntityArray(value.timelineRows)) &&
  isShareSettings(value.shareSettings);

const createPersistedDatabaseSnapshot = (): PersistedMockDatabase => ({
  users: mockDatabase.users,
  companies: mockDatabase.companies,
  groups: mockDatabase.groups,
  projects: mockDatabase.projects,
  people: mockDatabase.people,
  tools: mockDatabase.tools,
  costLibrary: mockDatabase.costLibrary,
  shareLinks: mockDatabase.shareLinks
});

const validatePersistedDatabase = (value: unknown): PersistedMockDatabase => {
  if (!isRecord(value)) {
    throw new Error("Invalid database backup");
  }

  const isValid =
    Array.isArray(value.users) &&
    value.users.every(isUser) &&
    Array.isArray(value.companies) &&
    value.companies.every(isCompany) &&
    Array.isArray(value.groups) &&
    value.groups.every(isProjectGroup) &&
    Array.isArray(value.projects) &&
    value.projects.every(isProject) &&
    Array.isArray(value.people) &&
    value.people.every(isPerson) &&
    Array.isArray(value.tools) &&
    value.tools.every(isTool) &&
    Array.isArray(value.costLibrary) &&
    value.costLibrary.every(isCostLibraryItem) &&
    Array.isArray(value.shareLinks) &&
    value.shareLinks.every(isShareLink);

  if (!isValid) {
    throw new Error("Invalid database backup");
  }

  return value as PersistedMockDatabase;
};

export function validateMockDatabaseBackup(value: unknown): MockDatabaseBackup {
  if (!isRecord(value)) {
    throw new Error("Invalid database backup");
  }

  if (
    value.schema !== mockDatabaseBackupSchema ||
    value.version !== mockDatabaseBackupVersion ||
    typeof value.exportedAt !== "string" ||
    Number.isNaN(Date.parse(value.exportedAt))
  ) {
    throw new Error("Unsupported database backup");
  }

  const preferences = value.preferences;

  if (
    preferences !== undefined &&
    (!isRecord(preferences) ||
      (preferences.language !== undefined && !languages.includes(preferences.language as Language)) ||
      (preferences.displayCurrency !== undefined && !isMoneyCurrency(preferences.displayCurrency)))
  ) {
    throw new Error("Invalid database backup preferences");
  }

  return {
    schema: mockDatabaseBackupSchema,
    version: mockDatabaseBackupVersion,
    exportedAt: value.exportedAt,
    database: validatePersistedDatabase(value.database),
    preferences: preferences as MockDatabaseBackup["preferences"]
  };
}

export function parseMockDatabaseBackup(content: string): MockDatabaseBackup {
  return validateMockDatabaseBackup(JSON.parse(content) as unknown);
}

const normalizePersistedGroup = (group: PersistedProjectGroup, seedGroup?: ProjectGroup): ProjectGroup => {
  const normalizedGroup = { ...group };
  delete normalizedGroup.companyId;
  const seedNameI18n = seedGroup?.name === group.name ? seedGroup.nameI18n : undefined;
  const nameI18n =
    seedNameI18n || group.nameI18n
      ? { ...seedNameI18n, ...group.nameI18n }
      : undefined;

  return { ...normalizedGroup, nameI18n };
};

const getSeedProjectIndex = (project: Project, fallbackIndex: number) => {
  const match = /^project-(\d+)$/.exec(project.id);

  return match ? Number(match[1]) - 1 : fallbackIndex;
};

const normalizePersistedVersions = (project: Project, projectIndex: number): ProjectVersion[] => {
  if (!Array.isArray(project.versions)) {
    return [];
  }

  const seedProjectIndex = getSeedProjectIndex(project, projectIndex);
  const seededDemoVersion = `v0.${seedProjectIndex + 1}.0`;
  const seededDemoReleaseDate = `2026-06-${String(6 + seedProjectIndex).padStart(2, "0")}`;

  return project.versions.map((version) => {
    const isReleaseNode = version.kind === "demo" || version.kind === "official";
    const isIncompleteRelease =
      isReleaseNode && (!version.versionNumber?.trim() || !version.releaseDate?.trim());
    const isSeededDemoRelease =
      version.kind === "demo" &&
      version.status === "released" &&
      version.versionNumber === seededDemoVersion &&
      version.releaseDate === seededDemoReleaseDate;

    if (!isIncompleteRelease && !isSeededDemoRelease) {
      return version;
    }

    return {
      ...version,
      releaseDate: undefined,
      status: "draft",
      versionNumber: undefined
    };
  });
};

export function hydrateMockDatabase() {
  if (hydrated || !canUseStorage()) {
    return;
  }

  hydrated = true;
  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return;
  }

  try {
    const persisted = JSON.parse(raw) as Partial<PersistedMockDatabase>;
    const seededGroupsById = new Map(mockDatabase.groups.map((group) => [group.id, group]));
    const seededToolsById = new Map(mockDatabase.tools.map((tool) => [tool.id, tool]));

    if (Array.isArray(persisted.users)) {
      mockDatabase.users = persisted.users;
    }

    if (Array.isArray(persisted.companies)) {
      mockDatabase.companies = persisted.companies;
    }

    if (Array.isArray(persisted.groups)) {
      mockDatabase.groups = persisted.groups.map((group) =>
        normalizePersistedGroup(group, seededGroupsById.get(group.id))
      );
    }

    if (Array.isArray(persisted.projects)) {
      mockDatabase.projects = persisted.projects;
      mockDatabase.projects = mockDatabase.projects.map((project, index) => ({
        ...project,
        archivedAt: project.archivedAt ?? null,
        payments: Array.isArray(project.payments) ? project.payments : createProjectPayments(project.id, index),
        versions: normalizePersistedVersions(project, index)
      }));
    }

    if (Array.isArray(persisted.people)) {
      mockDatabase.people = persisted.people;
    }

    if (Array.isArray(persisted.tools)) {
      mockDatabase.tools = persisted.tools.map((tool) => ({
        ...tool,
        subscription: tool.subscription ?? seededToolsById.get(tool.id)?.subscription
      }));
    }

    if (Array.isArray(persisted.costLibrary)) {
      mockDatabase.costLibrary = persisted.costLibrary;
    }

    if (Array.isArray(persisted.shareLinks)) {
      mockDatabase.shareLinks = persisted.shareLinks;
    }
  } catch {
    window.localStorage.removeItem(storageKey);
  }
}

export function persistMockDatabase() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify(createPersistedDatabaseSnapshot())
  );
}

export function createMockDatabaseBackup(): MockDatabaseBackup {
  hydrateMockDatabase();

  return structuredClone({
    schema: mockDatabaseBackupSchema,
    version: mockDatabaseBackupVersion,
    exportedAt: new Date().toISOString(),
    database: createPersistedDatabaseSnapshot(),
    preferences: {
      language: languages.find((language) => language === window.localStorage.getItem(languageStorageKey)),
      displayCurrency: (() => {
        const currency = window.localStorage.getItem(displayCurrencyStorageKey);
        return isMoneyCurrency(currency) ? currency : undefined;
      })()
    }
  } satisfies MockDatabaseBackup);
}

export function restoreMockDatabaseBackup(value: unknown) {
  if (!canUseStorage()) {
    throw new Error("Database backup restore requires browser storage");
  }

  const backup = validateMockDatabaseBackup(value);
  const restoredDatabase = structuredClone({
    ...backup.database,
    groups: backup.database.groups.map((group) => normalizePersistedGroup(group))
  } satisfies PersistedMockDatabase);
  const serializedDatabase = JSON.stringify(restoredDatabase);

  window.localStorage.setItem(storageKey, serializedDatabase);

  if (backup.preferences?.language) {
    window.localStorage.setItem(languageStorageKey, backup.preferences.language);
  }

  if (backup.preferences?.displayCurrency) {
    window.localStorage.setItem(displayCurrencyStorageKey, backup.preferences.displayCurrency);
  }

  mockDatabase.users = restoredDatabase.users;
  mockDatabase.companies = restoredDatabase.companies;
  mockDatabase.groups = restoredDatabase.groups;
  mockDatabase.projects = restoredDatabase.projects;
  mockDatabase.people = restoredDatabase.people;
  mockDatabase.tools = restoredDatabase.tools;
  mockDatabase.costLibrary = restoredDatabase.costLibrary;
  mockDatabase.shareLinks = restoredDatabase.shareLinks;
  hydrated = true;
}
