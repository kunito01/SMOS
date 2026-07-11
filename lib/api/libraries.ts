import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { getProjectActualCost, getTotalMonthlySubscriptionCost, mockDatabase } from "@/lib/mock";
import type { CostLibraryItem, Person, PersonProjectParticipation, Project, Tool, ToolSubscription } from "@/lib/types";
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
  subscription?: ToolSubscriptionInput;
};

type UpdateToolInput = Partial<AddToolInput>;

type AddCostTemplateInput = Omit<CostLibraryItem, "id">;

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
  const person: Person = {
    id: `person-library-${mockDatabase.people.length + 1}`,
    name: input.name,
    role: input.role,
    email: input.email,
    avatar: "",
    type: input.type,
    dailyCost: input.dailyCost,
    dailyCostCurrency: input.dailyCostCurrency,
    costTemplateId: input.costTemplateId
  };

  mockDatabase.people.unshift(person);
  await persistMockDatabase();

  return mockApi(person);
}

export async function updatePerson(personId: string, input: UpdatePersonInput) {
  await hydrateMockDatabase();
  const person = mockDatabase.people.find((item) => item.id === personId);

  if (person) {
    Object.assign(person, input);
  }

  await persistMockDatabase();

  return mockApi(person);
}

export async function deletePerson(personId: string) {
  await hydrateMockDatabase();
  mockDatabase.people = mockDatabase.people.filter((person) => person.id !== personId);
  await persistMockDatabase();

  return mockApi({ id: personId });
}

export async function addTool(input: AddToolInput) {
  await hydrateMockDatabase();
  const tool: Tool = {
    id: `tool-library-${mockDatabase.tools.length + 1}`,
    name: input.name,
    category: input.category,
    subscription: normalizeSubscription(input.subscription)
  };

  mockDatabase.tools.unshift(tool);
  await persistMockDatabase();

  return mockApi(tool);
}

export async function updateTool(toolId: string, input: UpdateToolInput) {
  await hydrateMockDatabase();
  const tool = mockDatabase.tools.find((item) => item.id === toolId);

  if (tool) {
    Object.assign(tool, {
      ...input,
      subscription: normalizeSubscription(input.subscription)
    });
  }

  await persistMockDatabase();

  return mockApi(tool);
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
    accountEmail: accountEmail ?? ""
  };
};

export async function addCostTemplate(input: AddCostTemplateInput) {
  await hydrateMockDatabase();
  const costTemplate: CostLibraryItem = {
    id: `cost-template-library-${mockDatabase.costLibrary.length + 1}`,
    ...input
  };

  mockDatabase.costLibrary.unshift(costTemplate);
  await persistMockDatabase();

  return mockApi(costTemplate);
}

export async function deleteCostTemplate(costTemplateId: string) {
  await hydrateMockDatabase();
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
