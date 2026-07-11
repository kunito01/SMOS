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

  project.budget.phases.forEach((phaseBudget) => {
    const phase = project.phases.find((item) => item.id === phaseBudget.phaseId);

    if (!phase) {
      return;
    }

    const phasePersonIds = new Set(phase.personIds ?? []);
    const phaseToolIds = new Set(phase.toolIds ?? []);

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
  project.timelineConfigured = false;
  alignProjectPhasesToDates(project, input.startDate, input.endDate);
  project.status = input.status;
  project.archivedAt = null;
  project.tools = selectedTools;
  project.people = selectedPeople;

  if (project.people.length) {
    const personAt = (index: number) => project.people[index % project.people.length];

    project.phases.forEach((phase, phaseIndex) => {
      phase.assigneeId = personAt(phaseIndex).id;
      phase.personIds = Array.from(
        { length: Math.min(2, project.people.length) },
        (_, personOffset) => personAt(phaseIndex + personOffset).id
      );

      phase.deliverables.forEach((deliverable, deliverableIndex) => {
        deliverable.assigneeId = personAt(phaseIndex + deliverableIndex).id;
        deliverable.tasks.forEach((task, taskIndex) => {
          task.assigneeId = personAt(phaseIndex + deliverableIndex + taskIndex).id;
        });
      });
    });

    project.materials.forEach((material, materialIndex) => {
      material.ownerId = personAt(materialIndex).id;
    });
    project.activity.forEach((event, eventIndex) => {
      event.actorId = personAt(eventIndex).id;
    });
  } else {
    project.phases.forEach((phase) => {
      phase.assigneeId = undefined;
      phase.personIds = [];
      phase.deliverables.forEach((deliverable) => {
        deliverable.assigneeId = "";
        deliverable.tasks.forEach((task) => {
          task.assigneeId = "";
        });
      });
    });
    project.materials.forEach((material) => {
      material.ownerId = "";
    });
    project.activity.forEach((event) => {
      event.actorId = "";
    });
  }

  if (project.tools.length) {
    const toolAt = (index: number) => project.tools[index % project.tools.length];

    project.phases.forEach((phase, phaseIndex) => {
      phase.toolIds = Array.from(
        { length: Math.min(2, project.tools.length) },
        (_, toolOffset) => toolAt(phaseIndex + toolOffset).id
      );
    });
  } else {
    project.phases.forEach((phase) => {
      phase.toolIds = [];
    });
  }

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

  project.status = status;
  await persistMockDatabase();

  return mockApi(project);
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

  project.archivedAt = null;
  await persistMockDatabase();

  return mockApi(project);
}

const normalizeImportedProject = (
  projectId: string,
  importedProject: Project,
  currentProject?: Project
): Project => {
  const phases = importedProject.phases.map((phase) => ({
    ...phase,
    projectId,
    deliverables: phase.deliverables.map((deliverable) => ({
      ...deliverable,
      tasks: deliverable.tasks.map((task) => ({
        ...task,
        deliverableId: deliverable.id
      }))
    }))
  }));

  return {
    ...importedProject,
    id: projectId,
    archivedAt: importedProject.archivedAt ?? currentProject?.archivedAt ?? null,
    phases,
    budget: normalizeProjectBudgetForPhases(importedProject.budget, phases, importedProject.tools),
    costs: importedProject.costs.map((cost) => ({ ...cost, projectId })),
    payments: (importedProject.payments ?? []).map((payment) => ({ ...payment, projectId })),
    materials: importedProject.materials.map((material) => ({ ...material, projectId })),
    versions: (importedProject.versions ?? []).map((version) => ({ ...version, projectId })),
    activity: importedProject.activity.map((event) => ({ ...event, projectId })),
    shareSettings: {
      ...importedProject.shareSettings,
      token: importedProject.shareSettings.token
    }
  };
};

export async function replaceProject(projectId: string, importedProject: Project) {
  await hydrateMockDatabase();
  const projectIndex = mockDatabase.projects.findIndex((item) => item.id === projectId);

  requireEntity(projectIndex >= 0 ? mockDatabase.projects[projectIndex] : undefined, `Project not found: ${projectId}`);

  const nextProject = normalizeImportedProject(projectId, importedProject, mockDatabase.projects[projectIndex]);
  const previousProject = mockDatabase.projects[projectIndex];
  mockDatabase.projects[projectIndex] = nextProject;

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.projects[projectIndex] = previousProject;
    throw error;
  }

  return mockApi(nextProject);
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
