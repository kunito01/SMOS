import {
  bundledExampleProjectIds,
  createEmptyMockDatabase,
  createMockDatabase,
  createProjectPayments,
  mockDatabase
} from "@/lib/mock";
import { languages, type Language } from "@/lib/i18n/translations";
import {
  buildEncryptedPublicShareRecords,
  type EncryptedPublicSharePayload
} from "@/lib/security/public-share-storage";
import {
  decryptWorkspaceRecord,
  encryptWorkspaceRecord,
  type WorkspaceMasterKey
} from "@/lib/security/workspace-crypto";
import {
  captureEncryptedWorkspaceBundle,
  deleteEncryptedWorkspaceBundle,
  getEncryptedWorkspaceRecord,
  replaceEncryptedWorkspaceBundle,
  restoreEncryptedWorkspaceBundle,
  type EncryptedWorkspaceBundleSnapshot
} from "@/lib/storage/indexed-db";
import { noteWorkspaceLocalSave } from "@/lib/storage/workspace-sync-coordinator";
import { assertWorkspaceWritable } from "@/lib/storage/workspace-write-guard";
import {
  bumpWorkspaceMutationEpoch,
  getWorkspaceMutationEpoch,
  withWorkspaceMutationLock
} from "@/lib/storage/workspace-mutation-lock";
import type { Company, CostLibraryItem, Person, Project, ProjectGroup, ProjectVersion, ProjectWorkflow, ShareLink, Tool, User } from "@/lib/types";
import { synchronizeCostTemplateLinks } from "@/lib/utils/cost-template-links";
import { isMoneyCurrency, type MoneyCurrency } from "@/lib/utils/money";
import { normalizeProjectBudgetForPhases } from "@/lib/utils/project-budget-normalize";
import {
  isProjectWorkflowIds,
  isProjectWorkflows,
  isWorkflowLibrary,
  normalizeProjectWorkflow,
  normalizeProjectWorkflowIds,
  normalizeProjectWorkflows,
  normalizeWorkflowLibrary
} from "@/lib/utils/project-workflow";

const legacyStorageKey = "studio-map-os.mock-database";
const legacyClaimMarkerStorageKey = "studio-map-os.mock-database.claimed-workspace-id";
const workspaceStorageKey = (workspaceId: string) =>
  `studio-map-os.workspace.${workspaceId}.database`;

let activeWorkspaceId: string | null = null;
let activeWorkspaceMasterKey: WorkspaceMasterKey | null = null;
let activeWorkspaceGeneration = 0;
let hydrated = false;
let hydrationFailed = false;
let hydrationPromise: Promise<void> | null = null;
let lastPersistedDatabase: PersistedMockDatabase | null = null;
let persistenceQueue: Promise<void> = Promise.resolve();
let persistenceFailureEpoch = 0;

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
  workflows: ProjectWorkflow[];
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

export type MockDatabaseWorkspaceStorageSnapshot = {
  encryptedBundle: EncryptedWorkspaceBundleSnapshot<EncryptedPublicSharePayload>;
  displayCurrency: string | null;
  language: string | null;
  legacyClaimMarker: string | null;
  legacyRaw: string | null;
  workspaceId: string;
  workspaceRaw: string | null;
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
  isRecord(value) &&
  hasStrings(value, ["id", "name", "role", "avatar", "type"]) &&
  (value.costTemplateId === undefined || typeof value.costTemplateId === "string");

const isTool = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "name", "category"]) &&
  (value.costTemplateId === undefined || typeof value.costTemplateId === "string");

const isCostLibraryItem = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "name", "category", "currency", "billingType"]) &&
  typeof value.amount === "number" &&
  typeof value.isActual === "boolean";

const isShareLink = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "projectId", "token", "createdAt"]) &&
  typeof value.allowCostPreview === "boolean" &&
  (value.displayCurrency === undefined || isMoneyCurrency(value.displayCurrency));

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isFiniteNonNegativeInteger = (value: unknown) =>
  isFiniteNonNegativeNumber(value) && Number.isInteger(value);

const isPercentage = (value: unknown) =>
  isFiniteNonNegativeNumber(value) && value <= 100;

const hasBudgetUsageRange = (value: Record<string, unknown>) =>
  hasStrings(value, ["startDate", "endDate"]) && isPercentage(value.allocationPercent);

