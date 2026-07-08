import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase } from "@/lib/api/mock-persistence";
import { createDashboardOverview, getProjectActualCost, mockDatabase } from "@/lib/mock";
import type { CompanySummary } from "@/lib/types";

export async function listCompanies() {
  hydrateMockDatabase();
  return mockApi(mockDatabase.companies);
}

export async function getCompany(companyId: string) {
  hydrateMockDatabase();
  const company = requireEntity(
    mockDatabase.companies.find((item) => item.id === companyId),
    `Company not found: ${companyId}`
  );

  return mockApi(company);
}

export async function listCompanyGroups(companyId: string) {
  hydrateMockDatabase();
  return mockApi(mockDatabase.groups.filter((group) => group.companyId === companyId));
}

export async function listCompanyProjects(companyId: string) {
  hydrateMockDatabase();
  return mockApi(mockDatabase.projects.filter((project) => project.companyId === companyId));
}

export async function listCompanySummaries(): Promise<CompanySummary[]> {
  hydrateMockDatabase();
  const summaries = mockDatabase.companies.map((company) => {
    const projects = mockDatabase.projects.filter((project) => project.companyId === company.id);
    const overview = createDashboardOverview(projects);

    return {
      company,
      totalProjectCount: overview.totalProjectCount,
      activeProjectCount: overview.activeProjectCount,
      completedProjectCount: overview.completedProjectCount,
      averageProgress: overview.averageProgress,
      privateCostTotal: projects.reduce((sum, project) => sum + getProjectActualCost(project), 0)
    };
  });

  return mockApi(summaries);
}
