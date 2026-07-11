import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase } from "@/lib/api/mock-persistence";
import {
  createProjectSubscriptionCostItems,
  getProjectActualCost,
  getProjectActualProfit,
  getProjectFutureCost,
  getProjectPlannedReceivable,
  getProjectProjectedProfit,
  getProjectReceivedRevenue,
  getProjectSubscriptionTools,
  getToolMonthlySubscriptionCost,
  mockDatabase
} from "@/lib/mock";
import {
  bundledExchangeRateSnapshot,
  convertCurrency,
  isExchangeRateSnapshot,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

export type CostSummary = {
  actualCostSoFar: number;
  futureEstimatedCost: number;
  totalProjectCost: number;
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

export async function listProjectCosts(projectId: string) {
  hydrateMockDatabase();
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

  hydrateMockDatabase();
  const project = mockDatabase.projects.find((item) => item.id === projectId);
  const costs = project ? [...project.costs, ...createProjectSubscriptionCostItems(project)] : [];

  return mockApi({
    projectId,
    actualCostSoFar: project ? getProjectActualCost(project, currency, snapshot) : 0,
    futureEstimatedCost: project ? getProjectFutureCost(project, currency, snapshot) : 0,
    totalProjectCost: costs.reduce(
      (sum, cost) => sum + convertCurrency(cost.amount, cost.currency, currency, snapshot),
      0
    ),
    plannedReceivable: project ? getProjectPlannedReceivable(project, currency, snapshot) : 0,
    receivedRevenue: project ? getProjectReceivedRevenue(project, currency, snapshot) : 0,
    actualProfit: project ? getProjectActualProfit(project, currency, snapshot) : 0,
    projectedProfit: project ? getProjectProjectedProfit(project, currency, snapshot) : 0,
    byCategory: costs.reduce<Record<string, number>>((acc, cost) => {
      acc[cost.category] =
        (acc[cost.category] ?? 0) + convertCurrency(cost.amount, cost.currency, currency, snapshot);
      return acc;
    }, {}),
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

  hydrateMockDatabase();
  const projects = mockDatabase.projects.filter((project) => !project.archivedAt);
  const projectCosts = projects.flatMap((project) => project.costs);
  const subscriptionTools = [
    ...new Map(
      projects
        .flatMap((project) => getProjectSubscriptionTools(project))
        .map((tool) => [tool.id, tool] as const)
    ).values()
  ];
  const subscriptionCost = subscriptionTools.reduce(
    (sum, tool) => sum + getToolMonthlySubscriptionCost(tool, currency, snapshot),
    0
  );
  const actualCostSoFar =
    projectCosts
      .filter((cost) => cost.isActual)
      .reduce((sum, cost) => sum + convertCurrency(cost.amount, cost.currency, currency, snapshot), 0) +
    subscriptionCost;
  const futureEstimatedCost = projectCosts
    .filter((cost) => !cost.isActual)
    .reduce((sum, cost) => sum + convertCurrency(cost.amount, cost.currency, currency, snapshot), 0);
  const plannedReceivable = projects.reduce(
    (sum, project) => sum + getProjectPlannedReceivable(project, currency, snapshot),
    0
  );
  const receivedRevenue = projects.reduce(
    (sum, project) => sum + getProjectReceivedRevenue(project, currency, snapshot),
    0
  );
  const byCategory = projectCosts.reduce<Record<string, number>>((acc, cost) => {
    acc[cost.category] =
      (acc[cost.category] ?? 0) + convertCurrency(cost.amount, cost.currency, currency, snapshot);
    return acc;
  }, {});

  byCategory.software = (byCategory.software ?? 0) + subscriptionCost;

  return mockApi({
    actualCostSoFar,
    futureEstimatedCost,
    totalProjectCost: actualCostSoFar + futureEstimatedCost,
    plannedReceivable,
    receivedRevenue,
    actualProfit: receivedRevenue - actualCostSoFar,
    projectedProfit: plannedReceivable - actualCostSoFar - futureEstimatedCost,
    byCategory,
    currency,
    exchangeRateAsOf: snapshot.asOf,
    exchangeRateSource: snapshot.source,
    exchangeRatesStale: Boolean(snapshot.stale)
  });
}