const isProjectBudgetPersonnelLine = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "roleLevel", "currency"]) &&
  (value.personId === undefined || typeof value.personId === "string") &&
  isMoneyCurrency(value.currency) &&
  isFiniteNonNegativeInteger(value.headcount) &&
  isFiniteNonNegativeNumber(value.hourlyRate) &&
  (hasBudgetUsageRange(value) || isFiniteNonNegativeInteger(value.days));

const isProjectBudgetTravel = (value: unknown) =>
  isRecord(value) &&
  typeof value.currency === "string" &&
  isMoneyCurrency(value.currency) &&
  isFiniteNonNegativeNumber(value.unitPrice) &&
  isFiniteNonNegativeInteger(value.count);

const isProjectBudgetDirectExpense = (value: unknown) =>
  isRecord(value) &&
  typeof value.currency === "string" &&
  isMoneyCurrency(value.currency) &&
  isFiniteNonNegativeNumber(value.amount);

const isProjectBudgetDailyExpenseLine = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "name", "currency"]) &&
  isMoneyCurrency(value.currency) &&
  isFiniteNonNegativeNumber(value.amount);

const isProjectBudgetExtraCostLine = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "name", "currency", "kind"]) &&
  (value.costTemplateId === undefined || typeof value.costTemplateId === "string") &&
  (value.kind === "outsourcing" || value.kind === "extra") &&
  isMoneyCurrency(value.currency) &&
  isFiniteNonNegativeNumber(value.amount);

const isProjectBudgetSoftwareCostLine = (value: unknown) =>
  isRecord(value) &&
  hasStrings(value, ["id", "name", "currency", "billingCycle"]) &&
  (value.toolId === undefined || typeof value.toolId === "string") &&
  isMoneyCurrency(value.currency) &&
  (value.billingCycle === "monthly" || value.billingCycle === "yearly") &&
  isFiniteNonNegativeNumber(value.amount) &&
  (hasBudgetUsageRange(value) || isFiniteNonNegativeInteger(value.periods));

const isProjectPhaseBudget = (value: unknown) =>
  isRecord(value) &&
  typeof value.phaseId === "string" &&
  Array.isArray(value.personnel) &&
  value.personnel.every(isProjectBudgetPersonnelLine) &&
  (value.travel === undefined || isProjectBudgetTravel(value.travel)) &&
  (value.dailyExpenseLines === undefined || (
    Array.isArray(value.dailyExpenseLines) &&
    value.dailyExpenseLines.every(isProjectBudgetDailyExpenseLine)
  )) &&
  (value.dailyExpenses === undefined || isProjectBudgetDirectExpense(value.dailyExpenses)) &&
  Array.isArray(value.extraCosts) &&
  value.extraCosts.every(isProjectBudgetExtraCostLine) &&
  Array.isArray(value.softwareCosts) &&
  value.softwareCosts.every(isProjectBudgetSoftwareCostLine);

const isProjectBudget = (value: unknown) =>
  isRecord(value) &&
  Array.isArray(value.phases) &&
  value.phases.every(isProjectPhaseBudget) &&
  isPercentage(value.contingencyPercent) &&
  isPercentage(value.taxPercent);

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
  (value.archiveIdentity === undefined || typeof value.archiveIdentity === "string") &&
  (value.isExample === undefined || typeof value.isExample === "boolean") &&
  (value.importPlaceholder === undefined || typeof value.importPlaceholder === "boolean") &&
  (value.timelineConfigured === undefined || typeof value.timelineConfigured === "boolean") &&
  (value.timelineRows === undefined || isEntityArray(value.timelineRows)) &&
  (value.workflowIds === undefined || isProjectWorkflowIds(value.workflowIds)) &&
  (value.workflows === undefined || isProjectWorkflows(value.workflows)) &&
  (value.budget === undefined || isProjectBudget(value.budget)) &&
  isShareSettings(value.shareSettings);

