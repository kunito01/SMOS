"use client";

import {
  companiesApi,
  costsApi,
  groupsApi,
  librariesApi,
  projectsApi,
  testflightApi,
  usageApi
} from "@/lib/api";
import type { ProjectPaymentInput, TimelinePhaseInput } from "@/lib/api/projects";
import type { Project, ProjectStatus } from "@/lib/types";
import { supportedCurrencies, type MoneyCurrency } from "@/lib/utils/money";
import { isDateKey, todayDateKey } from "@/lib/utils/testflight";

/**
 * Tools an external AI agent may call through the local MCP relay. Every
 * handler runs inside the signed-in PWA against the normal API layer, so
 * validation, persistence, cloud sync, and calendar push all apply as if the
 * user had clicked. Destructive tools require an explicit `confirm: true`.
 */

export type AgentToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type AgentArgs = Record<string, unknown>;

type AgentTool = AgentToolDefinition & {
  run: (args: AgentArgs) => Promise<unknown>;
};

const projectStatuses: ProjectStatus[] = ["planning", "active", "paused", "terminated", "completed"];
const DEFAULT_PHASE_COLOR = "#e3f596";

class AgentToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolError";
  }
}

const str = (args: AgentArgs, key: string, required = true) => {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new AgentToolError(`Missing required argument: ${key}`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AgentToolError(`Argument ${key} must be a string`);
  }
  return value;
};

const num = (args: AgentArgs, key: string, required = true) => {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new AgentToolError(`Missing required argument: ${key}`);
    }
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AgentToolError(`Argument ${key} must be a number`);
  }
  return parsed;
};

const bool = (args: AgentArgs, key: string) => args[key] === true;

const dateArg = (args: AgentArgs, key: string, required = true) => {
  const value = str(args, key, required);
  if (value !== undefined && !isDateKey(value)) {
    throw new AgentToolError(`Argument ${key} must be a yyyy-mm-dd date`);
  }
  return value;
};

const enumArg = <T extends string>(args: AgentArgs, key: string, options: readonly T[], required = true) => {
  const value = str(args, key, required);
  if (value === undefined) {
    return undefined;
  }
  if (!options.includes(value as T)) {
    throw new AgentToolError(`Argument ${key} must be one of: ${options.join(", ")}`);
  }
  return value as T;
};

const currencyArg = (args: AgentArgs, key: string, required = false) =>
  enumArg(args, key, supportedCurrencies, required) as MoneyCurrency | undefined;

const requireConfirm = (args: AgentArgs, action: string) => {
  if (!bool(args, "confirm")) {
    throw new AgentToolError(
      `${action} is irreversible. Ask the user, then call again with confirm: true.`
    );
  }
};

const findProject = async (projectId: string) => {
  const project = await projectsApi.getProject(projectId);
  if (!project) {
    throw new AgentToolError(`Project not found: ${projectId}`);
  }
  return project;
};

const summarizeProject = (project: Project) => ({
  id: project.id,
  name: project.name,
  status: project.status,
  progress: project.progress,
  companyId: project.companyId,
  groupId: project.groupId,
  startDate: project.startDate,
  endDate: project.endDate,
  currentPhase: project.phases.find((phase) => phase.id === project.currentPhaseId)?.name ?? null,
  codingDevice: project.codingDevice ?? null,
  archivedAt: project.archivedAt ?? null,
  isExample: project.isExample === true
});

const detailProject = (project: Project) => ({
  ...summarizeProject(project),
  description: project.description,
  timelineTitle: project.timelineTitle ?? "",
  phases: project.phases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    description: phase.description,
    startDate: phase.startDate,
    endDate: phase.endDate,
    status: phase.status,
    tasks: phase.deliverables.flatMap((deliverable) =>
      deliverable.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        completed: task.completed,
        dueDate: task.dueDate ?? null,
        priority: task.priority
      }))
    )
  })),
  releases: project.versions.map((version) => ({
    kind: version.kind ?? "legacy",
    versionNumber: version.versionNumber ?? null,
    releaseDate: version.releaseDate ?? null,
    platforms: version.platforms ?? []
  })),
  payments: (project.payments ?? []).map((payment) => ({
    id: payment.id,
    title: payment.title,
    type: payment.type,
    amount: payment.amount,
    currency: payment.currency,
    dueDate: payment.dueDate,
    receivedDate: payment.receivedDate ?? null
  })),
  people: project.people.map((person) => person.name),
  tools: project.tools.map((tool) => tool.name)
});

