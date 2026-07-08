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
  companyId: string;
  name: string;
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
  subscription?: ToolSubscription;
};

export type ToolSubscription = {
  amount: number;
  currency: CostItem["currency"];
  billingCycle: "monthly" | "yearly";
  expiresAt: string;
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

export type TimelineCustomRow = {
  id: string;
  label: string;
  values: Record<string, string>;
};

export type CostItem = {
  id: string;
  projectId: string;
  name: string;
  category: "software" | "people" | "outsourcing" | "asset" | "server" | "other";
  amount: number;
  currency: "USD" | "JPY" | "CNY" | "EUR";
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
  name: string;
  summary: string;
  status: "draft" | "review" | "released";
  createdAt: string;
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
  createdAt: string;
};

export type ProjectStatus = "planning" | "active" | "paused" | "completed";

export type Project = {
  id: string;
  companyId: string;
  groupId: string;
  name: string;
  description: string;
  coverImage: string;
  tools: Tool[];
  people: Person[];
  startDate: string;
  endDate: string;
  timelineTitle?: string;
  timelineRows?: TimelineCustomRow[];
  currentPhaseId: string;
  progress: number;
  status: ProjectStatus;
  phases: Phase[];
  costs: CostItem[];
  payments: PaymentItem[];
  materials: Material[];
  versions: ProjectVersion[];
  activity: ActivityEvent[];
  shareSettings: ShareSettings;
};

export type CompanySummary = {
  company: Company;
  totalProjectCount: number;
  activeProjectCount: number;
  completedProjectCount: number;
  averageProgress: number;
  privateCostTotal: number;
};

export type ProjectGroupSummary = {
  group: ProjectGroup;
  totalProjectCount: number;
  activeProjectCount: number;
  completedProjectCount: number;
  averageProgress: number;
  privateCostTotal: number;
};

export type DashboardOverview = {
  totalProjectCount: number;
  activeProjectCount: number;
  completedProjectCount: number;
  pausedProjectCount: number;
  averageProgress: number;
  upcomingDeliverableCount: number;
  overdueTaskCount: number;
  actualCostSoFar: number;
  futureEstimatedCost: number;
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
  shareLinks: ShareLink[];
};