const createPersistedDatabaseSnapshot = (): PersistedMockDatabase => ({
  users: mockDatabase.users,
  companies: mockDatabase.companies,
  groups: mockDatabase.groups,
  projects: mockDatabase.projects,
  people: mockDatabase.people,
  tools: mockDatabase.tools,
  costLibrary: mockDatabase.costLibrary,
  workflows: mockDatabase.workflows,
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
    Array.isArray(value.workflows) &&
    isWorkflowLibrary(value.workflows) &&
    Array.isArray(value.shareLinks) &&
    value.shareLinks.every(isShareLink);

  if (!isValid) {
    throw new Error("Invalid database backup");
  }

  const database = value as PersistedMockDatabase;
  const workflowIds = new Set(database.workflows.map((workflow) => workflow.id));
  if (
    database.projects.some((project) =>
      normalizeProjectWorkflowIds(project.workflowIds).some((workflowId) => !workflowIds.has(workflowId))
    )
  ) {
    throw new Error("Invalid database workflow references");
  }

  return database;
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
    database: normalizePersistedDatabase(value.database, { allowLegacyProjectShape: true }),
    preferences: preferences as MockDatabaseBackup["preferences"]
  };
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

const normalizePersistedProject = (
  project: Project,
  projectIndex: number,
  tools: ReadonlyArray<Tool>,
  seedProject?: Project
): Project => {
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const projectTools = Array.isArray(project.tools) ? project.tools : [];
  const toolsById = new Map<string, Tool>();

  projectTools.forEach((tool) => toolsById.set(tool.id, tool));
  tools.forEach((tool) => toolsById.set(tool.id, tool));

  return {
    ...project,
    isExample: project.isExample ?? Boolean(seedProject && seedProject.name === project.name),
    archivedAt: project.archivedAt ?? null,
    budget: normalizeProjectBudgetForPhases(project.budget, phases, [...toolsById.values()]),
    workflowIds: normalizeProjectWorkflowIds(project.workflowIds),
    ...(project.workflows === undefined
      ? {}
      : { workflows: normalizeProjectWorkflows(project.workflows) }),
    payments: Array.isArray(project.payments)
      ? project.payments
      : createProjectPayments(project.id, projectIndex),
    versions: normalizePersistedVersions(project, projectIndex)
  };
};

const hashWorkflowMigrationKey = (value: string) => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const migrateEmbeddedProjectWorkflows = (
  globalWorkflows: ReadonlyArray<ProjectWorkflow>,
  projects: ReadonlyArray<Project>
) => {
  const workflows: ProjectWorkflow[] = structuredClone([...globalWorkflows]);
  const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const signatureToId = new Map(
    workflows.map((workflow) => [JSON.stringify(workflow), workflow.id])
  );

  const normalizedProjects = projects.map((project) => {
    const linkedIds = normalizeProjectWorkflowIds(project.workflowIds);
    const embeddedWorkflows = normalizeProjectWorkflows(project.workflows);
    const linkMigratedWorkflow = (sourceId: string, destinationId: string) => {
      const sourceIndex = linkedIds.indexOf(sourceId);
      if (sourceIndex >= 0) {
        if (linkedIds.includes(destinationId) && sourceId !== destinationId) {
          linkedIds.splice(sourceIndex, 1);
        } else {
          linkedIds[sourceIndex] = destinationId;
        }
      } else if (!linkedIds.includes(destinationId)) {
        linkedIds.push(destinationId);
      }
    };

    for (const embeddedWorkflow of embeddedWorkflows) {
      const signature = JSON.stringify(embeddedWorkflow);
      const knownEquivalentId = signatureToId.get(signature);
      if (knownEquivalentId) {
        linkMigratedWorkflow(embeddedWorkflow.id, knownEquivalentId);
        continue;
      }

      let workflowId = embeddedWorkflow.id;
      if (workflowsById.has(workflowId)) {
        const suffix = `:migrated:${hashWorkflowMigrationKey(`${project.id}:${signature}`)}`;
        workflowId = `${workflowId.slice(0, 160 - suffix.length)}${suffix}`;
        let collisionIndex = 2;
        while (workflowsById.has(workflowId)) {
          const collisionSuffix = `:${collisionIndex}`;
          workflowId = `${workflowId.slice(0, 160 - collisionSuffix.length)}${collisionSuffix}`;
          collisionIndex += 1;
        }
      }

      const migratedWorkflow = normalizeProjectWorkflow({
        ...embeddedWorkflow,
        id: workflowId
      });
      workflows.push(migratedWorkflow);
      workflowsById.set(workflowId, migratedWorkflow);
      signatureToId.set(signature, workflowId);
      linkMigratedWorkflow(embeddedWorkflow.id, workflowId);
    }

    const projectWithoutEmbeddedWorkflows = { ...project };
    delete projectWithoutEmbeddedWorkflows.workflows;
    return {
      ...projectWithoutEmbeddedWorkflows,
      workflowIds: normalizeProjectWorkflowIds(linkedIds)
    } satisfies Project;
  });

  return {
    projects: normalizedProjects,
    workflows: normalizeWorkflowLibrary(workflows)
  };
};

const resetMockDatabase = () => {
  Object.assign(mockDatabase, createMockDatabase());
};

const normalizeWorkspaceId = (workspaceId: string) => workspaceId.trim();

export const retainBundledExampleProjects = (
  database: PersistedMockDatabase
): PersistedMockDatabase => {
  const removedExampleProjectIds = new Set(
    database.projects
      .filter(
        (project) => project.isExample === true && !bundledExampleProjectIds.has(project.id)
      )
      .map((project) => project.id)
  );

  if (removedExampleProjectIds.size === 0) {
    return database;
  }

  return {
    ...database,
    projects: database.projects.filter(
      (project) => !removedExampleProjectIds.has(project.id)
    ),
    shareLinks: database.shareLinks.filter(
      (shareLink) => !removedExampleProjectIds.has(shareLink.projectId)
    )
  };
};

const normalizePersistedDatabase = (
  value: unknown,
  options: { allowLegacyProjectShape?: boolean } = {}
): PersistedMockDatabase => {
  void options;
  if (!isRecord(value)) {
    throw new Error("Invalid persisted database");
  }

  const collectionKeys = [
    "users",
    "companies",
    "groups",
    "projects",
    "people",
    "tools",
    "costLibrary",
    "shareLinks"
  ] as const;

  if (!collectionKeys.every((key) => Array.isArray(value[key]))) {
    throw new Error("Invalid persisted database collections");
  }

  const persisted = retainBundledExampleProjects({
    ...(value as unknown as Omit<PersistedMockDatabase, "workflows">),
    workflows: normalizeWorkflowLibrary(value.workflows)
  });
  const seedDatabase = createMockDatabase();
  const seededGroupsById = new Map(seedDatabase.groups.map((group) => [group.id, group]));
  const seededProjectsById = new Map(seedDatabase.projects.map((project) => [project.id, project]));
  const seededToolsById = new Map(seedDatabase.tools.map((tool) => [tool.id, tool]));
  const normalizedTools = persisted.tools.map((tool) => ({
    ...tool,
    subscription: tool.subscription ?? seededToolsById.get(tool.id)?.subscription
  }));
  const normalizedProjects = persisted.projects.map((project, index) =>
    normalizePersistedProject(project, index, normalizedTools, seededProjectsById.get(project.id))
  );
  const migratedWorkflows = migrateEmbeddedProjectWorkflows(
    persisted.workflows,
    normalizedProjects
  );
  const hydratedDatabase: PersistedMockDatabase = {
    users: persisted.users,
    companies: persisted.companies,
    groups: persisted.groups.map((group) =>
      normalizePersistedGroup(group, seededGroupsById.get(group.id))
    ),
    projects: migratedWorkflows.projects,
    people: persisted.people,
    tools: normalizedTools,
    costLibrary: persisted.costLibrary,
    workflows: migratedWorkflows.workflows,
    shareLinks: persisted.shareLinks
  };

  synchronizeCostTemplateLinks(hydratedDatabase);

  return structuredClone(validatePersistedDatabase(hydratedDatabase));
};

const cloneDatabaseSnapshot = (database: PersistedMockDatabase) =>
  structuredClone(database);

const applyDatabaseSnapshot = (database: PersistedMockDatabase) => {
  Object.assign(mockDatabase, cloneDatabaseSnapshot(database));
};

const getRequiredActiveWorkspace = () => {
  if (!activeWorkspaceId || !activeWorkspaceMasterKey) {
    throw new Error("No encrypted database workspace is active");
  }

  return {
    generation: activeWorkspaceGeneration,
    masterKey: new Uint8Array(activeWorkspaceMasterKey) as WorkspaceMasterKey,
    workspaceId: activeWorkspaceId
  };
};

const readLegacyWorkspaceRaw = (workspaceId: string) =>
  canUseStorage() ? window.localStorage.getItem(workspaceStorageKey(workspaceId)) : null;

const removeVerifiedLegacyPlaintextCopies = (workspaceId: string) => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(workspaceStorageKey(workspaceId));
  if (window.localStorage.getItem(legacyClaimMarkerStorageKey) === workspaceId) {
    window.localStorage.removeItem(legacyStorageKey);
  }
};

