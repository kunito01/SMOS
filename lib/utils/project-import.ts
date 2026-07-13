import type { Project } from "@/lib/types";

export const legacyProjectSaveSchema = "studio-map-os.project-save.v1" as const;
export const projectSaveSchema = "studio-map-os.project-save.v2" as const;

export type ProjectImportMode = "blank-target" | "same-project";
export type ProjectImportBlockedReason = "identity" | "legacy" | "name";

export type ValidatedProjectSave = {
  format: "v1" | "v2";
  project: Project;
  projectIdentity?: string;
  savedAt: string;
};

export type ProjectImportDecision =
  | { allowed: true; mode: ProjectImportMode }
  | { allowed: false; reason: ProjectImportBlockedReason };

type ProjectSaveV2 = {
  schema: typeof projectSaveSchema;
  savedAt: string;
  projectIdentity: string;
  project: Project;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === "string";

const isEntityArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => isRecord(item) && hasString(item, "id"));

const isTask = (value: unknown) =>
  isRecord(value) &&
  ["id", "deliverableId", "title", "assigneeId", "priority"].every((key) => hasString(value, key)) &&
  typeof value.completed === "boolean";

const isDeliverable = (value: unknown) =>
  isRecord(value) &&
  ["id", "phaseId", "title", "description", "assigneeId", "dueDate"].every((key) =>
    hasString(value, key)
  ) &&
  typeof value.completed === "boolean" &&
  Array.isArray(value.tasks) &&
  value.tasks.every(isTask);

const isPhase = (value: unknown) =>
  isRecord(value) &&
  ["id", "projectId", "name", "description", "startDate", "endDate", "status"].every((key) =>
    hasString(value, key)
  ) &&
  Array.isArray(value.deliverables) &&
  value.deliverables.every(isDeliverable);

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
  ].every((key) => typeof value[key] === "boolean") &&
  (value.token === undefined || typeof value.token === "string");

const isTimelineRows = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) &&
    value.every(
      (row) =>
        isRecord(row) &&
        hasString(row, "id") &&
        hasString(row, "label") &&
        isRecord(row.values) &&
        Object.values(row.values).every((cell) => typeof cell === "string")
    ));

const isBudget = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    typeof value.contingencyPercent === "number" &&
    typeof value.taxPercent === "number" &&
    Array.isArray(value.phases) &&
    value.phases.every(
      (phase) =>
        isRecord(phase) &&
        hasString(phase, "phaseId") &&
        Array.isArray(phase.personnel) &&
        Array.isArray(phase.dailyExpenseLines) &&
        Array.isArray(phase.extraCosts) &&
        Array.isArray(phase.softwareCosts)
    ));

const isProject = (value: unknown): value is Project =>
  isRecord(value) &&
  [
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
  ].every((key) => hasString(value, key)) &&
  typeof value.progress === "number" &&
  Number.isFinite(value.progress) &&
  isEntityArray(value.tools) &&
  isEntityArray(value.people) &&
  Array.isArray(value.phases) &&
  value.phases.every(isPhase) &&
  isEntityArray(value.costs) &&
  isEntityArray(value.payments) &&
  isEntityArray(value.materials) &&
  isEntityArray(value.versions) &&
  isEntityArray(value.activity) &&
  isTimelineRows(value.timelineRows) &&
  isBudget(value.budget) &&
  isShareSettings(value.shareSettings) &&
  (value.archiveIdentity === undefined || typeof value.archiveIdentity === "string") &&
  (value.importPlaceholder === undefined || typeof value.importPlaceholder === "boolean");

export const isValidProjectArchiveIdentity = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,160}$/.test(value);

export const normalizeProjectImportName = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ");

export const createProjectSave = (project: Project): ProjectSaveV2 => {
  if (!isValidProjectArchiveIdentity(project.archiveIdentity)) {
    throw new Error("A stable project archive identity is required before export");
  }

  return {
    schema: projectSaveSchema,
    savedAt: new Date().toISOString(),
    projectIdentity: project.archiveIdentity,
    project
  };
};

export const validateProjectSave = (value: unknown): ValidatedProjectSave => {
  if (!isRecord(value)) {
    throw new Error("Invalid project save file");
  }

  const savedAt = value.savedAt;
  if (typeof savedAt !== "string" || Number.isNaN(Date.parse(savedAt))) {
    throw new Error("Invalid project save file");
  }

  if (value.schema === projectSaveSchema) {
    if (
      !isValidProjectArchiveIdentity(value.projectIdentity) ||
      !isProject(value.project) ||
      value.project.archiveIdentity !== value.projectIdentity
    ) {
      throw new Error("Invalid project save file");
    }

    return {
      format: "v2",
      savedAt,
      projectIdentity: value.projectIdentity,
      project: structuredClone(value.project)
    };
  }

  if (value.schema === legacyProjectSaveSchema && isProject(value.project)) {
    return {
      format: "v1",
      savedAt,
      project: structuredClone(value.project)
    };
  }

  throw new Error("Invalid project save file");
};

const namesMatch = (left: string, right: string) =>
  normalizeProjectImportName(left) === normalizeProjectImportName(right);

const legacyProjectDetailsMatch = (target: Project, source: Project) =>
  target.id === source.id &&
  namesMatch(target.name, source.name) &&
  target.companyId === source.companyId &&
  target.groupId === source.groupId;

export const decideProjectImport = (
  target: Project,
  archive: ValidatedProjectSave
): ProjectImportDecision => {
  if (target.importPlaceholder === true) {
    return { allowed: true, mode: "blank-target" };
  }

  if (archive.format === "v2") {
    if (target.archiveIdentity) {
      if (target.archiveIdentity !== archive.projectIdentity) {
        return { allowed: false, reason: "identity" };
      }

      return namesMatch(target.name, archive.project.name)
        ? { allowed: true, mode: "same-project" }
        : { allowed: false, reason: "name" };
    }

    if (legacyProjectDetailsMatch(target, archive.project)) {
      return { allowed: true, mode: "same-project" };
    }

    return namesMatch(target.name, archive.project.name)
      ? { allowed: false, reason: "identity" }
      : { allowed: false, reason: "name" };
  }

  return legacyProjectDetailsMatch(target, archive.project)
    ? { allowed: true, mode: "same-project" }
    : { allowed: false, reason: "legacy" };
};
