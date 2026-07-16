import type { Language } from "@/lib/i18n/translations";
import type { MoneyCurrency } from "@/lib/utils/money";

export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  createdAt: string;
};

export type Company = {
  id: string;
  name: string;
  description: string;
  coverImage: string;
  createdAt: string;
};

export type ProjectGroup = {
  id: string;
  name: string;
  nameI18n?: Partial<Record<Language, string>>;
  description: string;
  coverImage: string;
  colorTheme: string;
  createdAt: string;
};

export type Tool = {
  id: string;
  name: string;
  category: "ai" | "design" | "dev" | "game" | "video" | "other";
  icon?: string;
  /** When present, the compatible software template is the live source of truth. */
  costTemplateId?: string;
  subscription?: ToolSubscription;
};

export type ToolSubscription = {
  amount: number;
  currency: CostItem["currency"];
  billingCycle: "monthly" | "yearly";
  expiresAt: string;
  /** First or next recurring payment date used as the reminder anchor. */
  nextPaymentAt?: string;
  accountEmail: string;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  email?: string;
  type: "internal" | "external" | "vendor" | "ai-tool";
  dailyCost?: number;
  dailyCostCurrency?: CostItem["currency"];
  /** When present, the compatible daily people template is the live source of truth. */
  costTemplateId?: string;
};

export type Task = {
  id: string;
  deliverableId: string;
  title: string;
  completed: boolean;
  assigneeId: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
};

export type Deliverable = {
  id: string;
  phaseId: string;
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  tasks: Task[];
  completed: boolean;
};

export type Phase = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: "not-started" | "active" | "completed";
  assigneeId?: string;
  color?: string;
  personIds?: string[];
  toolIds?: string[];
  notes?: string;
  deliverables: Deliverable[];
};

export type ProjectBudgetPersonnelLine = {
  id: string;
  personId?: string;
  roleLevel: string;
  headcount: number;
  hourlyRate: number;
  currency: MoneyCurrency;
  startDate: string;
  endDate: string;
  allocationPercent: number;
  /** @deprecated Preserved only when an older total cannot be represented by a 0-100% allocation. */
  days?: number;
};

export type ProjectBudgetTravel = {
  unitPrice: number;
  currency: MoneyCurrency;
  count: number;
};

export type ProjectBudgetDirectExpense = {
  amount: number;
  currency: MoneyCurrency;
};

export type ProjectBudgetDailyExpenseLine = ProjectBudgetDirectExpense & {
  id: string;
  name: string;
};

export type ProjectBudgetExtraCostLine = ProjectBudgetDirectExpense & {
  id: string;
  costTemplateId?: string;
  name: string;
  kind: "outsourcing" | "extra";
};

export type ProjectBudgetSoftwareCostLine = {
  id: string;
  toolId?: string;
  name: string;
  amount: number;
  currency: MoneyCurrency;
  billingCycle: "monthly" | "yearly";
  startDate: string;
  endDate: string;
  allocationPercent: number;
  /** @deprecated Preserved only when an older total cannot be represented by a 0-100% allocation. */
  periods?: number;
};

export type ProjectPhaseBudget = {
  phaseId: string;
  personnel: ProjectBudgetPersonnelLine[];
  travel?: ProjectBudgetTravel;
  /** Itemized daily and miscellaneous expenses. */
  dailyExpenseLines: ProjectBudgetDailyExpenseLine[];
  /** @deprecated Kept only so older backup files can be migrated safely. */
  dailyExpenses?: ProjectBudgetDirectExpense;
  extraCosts: ProjectBudgetExtraCostLine[];
  /** Frozen subscription rows imported from the library or entered manually. */
  softwareCosts: ProjectBudgetSoftwareCostLine[];
};

export type ProjectBudget = {
  phases: ProjectPhaseBudget[];
  contingencyPercent: number;
  taxPercent: number;
};

export type TimelineCustomRow = {
  id: string;
  label: string;
  values: Record<string, string>;
};

export type ProjectWorkflowAttachment = {
  id: string;
  fileName: string;
  kind: "json" | "markdown";
  mimeType: "application/json" | "text/markdown";
  size: number;
  content: string;
  uploadedAt: string;
};

export type ProjectWorkflowNode = {
  id: string;
  shape: "rounded-rectangle" | "circle";
  fillColor: string;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  text: string;
  attachment?: ProjectWorkflowAttachment;
};

export type ProjectWorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type ProjectWorkflowViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type ProjectWorkflow = {
  id: string;
  name: string;
  version: 1;
  nodes: ProjectWorkflowNode[];
  edges: ProjectWorkflowEdge[];
  viewport: ProjectWorkflowViewport;
  createdAt: string;
  updatedAt: string;
};

export type CostItem = {
  id: string;
  projectId: string;
  name: string;
  category: "software" | "people" | "outsourcing" | "asset" | "server" | "other";
  amount: number;
  currency: MoneyCurrency;
  billingType: "one-time" | "monthly" | "yearly" | "hourly" | "daily";
  startDate: string;
  endDate?: string;
  isActual: boolean;
  visibility: "private";
};

