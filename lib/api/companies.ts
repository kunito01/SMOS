import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { createDashboardOverview, mockDatabase } from "@/lib/mock";
import type { Company, CompanySummary } from "@/lib/types";
import {
  bundledExchangeRateSnapshot,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

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

export type DeleteCompanyResult = {
  company: Company;
  status: "deleted";
  unlinkedProjectCount: number;
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
  await hydrateMockDatabase();
  return mockApi(mockDatabase.companies);
}

export async function getCompany(companyId: string) {
  await hydrateMockDatabase();
  const company = requireEntity(
    mockDatabase.companies.find((item) => item.id === companyId),
    `Company not found: ${companyId}`
  );

  return mockApi(company);
}

export async function createCompany(input: CreateCompanyInput) {
  await hydrateMockDatabase();

  const now = new Date().toISOString();
  const company: Company = {
    id: `company-${slugify(input.name)}-${Date.now()}`,
    name: input.name.trim(),
    description: input.description.trim(),
    coverImage: input.coverImage?.trim() || defaultCompanyCoverImage,
    createdAt: now
  };

  mockDatabase.companies = [company, ...mockDatabase.companies];
  await persistMockDatabase();

  return mockApi(company);
}

export async function updateCompanyBasics(companyId: string, input: CompanyBasicsInput) {
  await hydrateMockDatabase();
  const company = requireEntity(
    mockDatabase.companies.find((item) => item.id === companyId),
    `Company not found: ${companyId}`
  );

  company.name = input.name.trim() || company.name;
  company.description = input.description.trim() || company.description;

  if (input.coverImage) {
    company.coverImage = input.coverImage;
  }

  await persistMockDatabase();

  return mockApi(company);
}

export async function deleteCompany(companyId: string): Promise<DeleteCompanyResult> {
  await hydrateMockDatabase();
  const company = requireEntity(
    mockDatabase.companies.find((item) => item.id === companyId),
    `Company not found: ${companyId}`
  );
  const linkedProjects = mockDatabase.projects.filter((project) => project.companyId === companyId);
  const previousCompanies = [...mockDatabase.companies];
  const previousProjectCompanyIds = new Map(
    linkedProjects.map((project) => [project.id, project.companyId])
  );

  linkedProjects.forEach((project) => {
    project.companyId = "";
  });
  mockDatabase.companies = mockDatabase.companies.filter((item) => item.id !== companyId);

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.companies = previousCompanies;
    mockDatabase.projects.forEach((project) => {
      const previousCompanyId = previousProjectCompanyIds.get(project.id);

      if (previousCompanyId !== undefined) {
        project.companyId = previousCompanyId;
      }
    });
    throw error;
  }

  return mockApi({
    status: "deleted",
    company,
    unlinkedProjectCount: linkedProjects.length
  });
}

export async function listCompanyGroups(companyId: string) {
  await hydrateMockDatabase();
  const groupIds = new Set(
    mockDatabase.projects
      .filter((project) => project.companyId === companyId && !project.archivedAt)
      .map((project) => project.groupId)
  );

  return mockApi(mockDatabase.groups.filter((group) => groupIds.has(group.id)));
}

export async function listCompanyProjects(companyId: string) {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.projects.filter((project) => project.companyId === companyId && !project.archivedAt));
}

export async function listCompanySummaries(
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
): Promise<CompanySummary[]> {
  await hydrateMockDatabase();
  const summaries = mockDatabase.companies.map((company) => {
    const projects = mockDatabase.projects.filter((project) => project.companyId === company.id && !project.archivedAt);
    const overview = createDashboardOverview(projects, {
      includeArchivedTotal: false,
      currency,
      snapshot
    });

    return {
      company,
      currency,
      totalProjectCount: overview.totalProjectCount,
      activeProjectCount: overview.activeProjectCount,
      completedProjectCount: overview.completedProjectCount,
      averageProgress: overview.averageProgress,
      actualCostTotal: overview.actualCostSoFar,
      budgetCostTotal: overview.budgetCostTotal
    };
  });

  return mockApi(summaries);
}
