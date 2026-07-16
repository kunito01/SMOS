import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { getProjectActualCost, getTotalMonthlySubscriptionCost, mockDatabase } from "@/lib/mock";
import type { CostLibraryItem, Person, PersonProjectParticipation, Project, Tool, ToolSubscription } from "@/lib/types";
import {
  applyPeopleTemplate,
  applySoftwareTemplate,
  detachCostTemplateLinks,
  isCompatiblePeopleTemplate,
  isCompatibleSoftwareTemplate,
  synchronizeCostTemplateLinks
} from "@/lib/utils/cost-template-links";
import {
  bundledExchangeRateSnapshot,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

type AddPersonInput = Pick<Person, "name" | "role" | "type"> & {
  costTemplateId?: string;
  dailyCost?: number;
  dailyCostCurrency?: Person["dailyCostCurrency"];
  email?: string;
};

type UpdatePersonInput = Partial<AddPersonInput>;

type ToolSubscriptionInput = Partial<ToolSubscription>;

type AddToolInput = Pick<Tool, "name" | "category"> & {
  costTemplateId?: string;
  subscription?: ToolSubscriptionInput;
};

type UpdateToolInput = Partial<AddToolInput>;

type AddCostTemplateInput = Omit<CostLibraryItem, "id">;
type UpdateCostTemplateInput = Partial<AddCostTemplateInput>;

const createLibraryId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

const getCostTemplate = (costTemplateId: string | undefined) =>
  costTemplateId
    ? mockDatabase.costLibrary.find((template) => template.id === costTemplateId)
    : undefined;

const normalizeTemplateId = (value: string | undefined) => value?.trim() || undefined;

export async function listPeople() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.people);
}

export async function listTools() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.tools);
}

export async function getToolSubscriptionSummary(
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) {
  await hydrateMockDatabase();
  return mockApi({
    monthlyTotal: getTotalMonthlySubscriptionCost(mockDatabase.tools, currency, snapshot),
    currency,
    activeSubscriptionCount: mockDatabase.tools.filter((tool) => tool.subscription?.amount).length
  });
}

export async function listCostTemplates() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.costLibrary);
}

export async function listPersonProjectParticipation(
  currency: MoneyCurrency = "CNY",
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
): Promise<PersonProjectParticipation[]> {
  await hydrateMockDatabase();
  const companyById = new Map(mockDatabase.companies.map((company) => [company.id, company]));
  const groupById = new Map(mockDatabase.groups.map((group) => [group.id, group]));

  return mockApi(
    mockDatabase.people.map((person) => {
      const projects = mockDatabase.projects
        .filter((project) => !project.archivedAt && projectHasPerson(project, person.id))
        .map((project) => {
          const company = companyById.get(project.companyId);
          const group = groupById.get(project.groupId);

          return {
            projectId: project.id,
            projectName: project.name,
            isExample: project.isExample,
            companyId: project.companyId,
            companyName: company?.name ?? "",
            groupId: project.groupId,
            groupName: group?.name ?? "",
            groupNameI18n: group?.nameI18n,
            progress: project.progress,
            status: project.status,
            actualCostSoFar: getProjectActualCost(project, currency, snapshot)
          };
        });
      const actualCostTotal = projects.reduce((sum, project) => sum + project.actualCostSoFar, 0);

      return {
        personId: person.id,
        currency,
        totalProjectCount: projects.length,
        averageProgress: projects.length
          ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
          : 0,
        actualCostTotal,
        projects
      };
    })
  );
}

export async function addPerson(input: AddPersonInput) {
  await hydrateMockDatabase();
  const costTemplateId = normalizeTemplateId(input.costTemplateId);
  const template = getCostTemplate(costTemplateId);
  if (costTemplateId && !isCompatiblePeopleTemplate(template)) {
    throw new Error("A person can only link to a daily people template");
  }

  let person: Person = {
    id: createLibraryId("person-library"),
    name: input.name,
    role: input.role,
    email: input.email,
    avatar: "",
    type: input.type,
    dailyCost: input.dailyCost,
    dailyCostCurrency: input.dailyCostCurrency,
    costTemplateId
  };

  if (template) {
    person = applyPeopleTemplate(person, template);
  }

  mockDatabase.people.unshift(person);
  synchronizeCostTemplateLinks(mockDatabase);
  await persistMockDatabase();

  return mockApi(mockDatabase.people.find((item) => item.id === person.id));
}

export async function updatePerson(personId: string, input: UpdatePersonInput) {
  await hydrateMockDatabase();
  const person = mockDatabase.people.find((item) => item.id === personId);

  if (person) {
    const nextTemplateId = "costTemplateId" in input
      ? normalizeTemplateId(input.costTemplateId)
      : person.costTemplateId;
    const template = getCostTemplate(nextTemplateId);
    if (nextTemplateId && !isCompatiblePeopleTemplate(template)) {
      throw new Error("A person can only link to a daily people template");
    }

    Object.assign(person, input, { costTemplateId: nextTemplateId });
    if (!nextTemplateId) {
      delete person.costTemplateId;
    } else if (template) {
      Object.assign(person, applyPeopleTemplate(person, template));
    }
  }

  synchronizeCostTemplateLinks(mockDatabase);
  await persistMockDatabase();

  return mockApi(mockDatabase.people.find((item) => item.id === personId));
}

export async function deletePerson(personId: string) {
  await hydrateMockDatabase();
  mockDatabase.people = mockDatabase.people.filter((person) => person.id !== personId);
  await persistMockDatabase();

  return mockApi({ id: personId });
}

