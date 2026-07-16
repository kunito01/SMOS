import type {
  Phase,
  Project,
  ProjectBudget,
  ProjectBudgetPersonnelLine,
  ProjectBudgetSoftwareCostLine,
  ProjectPhaseBudget,
  Tool
} from "@/lib/types/domain";
import {
  bundledExchangeRateSnapshot,
  roundMoneyAmount,
  sumMoney,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

export const PROJECT_BUDGET_HOURS_PER_DAY = 10;

export type ProjectBudgetCostCategory =
  | "personnel"
  | "travel"
  | "daily-expenses"
  | "outsourcing"
  | "extra"
  | "software";

export type ProjectBudgetBreakdownItem = {
  id: string;
  category: ProjectBudgetCostCategory;
  label: string;
  amount: number;
  currency: MoneyCurrency;
  quantity?: number;
  unitAmount?: number;
  toolId?: string;
  billingCycle?: "monthly" | "yearly";
};

export type ProjectBudgetCategoryTotals = Record<ProjectBudgetCostCategory, number>;

export type ProjectBudgetPhaseBreakdown = {
  phaseId: string;
  phaseName: string;
  naturalDays: number;
  softwareBillingMonths: number;
  softwareSource: "snapshot" | "derived";
  missingToolIds: string[];
  items: ProjectBudgetBreakdownItem[];
  byCategory: ProjectBudgetCategoryTotals;
  subtotal: number;
  currency: MoneyCurrency;
};

export type LegacyProjectBudgetFallbackItem = {
  id?: string;
  name?: string;
  amount: number;
  currency: MoneyCurrency;
};

/**
 * Migration adapter for projects that do not yet have `project.budget`.
 * To preserve the old `totalProjectCost`, callers should pass every legacy
 * project cost (actual and estimated) plus the project's subscription costs.
 * This frozen fallback is a budget display value; actual-cost reporting stays
 * independent once a structured budget exists.
 */
export type LegacyProjectBudgetFallbackInput = {
  /** Pass all old project costs here, without filtering by `isActual`. */
  projectCosts: ReadonlyArray<LegacyProjectBudgetFallbackItem>;
  /** Pass the old project-level subscription-cost rows here. */
  subscriptionCosts: ReadonlyArray<LegacyProjectBudgetFallbackItem>;
  contingencyPercent?: number;
  taxPercent?: number;
};

export type CalculateProjectBudgetOptions = {
  currency?: MoneyCurrency;
  snapshot?: ExchangeRateSnapshot;
  /** Additional/current library records override matching project tool records. */
  tools?: ReadonlyArray<Tool>;
  legacyFallback?: LegacyProjectBudgetFallbackInput;
};

export type CalculateStructuredBudgetOptions = Pick<
  CalculateProjectBudgetOptions,
  "currency" | "snapshot"
>;

export type ProjectBudgetSoftwareSnapshotInput = {
  phase: Pick<Phase, "id" | "startDate" | "endDate" | "toolIds">;
  tools: ReadonlyArray<Tool>;
};

export type CalculateProjectPhaseBudgetInput = {
  phase: Pick<Phase, "id" | "name" | "startDate" | "endDate" | "toolIds">;
  budget?: ProjectPhaseBudget;
  tools: ReadonlyArray<Tool>;
  currency?: MoneyCurrency;
  snapshot?: ExchangeRateSnapshot;
};

export type ProjectBudgetCalculation = {
  source: "structured" | "legacy" | "none";
  currency: MoneyCurrency;
  phaseBreakdowns: ProjectBudgetPhaseBreakdown[];
  /** Structured budgets only; phase-adjusted category totals sum exactly to base. */
  byCategory?: ProjectBudgetCategoryTotals;
  base: number;
  contingencyPercent: number;
  contingency: number;
  taxPercent: number;
  tax: number;
  total: number;
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const assertNonNegativeNumber = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite, non-negative number`);
  }
};

const assertNonNegativeInteger = (value: number, label: string) => {
  assertNonNegativeNumber(value, label);

  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
};

const multiplyMoney = (label: string, ...values: number[]) => {
  values.forEach((value) => assertNonNegativeNumber(value, label));
  const amount = values.reduce((product, value) => product * value, 1);

  if (!Number.isFinite(amount)) {
    throw new Error(`${label} is too large`);
  }

  return amount;
};

const parseIsoDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }

  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  const normalized = Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString().slice(0, 10)
    : "";

  if (normalized !== value) {
    throw new Error(`${label} is not a valid calendar date`);
  }

  return milliseconds;
};

/** Counts both the phase start date and end date. */
export const countInclusiveNaturalDays = (startDate: string, endDate: string) => {
  const start = parseIsoDate(startDate, "Phase start date");
  const end = parseIsoDate(endDate, "Phase end date");

  if (end < start) {
    throw new Error("Phase end date must not be earlier than its start date");
  }

  return Math.floor((end - start) / millisecondsPerDay) + 1;
};

type BudgetUsageLine = Pick<
  ProjectBudgetPersonnelLine | ProjectBudgetSoftwareCostLine,
  "startDate" | "endDate" | "allocationPercent"
>;

const getSafeAllocationFraction = (value: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) / 100 : 0;

/** Returns zero for incomplete/out-of-phase draft ranges instead of interrupting editing. */
export const getProjectBudgetUsageDays = (
  line: BudgetUsageLine,
  phase: Pick<Phase, "startDate" | "endDate">
) => {
  try {
    if (
      line.startDate < phase.startDate ||
      line.endDate > phase.endDate ||
      line.endDate < line.startDate
    ) {
      return 0;
    }

    return countInclusiveNaturalDays(line.startDate, line.endDate);
  } catch {
    return 0;
  }
};

export const calculatePersonnelLineNativeAmount = (
  line: ProjectBudgetPersonnelLine,
  phase: Pick<Phase, "startDate" | "endDate">
) => {
  const effectiveDays = line.days !== undefined
    ? line.days
    : getProjectBudgetUsageDays(line, phase) * getSafeAllocationFraction(line.allocationPercent);

  return line.headcount * line.hourlyRate * PROJECT_BUDGET_HOURS_PER_DAY * effectiveDays;
};

export const calculateSoftwareLineNativeAmount = (
  line: ProjectBudgetSoftwareCostLine,
  phase: Pick<Phase, "startDate" | "endDate">
) => {
  if (line.periods !== undefined) {
    const monthlyAmount = line.billingCycle === "yearly" ? line.amount / 12 : line.amount;
    return monthlyAmount * line.periods;
  }

  const usageDays = getProjectBudgetUsageDays(line, phase);
  const dailyAmount = line.billingCycle === "yearly" ? line.amount / 365 : line.amount / 30;
  return dailyAmount * usageDays * getSafeAllocationFraction(line.allocationPercent);
};

const createSoftwareCostSnapshot = (
  phase: Pick<Phase, "id" | "startDate" | "endDate">,
  tool: Tool
): ProjectBudgetSoftwareCostLine => {
  const subscription = tool.subscription;

  if (subscription) {
    assertNonNegativeNumber(subscription.amount, `Tool ${tool.id} subscription amount`);
  }

  return {
    id: `${phase.id}:software:${tool.id}`,
    toolId: tool.id,
    name: tool.name,
    amount: subscription?.amount ?? 0,
    currency: subscription?.currency ?? "CNY",
    billingCycle: subscription?.billingCycle ?? "monthly",
    startDate: phase.startDate,
    endDate: phase.endDate,
    allocationPercent: 100
  };
};

/** Creates frozen subscription-rate rows from the phase's current tool selection. */
export const createProjectBudgetSoftwareCostSnapshots = ({
  phase,
  tools
}: ProjectBudgetSoftwareSnapshotInput): ProjectBudgetSoftwareCostLine[] => {
  const toolsById = new Map(tools.map((tool) => [tool.id, tool]));

  return [...new Set(phase.toolIds ?? [])].flatMap((toolId) => {
    const tool = toolsById.get(toolId);
    return tool ? [createSoftwareCostSnapshot(phase, tool)] : [];
  });
};

/**
 * Adds newly selected tools while preserving all saved rates and user-entered
 * usage months. Use `createProjectBudgetSoftwareCostSnapshots` to explicitly
 * refresh every rate from the current software library.
 */
export const syncProjectBudgetSoftwareCostSnapshots = ({
  phase,
  tools,
  existing
}: ProjectBudgetSoftwareSnapshotInput & {
  existing: ReadonlyArray<ProjectBudgetSoftwareCostLine>;
}): ProjectBudgetSoftwareCostLine[] => {
  const existingByToolId = new Map(
    existing.flatMap((line) => line.toolId ? [[line.toolId, line] as const] : [])
  );
  const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
  const preserved = existing.map((line) => ({ ...line }));

  const additions = [...new Set(phase.toolIds ?? [])].flatMap((toolId) => {
    if (existingByToolId.has(toolId)) {
      return [];
    }
    const tool = toolsById.get(toolId);
    return tool ? [createSoftwareCostSnapshot(phase, tool)] : [];
  });

  preserved.forEach((line) => {
    assertNonNegativeNumber(line.amount, `Tool ${line.toolId ?? line.id} snapshot amount`);
  });

  return [...preserved, ...additions];
};

export const createEmptyProjectBudget = (
  phases: ReadonlyArray<Pick<Phase, "id" | "startDate" | "endDate" | "toolIds">>,
  tools: ReadonlyArray<Tool>,
  currency: MoneyCurrency = "CNY"
): ProjectBudget => ({
  phases: phases.map((phase) => ({
    phaseId: phase.id,
    personnel: [
      {
        id: `${phase.id}:personnel:1`,
        roleLevel: "",
        headcount: 0,
        hourlyRate: 0,
        currency,
        startDate: phase.startDate,
        endDate: phase.endDate,
        allocationPercent: 100
      }
    ],
    travel: {
      unitPrice: 0,
      currency,
      count: 0
    },
    dailyExpenseLines: [],
    extraCosts: [],
    softwareCosts: createProjectBudgetSoftwareCostSnapshots({ phase, tools })
  })),
  contingencyPercent: 0,
  taxPercent: 0
});

const projectBudgetCategories: ProjectBudgetCostCategory[] = [
  "personnel",
  "travel",
  "daily-expenses",
  "outsourcing",
  "extra",
  "software"
];

const createEmptyCategoryTotals = (): ProjectBudgetCategoryTotals => ({
  personnel: 0,
  travel: 0,
  "daily-expenses": 0,
  outsourcing: 0,
  extra: 0,
  software: 0
});

const calculateCategoryTotals = (
  items: ReadonlyArray<ProjectBudgetBreakdownItem>,
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot,
  subtotal: number
) => {
  const totals = createEmptyCategoryTotals();

  projectBudgetCategories.forEach((category) => {
    totals[category] = sumMoney(
      items.filter((item) => item.category === category),
      currency,
      snapshot
    );
  });

  let roundingDifference =
    subtotal - projectBudgetCategories.reduce((sum, category) => sum + totals[category], 0);

  if (roundingDifference < 0) {
    [...projectBudgetCategories].reverse().forEach((category) => {
      if (roundingDifference === 0 || totals[category] === 0) {
        return;
      }

      const reduction = Math.min(totals[category], Math.abs(roundingDifference));
      totals[category] -= reduction;
      roundingDifference += reduction;
    });
  }

  if (roundingDifference > 0) {
    const lastUsedCategory = [...projectBudgetCategories]
      .reverse()
      .find((category) => items.some((item) => item.category === category));

    if (lastUsedCategory) {
      totals[lastUsedCategory] += roundingDifference;
      roundingDifference = 0;
    }
  }

  if (roundingDifference !== 0) {
    throw new Error("Unable to reconcile project-budget category totals");
  }

  return totals;
};

export const calculateProjectPhaseBudget = ({
  phase,
  budget,
  tools,
  currency = "CNY",
  snapshot = bundledExchangeRateSnapshot
}: CalculateProjectPhaseBudgetInput): ProjectBudgetPhaseBreakdown => {
  if (budget && budget.phaseId !== phase.id) {
    throw new Error(`Budget phase ${budget.phaseId} does not match phase ${phase.id}`);
  }

  const naturalDays = countInclusiveNaturalDays(phase.startDate, phase.endDate);
  const softwareBillingMonths = Math.ceil(naturalDays / 30);
  const items: ProjectBudgetBreakdownItem[] = [];

  (budget?.personnel ?? []).forEach((line) => {
    assertNonNegativeInteger(line.headcount, `Personnel ${line.id} headcount`);
    if (line.days !== undefined) {
      assertNonNegativeInteger(line.days, `Personnel ${line.id} legacy days`);
    }
    const usageDays = line.days !== undefined
      ? line.days
      : getProjectBudgetUsageDays(line, phase) * getSafeAllocationFraction(line.allocationPercent);
    const quantity = line.headcount * usageDays * PROJECT_BUDGET_HOURS_PER_DAY;

    items.push({
      id: `personnel:${line.id}`,
      category: "personnel",
      label: line.roleLevel,
      amount: multiplyMoney(`Personnel ${line.id} amount`, quantity, line.hourlyRate),
      currency: line.currency,
      quantity,
      unitAmount: line.hourlyRate
    });
  });

  if (budget?.travel) {
    assertNonNegativeInteger(budget.travel.count, `Phase ${phase.id} travel count`);
    items.push({
      id: "travel",
      category: "travel",
      label: "travel",
      amount: multiplyMoney(
        `Phase ${phase.id} travel amount`,
        budget.travel.unitPrice,
        budget.travel.count
      ),
      currency: budget.travel.currency,
      quantity: budget.travel.count,
      unitAmount: budget.travel.unitPrice
    });
  }

  if (budget?.dailyExpenseLines) {
    budget.dailyExpenseLines.forEach((line) => {
      assertNonNegativeNumber(line.amount, `Daily expense ${line.id} amount`);
      items.push({
        id: `daily-expenses:${line.id}`,
        category: "daily-expenses",
        label: line.name,
        amount: line.amount,
        currency: line.currency
      });
    });
  } else if (budget?.dailyExpenses) {
    // Older backups stored one unnamed total. Keep calculating it until the
    // normalizer migrates it into an itemized line.
    assertNonNegativeNumber(
      budget.dailyExpenses.amount,
      `Phase ${phase.id} daily expenses`
    );
    items.push({
      id: "daily-expenses:legacy",
      category: "daily-expenses",
      label: "daily-expenses",
      amount: budget.dailyExpenses.amount,
      currency: budget.dailyExpenses.currency
    });
  }

  (budget?.extraCosts ?? []).forEach((line) => {
    assertNonNegativeNumber(line.amount, `Extra cost ${line.id} amount`);
    items.push({
      id: `extra:${line.id}`,
      category: line.kind,
      label: line.name,
      amount: line.amount,
      currency: line.currency
    });
  });

  const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
  const savedSoftwareCosts = budget?.softwareCosts;
  const softwareSource = savedSoftwareCosts ? "snapshot" : "derived";
  const softwareCosts =
    savedSoftwareCosts ?? createProjectBudgetSoftwareCostSnapshots({ phase, tools });
  const snapshottedToolIds = new Set(
    softwareCosts.flatMap((line) => line.toolId ? [line.toolId] : [])
  );
  const missingToolIds = [...new Set(phase.toolIds ?? [])].filter(
    (toolId) => !toolsById.has(toolId) && !snapshottedToolIds.has(toolId)
  );

  softwareCosts.forEach((line) => {
    const softwareLabel = line.toolId ?? line.id;
    assertNonNegativeNumber(line.amount, `Tool ${softwareLabel} snapshot amount`);
    if (line.periods !== undefined) {
      assertNonNegativeInteger(line.periods, `Tool ${softwareLabel} legacy billing periods`);
    }

    const nativeAmount = calculateSoftwareLineNativeAmount(line, phase);
    if (line.amount === 0 || nativeAmount === 0) {
      return;
    }
    const usageDays = line.periods !== undefined
      ? line.periods
      : getProjectBudgetUsageDays(line, phase) * getSafeAllocationFraction(line.allocationPercent);
    const unitAmount = line.periods !== undefined
      ? (line.billingCycle === "yearly" ? line.amount / 12 : line.amount)
      : (line.billingCycle === "yearly" ? line.amount / 365 : line.amount / 30);

    items.push({
      id: `software:${line.id}`,
      category: "software",
      label: line.name,
      amount: nativeAmount,
      currency: line.currency,
      quantity: usageDays,
      unitAmount,
      toolId: line.toolId,
      billingCycle: line.billingCycle
    });
  });

  const subtotal = sumMoney(items, currency, snapshot);

  return {
    phaseId: phase.id,
    phaseName: phase.name,
    naturalDays,
    softwareBillingMonths,
    softwareSource,
    missingToolIds,
    items,
    byCategory: calculateCategoryTotals(items, currency, snapshot, subtotal),
    subtotal,
    currency
  };
};

const calculatePercentageAdditions = (
  base: number,
  contingencyPercent: number,
  taxPercent: number
) => {
  assertNonNegativeNumber(contingencyPercent, "Contingency percent");
  assertNonNegativeNumber(taxPercent, "Tax percent");

  const contingency = roundMoneyAmount(base * (contingencyPercent / 100));
  const tax = roundMoneyAmount((base + contingency) * (taxPercent / 100));

  return {
    contingency,
    tax,
    total: base + contingency + tax
  };
};

const createCalculation = (
  source: ProjectBudgetCalculation["source"],
  currency: MoneyCurrency,
  phaseBreakdowns: ProjectBudgetPhaseBreakdown[],
  base: number,
  contingencyPercent: number,
  taxPercent: number,
  byCategory?: ProjectBudgetCategoryTotals
): ProjectBudgetCalculation => ({
  source,
  currency,
  phaseBreakdowns,
  ...(byCategory ? { byCategory } : {}),
  base,
  contingencyPercent,
  ...calculatePercentageAdditions(base, contingencyPercent, taxPercent),
  taxPercent
});

export const calculateStructuredBudget = (
  budget: ProjectBudget,
  phases: ReadonlyArray<CalculateProjectPhaseBudgetInput["phase"]>,
  tools: ReadonlyArray<Tool>,
  options: CalculateStructuredBudgetOptions = {}
): ProjectBudgetCalculation => {
  const currency = options.currency ?? "CNY";
  const snapshot = options.snapshot ?? bundledExchangeRateSnapshot;
  const phaseIds = new Set(phases.map((phase) => phase.id));
  const budgetsByPhaseId = new Map<string, ProjectPhaseBudget>();

  budget.phases.forEach((phaseBudget) => {
    if (!phaseIds.has(phaseBudget.phaseId)) {
      throw new Error(`Budget references unknown phase ${phaseBudget.phaseId}`);
    }

    if (budgetsByPhaseId.has(phaseBudget.phaseId)) {
      throw new Error(`Budget contains duplicate phase ${phaseBudget.phaseId}`);
    }

    budgetsByPhaseId.set(phaseBudget.phaseId, phaseBudget);
  });

  const phaseBreakdowns = phases.map((phase) =>
    calculateProjectPhaseBudget({
      phase,
      budget: budgetsByPhaseId.get(phase.id),
      tools,
      currency,
      snapshot
    })
  );
  const base = phaseBreakdowns.reduce((sum, phase) => sum + phase.subtotal, 0);
  const byCategory = createEmptyCategoryTotals();

  projectBudgetCategories.forEach((category) => {
    byCategory[category] = phaseBreakdowns.reduce(
      (sum, phase) => sum + phase.byCategory[category],
      0
    );
  });

  return createCalculation(
    "structured",
    currency,
    phaseBreakdowns,
    base,
    budget.contingencyPercent,
    budget.taxPercent,
    byCategory
  );
};

export const calculateProjectBudget = (
  project: Pick<Project, "budget" | "phases" | "tools">,
  options: CalculateProjectBudgetOptions = {}
): ProjectBudgetCalculation => {
  const currency = options.currency ?? "CNY";
  const snapshot = options.snapshot ?? bundledExchangeRateSnapshot;
  const budget = project.budget;

  if (!budget) {
    const fallback = options.legacyFallback;

    if (!fallback) {
      return createCalculation("none", currency, [], 0, 0, 0);
    }

    const legacyItems = [...fallback.projectCosts, ...fallback.subscriptionCosts];

    legacyItems.forEach((item, index) => {
      assertNonNegativeNumber(item.amount, `Legacy budget item ${item.id ?? index} amount`);
    });

    return createCalculation(
      "legacy",
      currency,
      [],
      sumMoney(legacyItems, currency, snapshot),
      fallback.contingencyPercent ?? 0,
      fallback.taxPercent ?? 0
    );
  }

  const toolsById = new Map(project.tools.map((tool) => [tool.id, tool]));
  options.tools?.forEach((tool) => toolsById.set(tool.id, tool));

  return calculateStructuredBudget(
    budget,
    project.phases,
    [...toolsById.values()],
    { currency, snapshot }
  );
};