const persistEncryptedDatabaseSnapshot = async (
  database: PersistedMockDatabase,
  workspaceId: string,
  masterKey: WorkspaceMasterKey,
  options: {
    bumpMutationEpochAfterPersist?: boolean;
    expectedMutationEpoch?: number;
    validateActive?: () => void;
  } = {}
) => {
  const expectedMutationEpoch =
    options.expectedMutationEpoch ?? getWorkspaceMutationEpoch(workspaceId);

  return withWorkspaceMutationLock(workspaceId, async () => {
    options.validateActive?.();
    if (getWorkspaceMutationEpoch(workspaceId) !== expectedMutationEpoch) {
      throw new Error("The workspace changed before its encrypted save completed");
    }

    const normalizedDatabase = normalizePersistedDatabase(database);
    const [workspaceRecord, publicShareRecords] = await Promise.all([
      encryptWorkspaceRecord({
        workspaceId,
        payload: normalizedDatabase,
        masterKey
      }),
      buildEncryptedPublicShareRecords(normalizedDatabase, workspaceId)
    ]);

    options.validateActive?.();
    if (getWorkspaceMutationEpoch(workspaceId) !== expectedMutationEpoch) {
      throw new Error("The workspace changed before its encrypted save completed");
    }

    await replaceEncryptedWorkspaceBundle({
      workspaceRecord,
      publicShareRecords
    });
    if (options.bumpMutationEpochAfterPersist) {
      bumpWorkspaceMutationEpoch(workspaceId);
    }
    noteWorkspaceLocalSave(workspaceId);

    return normalizedDatabase;
  });
};