export async function addTool(input: AddToolInput) {
  await hydrateMockDatabase();
  const costTemplateId = normalizeTemplateId(input.costTemplateId);
  const template = getCostTemplate(costTemplateId);
  if (costTemplateId && !isCompatibleSoftwareTemplate(template)) {
    throw new Error("Software can only link to a monthly or yearly software template");
  }

  let tool: Tool = {
    id: createLibraryId("tool-library"),
    name: input.name,
    category: input.category,
    costTemplateId,
    subscription: normalizeSubscription(input.subscription)
  };

  if (template) {
    tool = applySoftwareTemplate(tool, template);
  }

  mockDatabase.tools.unshift(tool);
  synchronizeCostTemplateLinks(mockDatabase);
  await persistMockDatabase();

  return mockApi(mockDatabase.tools.find((item) => item.id === tool.id));
}

export async function updateTool(toolId: string, input: UpdateToolInput) {
  await hydrateMockDatabase();
  const tool = mockDatabase.tools.find((item) => item.id === toolId);

  if (tool) {
    const nextTemplateId = "costTemplateId" in input
      ? normalizeTemplateId(input.costTemplateId)
      : tool.costTemplateId;
    const template = getCostTemplate(nextTemplateId);
    if (nextTemplateId && !isCompatibleSoftwareTemplate(template)) {
      throw new Error("Software can only link to a monthly or yearly software template");
    }

    Object.assign(tool, {
      ...input,
      costTemplateId: nextTemplateId,
      subscription: normalizeSubscription(input.subscription)
    });
    if (!nextTemplateId) {
      delete tool.costTemplateId;
    } else if (template) {
      Object.assign(tool, applySoftwareTemplate(tool, template));
    }
  }

  synchronizeCostTemplateLinks(mockDatabase);
  await persistMockDatabase();

  return mockApi(mockDatabase.tools.find((item) => item.id === toolId));
}

export async function deleteTool(toolId: string) {
  await hydrateMockDatabase();
  mockDatabase.tools = mockDatabase.tools.filter((tool) => tool.id !== toolId);
  await persistMockDatabase();

  return mockApi({ id: toolId });
}

const normalizeSubscription = (subscription?: ToolSubscriptionInput): ToolSubscription | undefined => {
  const amount = Number(subscription?.amount);
  const accountEmail = subscription?.accountEmail?.trim();

  if (!subscription || amount <= 0) {
    return undefined;
  }

  return {
    amount,
    currency: subscription.currency ?? "CNY",
    billingCycle: subscription.billingCycle ?? "monthly",
    expiresAt: subscription.expiresAt || "2026-12-31",
    nextPaymentAt: subscription.nextPaymentAt?.trim() || undefined,
    accountEmail: accountEmail ?? ""
  };
};

export async function addCostTemplate(input: AddCostTemplateInput) {
  await hydrateMockDatabase();
  const costTemplate: CostLibraryItem = {
    id: createLibraryId("cost-template-library"),
    ...input
  };

  mockDatabase.costLibrary.unshift(costTemplate);
  await persistMockDatabase();

  return mockApi(costTemplate);
}

export async function updateCostTemplate(
  costTemplateId: string,
  input: UpdateCostTemplateInput
) {
  await hydrateMockDatabase();
  const template = mockDatabase.costLibrary.find((item) => item.id === costTemplateId);

  if (!template) {
    return mockApi(undefined);
  }

  const nextTemplate: CostLibraryItem = { ...template, ...input };
  const hasPeopleLinks = mockDatabase.people.some((person) => person.costTemplateId === costTemplateId) ||
    mockDatabase.projects.some((project) => project.people.some((person) => person.costTemplateId === costTemplateId));
  const hasSoftwareLinks = mockDatabase.tools.some((tool) => tool.costTemplateId === costTemplateId) ||
    mockDatabase.projects.some((project) => project.tools.some((tool) => tool.costTemplateId === costTemplateId));

  if (hasPeopleLinks && !isCompatiblePeopleTemplate(nextTemplate)) {
    throw new Error("Unlink people before changing this template's category or billing type");
  }
  if (hasSoftwareLinks && !isCompatibleSoftwareTemplate(nextTemplate)) {
    throw new Error("Unlink software before changing this template's category or billing type");
  }

  Object.assign(template, nextTemplate);
  synchronizeCostTemplateLinks(mockDatabase);
  await persistMockDatabase();

  return mockApi(mockDatabase.costLibrary.find((item) => item.id === costTemplateId));
}

export async function deleteCostTemplate(costTemplateId: string) {
  await hydrateMockDatabase();
  synchronizeCostTemplateLinks(mockDatabase);
  detachCostTemplateLinks(mockDatabase, costTemplateId);
  mockDatabase.costLibrary = mockDatabase.costLibrary.filter((cost) => cost.id !== costTemplateId);
  await persistMockDatabase();

  return mockApi({ id: costTemplateId });
}

const projectHasPerson = (project: Project, personId: string) => {
  if (project.people.some((person) => person.id === personId)) {
    return true;
  }

  return project.phases.some((phase) => {
    if (phase.assigneeId === personId || phase.personIds?.includes(personId)) {
      return true;
    }

    return phase.deliverables.some(
      (deliverable) =>
        deliverable.assigneeId === personId || deliverable.tasks.some((task) => task.assigneeId === personId)
    );
  });
};
