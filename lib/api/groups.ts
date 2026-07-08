import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase } from "@/lib/api/mock-persistence";
import { createDashboardOverview, getProjectActualCost, mockDatabase } from "@/lib/mock";
import type { ProjectGroupSummary } from "@/lib/types";

export async function listGroups() {
  hydrateMockDatabase();
  return mockApi(mockDatabase.groups);
}

export async function getGroup(groupId: string) {
  hydrateMockDatabase();
  const group = requireEntity(
    mockDatabase.groups.find((item) => item.id === groupId),
    `Project group not found: ${groupId}`
  );

  return mockApi(group);
}

export async function listGroupProjects(groupId: string) {
  hydrateMockDatabase();
  return mockApi(mockDatabase.projects.filter((project) => project.groupId === groupId));
}

export async function listGroupSummaries(): Promise<ProjectGroupSummary[]> {
  hydrateMockDatabase();
  const summaries = mockDatabase.groups.map((group) => {
    const projects = mockDatabase.projects.filter((project) => project.groupId === group.id);
    const overview = createDashboardOverview(projects);

    return {
      group,
      totalProjectCount: overview.totalProjectCount,
      activeProjectCount: overview.activeProjectCount,
      completedProjectCount: overview.completedProjectCount,
      averageProgress: overview.averageProgress,
      privateCostTotal: projects.reduce((sum, project) => sum + getProjectActualCost(project), 0)
    };
  });

  return mockApi(summaries);
}
