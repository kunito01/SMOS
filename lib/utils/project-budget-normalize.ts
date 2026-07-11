import type {
  Phase,
  ProjectBudget,
  ProjectBudgetDailyExpenseLine,
  ProjectBudgetDirectExpense,
  ProjectBudgetExtraCostLine,
  ProjectBudgetPersonnelLine,
  ProjectBudgetSoftwareCostLine,
  ProjectBudgetTravel,
  ProjectPhaseBudget,
  Tool
} from "@/lib/types/domain";
import { isMoneyCurrency } from "@/lib/utils/money";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanNonNegativeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

const cleanNonNegativeInteger = (value: unknown) =>
  Math.floor(cleanNonNegativeNumber(value));

const cleanPercentage = (value: unknown) =>
  Math.min(100, cleanNonNegativeNumber(value));

const cleanPersonnelLine = (value: unknown): ProjectBudgetPersonnelLine | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.roleLevel !== "string" ||
    !isMoneyCurrency(value.currency)
  ) {
    return null;
  }

  return {
    id: value.id,
    ...(typeof value.personId === "string" ? { personId: value.personId } : {}),
    roleLevel: value.roleLevel,
    headcount: cleanNonNegativeInteger(value.headcount),
    hourlyRate: cleanNonNegativeNumber(value.hourlyRate),
    currency: value.currency,
    days: cleanNonNegativeInteger(value.days)
  };
};

const cleanTravel = (value: unknown): ProjectBudgetTravel | undefined => {
  if (!isRecord(value) || !isMoneyCurrency(value.currency)) {
    return undefined;
  }

  return {
    unitPrice: cleanNonNegativeNumber(value.unitPrice),
    currency: value.currency,
    count: cleanNonNegativeInteger(value.count)
  };
};

const cleanDirectExpense = (value: unknown): ProjectBudgetDirectExpense | undefined => {
  if (!isRecord(value) || !isMoneyCurrency(value.currency)) {
    return undefined;
  }

  return {
    amount: cleanNonNegativeNumber(value.amount),
    currency: value.currency
  };
};

const cleanDailyExpenseLine = (value: unknown): ProjectBudgetDailyExpenseLine | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isMoneyCurrency(value.currency)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    amount: cleanNonNegativeNumber(value.amount),
    currency: value.currency
  };
};

const cleanExtraCostLine = (value: unknown): ProjectBudgetExtraCostLine | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    (value.kind !== "outsourcing" && value.kind !== "extra") ||
    !isMoneyCurrency(value.currency)
  ) {
    return null;
  }

  return {
    id: value.id,
    ...(typeof value.costTemplateId === "string" ? { costTemplateId: value.costTemplateId } : {}),
    name: value.name,
    kind: value.kind,
    amount: cleanNonNegativeNumber(value.amount),
    currency: value.currency
  };
};

const cleanSoftwareCostLine = (value: unknown): ProjectBudgetSoftwareCostLine | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.toolId !== undefined && typeof value.toolId !== "string") ||
    typeof value.name !== "string" ||
    !isMoneyCurrency(value.currency) ||
    (value.billingCycle !== "monthly" && value.billingCycle !== "yearly")
  ) {
    return null;
  }

  return {
    id: value.id,
    ...(typeof value.toolId === "string" ? { toolId: value.toolId } : {}),
    name: value.name,
    amount: cleanNonNegativeNumber(value.amount),
    currency: value.currency,
    billingCycle: value.billingCycle,
    periods: cleanNonNegativeInteger(value.periods)
  };
};

const syncSoftwareCosts = (existing: ProjectBudgetSoftwareCostLine[]) => {
  const uniqueExisting = new Map<string, ProjectBudgetSoftwareCostLine>();

  existing.forEach((line) => {
    const key = line.toolId ? `tool:${line.toolId}` : `manual:${line.id}`;
    if (!uniqueExisting.has(key)) {
      uniqueExisting.set(key, line);
    }
  });

  return [...uniqueExisting.values()];
};

const createNormalizedPhaseBudget = (
  phase: Phase,
  value: unknown
): ProjectPhaseBudget => {
  const phaseBudget = isRecord(value) ? value : {};
  const personnel = Array.isArray(phaseBudget.personnel)
    ? phaseBudget.personnel.flatMap((line) => {
        const cleaned = cleanPersonnelLine(line);
        return cleaned ? [cleaned] : [];
      })
    : [];
  const extraCosts = Array.isArray(phaseBudget.extraCosts)
    ? phaseBudget.extraCosts.flatMap((line) => {
        const cleaned = cleanExtraCostLine(line);
        return cleaned ? [cleaned] : [];
      })
    : [];
  const existingSoftwareCosts = Array.isArray(phaseBudget.softwareCosts)
    ? phaseBudget.softwareCosts.flatMap((line) => {
        const cleaned = cleanSoftwareCostLine(line);
        return cleaned ? [cleaned] : [];
      })
    : [];
  const travel = cleanTravel(phaseBudget.travel);
  const legacyDailyExpenses = cleanDirectExpense(phaseBudget.dailyExpenses);
  const hasItemizedDailyExpenses = Array.isArray(phaseBudget.dailyExpenseLines);
  const dailyExpenseLines = hasItemizedDailyExpenses
    ? (phaseBudget.dailyExpenseLines as unknown[]).flatMap((line) => {
        const cleaned = cleanDailyExpenseLine(line);
        return cleaned ? [cleaned] : [];
      })
    : legacyDailyExpenses && legacyDailyExpenses.amount > 0
      ? [{
          id: `${phase.id}:daily-expenses:legacy`,
          name: "",
          amount: legacyDailyExpenses.amount,
          currency: legacyDailyExpenses.currency
        }]
      : [];

  return {
    phaseId: phase.id,
    personnel,
    ...(travel ? { travel } : {}),
    dailyExpenseLines,
    extraCosts,
    softwareCosts: syncSoftwareCosts(existingSoftwareCosts)
  };
};

/**
 * Reconciles a saved budget with the project's current phases. The first saved
 * row for each current phase wins; orphan and duplicate rows are discarded.
 */
export const normalizeProjectBudgetForPhases = (
  budget: ProjectBudget | undefined,
  phases: ReadonlyArray<Phase>,
  _tools: ReadonlyArray<Tool> = []
): ProjectBudget | undefined => {
  void _tools;

  if (!isRecord(budget)) {
    return undefined;
  }

  const currentPhaseIds = new Set(phases.map((phase) => phase.id));
  const savedByPhaseId = new Map<string, unknown>();

  if (Array.isArray(budget.phases)) {
    budget.phases.forEach((phaseBudget) => {
      if (
        isRecord(phaseBudget) &&
        typeof phaseBudget.phaseId === "string" &&
        currentPhaseIds.has(phaseBudget.phaseId) &&
        !savedByPhaseId.has(phaseBudget.phaseId)
      ) {
        savedByPhaseId.set(phaseBudget.phaseId, phaseBudget);
      }
    });
  }

  return {
    phases: phases.map((phase) =>
      createNormalizedPhaseBudget(phase, savedByPhaseId.get(phase.id))
    ),
    contingencyPercent: cleanPercentage(budget.contingencyPercent),
    taxPercent: cleanPercentage(budget.taxPercent)
  };
};
