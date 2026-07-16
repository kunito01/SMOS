import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { createDashboardOverview, createMockProject, mockDatabase } from "@/lib/mock";
import type {
  CostItem,
  CreateProjectInput,
  DashboardScope,
  PaymentItem,
  Phase,
  Project,
  ProjectBudget,
  ProjectWorkflow,
  ProjectVersion,
  ProjectStatus,
  Task,
  TimelineCustomRow
} from "@/lib/types";
import {
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";
import { normalizeProjectBudgetForPhases } from "@/lib/utils/project-budget-normalize";
import { buildProjectPhaseDateRanges } from "@/lib/utils/project-phases";
import {
  normalizeProjectWorkflowIds,
  normalizeProjectWorkflows,
  normalizeWorkflowLibrary
} from "@/lib/utils/project-workflow";
import {
  createProjectSave,
  decideProjectImport,
  type ProjectImportBlockedReason,
  type ProjectImportMode,
  type ValidatedProjectSave
} from "@/lib/utils/project-import";

export type TimelineTaskInput = {
  id?: string;
  title: string;
  completed: boolean;
  assigneeId: string;
  dueDate: string;
  priority?: Task["priority"];
};

export type TimelinePhaseInput = {
  id?: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  color: string;
  personIds: string[];
  toolIds: string[];
  notes: string;
  tasks: TimelineTaskInput[];
};

export type UpdateProjectTimelineInput = {
  title: string;
  phases: TimelinePhaseInput[];
  rows: TimelineCustomRow[];
};

export type ProjectPaymentInput = {
  id?: string;
  title: string;
  type: PaymentItem["type"];
  amount: number;
  currency: PaymentItem["currency"];
  dueDate: string;
  receivedDate?: string;
  notes?: string;
};

export type ProjectBasicsInput = {
  name: string;
  description: string;
  coverImage?: string;
  groupId: string;
};

export type ProjectReleaseInput = {
  demoVersion: string;
  demoReleaseDate: string;
  officialVersion: string;
  officialReleaseDate: string;
};

export type UpdateProjectBudgetInput = ProjectBudget;

export type DashboardOverviewOptions = {
  includeArchivedTotal?: boolean;
  currency?: MoneyCurrency;
  snapshot?: ExchangeRateSnapshot;
};

export class ProjectImportTargetError extends Error {
  constructor(public readonly reason: ProjectImportBlockedReason) {
    super("The selected archive cannot replace this project");
    this.name = "ProjectImportTargetError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type ProjectImportPlan = {
  mode: ProjectImportMode;
  sourceName: string;
  targetName: string;
};

const markProjectAsPopulated = (project: Project) => {
  project.importPlaceholder = false;
};

const createProjectArchiveIdentity = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure project identity generation is unavailable");
  }

  return `project_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
};

export const isArchivedProject = (project: Project) => Boolean(project.archivedAt);
export const isActiveProject = (project: Project) => !isArchivedProject(project);

const isValidTimelineDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const filterProjectsByScope = (scope: DashboardScope = { type: "all" }): Project[] => {
  if (scope.type === "company") {
    return mockDatabase.projects.filter((project) => project.companyId === scope.id);
  }

  if (scope.type === "group") {
    return mockDatabase.projects.filter((project) => project.groupId === scope.id);
  }

  return mockDatabase.projects;
};

export async function listProjects(scope: DashboardScope = { type: "all" }) {
  await hydrateMockDatabase();
  return mockApi(filterProjectsByScope(scope).filter(isActiveProject));
}

export async function listActiveProjects(scope: DashboardScope = { type: "all" }) {
  await hydrateMockDatabase();
  return mockApi(filterProjectsByScope(scope).filter(isActiveProject));
}

export async function listArchivedProjects(scope: DashboardScope = { type: "all" }) {
  await hydrateMockDatabase();
  return mockApi(filterProjectsByScope(scope).filter(isArchivedProject));
}

export async function getProject(projectId: string) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  return mockApi(project);
}

export async function getDashboardOverview(
  scope: DashboardScope = { type: "all" },
  options: DashboardOverviewOptions = { includeArchivedTotal: true }
) {
  await hydrateMockDatabase();
  return mockApi(createDashboardOverview(filterProjectsByScope(scope), options));
}

const alignProjectPhasesToDates = (project: Project, startDate: string, endDate: string) => {
  const ranges = buildProjectPhaseDateRanges(startDate, endDate, project.phases.length);

  project.phases.forEach((phase, index) => {
    const range = ranges[index];

    if (range) {
      phase.startDate = range.startDate;
      phase.endDate = range.endDate;
    }
  });
};

const linkBudgetResourcesToProject = (project: Project) => {
  if (!project.budget) {
    return;
  }

  const peopleById = new Map(
    [...mockDatabase.people, ...project.people].map((person) => [person.id, person])
  );
  const toolsById = new Map(
    [...mockDatabase.tools, ...project.tools].map((tool) => [tool.id, tool])
  );
  const linkedPersonIds = new Set(project.people.map((person) => person.id));
  const linkedToolIds = new Set(project.tools.map((tool) => tool.id));

  project.phases.forEach((phase) => {
    phase.personIds = [];
    phase.toolIds = [];
  });

  project.budget.phases.forEach((phaseBudget) => {
    const phase = project.phases.find((item) => item.id === phaseBudget.phaseId);

    if (!phase) {
      return;
    }

    // Cost is the only source of truth for stage assignments. Rebuild these
    // lists on every budget save so deleting a line also removes it from the timeline.
    const phasePersonIds = new Set<string>();
    const phaseToolIds = new Set<string>();

    phaseBudget.personnel.forEach((line) => {
      if (!line.personId) {
        return;
      }

      phasePersonIds.add(line.personId);
      const person = peopleById.get(line.personId);
      if (person && !linkedPersonIds.has(person.id)) {
        project.people.push(person);
        linkedPersonIds.add(person.id);
      }
    });

    phaseBudget.softwareCosts.forEach((line) => {
      if (!line.toolId) {
        return;
      }

      phaseToolIds.add(line.toolId);
      const tool = toolsById.get(line.toolId);
      if (tool && !linkedToolIds.has(tool.id)) {
        project.tools.push(tool);
        linkedToolIds.add(tool.id);
      }
    });

    phase.personIds = [...phasePersonIds];
    phase.toolIds = [...phaseToolIds];
  });
};

export async function createProject(input: CreateProjectInput) {
  await hydrateMockDatabase();
  const projectIndex = mockDatabase.projects.reduce((highestIndex, existingProject) => {
    const match = /^project-(\d+)$/.exec(existingProject.id);
    return match ? Math.max(highestIndex, Number(match[1])) : highestIndex;
  }, 0);
  const requestedGroupId = input.groupId.trim();
  const groupId = mockDatabase.groups.some((group) => group.id === requestedGroupId) ? requestedGroupId : "";
  const project = createMockProject(input.companyId, groupId, input.name, projectIndex);
  const selectedTools = mockDatabase.tools.filter((tool) => input.toolIds.includes(tool.id));
  const selectedPeople = mockDatabase.people.filter((person) => input.personIds.includes(person.id));
  const selectedCostTemplates = mockDatabase.costLibrary.filter((cost) => input.costTemplateIds.includes(cost.id));

  project.startDate = input.startDate;
  project.endDate = input.endDate;
  project.description = "";
  project.timelineTitle = "";
  project.timelineConfigured = false;
  project.timelineRows = [];
  alignProjectPhasesToDates(project, input.startDate, input.endDate);
  project.status = input.status;
  project.archivedAt = null;
  project.tools = selectedTools;
  project.people = selectedPeople;
  project.phases = project.phases.map((phase) => ({
    ...phase,
    name: "",
    description: "",
    status: "not-started",
    assigneeId: undefined,
    personIds: [],
    toolIds: [],
    notes: "",
    deliverables: []
  }));
  project.currentPhaseId = project.phases[0]?.id ?? "";
  project.progress = 0;
  project.payments = [];
  project.materials = [];
  project.versions = [];
  project.activity = [];
  project.shareSettings = {
    isEnabled: false,
    allowCostPreview: false,
    showPeople: true,
    showTools: true,
    showTimeline: true,
    showDeliverables: true,
    showMaterials: true,
    showVersions: true
  };

  project.costs = selectedCostTemplates.map<CostItem>((template, index) => ({
      id: `${project.id}-cost-library-${index + 1}`,
      projectId: project.id,
      name: template.name,
      category: template.category,
      amount: template.amount,
      currency: template.currency,
      billingType: template.billingType,
      startDate: input.startDate,
      isActual: template.isActual,
      visibility: "private"
    }));
  project.budget = undefined;
  project.importPlaceholder =
    selectedPeople.length === 0 && selectedTools.length === 0 && selectedCostTemplates.length === 0;
  linkBudgetResourcesToProject(project);

  mockDatabase.projects.unshift(project);
  await persistMockDatabase();

  return mockApi(project);
}

const calculateProjectProgress = (project: Project) => {
  const tasks = project.phases.flatMap((phase) =>
    phase.deliverables.flatMap((deliverable) => deliverable.tasks)
  );
  const completedTasks = tasks.filter((task) => task.completed).length;

  return tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
};

const getProjectStatusFromProgress = (project: Project, progress: number): ProjectStatus => {
  if (project.status === "terminated") {
    return "terminated";
  }

  if (progress >= 100) {
    return "completed";
  }

  if (project.status === "paused") {
    return "paused";
  }

  return progress <= 10 ? "planning" : "active";
};

export async function updateTaskCompletion(taskId: string, completed: boolean) {
  await hydrateMockDatabase();
  let updatedTask: Task | undefined;
  let updatedProject: Project | undefined;

  for (const project of mockDatabase.projects) {
    for (const phase of project.phases) {
      for (const deliverable of phase.deliverables) {
        const task = deliverable.tasks.find((item) => item.id === taskId);

        if (task) {
          task.completed = completed;
          deliverable.completed = deliverable.tasks.every((item) => item.completed);
          updatedTask = task;
          updatedProject = project;
        }
      }
    }
  }

  if (updatedProject) {
    markProjectAsPopulated(updatedProject);
    updatedProject.progress = calculateProjectProgress(updatedProject);
    updatedProject.status = getProjectStatusFromProgress(updatedProject, updatedProject.progress);

    updatedProject.phases.forEach((phase) => {
      const phaseTasks = phase.deliverables.flatMap((deliverable) => deliverable.tasks);
      const completedTasks = phaseTasks.filter((task) => task.completed).length;

      if (completedTasks === phaseTasks.length) {
        phase.status = "completed";
      } else if (completedTasks > 0) {
        phase.status = "active";
      } else {
        phase.status = "not-started";
      }
    });
    updatedProject.currentPhaseId =
      updatedProject.phases.find((phase) => phase.status === "active")?.id ??
      updatedProject.phases.at(-1)?.id ??
      updatedProject.currentPhaseId;
  }

  await persistMockDatabase();

  return mockApi(requireEntity(updatedTask, `Task not found: ${taskId}`));
}

const normalizeHexColor = (value: string, fallback: string) => {
  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }

  return fallback;
};

const createPhaseFromTimelineInput = (
  project: Project,
  phaseInput: TimelinePhaseInput,
  index: number
): Phase => {
  const phaseId = phaseInput.id || `${project.id}-phase-custom-${Date.now()}-${index + 1}`;
  const deliverableId = `${phaseId}-deliverable-1`;
  const normalizedTasks = phaseInput.tasks.length
    ? phaseInput.tasks
    : [
        {
          assigneeId: phaseInput.personIds[0] ?? project.people[0]?.id ?? "",
          completed: false,
          dueDate: phaseInput.endDate,
          title: ""
        }
      ];
  const tasks: Task[] = normalizedTasks.map((task, taskIndex) => ({
    id: task.id || `${phaseId}-task-${Date.now()}-${taskIndex + 1}`,
    deliverableId,
    title: task.title.trim(),
    completed: task.completed,
    assigneeId: task.assigneeId || phaseInput.personIds[0] || project.people[0]?.id || "",
    dueDate: task.dueDate || phaseInput.endDate,
    priority: task.priority ?? "medium"
  }));
  const completedTasks = tasks.filter((task) => task.completed).length;
  const status: Phase["status"] =
    completedTasks === tasks.length ? "completed" : completedTasks > 0 ? "active" : "not-started";

  return {
    id: phaseId,
    projectId: project.id,
    name: phaseInput.name.trim(),
    description: phaseInput.description.trim(),
    startDate: phaseInput.startDate,
    endDate: phaseInput.endDate,
    status,
    assigneeId: phaseInput.personIds[0] || project.people[0]?.id,
    color: normalizeHexColor(phaseInput.color, "#e3f596"),
    personIds: phaseInput.personIds,
    toolIds: phaseInput.toolIds,
    notes: phaseInput.notes.trim(),
    deliverables: [
      {
        id: deliverableId,
        phaseId,
        title: "",
        description: "",
        assigneeId: phaseInput.personIds[0] || project.people[0]?.id || "",
        dueDate: phaseInput.endDate,
        tasks,
        completed: tasks.every((task) => task.completed)
      }
    ]
  };
};

export async function updateProjectBudget(projectId: string, input: UpdateProjectBudgetInput) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  if (project.timelineConfigured === false) {
    throw new Error("Save the project timeline before creating its phase budget");
  }

  markProjectAsPopulated(project);
  project.budget = normalizeProjectBudgetForPhases(input, project.phases, project.tools);
  linkBudgetResourcesToProject(project);
  await persistMockDatabase();

  return mockApi(project);
}

export async function updateProjectTimeline(projectId: string, input: UpdateProjectTimelineInput) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  if (
    input.phases.length === 0 ||
    input.phases.some((phase) => (
      !isValidTimelineDate(phase.startDate) ||
      !isValidTimelineDate(phase.endDate) ||
      phase.endDate < phase.startDate
    ))
  ) {
    throw new Error("The project timeline requires at least one phase with a valid date range");
  }
  const nextPhases = input.phases.map((phase, index) => createPhaseFromTimelineInput(project, phase, index));
  const nextPhaseIds = new Set(nextPhases.map((phase) => phase.id));

  markProjectAsPopulated(project);
  project.phases = nextPhases;
  project.budget = normalizeProjectBudgetForPhases(project.budget, project.phases, project.tools);
  project.timelineTitle = input.title.trim();
  project.timelineConfigured = true;
  project.timelineRows = input.rows.map((row, index) => ({
    id: row.id || `${project.id}-timeline-row-${Date.now()}-${index + 1}`,
    label: row.label.trim(),
    values: Object.fromEntries(
      Object.entries(row.values).filter(([phaseId]) => nextPhaseIds.has(phaseId))
    )
  }));
  project.startDate = nextPhases.reduce(
    (earliest, phase) => (phase.startDate < earliest ? phase.startDate : earliest),
    nextPhases[0]?.startDate ?? project.startDate
  );
  project.endDate = nextPhases.reduce(
    (latest, phase) => (phase.endDate > latest ? phase.endDate : latest),
    nextPhases[0]?.endDate ?? project.endDate
  );
  project.progress = calculateProjectProgress(project);
  project.status = getProjectStatusFromProgress(project, project.progress);
  project.currentPhaseId =
    project.phases.find((phase) => phase.status === "active")?.id ??
    project.phases.find((phase) => phase.status === "not-started")?.id ??
    project.phases.at(-1)?.id ??
    project.currentPhaseId;

  await persistMockDatabase();

  return mockApi(project);
}

export async function updateProjectPayments(projectId: string, input: ProjectPaymentInput[]) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  markProjectAsPopulated(project);
  project.payments = input
    .filter((payment) => payment.amount > 0)
    .map((payment, index) => ({
      id: payment.id || `${project.id}-payment-${Date.now()}-${index + 1}`,
      projectId: project.id,
      title: payment.title.trim() || (payment.type === "planned" ? "Planned receivable" : "Payment received"),
      type: payment.type,
      amount: payment.amount,
      currency: payment.currency,
      dueDate: payment.dueDate || project.endDate,
      receivedDate: payment.type === "received" ? payment.receivedDate || payment.dueDate || project.endDate : undefined,
      notes: payment.notes?.trim() || undefined
    }));

  await persistMockDatabase();

  return mockApi(project);
}

export async function updateProjectBasics(projectId: string, input: ProjectBasicsInput) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const groupId = input.groupId.trim();

  if (groupId && !mockDatabase.groups.some((group) => group.id === groupId)) {
    throw new Error(`Project group not found: ${groupId}`);
  }

  markProjectAsPopulated(project);
  project.name = input.name.trim() || project.name;
  project.description = input.description.trim() || project.description;
  project.groupId = groupId;

  if (input.coverImage) {
    project.coverImage = input.coverImage;
  }

  await persistMockDatabase();

  return mockApi(project);
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  markProjectAsPopulated(project);
  project.status = status;
  await persistMockDatabase();

  return mockApi(project);
}

export async function listProjectWorkflows(projectId: string) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const workflowsById = new Map(
    mockDatabase.workflows.map((workflow) => [workflow.id, workflow])
  );

  return mockApi(
    normalizeProjectWorkflowIds(project.workflowIds).map((workflowId) =>
      requireEntity(workflowsById.get(workflowId), `Workflow not found: ${workflowId}`)
    )
  );
}

export async function setProjectWorkflowIds(
  projectId: string,
  workflowIds: ReadonlyArray<string>
) {
  await hydrateMockDatabase();
  const projectIndex = mockDatabase.projects.findIndex((item) => item.id === projectId);
  const project = requireEntity(
    projectIndex >= 0 ? mockDatabase.projects[projectIndex] : undefined,
    `Project not found: ${projectId}`
  );
  const normalizedWorkflowIds = normalizeProjectWorkflowIds(workflowIds);
  const availableWorkflowIds = new Set(
    mockDatabase.workflows.map((workflow) => workflow.id)
  );
  const missingWorkflowId = normalizedWorkflowIds.find(
    (workflowId) => !availableWorkflowIds.has(workflowId)
  );
  if (missingWorkflowId) {
    throw new Error(`Workflow not found: ${missingWorkflowId}`);
  }

  const previousProject = structuredClone(project);
  const projectWithoutEmbeddedWorkflows = { ...project };
  delete projectWithoutEmbeddedWorkflows.workflows;
  const nextProject = structuredClone({
    ...projectWithoutEmbeddedWorkflows,
    workflowIds: normalizedWorkflowIds,
    importPlaceholder: normalizedWorkflowIds.length > 0 ? false : project.importPlaceholder
  } satisfies Project);

  mockDatabase.projects[projectIndex] = nextProject;

  try {
    await persistMockDatabase();
  } catch (error) {
    const rollbackIndex = mockDatabase.projects.findIndex((item) => item.id === projectId);
    if (rollbackIndex >= 0) {
      mockDatabase.projects[rollbackIndex] = previousProject;
    }
    throw error;
  }

  return mockApi(nextProject);
}

export async function linkProjectWorkflow(projectId: string, workflowId: string) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  const currentWorkflowIds = normalizeProjectWorkflowIds(project.workflowIds);
  return setProjectWorkflowIds(
    projectId,
    currentWorkflowIds.includes(workflowId)
      ? currentWorkflowIds
      : [...currentWorkflowIds, workflowId]
  );
}

export async function unlinkProjectWorkflow(projectId: string, workflowId: string) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  return setProjectWorkflowIds(
    projectId,
    normalizeProjectWorkflowIds(project.workflowIds).filter((id) => id !== workflowId)
  );
}

/**
 * @deprecated Embedded project workflows were replaced by global originals.
 * Kept temporarily so older UI builds migrate their edits atomically.
 */
export async function updateProjectWorkflows(
  projectId: string,
  workflows: ReadonlyArray<ProjectWorkflow>
) {
  await hydrateMockDatabase();
  const projectIndex = mockDatabase.projects.findIndex((item) => item.id === projectId);
  const project = requireEntity(
    projectIndex >= 0 ? mockDatabase.projects[projectIndex] : undefined,
    `Project not found: ${projectId}`
  );
  const normalizedWorkflows = normalizeProjectWorkflows(workflows);
  const previousProject = structuredClone(project);
  const previousWorkflows = structuredClone(mockDatabase.workflows);
  const nextGlobalWorkflows = structuredClone(mockDatabase.workflows);

  for (const workflow of normalizedWorkflows) {
    const workflowIndex = nextGlobalWorkflows.findIndex((item) => item.id === workflow.id);
    if (workflowIndex >= 0) {
      nextGlobalWorkflows[workflowIndex] = workflow;
    } else {
      nextGlobalWorkflows.push(workflow);
    }
  }

  mockDatabase.workflows = normalizeWorkflowLibrary(nextGlobalWorkflows);
  const projectWithoutEmbeddedWorkflows = { ...project };
  delete projectWithoutEmbeddedWorkflows.workflows;
  const nextProject = {
    ...projectWithoutEmbeddedWorkflows,
    workflowIds: normalizedWorkflows.map((workflow) => workflow.id),
    importPlaceholder: normalizedWorkflows.length > 0 ? false : project.importPlaceholder
  } satisfies Project;
  mockDatabase.projects[projectIndex] = nextProject;

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.projects[projectIndex] = previousProject;
    mockDatabase.workflows = previousWorkflows;
    throw error;
  }

  return mockApi(nextProject);
}

const releaseVersionId = (project: Project, kind: NonNullable<ProjectVersion["kind"]>) =>
  `${project.id}-version-${kind}`;

const findReleaseVersion = (project: Project, kind: NonNullable<ProjectVersion["kind"]>) =>
  project.versions.find((version) => version.kind === kind || version.id === releaseVersionId(project, kind));

const createReleaseVersion = (
  project: Project,
  kind: "demo" | "official",
  versionNumber: string,
  releaseDate: string,
  existing?: ProjectVersion
): ProjectVersion => {
  const isReleased = Boolean(versionNumber && releaseDate);

  return {
    id: existing?.id ?? releaseVersionId(project, kind),
    projectId: project.id,
    kind,
    name: kind === "demo" ? "Demo release" : "Official release",
    summary: kind === "demo" ? "Demo publishing checkpoint." : "Formal release checkpoint.",
    status: isReleased ? "released" : "draft",
    createdAt: isReleased ? releaseDate : existing?.createdAt || (kind === "demo" ? project.startDate : project.endDate),
    versionNumber: isReleased ? versionNumber : undefined,
    releaseDate: isReleased ? releaseDate : undefined
  };
};

export async function updateProjectReleasePlan(projectId: string, input: ProjectReleaseInput) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const demoVersion = input.demoVersion.trim();
  const demoReleaseDate = input.demoReleaseDate.trim();
  const officialVersion = input.officialVersion.trim();
  const officialReleaseDate = input.officialReleaseDate.trim();

  markProjectAsPopulated(project);
  project.versions = [
    createReleaseVersion(project, "demo", demoVersion, demoReleaseDate, findReleaseVersion(project, "demo")),
    createReleaseVersion(project, "official", officialVersion, officialReleaseDate, findReleaseVersion(project, "official"))
  ];

  await persistMockDatabase();

  return mockApi(project);
}

export async function archiveProject(projectId: string) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  markProjectAsPopulated(project);
  project.archivedAt = new Date().toISOString();
  await persistMockDatabase();

  return mockApi(project);
}

export async function restoreProject(projectId: string) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  markProjectAsPopulated(project);
  project.archivedAt = null;
  await persistMockDatabase();

  return mockApi(project);
}

const hashImportedId = (value: string, seed: number) => {
  let hash = seed >>> 0;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createImportedEntityId = (
  projectId: string,
  archiveIdentity: string,
  kind: string,
  sourceId: string
) => {
  const value = `${archiveIdentity}:${kind}:${sourceId}`;
  return `${projectId}-${kind}-${hashImportedId(value, 2_166_136_261)}${hashImportedId(value, 3_331_666_717)}`;
};

const normalizeImportedProject = (
  projectId: string,
  archive: ValidatedProjectSave,
  currentProject: Project,
  archiveIdentity: string,
  workflowIds: ReadonlyArray<string>
): Project => {
  const importedProject = archive.project;
  const phaseIds = new Map(
    importedProject.phases.map((phase) => [
      phase.id,
      createImportedEntityId(projectId, archiveIdentity, "phase", phase.id)
    ])
  );
  const phases = importedProject.phases.map((phase) => {
    const phaseId = phaseIds.get(phase.id) as string;

    return {
      ...phase,
      id: phaseId,
      projectId,
      deliverables: phase.deliverables.map((deliverable) => {
        const deliverableId = createImportedEntityId(
          projectId,
          archiveIdentity,
          "deliverable",
          deliverable.id
        );

        return {
          ...deliverable,
          id: deliverableId,
          phaseId,
          tasks: deliverable.tasks.map((task) => ({
            ...task,
            id: createImportedEntityId(projectId, archiveIdentity, "task", task.id),
            deliverableId
          }))
        };
      })
    };
  });
  const importedBudget = importedProject.budget
    ? {
        ...importedProject.budget,
        phases: importedProject.budget.phases.map((phaseBudget) => ({
          ...phaseBudget,
          phaseId: phaseIds.get(phaseBudget.phaseId) ?? phaseBudget.phaseId,
          personnel: phaseBudget.personnel.map((line) => ({
            ...line,
            id: createImportedEntityId(projectId, archiveIdentity, "budget-person", line.id)
          })),
          dailyExpenseLines: phaseBudget.dailyExpenseLines.map((line) => ({
            ...line,
            id: createImportedEntityId(projectId, archiveIdentity, "budget-daily", line.id)
          })),
          extraCosts: phaseBudget.extraCosts.map((line) => ({
            ...line,
            id: createImportedEntityId(projectId, archiveIdentity, "budget-extra", line.id)
          })),
          softwareCosts: phaseBudget.softwareCosts.map((line) => ({
            ...line,
            id: createImportedEntityId(projectId, archiveIdentity, "budget-software", line.id)
          }))
        }))
      }
    : undefined;

  return {
    ...importedProject,
    id: projectId,
    archiveIdentity,
    importPlaceholder: false,
    companyId: currentProject.companyId,
    groupId: currentProject.groupId,
    archivedAt: currentProject.archivedAt ?? null,
    currentPhaseId: phaseIds.get(importedProject.currentPhaseId) ?? phases[0]?.id ?? "",
    phases,
    workflowIds: normalizeProjectWorkflowIds(workflowIds),
    timelineRows: importedProject.timelineRows?.map((row) => ({
      ...row,
      id: createImportedEntityId(projectId, archiveIdentity, "timeline-row", row.id),
      values: Object.fromEntries(
        Object.entries(row.values).flatMap(([phaseId, cell]) => {
          const mappedPhaseId = phaseIds.get(phaseId);
          return mappedPhaseId ? [[mappedPhaseId, cell]] : [];
        })
      )
    })),
    budget: normalizeProjectBudgetForPhases(importedBudget, phases, importedProject.tools),
    costs: importedProject.costs.map((cost) => ({
      ...cost,
      id: createImportedEntityId(projectId, archiveIdentity, "cost", cost.id),
      projectId
    })),
    payments: importedProject.payments.map((payment) => ({
      ...payment,
      id: createImportedEntityId(projectId, archiveIdentity, "payment", payment.id),
      projectId
    })),
    materials: importedProject.materials.map((material) => ({
      ...material,
      id: createImportedEntityId(projectId, archiveIdentity, "material", material.id),
      projectId
    })),
    versions: importedProject.versions.map((version) => ({
      ...version,
      id: createImportedEntityId(projectId, archiveIdentity, "version", version.id),
      projectId
    })),
    activity: importedProject.activity.map((event) => ({
      ...event,
      id: createImportedEntityId(projectId, archiveIdentity, "activity", event.id),
      projectId
    })),
    // Company placement, archive state, and public sharing remain local to the
    // receiving device. A standalone project file cannot silently move or
    // publish the target project.
    shareSettings: { ...currentProject.shareSettings }
  };
};

const mergeImportedWorkflows = (
  projectId: string,
  archiveIdentity: string,
  archive: ValidatedProjectSave
) => {
  const nextLibrary = structuredClone(mockDatabase.workflows);
  const workflowsById = new Map(nextLibrary.map((workflow) => [workflow.id, workflow]));
  const sourceToDestinationId = new Map<string, string>();
  const requestedSourceIds = new Set(
    normalizeProjectWorkflowIds(archive.project.workflowIds)
  );

  for (const sourceWorkflow of archive.linkedWorkflows) {
    if (!requestedSourceIds.has(sourceWorkflow.id)) {
      continue;
    }
    const existingWorkflow = workflowsById.get(sourceWorkflow.id);
    if (!existingWorkflow || JSON.stringify(existingWorkflow) === JSON.stringify(sourceWorkflow)) {
      if (!existingWorkflow) {
        nextLibrary.push(sourceWorkflow);
        workflowsById.set(sourceWorkflow.id, sourceWorkflow);
      }
      sourceToDestinationId.set(sourceWorkflow.id, sourceWorkflow.id);
      continue;
    }

    let destinationId = createImportedEntityId(
      projectId,
      archiveIdentity,
      "workflow",
      sourceWorkflow.id
    );
    let collisionIndex = 2;
    while (workflowsById.has(destinationId)) {
      const candidate = workflowsById.get(destinationId);
      if (candidate && JSON.stringify(candidate) === JSON.stringify({ ...sourceWorkflow, id: destinationId })) {
        break;
      }
      destinationId = createImportedEntityId(
        projectId,
        archiveIdentity,
        "workflow",
        `${sourceWorkflow.id}:${collisionIndex}`
      );
      collisionIndex += 1;
    }

    if (!workflowsById.has(destinationId)) {
      const importedWorkflow = { ...sourceWorkflow, id: destinationId };
      nextLibrary.push(importedWorkflow);
      workflowsById.set(destinationId, importedWorkflow);
    }
    sourceToDestinationId.set(sourceWorkflow.id, destinationId);
  }

  const requestedIds = [...requestedSourceIds];
  const sourceIds = requestedIds.length > 0
    ? requestedIds
    : archive.linkedWorkflows.map((workflow) => workflow.id);
  const workflowIds = sourceIds.flatMap((sourceId) => {
    const destinationId = sourceToDestinationId.get(sourceId) ?? sourceId;
    return workflowsById.has(destinationId) ? [destinationId] : [];
  });

  return {
    workflowIds: normalizeProjectWorkflowIds([...new Set(workflowIds)]),
    workflows: normalizeWorkflowLibrary(nextLibrary)
  };
};

export async function ensureProjectArchiveIdentity(projectId: string) {
  await hydrateMockDatabase();
  const projectIndex = mockDatabase.projects.findIndex((item) => item.id === projectId);
  const project = requireEntity(
    projectIndex >= 0 ? mockDatabase.projects[projectIndex] : undefined,
    `Project not found: ${projectId}`
  );

  if (project.archiveIdentity) {
    return mockApi(project);
  }

  const previousProject = structuredClone(project);
  project.archiveIdentity = createProjectArchiveIdentity();

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.projects[projectIndex] = previousProject;
    throw error;
  }

  return mockApi(project);
}

export async function createStandaloneProjectSave(projectId: string) {
  const project = await ensureProjectArchiveIdentity(projectId);
  const linkedWorkflows = await listProjectWorkflows(projectId);
  return createProjectSave(project, linkedWorkflows);
}

export async function inspectProjectImport(projectId: string, archive: ValidatedProjectSave) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const decision = decideProjectImport(project, archive);

  if (!decision.allowed) {
    throw new ProjectImportTargetError(decision.reason);
  }

  return mockApi({
    mode: decision.mode,
    sourceName: archive.project.name,
    targetName: project.name
  } satisfies ProjectImportPlan);
}

export async function replaceProjectFromArchive(
  projectId: string,
  archive: ValidatedProjectSave
) {
  await hydrateMockDatabase();
  const projectIndex = mockDatabase.projects.findIndex((item) => item.id === projectId);
  const currentProject = requireEntity(
    projectIndex >= 0 ? mockDatabase.projects[projectIndex] : undefined,
    `Project not found: ${projectId}`
  );
  const decision = decideProjectImport(currentProject, archive);

  if (!decision.allowed) {
    throw new ProjectImportTargetError(decision.reason);
  }

  const archiveIdentity = archive.projectIdentity ?? createProjectArchiveIdentity();
  const importedWorkflows = mergeImportedWorkflows(projectId, archiveIdentity, archive);
  const nextProject = normalizeImportedProject(
    projectId,
    archive,
    currentProject,
    archiveIdentity,
    importedWorkflows.workflowIds
  );
  const previousProject = currentProject;
  const previousWorkflows = mockDatabase.workflows;
  mockDatabase.projects[projectIndex] = nextProject;
  mockDatabase.workflows = importedWorkflows.workflows;

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.projects[projectIndex] = previousProject;
    mockDatabase.workflows = previousWorkflows;
    throw error;
  }

  return mockApi({ mode: decision.mode, project: nextProject });
}

export async function deleteProject(projectId: string) {
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  mockDatabase.projects = mockDatabase.projects.filter((item) => item.id !== projectId);
  mockDatabase.shareLinks = mockDatabase.shareLinks.filter((link) => link.projectId !== projectId);
  await persistMockDatabase();

  return mockApi(project);
}
