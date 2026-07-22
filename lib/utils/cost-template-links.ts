import type {
  CostLibraryItem,
  Person,
  Project,
  Tool
} from "@/lib/types/domain";
import { PROJECT_BUDGET_HOURS_PER_DAY } from "@/lib/utils/project-budget";

// Personnel rate conversion basis: 20 working days per month, 10 hours per day.
export const PROJECT_BUDGET_WORKING_DAYS_PER_MONTH = 20;

/**
 * Converts a people template's amount to a per-day rate. A people template can
 * bill by hour, day, month, or year; the personnel library always stores and
 * shows a single daily rate, converted with 10 hours/day and 20 workdays/month.
 */
export const peopleTemplateDailyRate = (template: CostLibraryItem): number => {
  const { amount, billingType } = template;
  let daily: number;

  switch (billingType) {
    case "hourly":
      daily = amount * PROJECT_BUDGET_HOURS_PER_DAY;
      break;
    case "monthly":
      daily = amount / PROJECT_BUDGET_WORKING_DAYS_PER_MONTH;
      break;
    case "yearly":
      daily = amount / (PROJECT_BUDGET_WORKING_DAYS_PER_MONTH * 12);
      break;
    case "daily":
    default:
      daily = amount;
  }

  return Math.round(daily * 100) / 100;
};

export type CostTemplateLinkDatabase = {
  costLibrary: CostLibraryItem[];
  people: Person[];
  projects: Project[];
  tools: Tool[];
};

export const isCompatiblePeopleTemplate = (template: CostLibraryItem | undefined) =>
  Boolean(
    template &&
    template.category === "people" &&
    // Any recurring rate (hourly/daily/monthly/yearly) is allowed and converted
    // to a daily rate; a one-time amount is not a rate, so it is excluded.
    template.billingType !== "one-time"
  );

export const isCompatibleSoftwareTemplate = (template: CostLibraryItem | undefined) =>
  Boolean(
    template &&
    template.category === "software" &&
    (template.billingType === "monthly" || template.billingType === "yearly")
  );

export const applyPeopleTemplate = (
  person: Person,
  template: CostLibraryItem
): Person => ({
  ...person,
  costTemplateId: template.id,
  role: template.name,
  dailyCost: peopleTemplateDailyRate(template),
  dailyCostCurrency: template.currency
});

export const applySoftwareTemplate = (
  tool: Tool,
  template: CostLibraryItem
): Tool => ({
  ...tool,
  costTemplateId: template.id,
  name: template.name,
  subscription: {
    amount: template.amount,
    currency: template.currency,
    billingCycle: template.billingType as "monthly" | "yearly",
    expiresAt: tool.subscription?.expiresAt ?? "",
    nextPaymentAt: tool.subscription?.nextPaymentAt,
    accountEmail: tool.subscription?.accountEmail ?? ""
  }
});

const withoutTemplateLink = <T extends Person | Tool>(entity: T): T => {
  const next = { ...entity };
  delete next.costTemplateId;
  return next;
};

const syncPerson = (
  person: Person,
  templatesById: ReadonlyMap<string, CostLibraryItem>
) => {
  if (!person.costTemplateId) {
    return { ...person };
  }

  const template = templatesById.get(person.costTemplateId);
  return isCompatiblePeopleTemplate(template)
    ? applyPeopleTemplate(person, template as CostLibraryItem)
    : withoutTemplateLink(person);
};

const syncTool = (
  tool: Tool,
  templatesById: ReadonlyMap<string, CostLibraryItem>
) => {
  if (!tool.costTemplateId) {
    return { ...tool, subscription: tool.subscription ? { ...tool.subscription } : undefined };
  }

  const template = templatesById.get(tool.costTemplateId);
  return isCompatibleSoftwareTemplate(template)
    ? applySoftwareTemplate(tool, template as CostLibraryItem)
    : withoutTemplateLink(tool);
};

/**
 * Materializes every live template link into global libraries, project copies,
 * and their budget rows. The template remains the source of truth while the
 * materialized fields keep encrypted exports and old readers self-contained.
 */
export const synchronizeCostTemplateLinks = <T extends CostTemplateLinkDatabase>(database: T): T => {
  const templatesById = new Map(database.costLibrary.map((template) => [template.id, template]));

  database.people = database.people.map((person) => syncPerson(person, templatesById));
  database.tools = database.tools.map((tool) => syncTool(tool, templatesById));

  const globalPeopleById = new Map(database.people.map((person) => [person.id, person]));
  const globalToolsById = new Map(database.tools.map((tool) => [tool.id, tool]));

  database.projects = database.projects.map((project) => {
    const people = project.people.map((person) => {
      const globalPerson = globalPeopleById.get(person.id);
      return globalPerson?.costTemplateId
        ? { ...globalPerson }
        : syncPerson(person, templatesById);
    });
    const tools = project.tools.map((tool) => {
      const globalTool = globalToolsById.get(tool.id);
      return globalTool?.costTemplateId
        ? structuredClone(globalTool)
        : syncTool(tool, templatesById);
    });
    const projectPeopleById = new Map(people.map((person) => [person.id, person]));
    const projectToolsById = new Map(tools.map((tool) => [tool.id, tool]));

    return {
      ...project,
      people,
      tools,
      budget: project.budget
        ? {
            ...project.budget,
            phases: project.budget.phases.map((phaseBudget) => ({
              ...phaseBudget,
              personnel: phaseBudget.personnel.map((line) => {
                if (!line.personId) {
                  return line;
                }

                const person = globalPeopleById.get(line.personId) ?? projectPeopleById.get(line.personId);
                return person?.costTemplateId
                  ? {
                      ...line,
                      roleLevel: [person.name, person.role].filter(Boolean).join(" · "),
                      hourlyRate: (person.dailyCost ?? 0) / PROJECT_BUDGET_HOURS_PER_DAY,
                      currency: person.dailyCostCurrency ?? line.currency
                    }
                  : line;
              }),
              softwareCosts: phaseBudget.softwareCosts.map((line) => {
                if (!line.toolId) {
                  return line;
                }

                const tool = globalToolsById.get(line.toolId) ?? projectToolsById.get(line.toolId);
                return tool?.costTemplateId
                  ? {
                      ...line,
                      name: tool.name,
                      amount: tool.subscription?.amount ?? 0,
                      currency: tool.subscription?.currency ?? line.currency,
                      billingCycle: tool.subscription?.billingCycle ?? line.billingCycle
                    }
                  : line;
              })
            }))
          }
        : undefined
    };
  });

  return database;
};

/** Unlinks a template after its current values have already been materialized. */
export const detachCostTemplateLinks = (
  database: CostTemplateLinkDatabase,
  costTemplateId: string
) => {
  const detach = <T extends Person | Tool>(entity: T) =>
    entity.costTemplateId === costTemplateId ? withoutTemplateLink(entity) : entity;

  database.people = database.people.map(detach);
  database.tools = database.tools.map(detach);
  database.projects = database.projects.map((project) => ({
    ...project,
    people: project.people.map(detach),
    tools: project.tools.map(detach)
  }));
};