const claimLegacyMockDatabase = (workspaceId: string) => {
  const targetKey = workspaceStorageKey(workspaceId);

  if (
    window.localStorage.getItem(legacyClaimMarkerStorageKey) !== null ||
    window.localStorage.getItem(targetKey) !== null
  ) {
    return;
  }

  const legacyRaw = window.localStorage.getItem(legacyStorageKey);

  if (legacyRaw === null) {
    return;
  }

  try {
    const parsed = JSON.parse(legacyRaw) as unknown;

    if (!isRecord(parsed)) {
      return;
    }
  } catch {
    return;
  }

  window.localStorage.setItem(targetKey, legacyRaw);

  try {
    window.localStorage.setItem(legacyClaimMarkerStorageKey, workspaceId);
  } catch (error) {
    window.localStorage.removeItem(targetKey);
    throw error;
  }
};

export function getActiveMockDatabaseWorkspaceId() {
  return activeWorkspaceId;
}

export function hasLegacyMockDatabase() {
  return canUseStorage() && window.localStorage.getItem(legacyStorageKey) !== null;
}

export async function hasWorkspaceMockDatabase(workspaceId: string) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  if (!normalizedWorkspaceId) {
    return false;
  }

  return Boolean(
    (await getEncryptedWorkspaceRecord(normalizedWorkspaceId)) ||
      readLegacyWorkspaceRaw(normalizedWorkspaceId)
  );
}

/**
 * Reads one workspace directly from its persisted browser record without
 * activating it, hydrating the shared in-memory database, or applying seed
 * fallbacks. Public capability links use this strict read path so another
 * signed-in workspace can never influence the result.
 */
export async function readMockDatabaseWorkspaceSnapshot(
  workspaceId: string,
  masterKey: WorkspaceMasterKey
): Promise<PersistedMockDatabase | null> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  if (!normalizedWorkspaceId) {
    throw new Error("A browser database workspace is required");
  }

  const encryptedRecord = await getEncryptedWorkspaceRecord(normalizedWorkspaceId);

  if (encryptedRecord) {
    const decrypted = await decryptWorkspaceRecord<unknown>(
      encryptedRecord,
      masterKey,
      normalizedWorkspaceId
    );
    return normalizePersistedDatabase(decrypted);
  }

  const raw = readLegacyWorkspaceRaw(normalizedWorkspaceId);

  if (raw === null) {
    return null;
  }

  return normalizePersistedDatabase(JSON.parse(raw) as unknown, {
    allowLegacyProjectShape: true
  });
}

export async function captureMockDatabaseWorkspaceStorage(
  workspaceId: string,
  options: { discardCorruptBundleForVerifiedRecovery?: boolean } = {}
): Promise<MockDatabaseWorkspaceStorageSnapshot> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  if (!normalizedWorkspaceId || !canUseStorage()) {
    throw new Error("A browser database workspace is required");
  }

  let encryptedBundle: EncryptedWorkspaceBundleSnapshot<EncryptedPublicSharePayload>;

  try {
    encryptedBundle = await captureEncryptedWorkspaceBundle<EncryptedPublicSharePayload>(
      normalizedWorkspaceId
    );
  } catch (error) {
    if (!options.discardCorruptBundleForVerifiedRecovery) {
      throw error;
    }

    await deleteEncryptedWorkspaceBundle(normalizedWorkspaceId);
    encryptedBundle = await captureEncryptedWorkspaceBundle<EncryptedPublicSharePayload>(
      normalizedWorkspaceId
    );
  }

  return {
    encryptedBundle,
    displayCurrency: window.localStorage.getItem(displayCurrencyStorageKey),
    language: window.localStorage.getItem(languageStorageKey),
    legacyClaimMarker: window.localStorage.getItem(legacyClaimMarkerStorageKey),
    legacyRaw: window.localStorage.getItem(legacyStorageKey),
    workspaceId: normalizedWorkspaceId,
    workspaceRaw: window.localStorage.getItem(workspaceStorageKey(normalizedWorkspaceId))
  };
}

