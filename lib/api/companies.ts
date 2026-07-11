import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { createDashboardOverview, getProjectActualCost, mockDatabase } from "@/lib/mock";
import type { Company, CompanySummary } from "@/lib/types";

type CreateCompanyInput = {
  coverImage?: string;
  description: string;
  name: string;
};

export type CompanyBasicsInput = {
  coverImage?: string;
  description: string;
  name: string;
};

const defaultCompanyCoverImage =
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "brand";

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

export async function createCompany(input: CreateCompanyInput) {
  hydrateMockDatabase();

  const now = new Date().toISOString();
  const company: Company = {
    id: `company-${slugify(input.name)}-${Date.now()}`,
    name: input.name.trim(),
    description: input.description.trim(),
    coverImage: input.coverImage?.trim() || defaultCompanyCoverImage,
    createdAt: now
  };

  mockDatabase.companies = [company, ...mockDatabase.companies];
  persistMockDatabase();

  return mockApi(company);
}

export async function updateCompanyBasics(companyId: string, input: CompanyBasicsInput) {
  hydrateMockDatabase();
  const company = requireEntity(
    mockDatabase.companies.find((item) => item.id === companyId),
    `Company not found: ${companyId}`
  );

  company.name = input.name.trim() || company.name;
  company.description = input.description.trim() || company.description;

  if (input.coverImage) {
    company.coverImage = input.coverImage;
  }

  persistMockDatabase();

  return mockApi(company);
}

export async function listCompanyGroups(companyId: string) {
  hydrateMockDatabase();
  const groupIds = new Set(
    mockDatabase.projects
      .filter((project) => project.companyId === companyId && !project.archivedAt)
      .map((project) => project.groupId)
  );

  return mockApi(mockDatabase.groups.filter((group) => groupIds.has(group.id)));
}

export async function listCompanyProjects(companyId: string) {
  hydrateMockDatabase();
  return mockApi(mockDatabase.projects.filter((project) => project.companyId === companyId && !project.archivedAt));
}

export async function listCompanySummaries(): Promise<CompanySummary[]> {
  hydrateMockDatabase();
  const summaries = mockDatabase.companies.map((company) => {
    const projects = mockDatabase.projects.filter((project) => project.companyId === company.id && !project.archivedAt);
    const overview = createDashboardOverview(projects, { includeArchivedTotal: false });

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
