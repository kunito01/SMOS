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
  /** Uploaded brand logo (data URL, ≤1 MB); stamped onto brand-scoped exports. */
  logoImage?: string;
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
  /** Optional day of month (1–31) that usage credits refresh; drives the homepage reminder. */
  creditsRefreshDay?: number;
  accountEmail: string;
  /** Featured on the dashboard subscriptions card. */
  showOnDashboard?: boolean;
  /** Plan tier shown next to the name on the AI Agent card; presets plus custom values. */
  level?: string;
};

export type WishlistItem = {
  id: string;
  name: string;
  /** Optional expected price shown on the tile and summed under the card title. */
  amount?: number;
  currency?: CostItem["currency"];
  /** Set when the wish is fulfilled; fulfilled wishes scroll in the card's marquee. */
  fulfilledAt?: string;
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
  /** Present when imported from an asset/server/other cost template. */
  costTemplateId?: string;
  /**
   * Recurring template imports bill once per calendar month the phase
   * touches (project-wide, never twice for the same template and month);
   * absent means a flat one-time amount that may stack freely.
   */
  billingCycle?: "monthly" | "yearly";
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

/** A ComfyUI workflow definition tied to the host machine that runs it. */
export type ComfyUiWorkflow = {
  id: string;
  name: string;
  host: string;
  content: string;
  /** Rendered bold on workflow tiles. */
  strengths?: string;
  /** Rendered in red on workflow tiles. */
  weaknesses?: string;
  /** NSFW renders bold red, SFW bold yellow on workflow tiles. */
  rating?: "nsfw" | "sfw";
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
  /** Free-form name of the machine this project is coded on. */
  codingDevice?: string;
  /** False only for newly-created projects until the timeline is explicitly saved. */
  timelineConfigured?: boolean;
  timelineRows?: TimelineCustomRow[];
  /** IDs of global workflow templates linked to this project. */
  workflowIds?: string[];
  /** ComfyUI workflows linked from the global library. */
  comfyWorkflowIds?: string[];
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

/** How a design fee is derived from the client-facing inputs of one quote line. */
export type PricingTemplateKind = "area-tier" | "style-minute" | "cost-markup";

/** Only meaningful for area templates; picked per template, never per quote line. */
export type PricingAreaMode = "unit-price" | "progressive" | "flat";

export type PricingAreaTier = {
  id: string;
  /** Inclusive lower bound in square meters. */
  minArea: number;
  /** Inclusive upper bound; omitted on the open-ended top tier. */
  maxArea?: number;
  /** Rate per square meter, or the whole tier price when the mode is "flat". */
  price: number;
};

export type PricingStyleLevel = {
  id: string;
  name: string;
  /** Charged for every finished minute at this difficulty level. */
  minuteRate: number;
};

export type PricingAreaConfig = {
  mode: PricingAreaMode;
  tiers: PricingAreaTier[];
};

export type PricingStyleConfig = {
  levels: PricingStyleLevel[];
};

export type PricingCostConfig = {
  /** Administrative load applied to the cost basis first. */
  overheadPercent: number;
  /** Design margin applied after overhead. */
  markupPercent: number;
};

export type PricingTemplate = {
  id: string;
  name: string;
  kind: PricingTemplateKind;
  currency: MoneyCurrency;
  notes?: string;
  /** Floor applied after the kind-specific formula. */
  minimumFee?: number;
  createdAt: string;
  /** Present when kind is "area-tier". */
  area?: PricingAreaConfig;
  /** Present when kind is "style-minute". */
  style?: PricingStyleConfig;
  /** Present when kind is "cost-markup". */
  cost?: PricingCostConfig;
};

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

/** Frozen at insert time so later template edits never rewrite a sent quote. */
export type QuoteLinePricing = {
  /** Kept only to show provenance; the snapshot is the source of truth. */
  templateId?: string;
  templateName: string;
  kind: PricingTemplateKind;
  snapshot: PricingTemplate;
  inputs: {
    area?: number;
    minutes?: number;
    styleLevelId?: string;
    costBasis?: number;
  };
  /** Result of the formula, in the template currency. */
  sourceAmount: number;
  sourceCurrency: MoneyCurrency;
};

export type QuoteLine = {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  /** Always expressed in the quote currency. */
  unitPrice: number;
  pricing?: QuoteLinePricing;
};

/** One of the four fixed Scope-of-Work groups (02) in the proposal export. */
export type QuoteScopeColumn = {
  id: string;
  title: string;
  items: string[];
};

/** Row of the Deliverables table (03); quantity is free text such as "3个方案". */
export type QuoteDeliverableRow = {
  id: string;
  name: string;
  quantity: string;
  format: string;
};

/** Row of the phase-duration table (04); durations are counted in weeks. */
export type QuoteTimelineRow = {
  id: string;
  stage: string;
  weeks: number;
};

/** Row of the payment-schedule table (06); percentages should sum to 100. */
export type QuotePaymentScheduleRow = {
  id: string;
  stage: string;
  percent: number;
};

/** Revision & trip policy (07): only the counts and fee wording are editable. */
export type QuoteRevisionPolicy = {
  includedRevisions: number;
  includedTrips: number;
  extraRevisionFee: string;
  extraTripFee: string;
};

export type Quote = {
  id: string;
  companyId: string;
  /** Empty for a prospect that has not been turned into a project yet. */
  projectId?: string;
  code: string;
  title: string;
  clientContact?: string;
  status: QuoteStatus;
  currency: MoneyCurrency;
  issuedOn: string;
  validUntil?: string;
  version: number;
  lines: QuoteLine[];
  discountPercent: number;
  taxPercent: number;
  /** 01 Project Overview: fully hand-written. */
  overview?: string;
  /** 02 Scope of Work: exactly four editable groups in the proposal layout. */
  scope?: QuoteScopeColumn[];
  /** 03 Deliverables table rows. */
  deliverables?: QuoteDeliverableRow[];
  /** 04 phase-duration rows, in weeks. */
  timeline?: QuoteTimelineRow[];
  /** 06 payment-schedule rows. */
  paymentSchedule?: QuotePaymentScheduleRow[];
  /** 07 revision & trip policy slots. */
  revisionPolicy?: QuoteRevisionPolicy;
  /** Signer shown at the bottom; falls back to the brand name when empty. */
  signature?: string;
  /** Bottom notes block: fully hand-written. */
  notes?: string;
  /** @deprecated 08 is a fixed universal template now; kept only for old data. */
  terms?: string;
  createdAt: string;
  updatedAt: string;
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
  codingDevice?: string;
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
  /** Client-facing design fee templates; separate from the internal cost library. */
  pricingTemplates: PricingTemplate[];
  /** Quotes belong to a brand and optionally point at one of its projects. */
  quotes: Quote[];
  /** Global workflow originals. Projects only keep IDs that point here. */
  workflows: ProjectWorkflow[];
  /** ComfyUI workflow library shown in the workflow section. */
  comfyWorkflows: ComfyUiWorkflow[];
  shareLinks: ShareLink[];
  /** Future purchases and subscriptions shown on the dashboard wish list. */
  wishlist: WishlistItem[];
  /** Bindings to outside services; travels with the workspace so every device reuses them. */
  integrations?: WorkspaceIntegrations;
};

export type GoogleCalendarLink = {
  calendarId: string;
  connectedAt: string;
};

export type WorkspaceIntegrations = {
  /** Google calendars SMOS created, keyed by OAuth client id. */
  googleCalendars?: Record<string, GoogleCalendarLink>;
};
