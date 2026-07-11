import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import type { Language } from "@/lib/i18n/translations";
import { createDashboardOverview, mockDatabase } from "@/lib/mock";
import type { ProjectGroup, ProjectGroupSummary } from "@/lib/types";
import {
  bundledExchangeRateSnapshot,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

export type CreateGroupInput = {
  description: string;
  language: Language;
  name: string;
};

export type UpdateGroupInput = CreateGroupInput;

export type ListGroupSummariesOptions = {
  companyId?: string;
  currency?: MoneyCurrency;
  snapshot?: ExchangeRateSnapshot;
};

export type DeleteGroupResult = {
  status: "deleted";
  group: ProjectGroup;
  unlinkedProjectCount: number;
};

const defaultGroupCoverImage =
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "group";

const getGroupNameForLanguage = (group: ProjectGroup, language: Language) =>
  group.nameI18n?.[language]?.trim() || group.name.trim();

export async function listGroups() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.groups);
}

export async function getGroup(groupId: string) {
  await hydrateMockDatabase();
  const group = requireEntity(
    mockDatabase.groups.find((item) => item.id === groupId),
    `Project group not found: ${groupId}`
  );

  return mockApi(group);
}

export async function createGroup(input: CreateGroupInput) {
  await hydrateMockDatabase();
  const name = input.name.trim();

  if (!name) {
    throw new Error("Project group name is required");
  }

  const normalizedName = name.toLocaleLowerCase(input.language);
  const duplicate = mockDatabase.groups.some(
    (group) => getGroupNameForLanguage(group, input.language).toLocaleLowerCase(input.language) === normalizedName
  );

  if (duplicate) {
    throw new Error(`Project group already exists: ${name}`);
  }

  const group: ProjectGroup = {
    id: `group-${slugify(name)}-${Date.now()}`,
    name,
    nameI18n: { [input.language]: name },
    description: input.description.trim(),
    coverImage: defaultGroupCoverImage,
    colorTheme: mockDatabase.groups.length % 2 === 0 ? "aqua" : "lime",
    createdAt: new Date().toISOString()
  };

  mockDatabase.groups = [group, ...mockDatabase.groups];
  await persistMockDatabase();

  return mockApi(group);
}

export async function updateGroup(groupId: string, input: UpdateGroupInput) {
  await hydrateMockDatabase();
  const group = requireEntity(
    mockDatabase.groups.find((item) => item.id === groupId),
    `Project group not found: ${groupId}`
  );
  const name = input.name.trim();

  if (!name) {
    throw new Error("Project group name is required");
  }

  const normalizedName = name.toLocaleLowerCase(input.language);
  const duplicate = mockDatabase.groups.some(
    (item) =>
      item.id !== groupId &&
      getGroupNameForLanguage(item, input.language).toLocaleLowerCase(input.language) === normalizedName
  );

  if (duplicate) {
    throw new Error(`Project group already exists: ${name}`);
  }

  group.nameI18n = { ...group.nameI18n, [input.language]: name };
  group.description = input.description.trim();
  await persistMockDatabase();

  return mockApi(group);
}

export async function deleteGroup(groupId: string): Promise<DeleteGroupResult> {
  await hydrateMockDatabase();
  const group = requireEntity(
    mockDatabase.groups.find((item) => item.id === groupId),
    `Project group not found: ${groupId}`
  );
  const linkedProjects = mockDatabase.projects.filter((project) => project.groupId === groupId);

  linkedProjects.forEach((project) => {
    project.groupId = "";
  });
  mockDatabase.groups = mockDatabase.groups.filter((item) => item.id !== groupId);
  await persistMockDatabase();

  return mockApi({ status: "deleted", group, unlinkedProjectCount: linkedProjects.length });
}

export async function listGroupProjects(groupId: string) {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.projects.filter((project) => project.groupId === groupId && !project.archivedAt));
}

export async function listGroupSummaries(
  options: ListGroupSummariesOptions = {}
): Promise<ProjectGroupSummary[]> {
  await hydrateMockDatabase();
  const currency = options.currency ?? "CNY";
  const snapshot = options.snapshot ?? bundledExchangeRateSnapshot;
  const scopedProjects = mockDatabase.projects.filter(
    (project) => !project.archivedAt && (!options.companyId || project.companyId === options.companyId)
  );
  const summaries = mockDatabase.groups.map((group) => {
    const projects = scopedProjects.filter((project) => project.groupId === group.id);
    const overview = createDashboardOverview(projects, {
      includeArchivedTotal: false,
      currency,
      snapshot
    });

    return {
      group,
      currency,
      totalProjectCount: overview.totalProjectCount,
      activeProjectCount: overview.activeProjectCount,
      completedProjectCount: overview.completedProjectCount,
      averageProgress: overview.averageProgress,
      actualCostTotal: overview.actualCostSoFar,
      budgetCostTotal: overview.budgetCostTotal
    };
  });

  return mockApi(options.companyId ? summaries.filter((summary) => summary.totalProjectCount > 0) : summaries);
}
