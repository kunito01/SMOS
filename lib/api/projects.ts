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
  ProjectStatus,
  Task,
  TimelineCustomRow
} from "@/lib/types";

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
  hydrateMockDatabase();
  return mockApi(filterProjectsByScope(scope));
}

export async function getProject(projectId: string) {
  hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  return mockApi(project);
}

export async function getDashboardOverview(scope: DashboardScope = { type: "all" }) {
  hydrateMockDatabase();
  return mockApi(createDashboardOverview(filterProjectsByScope(scope)));
}

export async function createProject(input: CreateProjectInput) {
  hydrateMockDatabase();
  const projectIndex = mockDatabase.projects.length;
  const project = createMockProject(input.companyId, input.groupId, input.name, projectIndex);
  const selectedTools = mockDatabase.tools.filter((tool) => input.toolIds.includes(tool.id));
  const selectedPeople = mockDatabase.people.filter((person) => input.personIds.includes(person.id));
  const selectedCostTemplates = mockDatabase.costLibrary.filter((cost) => input.costTemplateIds.includes(cost.id));

  project.startDate = input.startDate;
  project.endDate = input.endDate;
  project.status = input.status;
  project.tools = selectedTools.length ? selectedTools : project.tools;
  project.people = selectedPeople.length ? selectedPeople : project.people;

  if (selectedCostTemplates.length) {
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
  }

  mockDatabase.projects.unshift(project);
  persistMockDatabase();

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
  if (progress >= 100) {
    return "completed";
  }

  if (project.status === "paused") {
    return "paused";
  }

  return progress <= 10 ? "planning" : "active";
};

export async function updateTaskCompletion(taskId: string, completed: boolean) {
  hydrateMockDatabase();
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

  persistMockDatabase();

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
          title: "New task"
        }
      ];
  const tasks: Task[] = normalizedTasks.map((task, taskIndex) => ({
    id: task.id || `${phaseId}-task-${Date.now()}-${taskIndex + 1}`,
    deliverableId,
    title: task.title.trim() || `Task ${taskIndex + 1}`,
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
    name: phaseInput.name.trim() || `Stage ${index + 1}`,
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
        title: `${phaseInput.name.trim() || `Stage ${index + 1}`} tasks`,
        description: "Timeline task group.",
        assigneeId: phaseInput.personIds[0] || project.people[0]?.id || "",
        dueDate: phaseInput.endDate,
        tasks,
        completed: tasks.every((task) => task.completed)
      }
    ]
  };
};

export async function updateProjectTimeline(projectId: string, input: UpdateProjectTimelineInput) {
  hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const nextPhases = input.phases.map((phase, index) => createPhaseFromTimelineInput(project, phase, index));
  const nextPhaseIds = new Set(nextPhases.map((phase) => phase.id));

  project.phases = nextPhases;
  project.timelineTitle = input.title.trim() || "Timeline board";
  project.timelineRows = input.rows.map((row, index) => ({
    id: row.id || `${project.id}-timeline-row-${Date.now()}-${index + 1}`,
    label: row.label.trim() || `Custom row ${index + 1}`,
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

  persistMockDatabase();

  return mockApi(project);
}

export async function updateProjectPayments(projectId: string, input: ProjectPaymentInput[]) {
  hydrateMockDatabase();
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

  persistMockDatabase();

  return mockApi(project);
}
