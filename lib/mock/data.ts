import type {
  Company,
  CostItem,
  CostLibraryItem,
  ActivityEvent,
  DashboardOverview,
  Deliverable,
  Material,
  MockDatabase,
  PaymentItem,
  Person,
  Phase,
  Project,
  ProjectGroup,
  ProjectStatus,
  ProjectVersion,
  ShareLink,
  ShareSettings,
  Task,
  Tool,
  User
} from "@/lib/types";
import {
  bundledExchangeRateSnapshot,
  sumMoney,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";
import {
  calculateProjectBudget,
  type ProjectBudgetCalculation
} from "@/lib/utils/project-budget";
import { defaultProjectPhaseNames } from "@/lib/utils/project-phases";
import { hasProjectPublishedRelease } from "@/lib/utils/project-release";

const projectImages = [
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560472355-536de3962603?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80"
];

const companyCovers = [
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1400&q=80"
];

const groupCovers = [
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80"
];

const phaseNames = [...defaultProjectPhaseNames];
const phaseColors = ["#e3f596", "#8edbe8", "#f94a22", "#1c2328", "#d4a1df"];

const toolPool: Tool[] = [
  { id: "tool-codex", name: "Codex", category: "dev", icon: "code" },
  {
    id: "tool-chatgpt",
    name: "ChatGPT",
    category: "ai",
    icon: "sparkles",
    subscription: {
      amount: 20,
      currency: "USD",
      billingCycle: "monthly",
      expiresAt: "2026-12-20",
      accountEmail: "ai.ops@studio.test"
    }
  },
  {
    id: "tool-figma",
    name: "Figma",
    category: "design",
    icon: "figma",
    subscription: {
      amount: 180,
      currency: "USD",
      billingCycle: "yearly",
      expiresAt: "2027-03-12",
      accountEmail: "design@studio.test"
    }
  },
  { id: "tool-godot", name: "Godot", category: "game", icon: "gamepad" },
  { id: "tool-three", name: "Three.js", category: "dev", icon: "box" },
  {
    id: "tool-photoshop",
    name: "Photoshop",
    category: "design",
    icon: "brush",
    subscription: {
      amount: 380,
      currency: "CNY",
      billingCycle: "monthly",
      expiresAt: "2026-11-05",
      accountEmail: "post@studio.test"
    }
  },
  {
    id: "tool-runway",
    name: "Runway",
    category: "video",
    icon: "video",
    subscription: {
      amount: 35,
      currency: "USD",
      billingCycle: "monthly",
      expiresAt: "2026-09-18",
      accountEmail: "video@studio.test"
    }
  },
  {
    id: "tool-midjourney",
    name: "Midjourney",
    category: "ai",
    icon: "image",
    subscription: {
      amount: 30,
      currency: "USD",
      billingCycle: "monthly",
      expiresAt: "2026-10-01",
      accountEmail: "image.ai@studio.test"
    }
  },
  { id: "tool-custom", name: "Custom", category: "other", icon: "settings" }
];

const peoplePool: Person[] = [
  {
    id: "person-likun",
    name: "Likun",
    role: "Studio Owner",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80",
    email: "likun@studio.test",
    type: "internal",
    dailyCost: 1800,
    dailyCostCurrency: "CNY",
    costTemplateId: "cost-template-core-days"
  },
  {
    id: "person-mira",
    name: "Mira",
    role: "Producer",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80",
    email: "mira@studio.test",
    type: "internal",
    dailyCost: 1200,
    dailyCostCurrency: "CNY",
    costTemplateId: "cost-template-core-days"
  },
  {
    id: "person-chen",
    name: "Chen",
    role: "Design Lead",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80",
    email: "chen@studio.test",
    type: "internal",
    dailyCost: 1500,
    dailyCostCurrency: "CNY",
    costTemplateId: "cost-template-core-days"
  },
  {
    id: "person-nova",
    name: "Nova AI",
    role: "AI Assistant",
    avatar: "",
    type: "ai-tool",
    dailyCost: 320,
    dailyCostCurrency: "USD",
    costTemplateId: "cost-template-ai-suite"
  },
  {
    id: "person-riko",
    name: "Riko",
    role: "Motion Vendor",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80",
    email: "riko@vendor.test",
    type: "vendor",
    dailyCost: 6800,
    dailyCostCurrency: "CNY",
    costTemplateId: "cost-template-motion-vendor"
  },
  {
    id: "person-kai",
    name: "Kai",
    role: "Game Developer",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80",
    email: "kai@studio.test",
    type: "internal",
    dailyCost: 1300,
    dailyCostCurrency: "CNY",
    costTemplateId: "cost-template-core-days"
  }
];

const costLibrarySeed: CostLibraryItem[] = [
  {
    id: "cost-template-ai-suite",
    name: "AI tool suite",
    category: "software",
    amount: 320,
    currency: "USD",
    billingType: "monthly",
    isActual: true
  },
  {
    id: "cost-template-core-days",
    name: "Core production days",
    category: "people",
    amount: 22000,
    currency: "CNY",
    billingType: "one-time",
    isActual: false
  },
  {
    id: "cost-template-motion-vendor",
    name: "Motion vendor sprint",
    category: "outsourcing",
    amount: 6800,
    currency: "CNY",
    billingType: "one-time",
    isActual: false
  },
  {
    id: "cost-template-cloud-render",
    name: "Cloud render budget",
    category: "server",
    amount: 1200,
    currency: "CNY",
    billingType: "monthly",
    isActual: false
  }
];

const companySeeds = [
  {
    id: "company-northstar",
    name: "Northstar Creative Lab",
    description: "A compact AI-assisted studio for interactive games, visual systems, and launch-ready prototypes."
  },
  {
    id: "company-color-works",
    name: "Color Works Studio",
    description: "A visual production studio for short films, campaign assets, brand pages, and shareable progress rooms."
  }
];

const groupSeeds = [
  {
    id: "group-1-1",
    name: "Game Projects",
    nameI18n: { en: "Game Projects", zh: "游戏项目", ja: "ゲームプロジェクト" }
  },
  {
    id: "group-1-2",
    name: "AI Video Projects",
    nameI18n: { en: "AI Video Projects", zh: "AI 视频项目", ja: "AI動画プロジェクト" }
  },
  {
    id: "group-2-1",
    name: "Website Projects",
    nameI18n: { en: "Website Projects", zh: "网站项目", ja: "Webサイトプロジェクト" }
  },
  {
    id: "group-2-2",
    name: "Client Projects",
    nameI18n: { en: "Client Projects", zh: "客户项目", ja: "クライアントプロジェクト" }
  }
];

const projectSeedAssignments = [
  {
    companyId: "company-northstar",
    groupId: "group-1-1",
    names: ["AI Web Game Prototype", "Three.js Engine Experiment", "Visual Asset Production"]
  },
  {
    companyId: "company-northstar",
    groupId: "group-1-2",
    names: ["Short Video Pipeline", "Runway Trailer Sprint", "Motion Identity Pack"]
  },
  {
    companyId: "company-color-works",
    groupId: "group-2-1",
    names: ["Brand Landing Page", "Portfolio Relaunch", "Interactive Product Site"]
  },
  {
    companyId: "company-color-works",
    groupId: "group-2-2",
    names: ["Marketing Campaign", "Client Progress Room", "Event Concept Board"]
  }
];

const materialSeeds: Array<Pick<Material, "name" | "type" | "status">> = [
  { name: "Hero reference wall", type: "image", status: "approved" },
  { name: "Motion study", type: "video", status: "review" },
  { name: "Prototype capture", type: "prototype", status: "draft" },
  { name: "Share deck", type: "doc", status: "approved" }
];

const versionSeeds: Array<Pick<ProjectVersion, "kind" | "name" | "summary" | "status">> = [
  {
    kind: "demo",
    name: "Demo release",
    summary: "Demo publishing checkpoint.",
    status: "draft"
  },
  {
    kind: "official",
    name: "Official release",
    summary: "Formal release checkpoint.",
    status: "draft"
  }
];

const activitySeeds: Array<Pick<ActivityEvent, "title" | "tone">> = [
  { title: "Brief approved", tone: "success" },
  { title: "Assets uploaded", tone: "info" },
  { title: "Share room updated", tone: "warning" }
];

const user: User = {
  id: "user-studio-owner",
  name: "Studio Owner",
  email: "studio@example.com",
  avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80",
  createdAt: "2026-06-01T09:00:00.000Z"
};

const dateFor = (month: number, day: number) => `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const pickSlice = <T,>(items: T[], start: number, count: number) =>
  Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);

const createTasks = (deliverableId: string, projectIndex: number, phaseIndex: number, deliverableIndex: number): Task[] =>
  Array.from({ length: 3 }, (_, taskIndex) => {
    const completed = phaseIndex < 2 || (phaseIndex === 2 && deliverableIndex === 0 && taskIndex < 2);
    const assignee = peoplePool[(projectIndex + phaseIndex + deliverableIndex + taskIndex) % peoplePool.length];

    return {
      id: `${deliverableId}-task-${taskIndex + 1}`,
      deliverableId,
      title: ["Brief locked", "Asset pass complete", "Review notes cleared"][taskIndex],
      completed,
      assigneeId: assignee.id,
      dueDate: dateFor(6 + phaseIndex, 8 + deliverableIndex * 4 + taskIndex),
      priority: taskIndex === 2 ? "high" : taskIndex === 1 ? "medium" : "low"
    };
  });

const createDeliverables = (phaseId: string, projectIndex: number, phaseIndex: number): Deliverable[] =>
  Array.from({ length: 3 }, (_, deliverableIndex) => {
    const deliverableId = `${phaseId}-deliverable-${deliverableIndex + 1}`;
    const tasks = createTasks(deliverableId, projectIndex, phaseIndex, deliverableIndex);

    return {
      id: deliverableId,
      phaseId,
      title: ["Direction package", "Production batch", "Review build"][deliverableIndex],
      description: "A concrete creative output with owner, date, and checklist state.",
      assigneeId: peoplePool[(projectIndex + phaseIndex + deliverableIndex) % peoplePool.length].id,
      dueDate: dateFor(6 + phaseIndex, 12 + deliverableIndex * 5),
      tasks,
      completed: tasks.every((task) => task.completed)
    };
  });

const createPhases = (projectId: string, projectIndex: number): Phase[] =>
  phaseNames.map((name, phaseIndex) => {
    const phaseId = `${projectId}-phase-${phaseIndex + 1}`;
    const status: Phase["status"] =
      phaseIndex < 2 ? "completed" : phaseIndex === 2 ? "active" : "not-started";

    return {
      id: phaseId,
      projectId,
      name,
      description: `${name} workstream for project planning, production, and launch readiness.`,
      startDate: dateFor(6 + phaseIndex, 1),
      endDate: dateFor(6 + phaseIndex, 24),
      status,
      assigneeId: peoplePool[(projectIndex + phaseIndex) % peoplePool.length].id,
      color: phaseColors[phaseIndex % phaseColors.length],
      personIds: pickSlice(peoplePool, projectIndex + phaseIndex, 2).map((person) => person.id),
      toolIds: pickSlice(toolPool, projectIndex + phaseIndex, 2).map((tool) => tool.id),
      notes: `${name} checkpoint notes and review context.`,
      deliverables: createDeliverables(phaseId, projectIndex, phaseIndex)
    };
  });

const calculateProgress = (phases: Phase[]) => {
  const tasks = phases.flatMap((phase) => phase.deliverables.flatMap((deliverable) => deliverable.tasks));
  const completedTasks = tasks.filter((task) => task.completed).length;

  return Math.round((completedTasks / tasks.length) * 100);
};

const createCosts = (projectId: string, projectIndex: number): CostItem[] => [
  {
    id: `${projectId}-cost-software`,
    projectId,
    name: "AI and design software",
    category: "software",
    amount: 220 + projectIndex * 12,
    currency: "USD",
    billingType: "monthly",
    startDate: "2026-06-01",
    isActual: true,
    visibility: "private"
  },
  {
    id: `${projectId}-cost-people`,
    projectId,
    name: "Core production time",
    category: "people",
    amount: 18000 + projectIndex * 950,
    currency: "CNY",
    billingType: "one-time",
    startDate: "2026-06-05",
    isActual: projectIndex % 3 !== 0,
    visibility: "private"
  },
  {
    id: `${projectId}-cost-assets`,
    projectId,
    name: "External asset pack",
    category: "asset",
    amount: 520 + projectIndex * 35,
    currency: "USD",
    billingType: "one-time",
    startDate: "2026-07-01",
    isActual: false,
    visibility: "private"
  }
];

export const createProjectPayments = (projectId: string, projectIndex: number): PaymentItem[] => {
  const baseAmount = 86000 + projectIndex * 7200;
  const deposit = Math.round(baseAmount * 0.35);
  const milestone = Math.round(baseAmount * 0.4);
  const finalPayment = baseAmount - deposit - milestone;
  const hasMilestoneReceipt = projectIndex % 4 !== 0;

  return [
    {
      id: `${projectId}-payment-plan-deposit`,
      projectId,
      title: "Project deposit",
      type: "planned",
      amount: deposit,
      currency: "CNY",
      dueDate: "2026-06-18",
      notes: "Kickoff receivable"
    },
    {
      id: `${projectId}-payment-plan-milestone`,
      projectId,
      title: "Midpoint milestone",
      type: "planned",
      amount: milestone,
      currency: "CNY",
      dueDate: "2026-08-15",
      notes: "Design and production review"
    },
    {
      id: `${projectId}-payment-plan-final`,
      projectId,
      title: "Final delivery",
      type: "planned",
      amount: finalPayment,
      currency: "CNY",
      dueDate: "2026-10-10",
      notes: "Launch handoff"
    },
    {
      id: `${projectId}-payment-received-deposit`,
      projectId,
      title: "Deposit received",
      type: "received",
      amount: deposit,
      currency: "CNY",
      dueDate: "2026-06-18",
      receivedDate: "2026-06-20",
      notes: "Bank transfer confirmed"
    },
    ...(hasMilestoneReceipt
      ? [
          {
            id: `${projectId}-payment-received-milestone`,
            projectId,
            title: "Milestone received",
            type: "received",
            amount: Math.round(milestone * 0.72),
            currency: "CNY",
            dueDate: "2026-08-15",
            receivedDate: "2026-08-20",
            notes: "Partial milestone collection"
          } satisfies PaymentItem
        ]
      : [])
  ];
};

const createMaterials = (projectId: string, projectIndex: number): Material[] =>
  materialSeeds.map((material, materialIndex) => ({
    id: `${projectId}-material-${materialIndex + 1}`,
    projectId,
    ...material,
    ownerId: peoplePool[(projectIndex + materialIndex) % peoplePool.length].id,
    updatedAt: dateFor(6 + (materialIndex % 3), 10 + projectIndex + materialIndex)
  }));

const createVersions = (projectId: string, projectIndex: number): ProjectVersion[] =>
  versionSeeds.map((version, versionIndex) => ({
    id: `${projectId}-version-${version.kind}`,
    projectId,
    ...version,
    createdAt: dateFor(6 + versionIndex, 6 + projectIndex + versionIndex * 5)
  }));

const createActivity = (projectId: string, projectIndex: number): ActivityEvent[] =>
  activitySeeds.map((event, eventIndex) => ({
    id: `${projectId}-activity-${eventIndex + 1}`,
    projectId,
    ...event,
    actorId: peoplePool[(projectIndex + eventIndex + 1) % peoplePool.length].id,
    createdAt: dateFor(6 + eventIndex, 18 + projectIndex + eventIndex)
  }));

export const createMockProject = (
  companyId: string,
  groupId: string,
  name: string,
  projectIndex: number,
  shareToken?: string
): Project => {
  const projectId = `project-${String(projectIndex + 1).padStart(2, "0")}`;
  const phases = createPhases(projectId, projectIndex);
  const progress = calculateProgress(phases);
  const status: ProjectStatus =
    projectIndex % 6 === 5 ? "paused" : progress >= 90 ? "completed" : projectIndex % 4 === 0 ? "planning" : "active";
  const shareSettings: ShareSettings = {
    isEnabled: Boolean(shareToken),
    token: shareToken,
    allowCostPreview: projectIndex === 1,
    showPeople: true,
    showTools: true,
    showTimeline: true,
    showDeliverables: true,
    showMaterials: true,
    showVersions: true
  };

  return {
    id: projectId,
    companyId,
    groupId,
    name,
    description: "A visual studio initiative managed through phases, deliverables, people, tools, and share settings.",
    coverImage: projectImages[projectIndex % projectImages.length],
    archivedAt: null,
    tools: pickSlice(toolPool, projectIndex, 4),
    people: pickSlice(peoplePool, projectIndex, 4),
    startDate: "2026-06-01",
    endDate: "2026-10-15",
    timelineTitle: "Timeline board",
    timelineRows: [],
    currentPhaseId: phases.find((phase) => phase.status === "active")?.id ?? phases[0].id,
    progress,
    status,
    phases,
    costs: createCosts(projectId, projectIndex),
    payments: createProjectPayments(projectId, projectIndex),
    materials: createMaterials(projectId, projectIndex),
    versions: createVersions(projectId, projectIndex),
    activity: createActivity(projectId, projectIndex),
    shareSettings
  };
};

export const createMockDatabase = (): MockDatabase => {
  const companies: Company[] = companySeeds.map((company, index) => ({
    ...company,
    coverImage: companyCovers[index],
    createdAt: `2026-06-0${index + 1}T09:00:00.000Z`
  }));

  const groups: ProjectGroup[] = groupSeeds.map((group, groupIndex) => ({
    id: group.id,
    name: group.name,
    nameI18n: group.nameI18n,
    description: `${group.name}, grouped for visual planning and progress sharing.`,
    coverImage: groupCovers[groupIndex],
    colorTheme: groupIndex % 2 === 0 ? "aqua" : "lime",
    createdAt: `2026-06-0${(groupIndex % 2) + 3}T09:00:00.000Z`
  }));

  const projects = projectSeedAssignments.flatMap((assignment, assignmentIndex) =>
    assignment.names.map((projectName, projectOffset) => {
      const projectIndex = assignmentIndex * 3 + projectOffset;
      const shareToken = projectIndex === 0 ? "studio-share-alpha" : projectIndex === 4 ? "studio-share-beta" : undefined;

      return createMockProject(assignment.companyId, assignment.groupId, projectName, projectIndex, shareToken);
    })
  );

  const shareLinks: ShareLink[] = projects
    .filter((project) => project.shareSettings.isEnabled && project.shareSettings.token)
    .map((project, index) => ({
      id: `share-${index + 1}`,
      projectId: project.id,
      token: project.shareSettings.token as string,
      expiresAt: index === 0 ? "2026-12-31T23:59:59.000Z" : undefined,
      allowCostPreview: project.shareSettings.allowCostPreview,
      displayCurrency: "CNY",
      createdAt: "2026-06-20T10:00:00.000Z"
    }));

  return structuredClone({
    users: [user],
    companies,
    groups,
    projects,
    people: peoplePool,
    tools: toolPool,
    costLibrary: costLibrarySeed,
    shareLinks
  });
};

export const mockDatabase = createMockDatabase();

export const getToolMonthlySubscriptionMoney = (tool: Tool) => {
  const subscription = tool.subscription;

  if (!subscription || subscription.amount <= 0) {
    return null;
  }

  return {
    amount: subscription.billingCycle === "yearly" ? subscription.amount / 12 : subscription.amount,
    currency: subscription.currency
  };
};

export const getToolMonthlySubscriptionCost = (
  tool: Tool,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) => {
  const monthly = getToolMonthlySubscriptionMoney(tool);

  return monthly ? sumMoney([monthly], currency, snapshot) : 0;
};

export const getTotalMonthlySubscriptionCost = (
  tools: Tool[] = mockDatabase.tools,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) =>
  sumMoney(
    tools.flatMap((tool) => {
      const monthly = getToolMonthlySubscriptionMoney(tool);
      return monthly ? [monthly] : [];
    }),
    currency,
    snapshot
  );

export const getProjectSubscriptionTools = (project: Project, tools: Tool[] = mockDatabase.tools) => {
  const usedToolIds = new Set([
    ...project.tools.map((tool) => tool.id),
    ...project.phases.flatMap((phase) => phase.toolIds ?? [])
  ]);

  return tools.filter((tool) => usedToolIds.has(tool.id) && Boolean(getToolMonthlySubscriptionMoney(tool)));
};

export const getProjectSubscriptionCost = (
  project: Project,
  tools: Tool[] = mockDatabase.tools,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) =>
  sumMoney(
    getProjectSubscriptionTools(project, tools).flatMap((tool) => {
      const monthly = getToolMonthlySubscriptionMoney(tool);
      return monthly ? [monthly] : [];
    }),
    currency,
    snapshot
  );

export const createProjectSubscriptionCostItems = (project: Project, tools: Tool[] = mockDatabase.tools): CostItem[] =>
  getProjectSubscriptionTools(project, tools).flatMap((tool) => {
    const monthly = getToolMonthlySubscriptionMoney(tool);

    return monthly
      ? [
          {
            id: `${project.id}-subscription-${tool.id}`,
            projectId: project.id,
            name: `Subscription · ${tool.name}`,
            category: "software" as const,
            amount: monthly.amount,
            currency: monthly.currency,
            billingType: "monthly" as const,
            startDate: project.startDate,
            endDate: tool.subscription?.expiresAt,
            isActual: true,
            visibility: "private" as const
          }
        ]
      : [];
  });

export const getAllTasks = (projects: Project[] = mockDatabase.projects) =>
  projects.flatMap((project) =>
    project.phases.flatMap((phase) =>
      phase.deliverables.flatMap((deliverable) => deliverable.tasks)
    )
  );

export const getAllDeliverables = (projects: Project[] = mockDatabase.projects) =>
  projects.flatMap((project) => project.phases.flatMap((phase) => phase.deliverables));

export const getProjectActualCost = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) =>
  sumMoney(
    [
      ...project.costs.filter((cost) => cost.isActual),
      ...createProjectSubscriptionCostItems(project, mockDatabase.tools)
    ],
    currency,
    snapshot
  );

export const getProjectFutureCost = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) =>
  sumMoney(project.costs.filter((cost) => !cost.isActual), currency, snapshot);

/**
 * Returns the project's complete budget independently from its actual-cost
 * reporting. Projects created before structured budgets retain the exact old
 * `actual + future` total by passing those already-rounded display-currency
 * buckets through the legacy adapter.
 */
export const getProjectBudgetCalculation = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
): ProjectBudgetCalculation => {
  if (project.timelineConfigured === false) {
    return calculateProjectBudget({
      budget: undefined,
      phases: project.phases,
      tools: project.tools
    }, {
      currency,
      snapshot,
      tools: mockDatabase.tools
    });
  }

  if (project.budget) {
    return calculateProjectBudget(project, {
      currency,
      snapshot,
      tools: mockDatabase.tools
    });
  }

  const legacyActualCost = getProjectActualCost(project, currency, snapshot);
  const legacyFutureCost = getProjectFutureCost(project, currency, snapshot);

  return calculateProjectBudget(project, {
    currency,
    snapshot,
    tools: mockDatabase.tools,
    legacyFallback: {
      projectCosts: [
        {
          id: `${project.id}-legacy-actual-total`,
          name: "Legacy actual-cost total",
          amount: legacyActualCost,
          currency
        },
        {
          id: `${project.id}-legacy-future-total`,
          name: "Legacy future-cost total",
          amount: legacyFutureCost,
          currency
        }
      ],
      subscriptionCosts: []
    }
  });
};

export const getProjectBudgetCost = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) => getProjectBudgetCalculation(project, currency, snapshot).total;

export const getProjectPlannedReceivable = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) =>
  sumMoney(
    (project.payments ?? []).filter((payment) => payment.type === "planned"),
    currency,
    snapshot
  );

export const getProjectReceivedRevenue = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) =>
  sumMoney(
    (project.payments ?? []).filter((payment) => payment.type === "received"),
    currency,
    snapshot
  );

export const getProjectActualProfit = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) => getProjectReceivedRevenue(project, currency, snapshot) - getProjectActualCost(project, currency, snapshot);

export const getProjectProjectedProfit = (
  project: Project,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) =>
  getProjectPlannedReceivable(project, currency, snapshot) -
  getProjectBudgetCost(project, currency, snapshot);

export const createDashboardOverview = (
  projects: Project[] = mockDatabase.projects,
  options: {
    includeArchivedTotal?: boolean;
    currency?: MoneyCurrency;
    snapshot?: ExchangeRateSnapshot;
  } = { includeArchivedTotal: true }
): DashboardOverview => {
  const currency = options.currency ?? "CNY";
  const snapshot = options.snapshot ?? bundledExchangeRateSnapshot;
  const operationalProjects = projects.filter((project) => !project.archivedAt);
  const countedProjects = options.includeArchivedTotal === false ? operationalProjects : projects;
  const deliverables = getAllDeliverables(operationalProjects);
  const tasks = getAllTasks(operationalProjects);
  const projectCount = countedProjects.length;
  const preferredSpotlightIndexes = [0, 6, 3, 1];
  const preferredSpotlights = preferredSpotlightIndexes.flatMap((projectIndex) =>
    operationalProjects[projectIndex] ? [operationalProjects[projectIndex]] : []
  );
  const spotlightProjects = [
    ...preferredSpotlights,
    ...operationalProjects.filter((project) => !preferredSpotlights.some((spotlight) => spotlight.id === project.id))
  ].slice(0, 4);

  return {
    currency,
    totalProjectCount: projectCount,
    activeProjectCount: operationalProjects.filter((project) => project.status === "active").length,
    completedProjectCount: operationalProjects.filter((project) => project.status === "completed").length,
    pausedProjectCount: operationalProjects.filter((project) => project.status === "paused").length,
    averageProgress: projectCount
      ? Math.round(countedProjects.reduce((sum, project) => sum + project.progress, 0) / projectCount)
      : 0,
    releasedProjectCount: countedProjects.filter((project) =>
      project.status === "completed" || hasProjectPublishedRelease(project)
    ).length,
    upcomingDeliverableCount: deliverables.filter((deliverable) => !deliverable.completed).length,
    overdueTaskCount: tasks.filter((task) => !task.completed && task.priority === "high").length,
    actualCostSoFar: operationalProjects.reduce(
      (sum, project) => sum + getProjectActualCost(project, currency, snapshot),
      0
    ),
    budgetCostTotal: operationalProjects.reduce(
      (sum, project) => sum + getProjectBudgetCost(project, currency, snapshot),
      0
    ),
    stageDistribution: phaseNames.map((phaseName) => {
      const phaseTasks = operationalProjects.flatMap((project) =>
        project.phases
          .filter((phase) => phase.name === phaseName)
          .flatMap((phase) => phase.deliverables.flatMap((deliverable) => deliverable.tasks))
      );
      const completedTasks = phaseTasks.filter((task) => task.completed).length;

      return {
        name: phaseName,
        value: phaseTasks.length ? Math.round((completedTasks / phaseTasks.length) * 100) : 0
      };
    }),
    spotlightProjects
  };
};
