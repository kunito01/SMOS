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
  mockDatabase
} from "@/lib/mock";
import { toCny } from "@/lib/utils/money";

export async function listProjectCosts(projectId: string) {
  hydrateMockDatabase();
  const project = mockDatabase.projects.find((item) => item.id === projectId);
  return mockApi(project ? [...project.costs, ...createProjectSubscriptionCostItems(project)] : []);
}

export async function getProjectCostSummary(projectId: string) {
  hydrateMockDatabase();
  const project = mockDatabase.projects.find((item) => item.id === projectId);
  const costs = project ? [...project.costs, ...createProjectSubscriptionCostItems(project)] : [];

  return mockApi({
    projectId,
    actualCostSoFar: project ? getProjectActualCost(project) : 0,
    futureEstimatedCost: project ? getProjectFutureCost(project) : 0,
    totalProjectCost: costs.reduce((sum, cost) => sum + toCny(cost.amount, cost.currency), 0),
    plannedReceivable: project ? getProjectPlannedReceivable(project) : 0,
    receivedRevenue: project ? getProjectReceivedRevenue(project) : 0,
    actualProfit: project ? getProjectActualProfit(project) : 0,
    projectedProfit: project ? getProjectProjectedProfit(project) : 0,
    byCategory: costs.reduce<Record<string, number>>((acc, cost) => {
      acc[cost.category] = (acc[cost.category] ?? 0) + toCny(cost.amount, cost.currency);
      return acc;
    }, {})
  });
}

export async function getGlobalCostSummary() {
  hydrateMockDatabase();
  const projects = mockDatabase.projects;
  const costs = projects.flatMap((project) => [...project.costs, ...createProjectSubscriptionCostItems(project)]);

  return mockApi({
    actualCostSoFar: projects.reduce((sum, project) => sum + getProjectActualCost(project), 0),
    futureEstimatedCost: projects.reduce((sum, project) => sum + getProjectFutureCost(project), 0),
    totalProjectCost: projects.reduce(
      (sum, project) =>
        sum +
        [...project.costs, ...createProjectSubscriptionCostItems(project)].reduce(
          (costSum, cost) => costSum + toCny(cost.amount, cost.currency),
          0
        ),
      0
    ),
    plannedReceivable: projects.reduce((sum, project) => sum + getProjectPlannedReceivable(project), 0),
    receivedRevenue: projects.reduce((sum, project) => sum + getProjectReceivedRevenue(project), 0),
    actualProfit: projects.reduce((sum, project) => sum + getProjectActualProfit(project), 0),
    projectedProfit: projects.reduce((sum, project) => sum + getProjectProjectedProfit(project), 0),
    byCategory: costs.reduce<Record<string, number>>((acc, cost) => {
      acc[cost.category] = (acc[cost.category] ?? 0) + toCny(cost.amount, cost.currency);
      return acc;
    }, {})
  });
}