export async function restoreMockDatabaseWorkspaceStorage(
  snapshot: MockDatabaseWorkspaceStorageSnapshot
) {
  if (!canUseStorage()) {
    throw new Error("Browser storage is unavailable");
  }

  const restoreValue = (key: string, value: string | null) => {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  };

  await withWorkspaceMutationLock(snapshot.workspaceId, async () => {
    const currentValues = {
      displayCurrency: window.localStorage.getItem(displayCurrencyStorageKey),
      language: window.localStorage.getItem(languageStorageKey),
      legacyClaimMarker: window.localStorage.getItem(legacyClaimMarkerStorageKey),
      legacyRaw: window.localStorage.getItem(legacyStorageKey),
      workspaceRaw: window.localStorage.getItem(workspaceStorageKey(snapshot.workspaceId))
    };

    try {
      restoreValue(workspaceStorageKey(snapshot.workspaceId), snapshot.workspaceRaw);
      restoreValue(legacyClaimMarkerStorageKey, snapshot.legacyClaimMarker);
      restoreValue(legacyStorageKey, snapshot.legacyRaw);
      restoreValue(languageStorageKey, snapshot.language);
      restoreValue(displayCurrencyStorageKey, snapshot.displayCurrency);
      await restoreEncryptedWorkspaceBundle(snapshot.encryptedBundle);
      bumpWorkspaceMutationEpoch(snapshot.workspaceId);
    } catch (error) {
      restoreValue(workspaceStorageKey(snapshot.workspaceId), currentValues.workspaceRaw);
      restoreValue(legacyClaimMarkerStorageKey, currentValues.legacyClaimMarker);
      restoreValue(legacyStorageKey, currentValues.legacyRaw);
      restoreValue(languageStorageKey, currentValues.language);
      restoreValue(displayCurrencyStorageKey, currentValues.displayCurrency);
      throw error;
    }
  });
}

export async function finalizeLegacyMockDatabaseClaim(workspaceId: string) {
  if (!canUseStorage()) {
    return;
  }

  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const claimedWorkspaceId = window.localStorage.getItem(legacyClaimMarkerStorageKey);
  const encryptedRecord = normalizedWorkspaceId
    ? await getEncryptedWorkspaceRecord(normalizedWorkspaceId)
    : null;

  if (claimedWorkspaceId === normalizedWorkspaceId && encryptedRecord !== null) {
    // The workspace-scoped copy is now authoritative. Keeping the old global
    // copy would leave a second, stale plaintext database available forever.
    window.localStorage.removeItem(legacyStorageKey);
    window.localStorage.removeItem(workspaceStorageKey(normalizedWorkspaceId));
  }
}

