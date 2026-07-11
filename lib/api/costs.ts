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
  const projects = mockDatabase.projects.filter((project) => !project.archivedAt);
  const projectSummaries = projects.map((project) => {
    const actualCostSoFar = getProjectActualCost(project, currency, snapshot);
    const budgetCalculation = project.timelineConfigured !== false
      ? getProjectBudgetCalculation(project, currency, snapshot)
      : null;
    const budgetCostTotal = budgetCalculation?.total ?? 0;
    const costs = [...project.costs, ...createProjectSubscriptionCostItems(project)];

    return {
      actualCostSoFar,
      budgetCostTotal,
      byCategory: budgetCalculation
        ? buildBudgetCategoryTotals(budgetCalculation, costs, currency, snapshot)
        : {},
      plannedReceivable: getProjectPlannedReceivable(project, currency, snapshot),
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
