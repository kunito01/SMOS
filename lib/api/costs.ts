import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase } from "@/lib/api/mock-persistence";
import {
  createProjectSubscriptionCostItems,
  getProjectActualCost,
  getProjectActualProfit,
  getProjectBudgetCalculation,
  getProjectPlannedReceivable,
  getProjectReceivedRevenue,
  mockDatabase
} from "@/lib/mock";
import {
  bundledExchangeRateSnapshot,
  isExchangeRateSnapshot,
  sumMoney,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";
import type { CostItem } from "@/lib/types";
import type { ProjectBudgetCalculation } from "@/lib/utils/project-budget";

export type CostSummary = {
  actualCostSoFar: number;
  budgetCostTotal: number;
  plannedReceivable: number;
  receivedRevenue: number;
  actualProfit: number;
  projectedProfit: number;
  byCategory: Record<string, number>;
  currency: MoneyCurrency;
  exchangeRateAsOf: string;
  exchangeRateSource: string;
  exchangeRatesStale: boolean;
};

export type ProjectCostSummary = CostSummary & {
  projectId: string;
};

const buildCategoryTotals = (
  costs: ReadonlyArray<CostItem>,
  budgetCostTotal: number,
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot
) => {
  const totals = [...new Set(costs.map((cost) => cost.category))].reduce<Record<string, number>>(
    (result, category) => {
      result[category] = sumMoney(
        costs.filter((cost) => cost.category === category),
        currency,
        snapshot
      );
      return result;
    },
    {}
  );
  const difference = budgetCostTotal - Object.values(totals).reduce((sum, value) => sum + value, 0);
  const adjustmentCategory = Object.keys(totals).reduce<string | null>(
    (largestCategory, category) =>
      largestCategory === null || Math.abs(totals[category]) > Math.abs(totals[largestCategory])
        ? category
        : largestCategory,
    null
  );

  if (difference !== 0 && adjustmentCategory) {
    totals[adjustmentCategory] += difference;
  } else if (difference !== 0) {
    totals.other = difference;
  }

  return totals;
};

const reconcileCategoryTotals = (
  totals: Record<string, number>,
  budgetCostTotal: number,
  fallbackCategory: string
) => {
  const reconciled = { ...totals };
  const difference = budgetCostTotal - Object.values(reconciled).reduce((sum, value) => sum + value, 0);

  if (difference === 0) {
    return reconciled;
  }

  const adjustmentCategory = Object.keys(reconciled).reduce<string | null>(
    (largestCategory, category) =>
      largestCategory === null || Math.abs(reconciled[category]) > Math.abs(reconciled[largestCategory])
        ? category
        : largestCategory,
    null
  ) ?? fallbackCategory;

  reconciled[adjustmentCategory] = (reconciled[adjustmentCategory] ?? 0) + difference;
  return reconciled;
};

const buildBudgetCategoryTotals = (
  calculation: ProjectBudgetCalculation,
  costs: ReadonlyArray<CostItem>,
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot
) => {
  if (calculation.source !== "structured") {
    return buildCategoryTotals(costs, calculation.total, currency, snapshot);
  }

  const totals = Object.entries(calculation.byCategory ?? {}).reduce<Record<string, number>>(
    (result, [category, value]) => {
      if (value !== 0) {
        const summaryCategory = category === "personnel" ? "people" : category;
        result[summaryCategory] = (result[summaryCategory] ?? 0) + value;
      }
      return result;
    },
    {}
  );

  if (calculation.contingency !== 0) {
    totals.contingency = calculation.contingency;
  }

  if (calculation.tax !== 0) {
    totals.tax = calculation.tax;
  }

  return reconcileCategoryTotals(totals, calculation.total, "extra");
};

export async function listProjectCosts(projectId: string) {
  await hydrateMockDatabase();
  const project = mockDatabase.projects.find((item) => item.id === projectId);
  return mockApi(project ? [...project.costs, ...createProjectSubscriptionCostItems(project)] : []);
}

export async function getProjectCostSummary(
  projectId: string,
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
): Promise<ProjectCostSummary> {
  if (!isExchangeRateSnapshot(snapshot)) {
    throw new Error("Invalid exchange-rate snapshot");
  }

  await hydrateMockDatabase();
  const project = mockDatabase.projects.find((item) => item.id === projectId);
  const costs = project ? [...project.costs, ...createProjectSubscriptionCostItems(project)] : [];
  const actualCostSoFar = project ? getProjectActualCost(project, currency, snapshot) : 0;
  const budgetCalculation = project && project.timelineConfigured !== false
    ? getProjectBudgetCalculation(project, currency, snapshot)
    : null;
  const budgetCostTotal = budgetCalculation?.total ?? 0;
  const plannedReceivable = project ? getProjectPlannedReceivable(project, currency, snapshot) : 0;
  const receivedRevenue = project ? getProjectReceivedRevenue(project, currency, snapshot) : 0;
  const byCategory = project && budgetCalculation
    ? buildBudgetCategoryTotals(budgetCalculation, costs, currency, snapshot)
    : {};

  return mockApi({
    projectId,
    actualCostSoFar,
    budgetCostTotal,
    plannedReceivable,
    receivedRevenue,
    actualProfit: project ? getProjectActualProfit(project, currency, snapshot) : 0,
    projectedProfit: plannedReceivable - budgetCostTotal,
    byCategory,
    currency,
    exchangeRateAsOf: snapshot.asOf,
    exchangeRateSource: snapshot.source,
    exchangeRatesStale: Boolean(snapshot.stale)
  });
}

export async function getGlobalCostSummary(
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
): Promise<CostSummary> {
  if (!isExchangeRateSnapshot(snapshot)) {
    throw new Error("Invalid exchange-rate snapshot");
  }

  await hydrateMockDatabase();
  // Archived projects keep contributing what they actually cost and earned; only
  // forward-looking budget and receivable figures are limited to live projects.
  const projectSummaries = mockDatabase.projects.map((project) => {
    const archived = Boolean(project.archivedAt);
    const actualCostSoFar = getProjectActualCost(project, currency, snapshot);
    const budgetCalculation = !archived && project.timelineConfigured !== false
      ? getProjectBudgetCalculation(project, currency, snapshot)
      : null;
    const budgetCostTotal = budgetCalculation?.total ?? 0;
    const costs = [...project.costs, ...createProjectSubscriptionCostItems(project)];

    return {
      archived,
      actualCostSoFar,
      budgetCostTotal,
      byCategory: budgetCalculation
        ? buildBudgetCategoryTotals(budgetCalculation, costs, currency, snapshot)
        : {},
      plannedReceivable: archived ? 0 : getProjectPlannedReceivable(project, currency, snapshot),
      receivedRevenue: getProjectReceivedRevenue(project, currency, snapshot)
    };
  });
  const actualCostSoFar = projectSummaries.reduce((total, summary) => total + summary.actualCostSoFar, 0);
  const budgetCostTotal = projectSummaries.reduce(
    (total, summary) => total + summary.budgetCostTotal,
    0
  );
  const plannedReceivable = projectSummaries.reduce((total, summary) => total + summary.plannedReceivable, 0);
  const receivedRevenue = projectSummaries.reduce((total, summary) => total + summary.receivedRevenue, 0);
  const categories = new Set(projectSummaries.flatMap((summary) => Object.keys(summary.byCategory)));
  const categoryTotals = [...categories].reduce<Record<string, number>>((totals, category) => {
    totals[category] = projectSummaries.reduce((total, summary) => total + (summary.byCategory[category] ?? 0), 0);
    return totals;
  }, {});
  const byCategory = reconcileCategoryTotals(categoryTotals, budgetCostTotal, "other");

  return mockApi({
    actualCostSoFar,
    budgetCostTotal,
    plannedReceivable,
    receivedRevenue,
    actualProfit: receivedRevenue - actualCostSoFar,
    projectedProfit: plannedReceivable - budgetCostTotal,
    byCategory,
    currency,
    exchangeRateAsOf: snapshot.asOf,
    exchangeRateSource: snapshot.source,
    exchangeRatesStale: Boolean(snapshot.stale)
  });
}

export type FiscalYearTotals = {
  cost: number;
  revenue: number;
  profit: number;
  /** profit / revenue, or null when nothing was received. */
  margin: number | null;
};

export type FiscalYearGroupReport = {
  groupId: string;
  totals: FiscalYearTotals;
};

export type FiscalYearCompanyReport = {
  companyId: string;
  totals: FiscalYearTotals;
  groups: FiscalYearGroupReport[];
};

export type FiscalYearReport = {
  /** The calendar year the fiscal year starts in (March). */
  fiscalYear: number;
  startDate: string;
  endDate: string;
  totals: FiscalYearTotals;
  companies: FiscalYearCompanyReport[];
  currency: MoneyCurrency;
};

const FISCAL_YEAR_START_MONTH = 3;

/** Fiscal years run March → February and are named after the calendar year they start in. */
export const getFiscalYearOf = (dateKey: string) => {
  const [year, month] = dateKey.split("-").map(Number);
  return month >= FISCAL_YEAR_START_MONTH ? year : year - 1;
};

export const getCurrentFiscalYear = (now: Date = new Date()) =>
  now.getMonth() + 1 >= FISCAL_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;

const isDateKey = (value: string | undefined): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");

type MoneyEntry = { amount: number; currency: MoneyCurrency };

const fiscalTotals = (
  costs: MoneyEntry[],
  revenues: MoneyEntry[],
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot
): FiscalYearTotals => {
  const cost = sumMoney(costs, currency, snapshot);
  const revenue = sumMoney(revenues, currency, snapshot);
  const profit = revenue - cost;
  return { cost, revenue, profit, margin: revenue > 0 ? profit / revenue : null };
};

/**
 * Actual costs (by the date they were incurred) and received payments (by the
 * date they landed) bucketed into March–February fiscal years, then broken down
 * by brand and by project group within each brand. Archived projects count.
 */
export async function getFiscalYearReports(
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
): Promise<FiscalYearReport[]> {
  if (!isExchangeRateSnapshot(snapshot)) {
    throw new Error("Invalid exchange-rate snapshot");
  }

  await hydrateMockDatabase();

  type Bucket = { costs: MoneyEntry[]; revenues: MoneyEntry[] };
  const newBucket = (): Bucket => ({ costs: [], revenues: [] });
  // fiscalYear → companyId → groupId → bucket
  const years = new Map<number, Map<string, Map<string, Bucket>>>();
  const bucketFor = (fiscalYear: number, companyId: string, groupId: string) => {
    const companies = years.get(fiscalYear) ?? new Map<string, Map<string, Bucket>>();
    years.set(fiscalYear, companies);
    const groups = companies.get(companyId) ?? new Map<string, Bucket>();
    companies.set(companyId, groups);
    const bucket = groups.get(groupId) ?? newBucket();
    groups.set(groupId, bucket);
    return bucket;
  };

  for (const project of mockDatabase.projects) {
    const companyId = project.companyId || "unassigned";
    const groupId = project.groupId || "unassigned";
    const actualCosts = [
      ...project.costs.filter((cost) => cost.isActual),
      ...createProjectSubscriptionCostItems(project)
    ];
    for (const cost of actualCosts) {
      if (isDateKey(cost.startDate)) {
        bucketFor(getFiscalYearOf(cost.startDate), companyId, groupId).costs.push(cost);
      }
    }
    for (const payment of project.payments ?? []) {
      const landedOn = payment.receivedDate || payment.dueDate;
      if (payment.type === "received" && isDateKey(landedOn)) {
        bucketFor(getFiscalYearOf(landedOn), companyId, groupId).revenues.push(payment);
      }
    }
  }

  // The current fiscal year always appears, even before anything is booked into it.
  years.set(getCurrentFiscalYear(), years.get(getCurrentFiscalYear()) ?? new Map());

  const companyOrder = new Map(mockDatabase.companies.map((company, index) => [company.id, index]));
  const groupOrder = new Map(mockDatabase.groups.map((group, index) => [group.id, index]));
  const orderOf = (order: Map<string, number>, id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;

  const reports = [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([fiscalYear, companies]) => {
      const companyReports = [...companies.entries()]
        .sort(([a], [b]) => orderOf(companyOrder, a) - orderOf(companyOrder, b))
        .map(([companyId, groups]) => {
          const groupReports = [...groups.entries()]
            .sort(([a], [b]) => orderOf(groupOrder, a) - orderOf(groupOrder, b))
            .map(([groupId, bucket]) => ({
              groupId,
              totals: fiscalTotals(bucket.costs, bucket.revenues, currency, snapshot)
            }));
          const allBuckets = [...groups.values()];
          return {
            companyId,
            totals: fiscalTotals(
              allBuckets.flatMap((bucket) => bucket.costs),
              allBuckets.flatMap((bucket) => bucket.revenues),
              currency,
              snapshot
            ),
            groups: groupReports
          };
        });
      const everyBucket = [...companies.values()].flatMap((groups) => [...groups.values()]);
      return {
        fiscalYear,
        startDate: `${fiscalYear}-03-01`,
        endDate: `${fiscalYear + 1}-02-${String(new Date(Date.UTC(fiscalYear + 1, 2, 0)).getUTCDate()).padStart(2, "0")}`,
        totals: fiscalTotals(
          everyBucket.flatMap((bucket) => bucket.costs),
          everyBucket.flatMap((bucket) => bucket.revenues),
          currency,
          snapshot
        ),
        companies: companyReports,
        currency
      } satisfies FiscalYearReport;
    });

  return mockApi(reports);
}