export async function activateMockDatabaseWorkspace(
  workspaceId: string,
  masterKey: WorkspaceMasterKey,
  options: {
    allowCreate?: boolean;
    allowRecoveryOverwrite?: boolean;
    claimLegacy?: boolean;
    initialDatabase?: "examples" | "empty";
  } = {}
) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  if (!normalizedWorkspaceId) {
    throw new Error("A database workspace ID is required");
  }

  const generation = activeWorkspaceGeneration + 1;
  activeWorkspaceGeneration = generation;
  activeWorkspaceMasterKey?.fill(0);
  activeWorkspaceMasterKey = new Uint8Array(masterKey) as WorkspaceMasterKey;
  activeWorkspaceId = normalizedWorkspaceId;
  hydrated = false;
  hydrationFailed = false;
  lastPersistedDatabase = null;
  resetMockDatabase();

  if (!canUseStorage()) {
    throw new Error("Browser storage is unavailable");
  }

  if (options.claimLegacy) {
    claimLegacyMockDatabase(normalizedWorkspaceId);
  }

  const activationKey = new Uint8Array(masterKey) as WorkspaceMasterKey;
  const currentHydration = (async () => {
    try {
      let encryptedRecord;

      try {
        encryptedRecord = await getEncryptedWorkspaceRecord(normalizedWorkspaceId);
      } catch (error) {
        if (!options.allowRecoveryOverwrite) {
          throw error;
        }
        encryptedRecord = null;
      }

      if (generation !== activeWorkspaceGeneration) {
        throw new Error("Workspace activation was superseded");
      }

      if (encryptedRecord) {
        try {
          const decrypted = await decryptWorkspaceRecord<unknown>(
            encryptedRecord,
            activationKey,
            normalizedWorkspaceId
          );
          const database = normalizePersistedDatabase(decrypted);

          applyDatabaseSnapshot(database);
          lastPersistedDatabase = cloneDatabaseSnapshot(database);
          hydrated = true;
          removeVerifiedLegacyPlaintextCopies(normalizedWorkspaceId);
          return;
        } catch (error) {
          if (!options.allowRecoveryOverwrite) {
            throw error;
          }
        }
      }

      const legacyRaw = readLegacyWorkspaceRaw(normalizedWorkspaceId);

      if (legacyRaw !== null) {
        const database = normalizePersistedDatabase(JSON.parse(legacyRaw) as unknown, {
          allowLegacyProjectShape: true
        });

        if (generation !== activeWorkspaceGeneration) {
          throw new Error("Workspace activation was superseded");
        }

        await persistEncryptedDatabaseSnapshot(database, normalizedWorkspaceId, activationKey);
        const verificationRecord = await getEncryptedWorkspaceRecord(normalizedWorkspaceId);

        if (!verificationRecord) {
          throw new Error("The encrypted IndexedDB migration could not be verified");
        }

        const verifiedDatabase = normalizePersistedDatabase(
          await decryptWorkspaceRecord<unknown>(
            verificationRecord,
            activationKey,
            normalizedWorkspaceId
          )
        );

        if (generation !== activeWorkspaceGeneration) {
          throw new Error("Workspace activation was superseded");
        }

        applyDatabaseSnapshot(verifiedDatabase);
        lastPersistedDatabase = cloneDatabaseSnapshot(verifiedDatabase);
        hydrated = true;
        removeVerifiedLegacyPlaintextCopies(normalizedWorkspaceId);
        return;
      }

      if (!options.allowCreate && !options.allowRecoveryOverwrite) {
        throw new Error("The encrypted workspace database is missing");
      }

      const seedDatabase = normalizePersistedDatabase(
        options.initialDatabase === "empty" ? createEmptyMockDatabase() : createMockDatabase()
      );
      applyDatabaseSnapshot(seedDatabase);
      lastPersistedDatabase = cloneDatabaseSnapshot(seedDatabase);
      hydrated = true;
    } catch (error) {
      if (generation === activeWorkspaceGeneration) {
        hydrationFailed = true;
      }
      throw error;
    } finally {
      activationKey.fill(0);
    }
  })();

  hydrationPromise = currentHydration;

  try {
    await currentHydration;
  } finally {
    if (hydrationPromise === currentHydration) {
      hydrationPromise = null;
    }
  }
}

export function deactivateMockDatabaseWorkspace() {
  activeWorkspaceGeneration += 1;
  activeWorkspaceMasterKey?.fill(0);
  activeWorkspaceMasterKey = null;
  activeWorkspaceId = null;
  hydrated = false;
  hydrationFailed = false;
  hydrationPromise = null;
  lastPersistedDatabase = null;
  resetMockDatabase();
}

export async function hydrateMockDatabase() {
  if (hydrationPromise) {
    await hydrationPromise;
  }

  if (!activeWorkspaceId || !activeWorkspaceMasterKey) {
    throw new Error("No encrypted database workspace is active");
  }

  if (!hydrated || hydrationFailed) {
    throw new Error("The active encrypted workspace database is unavailable");
  }
}