export type CostLibraryItem = {
  id: string;
  name: string;
  category: CostItem["category"];
  amount: number;
  currency: CostItem["currency"];
  billingType: CostItem["billingType"];
  isActual: boolean;
};

export type PaymentItem = {
  id: string;
  projectId: string;
  title: string;
  type: "planned" | "received";
  amount: number;
  currency: CostItem["currency"];
  dueDate: string;
  receivedDate?: string;
  notes?: string;
};

export type Material = {
  id: string;
  projectId: string;
  name: string;
  type: "image" | "video" | "doc" | "prototype" | "audio" | "other";
  status: "draft" | "review" | "approved";
  ownerId: string;
  updatedAt: string;
};

export type ProjectVersion = {
  id: string;
  projectId: string;
  kind?: "demo" | "official" | "legacy";
  name: string;
  summary: string;
  status: "draft" | "review" | "released";
  createdAt: string;
  versionNumber?: string;
  releaseDate?: string;
};

export type ActivityEvent = {
  id: string;
  projectId: string;
  title: string;
  actorId: string;
  createdAt: string;
  tone: "info" | "success" | "warning";
};

export type ShareSettings = {
  isEnabled: boolean;
  token?: string;
  allowCostPreview: boolean;
  showPeople: boolean;
  showTools: boolean;
  showTimeline: boolean;
  showDeliverables: boolean;
  showMaterials: boolean;
  showVersions: boolean;
};

export type ShareLink = {
  id: string;
  projectId: string;
  token: string;
  expiresAt?: string;
  allowCostPreview: boolean;
  displayCurrency?: MoneyCurrency;
  createdAt: string;
};

export type ProjectStatus = "planning" | "active" | "paused" | "terminated" | "completed";

export type Project = {
  id: string;
  /** Explicit marker for bundled examples; project IDs alone never imply demo content. */
  isExample?: boolean;
  /** Stable opaque identity used only to verify standalone project archives. */
  archiveIdentity?: string;
  /** True only while a newly-created local project is safe to replace with an archive. */
  importPlaceholder?: boolean;
  companyId: string;
  groupId: string;
  name: string;
  description: string;
  coverImage: string;
  archivedAt?: string | null;
  tools: Tool[];
  people: Person[];
  startDate: string;
  endDate: string;
  timelineTitle?: string;
  /** False only for newly-created projects until the timeline is explicitly saved. */
  timelineConfigured?: boolean;
  timelineRows?: TimelineCustomRow[];
  /** IDs of global workflow templates linked to this project. */
  workflowIds?: string[];
  /** @deprecated Legacy embedded workflows are migrated into the global library on load/import. */
  workflows?: ProjectWorkflow[];
  currentPhaseId: string;
  progress: number;
  status: ProjectStatus;
  phases: Phase[];
  budget?: ProjectBudget;
  costs: CostItem[];
  payments: PaymentItem[];
  materials: Material[];
  versions: ProjectVersion[];
  activity: ActivityEvent[];
  shareSettings: ShareSettings;
};

export type CompanySummary = {
  company: Company;
  currency: MoneyCurrency;
  totalProjectCount: number;
  activeProjectCount: number;
  completedProjectCount: number;
  averageProgress: number;
  actualCostTotal: number;
  budgetCostTotal: number;
};

export type ProjectGroupSummary = {
  group: ProjectGroup;
  currency: MoneyCurrency;
  totalProjectCount: number;
  activeProjectCount: number;
  completedProjectCount: number;
  averageProgress: number;
  actualCostTotal: number;
  budgetCostTotal: number;
};

export type PersonProjectParticipation = {
  personId: string;
  currency: MoneyCurrency;
  totalProjectCount: number;
  averageProgress: number;
  actualCostTotal: number;
  projects: Array<{
    projectId: string;
    projectName: string;
    isExample?: boolean;
    companyId: string;
    companyName: string;
    groupId: string;
    groupName: string;
    groupNameI18n?: ProjectGroup["nameI18n"];
    progress: number;
    status: ProjectStatus;
    actualCostSoFar: number;
  }>;
};

export type DashboardOverview = {
  currency: MoneyCurrency;
  totalProjectCount: number;
  activeProjectCount: number;
  completedProjectCount: number;
  pausedProjectCount: number;
  averageProgress: number;
  releasedProjectCount: number;
  upcomingDeliverableCount: number;
  overdueTaskCount: number;
  actualCostSoFar: number;
  budgetCostTotal: number;
  stageDistribution: Array<{
    name: string;
    value: number;
  }>;
  spotlightProjects: Project[];
};

export type DashboardScope =
  | {
      type: "all";
    }
  | {
      type: "company";
      id: string;
    }
  | {
      type: "group";
      id: string;
    };

export type CreateProjectInput = {
  name: string;
  companyId: string;
  groupId: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  toolIds: string[];
  personIds: string[];
  costTemplateIds: string[];
};

export type MockDatabase = {
  users: User[];
  companies: Company[];
  groups: ProjectGroup[];
  projects: Project[];
  people: Person[];
  tools: Tool[];
  costLibrary: CostLibraryItem[];
  /** Global workflow originals. Projects only keep IDs that point here. */
  workflows: ProjectWorkflow[];
  shareLinks: ShareLink[];
};