/** Existing phases as timeline inputs so partial agent edits keep colours, people, tools, and notes. */
const phaseToTimelineInput = (phase: Project["phases"][number]): TimelinePhaseInput => ({
  id: phase.id,
  name: phase.name,
  description: phase.description,
  startDate: phase.startDate,
  endDate: phase.endDate,
  color: phase.color ?? DEFAULT_PHASE_COLOR,
  personIds: phase.personIds ?? [],
  toolIds: phase.toolIds ?? [],
  notes: phase.notes ?? "",
  tasks: phase.deliverables.flatMap((deliverable) =>
    deliverable.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      completed: task.completed,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate ?? phase.endDate,
      priority: task.priority
    }))
  )
});

const shiftDateKey = (value: string, offsetDays: number) => {
  if (!isDateKey(value)) {
    return value;
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
};

const dayNumber = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

const paymentToInput = (payment: NonNullable<Project["payments"]>[number]): ProjectPaymentInput => ({
  id: payment.id,
  title: payment.title,
  type: payment.type,
  amount: payment.amount,
  currency: payment.currency,
  dueDate: payment.dueDate,
  receivedDate: payment.receivedDate,
  notes: payment.notes
});

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false
});

const tools: AgentTool[] = [
  {
    name: "list_projects",
    description:
      "List projects with status, progress, dates, and current phase. Active projects by default; set includeArchived to also return archived ones.",
    inputSchema: objectSchema({
      includeArchived: { type: "boolean", description: "Also include archived projects." }
    }),
    run: async (args) => {
      const active = await projectsApi.listProjects();
      const archived = bool(args, "includeArchived") ? await projectsApi.listArchivedProjects() : [];
      return [...active, ...archived].map(summarizeProject);
    }
  },
  {
    name: "get_project",
    description: "Full detail for one project: phases with tasks, releases, payments, people, and tools.",
    inputSchema: objectSchema({ projectId: { type: "string" } }, ["projectId"]),
    run: async (args) => detailProject(await findProject(str(args, "projectId")!))
  },
  {
    name: "list_companies",
    description: "List brands/companies (id and name) that projects belong to.",
    inputSchema: objectSchema({}),
    run: async () => (await companiesApi.listCompanies()).map((company) => ({ id: company.id, name: company.name }))
  },
  {
    name: "list_groups",
    description: "List project groups / project types (id and name).",
    inputSchema: objectSchema({}),
    run: async () => (await groupsApi.listGroups()).map((group) => ({ id: group.id, name: group.name }))
  },
  {
    name: "list_pending_tasks",
    description:
      "Open tasks from phases that have already started, grouped by project. Overdue tasks are flagged. Optionally limit to one project.",
    inputSchema: objectSchema({ projectId: { type: "string" } }),
    run: async (args) => {
      const projectId = str(args, "projectId", false);
      const today = todayDateKey();
      const projects = (await projectsApi.listProjects()).filter(
        (project) => !projectId || project.id === projectId
      );
      return projects.flatMap((project) =>
        project.phases
          .filter((phase) => isDateKey(phase.startDate) && phase.startDate <= today)
          .flatMap((phase) =>
            phase.deliverables.flatMap((deliverable) =>
              deliverable.tasks
                .filter((task) => !task.completed)
                .map((task) => {
                  const deadline = task.dueDate ?? phase.endDate;
                  return {
                    taskId: task.id,
                    title: task.title,
                    projectId: project.id,
                    projectName: project.name,
                    phase: phase.name,
                    dueDate: deadline,
                    overdue: isDateKey(deadline) && deadline < today,
                    priority: task.priority
                  };
                })
            )
          )
      );
    }
  },
  {
    name: "set_task_completion",
    description: "Mark a task done or not done. Phase status and project progress update automatically.",
    inputSchema: objectSchema({ taskId: { type: "string" }, completed: { type: "boolean" } }, ["taskId", "completed"]),
    run: async (args) => {
      if (typeof args.completed !== "boolean") {
        throw new AgentToolError("Argument completed must be a boolean");
      }
      const task = await projectsApi.updateTaskCompletion(str(args, "taskId")!, args.completed);
      return { taskId: task.id, title: task.title, completed: task.completed };
    }
  },
  {
    name: "create_project",
    description: "Create a project under a company. Phases are generated from the date range and can be refined with update_project_timeline.",
    inputSchema: objectSchema(
      {
        name: { type: "string" },
        companyId: { type: "string" },
        groupId: { type: "string" },
        status: { type: "string", enum: projectStatuses },
        startDate: { type: "string", description: "yyyy-mm-dd" },
        endDate: { type: "string", description: "yyyy-mm-dd" },
        codingDevice: { type: "string" }
      },
      ["name", "companyId", "startDate", "endDate"]
    ),
    run: async (args) => {
      const project = await projectsApi.createProject({
        name: str(args, "name")!,
        companyId: str(args, "companyId")!,
        groupId: str(args, "groupId", false) ?? "",
        status: enumArg(args, "status", projectStatuses, false) ?? "planning",
        startDate: dateArg(args, "startDate")!,
        endDate: dateArg(args, "endDate")!,
        codingDevice: str(args, "codingDevice", false),
        toolIds: [],
        personIds: [],
        costTemplateIds: []
      });
      return summarizeProject(project);
    }
  },
  {
    name: "update_project_status",
    description: "Set a project's status.",
    inputSchema: objectSchema(
      { projectId: { type: "string" }, status: { type: "string", enum: projectStatuses } },
      ["projectId", "status"]
    ),
    run: async (args) =>
      summarizeProject(
        await projectsApi.updateProjectStatus(str(args, "projectId")!, enumArg(args, "status", projectStatuses)!)
      )
  },
  {
    name: "update_project_basics",
    description: "Rename a project or change its description, group, or coding device. Omitted fields keep their current value.",
    inputSchema: objectSchema(
      {
        projectId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        groupId: { type: "string" },
        codingDevice: { type: "string", description: "Empty string clears it." }
      },
      ["projectId"]
    ),
    run: async (args) => {
      const project = await findProject(str(args, "projectId")!);
      const codingDevice = str(args, "codingDevice", false);
      const updated = await projectsApi.updateProjectBasics(project.id, {
        name: str(args, "name", false) ?? project.name,
        description: str(args, "description", false) ?? project.description,
        groupId: str(args, "groupId", false) ?? project.groupId,
        ...(args.codingDevice !== undefined ? { codingDevice: codingDevice ?? "" } : {})
      });
      return summarizeProject(updated);
    }
  },
  {
    name: "update_project_timeline",
    description:
      "Replace the project's phase timeline. Pass the complete list of phases in order; include an existing phase's id to keep its colour, people, tools, notes, and (when tasks are omitted) its tasks. Phases left out are removed.",
    inputSchema: objectSchema(
      {
        projectId: { type: "string" },
        title: { type: "string" },
        phases: {
          type: "array",
          items: objectSchema(
            {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              startDate: { type: "string", description: "yyyy-mm-dd" },
              endDate: { type: "string", description: "yyyy-mm-dd" },
              tasks: {
                type: "array",
                items: objectSchema(
                  {
                    id: { type: "string" },
                    title: { type: "string" },
                    dueDate: { type: "string", description: "yyyy-mm-dd" },
                    completed: { type: "boolean" },
                    priority: { type: "string", enum: ["low", "medium", "high"] }
                  },
                  ["title"]
                )
              }
            },
            ["name", "startDate", "endDate"]
          )
        }
      },
      ["projectId", "phases"]
    ),
    run: async (args) => {
      const project = await findProject(str(args, "projectId")!);
      if (!Array.isArray(args.phases) || args.phases.length === 0) {
        throw new AgentToolError("phases must be a non-empty array");
      }
      const existingById = new Map(project.phases.map((phase) => [phase.id, phaseToTimelineInput(phase)]));
      const phases: TimelinePhaseInput[] = (args.phases as AgentArgs[]).map((input, index) => {
        const id = str(input, "id", false);
        const base = id ? existingById.get(id) : undefined;
        const startDate = dateArg(input, "startDate")!;
        const endDate = dateArg(input, "endDate")!;
        if (endDate < startDate) {
          throw new AgentToolError(`Phase ${index + 1}: endDate is before startDate`);
        }
        const existingTasksById = new Map((base?.tasks ?? []).map((task) => [task.id, task]));
        const tasks = Array.isArray(input.tasks)
          ? (input.tasks as AgentArgs[]).map((taskInput) => {
              const taskId = str(taskInput, "id", false);
              const existing = taskId ? existingTasksById.get(taskId) : undefined;
              return {
                id: existing?.id,
                title: str(taskInput, "title")!,
                completed: typeof taskInput.completed === "boolean" ? taskInput.completed : existing?.completed ?? false,
                assigneeId: existing?.assigneeId ?? "",
                dueDate: dateArg(taskInput, "dueDate", false) ?? existing?.dueDate ?? endDate,
                priority:
                  enumArg(taskInput, "priority", ["low", "medium", "high"] as const, false) ??
                  existing?.priority ??
                  "medium"
              };
            })
          : (base?.tasks ?? []);
        return {
          id: base?.id,
          name: str(input, "name")!,
          description: str(input, "description", false) ?? base?.description ?? "",
          startDate,
          endDate,
          color: base?.color ?? DEFAULT_PHASE_COLOR,
          personIds: base?.personIds ?? [],
          toolIds: base?.toolIds ?? [],
          notes: base?.notes ?? "",
          tasks
        };
      });
      const updated = await projectsApi.updateProjectTimeline(project.id, {
        title: str(args, "title", false) ?? project.timelineTitle ?? "",
        phases,
        rows: project.timelineRows ?? []
      });
      return detailProject(updated);
    }
  },
  {
    name: "shift_project_timeline",
    description: "Move the whole timeline so the earliest phase starts on startDate; every phase and task shifts by the same number of days.",
    inputSchema: objectSchema(
      { projectId: { type: "string" }, startDate: { type: "string", description: "yyyy-mm-dd" } },
      ["projectId", "startDate"]
    ),
    run: async (args) => {
      const project = await findProject(str(args, "projectId")!);
      const nextStart = dateArg(args, "startDate")!;
      const starts = project.phases.map((phase) => phase.startDate).filter(isDateKey);
      if (!starts.length) {
        throw new AgentToolError("The project has no dated phases to shift");
      }
      const currentStart = starts.reduce((earliest, date) => (date < earliest ? date : earliest));
      const offsetDays = dayNumber(nextStart) - dayNumber(currentStart);
      const phases = project.phases.map(phaseToTimelineInput).map((phase) => ({
        ...phase,
        startDate: shiftDateKey(phase.startDate, offsetDays),
        endDate: shiftDateKey(phase.endDate, offsetDays),
        tasks: phase.tasks.map((task) => ({ ...task, dueDate: shiftDateKey(task.dueDate, offsetDays) }))
      }));
      const updated = await projectsApi.updateProjectTimeline(project.id, {
        title: project.timelineTitle ?? "",
        phases,
        rows: project.timelineRows ?? []
      });
      return { shiftedByDays: offsetDays, ...summarizeProject(updated) };
    }
  },
  {
    name: "add_project_payment",
    description: "Record a planned receivable or a received payment on a project.",
    inputSchema: objectSchema(
      {
        projectId: { type: "string" },
        title: { type: "string" },
        type: { type: "string", enum: ["planned", "received"] },
        amount: { type: "number" },
        currency: { type: "string", enum: supportedCurrencies },
        dueDate: { type: "string", description: "yyyy-mm-dd" },
        receivedDate: { type: "string", description: "yyyy-mm-dd, for received payments" },
        notes: { type: "string" }
      },
      ["projectId", "title", "type", "amount", "dueDate"]
    ),
    run: async (args) => {
      const project = await findProject(str(args, "projectId")!);
      const amount = num(args, "amount")!;
      if (amount <= 0) {
        throw new AgentToolError("amount must be greater than 0");
      }
      const updated = await projectsApi.updateProjectPayments(project.id, [
        ...(project.payments ?? []).map(paymentToInput),
        {
          title: str(args, "title")!,
          type: enumArg(args, "type", ["planned", "received"] as const)!,
          amount,
          currency: currencyArg(args, "currency") ?? "CNY",
          dueDate: dateArg(args, "dueDate")!,
          receivedDate: dateArg(args, "receivedDate", false),
          notes: str(args, "notes", false)
        }
      ]);
      return detailProject(updated).payments;
    }
  },
  {
    name: "get_dashboard_overview",
    description: "Headline numbers: project counts, average progress, actual cost, budget total, and spotlight projects. Scope to a company or group if needed.",
    inputSchema: objectSchema({ companyId: { type: "string" }, groupId: { type: "string" } }),
    run: async (args) => {
      const companyId = str(args, "companyId", false);
      const groupId = str(args, "groupId", false);
      const overview = await projectsApi.getDashboardOverview(
        companyId ? { type: "company", id: companyId } : groupId ? { type: "group", id: groupId } : { type: "all" }
      );
      return {
        currency: overview.currency,
        totalProjectCount: overview.totalProjectCount,
        activeProjectCount: overview.activeProjectCount,
        completedProjectCount: overview.completedProjectCount,
        pausedProjectCount: overview.pausedProjectCount,
        averageProgress: overview.averageProgress,
        releasedProjectCount: overview.releasedProjectCount,
        upcomingDeliverableCount: overview.upcomingDeliverableCount,
        actualCostSoFar: overview.actualCostSoFar,
        budgetCostTotal: overview.budgetCostTotal,
        spotlightProjects: overview.spotlightProjects.map(summarizeProject)
      };
    }
  },
  {
    name: "get_cost_summary",
    description: "Cost summary in CNY: actual cost, budget, planned receivable, received revenue, and profit — for one project or the whole studio.",
    inputSchema: objectSchema({ projectId: { type: "string" } }),
    run: async (args) => {
      const projectId = str(args, "projectId", false);
      return projectId ? costsApi.getProjectCostSummary(projectId) : costsApi.getGlobalCostSummary();
    }
  },
  {
    name: "get_fiscal_year_reports",
    description: "Annual statements (March–February fiscal years) with cost, revenue, profit, and margin per brand and project group.",
    inputSchema: objectSchema({}),
    run: async () => costsApi.getFiscalYearReports()
  },
  {
    name: "list_wishlist",
    description: "Wish list items with price, currency, and whether they were fulfilled.",
    inputSchema: objectSchema({}),
    run: async () => librariesApi.listWishlist()
  },
  {
    name: "add_wishlist_item",
    description: "Add something to buy or subscribe to later, with an optional price.",
    inputSchema: objectSchema(
      {
        name: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string", enum: supportedCurrencies }
      },
      ["name"]
    ),
    run: async (args) =>
      librariesApi.addWishlistItem({
        name: str(args, "name")!,
        amount: num(args, "amount", false),
        currency: currencyArg(args, "currency")
      })
  },
  {
    name: "fulfill_wishlist_item",
    description: "Mark a wish as fulfilled; it moves into the dashboard marquee.",
    inputSchema: objectSchema({ itemId: { type: "string" } }, ["itemId"]),
    run: async (args) => librariesApi.fulfillWishlistItem(str(args, "itemId")!)
  },
  {
    name: "list_usage_reminders",
    description: "USAGE refresh countdowns with their start date and weekly/monthly cycle.",
    inputSchema: objectSchema({}),
    run: async () => usageApi.listUsageReminders()
  },
  {
    name: "add_usage_reminder",
    description: "Add a USAGE refresh countdown that repeats weekly (default) or monthly from startDate.",
    inputSchema: objectSchema(
      {
        name: { type: "string" },
        startDate: { type: "string", description: "yyyy-mm-dd" },
        cycle: { type: "string", enum: ["weekly", "monthly"] }
      },
      ["name", "startDate"]
    ),
    run: async (args) =>
      usageApi.addUsageReminder({
        name: str(args, "name")!,
        startDate: dateArg(args, "startDate")!,
        cycle: enumArg(args, "cycle", ["weekly", "monthly"] as const, false)
      })
  },
  {
    name: "list_testflight_reminders",
    description: "iOS TestFlight 90-day countdowns (name, version, window start, linked project).",
    inputSchema: objectSchema({}),
    run: async () => testflightApi.listTestflightReminders()
  },
  {
    name: "renew_testflight_reminder",
    description: "Restart a TestFlight countdown from today; a linked project records the renewal on its official release.",
    inputSchema: objectSchema({ reminderId: { type: "string" } }, ["reminderId"]),
    run: async (args) => testflightApi.renewTestflightReminder(str(args, "reminderId")!)
  },
  {
    name: "archive_project",
    description: "Move a project to the archive (its actual costs stay in the totals). Requires confirm: true.",
    inputSchema: objectSchema({ projectId: { type: "string" }, confirm: { type: "boolean" } }, ["projectId", "confirm"]),
    run: async (args) => {
      requireConfirm(args, "Archiving a project");
      return summarizeProject(await projectsApi.archiveProject(str(args, "projectId")!));
    }
  },
  {
    name: "restore_project",
    description: "Bring an archived project back to the active list.",
    inputSchema: objectSchema({ projectId: { type: "string" } }, ["projectId"]),
    run: async (args) => summarizeProject(await projectsApi.restoreProject(str(args, "projectId")!))
  },
  {
    name: "delete_project",
    description: "Permanently delete a project and its share links. Requires confirm: true.",
    inputSchema: objectSchema({ projectId: { type: "string" }, confirm: { type: "boolean" } }, ["projectId", "confirm"]),
    run: async (args) => {
      requireConfirm(args, "Deleting a project");
      const project = await projectsApi.deleteProject(str(args, "projectId")!);
      return { deleted: true, id: project.id, name: project.name };
    }
  }
];

export const listAgentTools = (): AgentToolDefinition[] =>
  tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export const runAgentTool = async (name: string, args: AgentArgs | undefined) => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new AgentToolError(`Unknown tool: ${name}`);
  }
  return tool.run(args ?? {});
};