export async function persistMockDatabase(
  options: { bumpMutationEpochAfterPersist?: boolean; notifyOnConflictRefusal?: boolean } = {}
) {
  await hydrateMockDatabase();

  const database = normalizePersistedDatabase(createPersistedDatabaseSnapshot());
  const identity = getRequiredActiveWorkspace();
  const failureEpoch = persistenceFailureEpoch;
  const expectedMutationEpoch = getWorkspaceMutationEpoch(identity.workspaceId);
  const operation = persistenceQueue.then(async () => {
    try {
      const validateActive = () => {
        if (
          identity.generation !== activeWorkspaceGeneration ||
          failureEpoch !== persistenceFailureEpoch
        ) {
          throw new Error("The workspace changed before its encrypted save completed");
        }
      };

      validateActive();

      try {
        // Throwing inside this try rolls the in-memory database back to the
        // last persisted snapshot, so a refused save leaves no phantom edits.
        assertWorkspaceWritable(identity.workspaceId, {
          notify: options.notifyOnConflictRefusal ?? true
        });

        const persistedDatabase = await persistEncryptedDatabaseSnapshot(
          database,
          identity.workspaceId,
          identity.masterKey,
          {
            bumpMutationEpochAfterPersist: options.bumpMutationEpochAfterPersist,
            expectedMutationEpoch,
            validateActive
          }
        );

        if (identity.generation === activeWorkspaceGeneration) {
          lastPersistedDatabase = cloneDatabaseSnapshot(persistedDatabase);
          removeVerifiedLegacyPlaintextCopies(identity.workspaceId);
        }
      } catch (error) {
        if (
          identity.generation === activeWorkspaceGeneration &&
          getWorkspaceMutationEpoch(identity.workspaceId) === expectedMutationEpoch
        ) {
          persistenceFailureEpoch += 1;
          if (lastPersistedDatabase) {
            applyDatabaseSnapshot(lastPersistedDatabase);
          }
        }
        throw error;
      }
    } finally {
      identity.masterKey.fill(0);
    }
  });

  persistenceQueue = operation.catch(() => undefined);
  await operation;
}

export async function createMockDatabaseBackup(): Promise<MockDatabaseBackup> {
  if (!canUseStorage()) {
    throw new Error("Database backup creation requires browser storage");
  }

  await hydrateMockDatabase();

  if (hydrationFailed) {
    throw new Error("The active workspace database is corrupt and cannot be exported");
  }

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

export async function restoreMockDatabaseBackup(value: unknown) {
  if (!canUseStorage()) {
    throw new Error("Database backup restore requires browser storage");
  }

  await hydrateMockDatabase();
  const identity = getRequiredActiveWorkspace();
  identity.masterKey.fill(0);

  const backup = validateMockDatabaseBackup(value);
  const restoredDatabase = normalizePersistedDatabase({
    ...backup.database,
    groups: backup.database.groups.map((group) => normalizePersistedGroup(group)),
    projects: backup.database.projects.map((project, index) =>
      normalizePersistedProject(project, index, backup.database.tools)
    ),
    shareLinks: backup.database.shareLinks.map((link) => ({
      ...link,
      displayCurrency: backup.preferences?.displayCurrency ?? link.displayCurrency ?? "CNY"
    }))
  } satisfies PersistedMockDatabase);
  const previousDatabase = cloneDatabaseSnapshot(
    lastPersistedDatabase ?? normalizePersistedDatabase(createPersistedDatabaseSnapshot())
  );
  const previousBundle = await captureEncryptedWorkspaceBundle<EncryptedPublicSharePayload>(
    identity.workspaceId
  );
  const previousLanguage = window.localStorage.getItem(languageStorageKey);
  const previousDisplayCurrency = window.localStorage.getItem(displayCurrencyStorageKey);

  const restoreStoredValue = (key: string, previousValue: string | null) => {
    if (previousValue === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, previousValue);
    }
  };

  let encryptedWorkspacePersisted = false;

  try {
    applyDatabaseSnapshot(restoredDatabase);
    await persistMockDatabase({ bumpMutationEpochAfterPersist: true });
    encryptedWorkspacePersisted = true;

    if (backup.preferences?.language) {
      window.localStorage.setItem(languageStorageKey, backup.preferences.language);
    }

    if (backup.preferences?.displayCurrency) {
      window.localStorage.setItem(displayCurrencyStorageKey, backup.preferences.displayCurrency);
    }
  } catch (error) {
    if (encryptedWorkspacePersisted) {
      try {
        await withWorkspaceMutationLock(identity.workspaceId, async () => {
          await restoreEncryptedWorkspaceBundle(previousBundle);
          bumpWorkspaceMutationEpoch(identity.workspaceId);
        });
        restoreStoredValue(languageStorageKey, previousLanguage);
        restoreStoredValue(displayCurrencyStorageKey, previousDisplayCurrency);
        applyDatabaseSnapshot(previousDatabase);
        lastPersistedDatabase = cloneDatabaseSnapshot(previousDatabase);
      } catch {
        // The caller also holds an outer workspace snapshot and will make one
        // more rollback attempt before reporting the restore failure.
      }
    }

    throw error;
  }

  hydrated = true;
  hydrationFailed = false;
}
