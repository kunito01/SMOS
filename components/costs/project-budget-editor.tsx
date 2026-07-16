"use client";

import { useMemo } from "react";
import {
  BriefcaseBusiness,
  BusFront,
  CircleCheck,
  CirclePlus,
  Percent,
  ReceiptText,
  Save,
  Trash2,
  UsersRound,
  Wrench
} from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type {
  CostLibraryItem,
  Phase,
  Person,
  ProjectBudget,
  ProjectBudgetDailyExpenseLine,
  ProjectBudgetExtraCostLine,
  ProjectBudgetPersonnelLine,
  ProjectBudgetSoftwareCostLine,
  ProjectPhaseBudget,
  Tool
} from "@/lib/types";
import {
  calculatePersonnelLineNativeAmount,
  calculateSoftwareLineNativeAmount,
  calculateStructuredBudget,
  PROJECT_BUDGET_HOURS_PER_DAY
} from "@/lib/utils/project-budget";
import {
  formatCurrency,
  supportedCurrencies,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

type BudgetPhase = Pick<Phase, "id" | "name" | "startDate" | "endDate" | "toolIds">;

export type ProjectBudgetSaveTarget =
  | { kind: "personnel"; phaseId: string; lineId: string }
  | { kind: "travel"; phaseId: string }
  | { kind: "dailyExpense"; phaseId: string; lineId: string }
  | { kind: "extraCost"; phaseId: string; lineId: string }
  | { kind: "softwareCost"; phaseId: string; lineId: string }
  | { kind: "totals" };

type ProjectBudgetEditorProps = {
  value: ProjectBudget;
  onChange: (value: ProjectBudget) => void;
  phases: BudgetPhase[];
  tools: Tool[];
  displayCurrency: MoneyCurrency;
  exchangeRateSnapshot: ExchangeRateSnapshot;
  formatAmount: (value: number, currency?: MoneyCurrency) => string;
  people: Person[];
  costTemplates: CostLibraryItem[];
  showHeader?: boolean;
  savedValue?: ProjectBudget | null;
  onSave?: (target?: ProjectBudgetSaveTarget) => Promise<boolean>;
  isSaving?: boolean;
};

const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const integerValue = (value: string) => Math.round(numberValue(value));

const createLineId = (prefix: string) =>
  `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

const getPhaseBudget = (budget: ProjectBudget, phaseId: string) =>
  budget.phases.find((phase) => phase.phaseId === phaseId);

export function ProjectBudgetEditor({
  value,
  onChange,
  phases,
  tools,
  displayCurrency,
  exchangeRateSnapshot,
  formatAmount,
  people,
  costTemplates,
  showHeader = true,
  savedValue = null,
  onSave,
  isSaving = false
}: ProjectBudgetEditorProps) {
  const { t } = useI18n();
  const calculation = useMemo(
    () => calculateStructuredBudget(value, phases, tools, {
      currency: displayCurrency,
      snapshot: exchangeRateSnapshot
    }),
    [displayCurrency, exchangeRateSnapshot, phases, tools, value]
  );
  const phaseBreakdownById = useMemo(
    () => new Map(calculation.phaseBreakdowns.map((phase) => [phase.phaseId, phase])),
    [calculation.phaseBreakdowns]
  );
  const outsourcingTemplates = useMemo(
    () => costTemplates.filter((template) => template.category === "outsourcing"),
    [costTemplates]
  );
  const savedPhaseBudgetById = useMemo(
    () => new Map((savedValue?.phases ?? []).map((phase) => [phase.phaseId, phase])),
    [savedValue]
  );

  const valuesMatch = (current: unknown, saved: unknown) =>
    saved !== undefined && JSON.stringify(current) === JSON.stringify(saved);

  const saveControl = (
    isSaved: boolean,
    label: string,
    target: ProjectBudgetSaveTarget
  ) => {
    if (!onSave) {
      return null;
    }

    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={isSaved}
        aria-label={`${isSaved ? t("budgetLineSaved") : t("budgetLineSave")} ${label}`}
        data-budget-save-state={isSaved ? "saved" : "dirty"}
        className={
          isSaved
            ? "bg-[#97EECE] text-[#12263A] ring-[#12263A]/10 disabled:opacity-100"
            : "bg-ink text-white hover:bg-limepop hover:text-ink"
        }
        disabled={isSaved || isSaving}
        onClick={() => void onSave(target)}
      >
        {isSaved ? <CircleCheck size={16} /> : <Save size={16} />}
        {isSaving ? t("saving") : isSaved ? t("budgetLineSaved") : t("budgetLineSave")}
      </Button>
    );
  };

  const updatePhase = (phaseId: string, update: (phase: ProjectPhaseBudget) => ProjectPhaseBudget) => {
    onChange({
      ...value,
      phases: value.phases.map((phase) => (phase.phaseId === phaseId ? update(phase) : phase))
    });
  };

  const updatePersonnel = (
    phaseId: string,
    lineId: string,
    patch: Partial<ProjectBudgetPersonnelLine>
  ) => {
    updatePhase(phaseId, (phase) => ({
      ...phase,
      personnel: phase.personnel.map((line) => {
        if (line.id !== lineId) {
          return line;
        }

        const next = { ...line, ...patch };
        if (
          "startDate" in patch ||
          "endDate" in patch ||
          "allocationPercent" in patch
        ) {
          delete next.days;
        }
        return next;
      })
    }));
  };

  const updateDailyExpense = (
    phaseId: string,
    lineId: string,
    patch: Partial<ProjectBudgetDailyExpenseLine>
  ) => {
    updatePhase(phaseId, (phase) => ({
      ...phase,
      dailyExpenseLines: (phase.dailyExpenseLines ?? []).map((line) =>
        line.id === lineId ? { ...line, ...patch } : line
      )
    }));
  };

  const updateExtraCost = (
    phaseId: string,
    lineId: string,
    patch: Partial<ProjectBudgetExtraCostLine>
  ) => {
    updatePhase(phaseId, (phase) => ({
      ...phase,
      extraCosts: phase.extraCosts.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    }));
  };

  const updateSoftwareCost = (
    phaseId: string,
    lineId: string,
    patch: Partial<ProjectBudgetSoftwareCostLine>
  ) => {
    updatePhase(phaseId, (phase) => ({
      ...phase,
      softwareCosts: phase.softwareCosts.map((line) =>
        {
          if (line.id !== lineId) {
            return line;
          }

          const next = { ...line, ...patch };
          if (
            "startDate" in patch ||
            "endDate" in patch ||
            "allocationPercent" in patch
          ) {
            delete next.periods;
          }
          return next;
        }
      )
    }));
  };

  const importPerson = (phaseId: string, personId: string) => {
    const person = people.find((item) => item.id === personId);
    const usagePhase = phases.find((item) => item.id === phaseId);

    if (!person || !usagePhase) {
      return;
    }

    updatePhase(phaseId, (phase) => {
      if (phase.personnel.some((line) => line.personId === person.id)) {
        return phase;
      }

      return {
        ...phase,
        personnel: [
          ...phase.personnel,
          {
            id: createLineId(`${phaseId}:personnel:${person.id}`),
            personId: person.id,
            roleLevel: [person.name, person.role].filter(Boolean).join(" · "),
            headcount: 1,
            hourlyRate: (person.dailyCost ?? 0) / PROJECT_BUDGET_HOURS_PER_DAY,
            currency: person.dailyCostCurrency ?? displayCurrency,
            startDate: usagePhase.startDate,
            endDate: usagePhase.endDate,
            allocationPercent: 100
          }
        ]
      };
    });
  };

  const importOutsourcing = (phaseId: string, costTemplateId: string) => {
    const template = outsourcingTemplates.find((item) => item.id === costTemplateId);

    if (!template) {
      return;
    }

    updatePhase(phaseId, (phase) => {
      if (phase.extraCosts.some((line) => line.costTemplateId === template.id)) {
        return phase;
      }

      return {
        ...phase,
        extraCosts: [
          ...phase.extraCosts,
          {
            id: createLineId(`${phaseId}:outsourcing:${template.id}`),
            costTemplateId: template.id,
            name: template.name,
            kind: "outsourcing",
            amount: template.amount,
            currency: template.currency
          }
        ]
      };
    });
  };

  const importSoftware = (phaseId: string, toolId: string) => {
    const tool = tools.find((item) => item.id === toolId);
    const usagePhase = phases.find((item) => item.id === phaseId);

    if (!tool || !usagePhase) {
      return;
    }

    updatePhase(phaseId, (phase) => {
      if (phase.softwareCosts.some((line) => line.toolId === tool.id)) {
        return phase;
      }

      return {
        ...phase,
        softwareCosts: [
          ...phase.softwareCosts,
          {
            id: createLineId(`${phaseId}:software:${tool.id}`),
            toolId: tool.id,
            name: tool.name,
            amount: tool.subscription?.amount ?? 0,
            currency: tool.subscription?.currency ?? displayCurrency,
            billingCycle: tool.subscription?.billingCycle ?? "monthly",
            startDate: usagePhase.startDate,
            endDate: usagePhase.endDate,
            allocationPercent: 100
          }
        ]
      };
    });
  };

  return (
    <div className="grid gap-4">
      {showHeader ? <div className="rounded-studio bg-ink p-4 text-white">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-limepop text-ink">
            <ReceiptText size={18} />
          </span>
          <div>
            <h3 className="text-xl font-black">{t("projectBudgetPlanner")}</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-white/65">
              {t("projectBudgetPlannerBody")}
            </p>
          </div>
        </div>
      </div> : null}

      {phases.map((phase, phaseIndex) => {
        const phaseBudget = getPhaseBudget(value, phase.id);
        const breakdown = phaseBreakdownById.get(phase.id);
        const savedPhaseBudget = savedPhaseBudgetById.get(phase.id);

        if (!phaseBudget || !breakdown) {
          return null;
        }

        return (
          <section
            key={phase.id}
            data-budget-phase-index={phaseIndex}
            className="rounded-studio bg-[#12263A] p-4 text-[#97EECE] ring-1 ring-black/[0.08]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-muted">
                  {t("projectBudgetPhase")} {String(phaseIndex + 1).padStart(2, "0")}
                </p>
                <h4 className="mt-1 text-2xl font-black">{phase.name}</h4>
                <p className="mt-1 text-xs font-bold text-muted">
                  {phase.startDate} – {phase.endDate}
                </p>
              </div>
              <div
                data-budget-phase-subtotal
                className="rounded-full bg-[#f0c79f] px-4 py-2 text-sm font-black text-[#12263A]"
              >
                {t("budgetPhaseSubtotal")}: {formatAmount(breakdown.subtotal, displayCurrency)}
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="rounded-studio bg-white p-4 text-black">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <UsersRound size={18} />
                    <h5 className="font-black">{t("budgetPersonnel")}</h5>
                    <span className="text-xs font-black text-black">{t("budgetHoursPerDay")}</span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Select
                      value=""
                      aria-label={t("importPeopleFromLibrary")}
                      onChange={(event) => importPerson(phase.id, event.target.value)}
                      className="h-10 min-w-[13rem] rounded-full border-0 bg-cloud px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      <option value="">{t("importPeopleFromLibrary")}</option>
                      {people.map((person) => (
                        <option
                          key={person.id}
                          value={person.id}
                          disabled={phaseBudget.personnel.some((line) => line.personId === person.id)}
                        >
                          {person.name} · {person.role} · {formatCurrency(person.dailyCost ?? 0, person.dailyCostCurrency ?? displayCurrency)}/{t("budgetPerDay")}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updatePhase(phase.id, (current) => ({
                          ...current,
                          personnel: [
                            ...current.personnel,
                            {
                              id: createLineId(`${phase.id}:personnel`),
                              roleLevel: "",
                              headcount: 0,
                              hourlyRate: 0,
                              currency: displayCurrency,
                              startDate: phase.startDate,
                              endDate: phase.endDate,
                              allocationPercent: 100
                            }
                          ]
                        }))
                      }
                    >
                      <CirclePlus size={16} />
                      {t("addBudgetPersonnel")}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3">
                  {phaseBudget.personnel.map((line) => {
                    const nativeAmount = calculatePersonnelLineNativeAmount(line, phase);

                    return (
                      <div
                        key={line.id}
                        data-budget-personnel-row
                        className="grid min-w-0 gap-3 rounded-studio bg-cloud/70 p-3 sm:grid-cols-2 xl:grid-cols-4"
                      >
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-black text-muted">{t("budgetRoleLevel")}</span>
                          <input
                            value={line.roleLevel}
                            onChange={(event) => updatePersonnel(phase.id, line.id, { roleLevel: event.target.value })}
                            className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                          />
                          {line.personId ? (
                            <span className="text-[0.68rem] font-black text-muted">{t("importedFromPeopleLibrary")}</span>
                          ) : null}
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-black text-muted">{t("budgetHeadcount")}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={line.headcount || ""}
                            onChange={(event) => updatePersonnel(phase.id, line.id, { headcount: integerValue(event.target.value) })}
                            className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-black text-muted">{t("budgetHourlyRate")}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.hourlyRate || ""}
                            onChange={(event) => updatePersonnel(phase.id, line.id, { hourlyRate: numberValue(event.target.value) })}
                            className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-black text-muted">{t("currency")}</span>
                          <Select
                            value={line.currency}
                            onChange={(event) => updatePersonnel(phase.id, line.id, { currency: event.target.value as MoneyCurrency })}
                            className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          >
                            {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                          </Select>
                          <span className="text-[0.68rem] font-black text-muted">{formatCurrency(nativeAmount, line.currency)}</span>
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-black text-muted">{t("budgetUsageStartDate")}</span>
                          <input
                            type="date"
                            min={phase.startDate}
                            max={phase.endDate}
                            value={line.startDate}
                            onChange={(event) => {
                              const startDate = event.target.value;
                              updatePersonnel(phase.id, line.id, {
                                startDate,
                                endDate: line.endDate < startDate ? startDate : line.endDate
                              });
                            }}
                            className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-black text-muted">{t("budgetUsageEndDate")}</span>
                          <input
                            type="date"
                            min={line.startDate || phase.startDate}
                            max={phase.endDate}
                            value={line.endDate}
                            onChange={(event) => updatePersonnel(phase.id, line.id, { endDate: event.target.value })}
                            className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-black text-muted">{t("budgetAllocationPercent")}</span>
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={line.allocationPercent}
                              onChange={(event) => updatePersonnel(phase.id, line.id, {
                                allocationPercent: Math.min(100, numberValue(event.target.value))
                              })}
                              className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                            />
                            <span className="font-black">%</span>
                          </span>
                        </label>
                        <div className="min-w-0 rounded-studio bg-white/75 px-3 py-2 text-xs font-bold leading-5 text-muted">
                          {t("budgetPersonnelFormula")}
                        </div>
                        {line.days !== undefined ? (
                          <p className="min-w-0 text-xs font-black leading-5 text-coral sm:col-span-2 xl:col-span-4">
                            {t("projectBudgetLegacyUsageReview")}
                          </p>
                        ) : null}
                        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              updatePhase(phase.id, (current) => ({
                                ...current,
                                personnel: current.personnel.filter((item) => item.id !== line.id)
                              }))
                            }
                          >
                            <Trash2 size={16} />
                            {t("delete")}
                          </Button>
                          {saveControl(
                            valuesMatch(
                              line,
                              savedPhaseBudget?.personnel.find((item) => item.id === line.id)
                            ),
                            line.roleLevel || t("budgetPersonnel"),
                            { kind: "personnel", phaseId: phase.id, lineId: line.id }
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-studio bg-white p-4 text-black">
                  <div className="flex items-center gap-2">
                    <BusFront size={18} />
                    <h5 className="font-black">{t("budgetTravel")}</h5>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <label className="grid gap-1">
                      <span className="text-xs font-black text-muted">{t("budgetTravelUnitPrice")}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={phaseBudget.travel?.unitPrice || ""}
                        onChange={(event) => updatePhase(phase.id, (current) => ({
                          ...current,
                          travel: {
                            unitPrice: numberValue(event.target.value),
                            count: current.travel?.count ?? 0,
                            currency: current.travel?.currency ?? displayCurrency
                          }
                        }))}
                        className="h-10 rounded-full border-0 bg-cloud px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-black text-muted">{t("budgetTravelCount")}</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={phaseBudget.travel?.count || ""}
                        onChange={(event) => updatePhase(phase.id, (current) => ({
                          ...current,
                          travel: {
                            unitPrice: current.travel?.unitPrice ?? 0,
                            count: integerValue(event.target.value),
                            currency: current.travel?.currency ?? displayCurrency
                          }
                        }))}
                        className="h-10 rounded-full border-0 bg-cloud px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-black text-muted">{t("currency")}</span>
                      <Select
                        value={phaseBudget.travel?.currency ?? displayCurrency}
                        onChange={(event) => updatePhase(phase.id, (current) => ({
                          ...current,
                          travel: {
                            unitPrice: current.travel?.unitPrice ?? 0,
                            count: current.travel?.count ?? 0,
                            currency: event.target.value as MoneyCurrency
                          }
                        }))}
                        className="h-10 rounded-full border-0 bg-cloud px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                      >
                        {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </Select>
                    </label>
                  </div>
                  <div className="mt-3">
                    {saveControl(
                      valuesMatch(phaseBudget.travel, savedPhaseBudget?.travel),
                      t("budgetTravel"),
                      { kind: "travel", phaseId: phase.id }
                    )}
                  </div>
                </div>

                <div className="rounded-studio bg-white p-4 text-black">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ReceiptText size={18} />
                      <h5 className="font-black">{t("budgetDailyExpenses")}</h5>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => updatePhase(phase.id, (current) => ({
                        ...current,
                        dailyExpenseLines: [
                          ...(current.dailyExpenseLines ?? []),
                          {
                            id: createLineId(`${phase.id}:daily-expenses`),
                            name: "",
                            amount: 0,
                            currency: displayCurrency
                          }
                        ]
                      }))}
                    >
                      <CirclePlus size={16} />
                      {t("addBudgetDailyExpense")}
                    </Button>
                  </div>
                  {(phaseBudget.dailyExpenseLines ?? []).length ? (
                    <div className="mt-3 grid gap-3">
                      {(phaseBudget.dailyExpenseLines ?? []).map((line) => (
                        <div key={line.id} data-budget-daily-expense-row className="grid min-w-0 gap-3 rounded-studio bg-cloud/70 p-3 sm:grid-cols-2">
                          <label className="grid min-w-0 gap-1">
                            <span className="text-xs font-black text-muted">{t("budgetExtraCostName")}</span>
                            <input
                              value={line.name}
                              onChange={(event) => updateDailyExpense(phase.id, line.id, { name: event.target.value })}
                              className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                            />
                          </label>
                          <label className="grid min-w-0 gap-1">
                            <span className="text-xs font-black text-muted">{t("amount")}</span>
                            <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.amount || ""}
                                onChange={(event) => updateDailyExpense(phase.id, line.id, { amount: numberValue(event.target.value) })}
                                className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                              />
                              <Select
                                value={line.currency}
                                aria-label={`${t("currency")} ${line.name || t("budgetDailyExpenses")}`}
                                onChange={(event) => updateDailyExpense(phase.id, line.id, { currency: event.target.value as MoneyCurrency })}
                                className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                              >
                                {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                              </Select>
                            </span>
                          </label>
                          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => updatePhase(phase.id, (current) => ({
                                ...current,
                                dailyExpenseLines: (current.dailyExpenseLines ?? []).filter((item) => item.id !== line.id)
                              }))}
                            >
                              <Trash2 size={16} />
                              {t("delete")}
                            </Button>
                            {saveControl(
                              valuesMatch(
                                line,
                                savedPhaseBudget?.dailyExpenseLines?.find((item) => item.id === line.id)
                              ),
                              line.name || t("budgetDailyExpenses"),
                              { kind: "dailyExpense", phaseId: phase.id, lineId: line.id }
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-full bg-cloud/70 px-4 py-3 text-sm font-bold text-muted">
                      {t("budgetDailyExpensesNone")}
                    </p>
                  )}
                </div>
              </div>

              <div data-budget-outsourcing-panel className="rounded-studio bg-[#dff478] p-4 text-black">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness size={18} />
                    <h5 className="font-black">{t("budgetExtraCosts")}</h5>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Select
                      value=""
                      aria-label={t("importOutsourcingFromLibrary")}
                      onChange={(event) => importOutsourcing(phase.id, event.target.value)}
                      className="h-10 min-w-[13rem] rounded-full border-0 bg-cloud px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      <option value="">{t("importOutsourcingFromLibrary")}</option>
                      {outsourcingTemplates.map((template) => (
                        <option
                          key={template.id}
                          value={template.id}
                          disabled={phaseBudget.extraCosts.some((line) => line.costTemplateId === template.id)}
                        >
                          {template.name} · {formatCurrency(template.amount, template.currency)}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => updatePhase(phase.id, (current) => ({
                        ...current,
                        extraCosts: [
                          ...current.extraCosts,
                          {
                            id: createLineId(`${phase.id}:extra`),
                            name: "",
                            kind: "outsourcing",
                            amount: 0,
                            currency: displayCurrency
                          }
                        ]
                      }))}
                    >
                      <CirclePlus size={16} />
                      {t("addBudgetExtraCost")}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {phaseBudget.extraCosts.map((line) => (
                    <div
                      key={line.id}
                      data-budget-extra-cost-row
                      className="grid min-w-0 gap-3 rounded-studio bg-cloud/70 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(10rem,auto)] lg:grid-cols-[minmax(8rem,1fr)_9rem_minmax(7rem,0.7fr)_7rem_minmax(10rem,auto)]"
                    >
                      <label className="grid min-w-0 gap-1 sm:col-start-1 sm:row-start-1 lg:col-auto lg:row-auto">
                        <span className="text-xs font-black text-muted">{t("budgetExtraCostName")}</span>
                        <input
                          value={line.name}
                          onChange={(event) => updateExtraCost(phase.id, line.id, { name: event.target.value })}
                          className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                        />
                        {line.costTemplateId ? (
                          <span className="text-[0.68rem] font-black text-muted">{t("importedFromCostLibrary")}</span>
                        ) : null}
                      </label>
                      <label className="grid min-w-0 gap-1 sm:col-start-2 sm:row-start-1 lg:col-auto lg:row-auto">
                        <span className="text-xs font-black text-muted">{t("budgetExtraCostType")}</span>
                        <Select
                          value={line.kind}
                          onChange={(event) => updateExtraCost(phase.id, line.id, { kind: event.target.value as ProjectBudgetExtraCostLine["kind"] })}
                          className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        >
                          <option value="outsourcing">{t("budgetExtraCostOutsourcing")}</option>
                          <option value="extra">{t("budgetExtraCostOther")}</option>
                        </Select>
                      </label>
                      <label className="grid min-w-0 gap-1 sm:col-start-1 sm:row-start-2 lg:col-auto lg:row-auto">
                        <span className="text-xs font-black text-muted">{t("amount")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.amount || ""}
                          onChange={(event) => updateExtraCost(phase.id, line.id, { amount: numberValue(event.target.value) })}
                          className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 sm:col-start-2 sm:row-start-2 lg:col-auto lg:row-auto">
                        <span className="text-xs font-black text-muted">{t("currency")}</span>
                        <Select
                          value={line.currency}
                          onChange={(event) => updateExtraCost(phase.id, line.id, { currency: event.target.value as MoneyCurrency })}
                          className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        >
                          {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </Select>
                      </label>
                      <div className="flex flex-wrap items-center gap-2 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center lg:col-auto lg:row-auto lg:row-span-1 lg:mt-5 lg:self-auto">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => updatePhase(phase.id, (current) => ({
                            ...current,
                            extraCosts: current.extraCosts.filter((item) => item.id !== line.id)
                          }))}
                        >
                          <Trash2 size={16} />
                          {t("delete")}
                        </Button>
                        {saveControl(
                          valuesMatch(
                            line,
                            savedPhaseBudget?.extraCosts.find((item) => item.id === line.id)
                          ),
                          line.name || t("budgetExtraCosts"),
                          { kind: "extraCost", phaseId: phase.id, lineId: line.id }
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-studio bg-ink p-4 text-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wrench size={18} />
                    <h5 className="font-black">{t("budgetSoftware")}</h5>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Select
                      value=""
                      aria-label={t("importSoftwareFromLibrary")}
                      onChange={(event) => importSoftware(phase.id, event.target.value)}
                      className="h-10 min-w-[13rem] rounded-full border-0 bg-white px-3 text-sm font-bold text-ink outline-none ring-1 ring-white/20"
                    >
                      <option value="">{t("importSoftwareFromLibrary")}</option>
                      {tools.map((tool) => (
                        <option
                          key={tool.id}
                          value={tool.id}
                          disabled={phaseBudget.softwareCosts.some((line) => line.toolId === tool.id)}
                        >
                          {tool.name} · {tool.subscription
                            ? `${formatCurrency(tool.subscription.amount, tool.subscription.currency)} · ${t(tool.subscription.billingCycle === "monthly" ? "billingTypeMonthly" : "billingTypeYearly")}`
                            : t("noSubscription")}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="bg-white/10 text-white hover:bg-white hover:text-ink"
                      onClick={() => updatePhase(phase.id, (current) => ({
                        ...current,
                        softwareCosts: [
                          ...current.softwareCosts,
                          {
                            id: createLineId(`${phase.id}:software`),
                            name: "",
                            amount: 0,
                            currency: displayCurrency,
                            billingCycle: "monthly",
                            startDate: phase.startDate,
                            endDate: phase.endDate,
                            allocationPercent: 100
                          }
                        ]
                      }))}
                    >
                      <CirclePlus size={16} />
                      {t("addBudgetSoftware")}
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-white/60">{t("budgetSoftwareHint")}</p>
                {phaseBudget.softwareCosts.length ? (
                  <div className="mt-3 grid gap-2">
                    {phaseBudget.softwareCosts.map((line) => {
                      const nativeTotal = calculateSoftwareLineNativeAmount(line, phase);

                      return (
                        <div
                          key={line.id}
                          data-budget-software-row
                          className="grid min-w-0 items-start gap-3 rounded-studio bg-[#46677D] p-3 sm:grid-cols-2 xl:grid-cols-4"
                        >
                          <label className="grid min-w-0 content-start gap-1">
                            <span className="text-xs font-black text-white/60">{t("budgetSoftwareName")}</span>
                            <input
                              value={line.name}
                              onChange={(event) => updateSoftwareCost(phase.id, line.id, { name: event.target.value })}
                              className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold text-ink outline-none ring-1 ring-white/20 focus:ring-limepop"
                            />
                            {line.toolId ? (
                              <span className="text-[0.68rem] font-black text-white/55">{t("importedFromSoftwareLibrary")}</span>
                            ) : null}
                          </label>
                          <label className="grid min-w-0 content-start gap-1">
                            <span className="text-xs font-black text-white/60">{t("subscriptionFee")}</span>
                            <span className="grid min-w-0 grid-cols-[minmax(6rem,1fr)_4.75rem] gap-2">
                              <input
                                data-budget-software-amount
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.amount || ""}
                                onChange={(event) => updateSoftwareCost(phase.id, line.id, { amount: numberValue(event.target.value) })}
                                className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold text-ink outline-none ring-1 ring-white/20 focus:ring-limepop"
                              />
                              <Select
                                data-budget-software-currency
                                value={line.currency}
                                aria-label={`${t("currency")} ${line.name || t("budgetSoftware")}`}
                                onChange={(event) => updateSoftwareCost(phase.id, line.id, { currency: event.target.value as MoneyCurrency })}
                                className="!h-10 !min-h-10 min-w-0 w-full rounded-full border-0 bg-white !px-2 !text-xs !font-black text-ink outline-none ring-1 ring-white/20"
                              >
                                {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                              </Select>
                            </span>
                            <span className="text-[0.68rem] font-black text-white/55">{formatCurrency(nativeTotal, line.currency)}</span>
                          </label>
                          <label className="grid min-w-0 content-start gap-1">
                            <span className="text-xs font-black text-white/60">{t("billing")}</span>
                            <Select
                              value={line.billingCycle}
                              onChange={(event) => updateSoftwareCost(phase.id, line.id, { billingCycle: event.target.value as ProjectBudgetSoftwareCostLine["billingCycle"] })}
                              className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold text-ink outline-none ring-1 ring-white/20"
                            >
                              <option value="monthly">{t("billingTypeMonthly")}</option>
                              <option value="yearly">{t("billingTypeYearly")}</option>
                            </Select>
                          </label>
                          <label className="grid min-w-0 content-start gap-1">
                            <span className="text-xs font-black text-white/60">{t("budgetUsageStartDate")}</span>
                            <input
                              type="date"
                              min={phase.startDate}
                              max={phase.endDate}
                              value={line.startDate}
                              onChange={(event) => {
                                const startDate = event.target.value;
                                updateSoftwareCost(phase.id, line.id, {
                                  startDate,
                                  endDate: line.endDate < startDate ? startDate : line.endDate
                                });
                              }}
                              className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold text-ink outline-none ring-1 ring-white/20 focus:ring-limepop"
                            />
                          </label>
                          <label className="grid min-w-0 content-start gap-1">
                            <span className="text-xs font-black text-white/60">{t("budgetUsageEndDate")}</span>
                            <input
                              type="date"
                              min={line.startDate || phase.startDate}
                              max={phase.endDate}
                              value={line.endDate}
                              onChange={(event) => updateSoftwareCost(phase.id, line.id, { endDate: event.target.value })}
                              className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold text-ink outline-none ring-1 ring-white/20 focus:ring-limepop"
                            />
                          </label>
                          <label className="grid min-w-0 content-start gap-1">
                            <span className="text-xs font-black text-white/60">{t("budgetAllocationPercent")}</span>
                            <span className="flex min-w-0 items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={line.allocationPercent}
                                onChange={(event) => updateSoftwareCost(phase.id, line.id, {
                                  allocationPercent: Math.min(100, numberValue(event.target.value))
                                })}
                                className="h-10 min-w-0 w-full rounded-full border-0 bg-white px-3 text-sm font-bold text-ink outline-none ring-1 ring-white/20 focus:ring-limepop"
                              />
                              <span className="font-black">%</span>
                            </span>
                          </label>
                          <div className="min-w-0 rounded-studio bg-white/10 px-3 py-2 text-xs font-bold leading-5 text-white/65">
                            {t("budgetSoftwareFormula")}
                          </div>
                          {line.periods !== undefined ? (
                            <p className="min-w-0 text-xs font-black leading-5 text-[#ffb4a7] sm:col-span-2 xl:col-span-4">
                              {t("projectBudgetLegacyUsageReview")}
                            </p>
                          ) : null}
                          <div
                            data-budget-software-actions
                            className="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-4"
                          >
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="bg-white/10 text-white hover:bg-white hover:text-ink"
                              onClick={() => updatePhase(phase.id, (current) => ({
                                ...current,
                                softwareCosts: current.softwareCosts.filter((item) => item.id !== line.id)
                              }))}
                            >
                              <Trash2 size={16} />
                              {t("delete")}
                            </Button>
                            {saveControl(
                              valuesMatch(
                                line,
                                savedPhaseBudget?.softwareCosts.find((item) => item.id === line.id)
                              ),
                              line.name || t("budgetSoftware"),
                              { kind: "softwareCost", phaseId: phase.id, lineId: line.id }
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-full bg-white/10 px-4 py-3 text-sm font-bold text-white/65">
                    {t("budgetSoftwareNone")}
                  </p>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <section className="rounded-studio bg-[#ffc700] p-4 text-ink">
        <div className="flex items-center gap-2">
          <Percent size={18} />
          <h3 className="text-xl font-black">{t("projectBudgetTotal")}</h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-studio bg-white/65 p-4">
            <p className="text-xs font-black text-muted">{t("budgetBaseSubtotal")}</p>
            <p className="mt-2 text-2xl font-black">{formatAmount(calculation.base, displayCurrency)}</p>
          </div>
          <label className="rounded-studio bg-white/65 p-4">
            <span className="text-xs font-black text-muted">{t("budgetContingencyPercent")}</span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={value.contingencyPercent || ""}
                onChange={(event) => onChange({ ...value, contingencyPercent: Math.min(100, numberValue(event.target.value)) })}
                className="h-10 min-w-0 flex-1 rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
              />
              <span className="font-black">%</span>
            </div>
            <span className="mt-2 block text-lg font-black">{formatAmount(calculation.contingency, displayCurrency)}</span>
          </label>
          <label className="rounded-studio bg-white/65 p-4">
            <span className="text-xs font-black text-muted">{t("budgetTaxPercent")}</span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={value.taxPercent || ""}
                onChange={(event) => onChange({ ...value, taxPercent: Math.min(100, numberValue(event.target.value)) })}
                className="h-10 min-w-0 flex-1 rounded-full border-0 bg-white px-3 text-sm font-bold outline-none ring-1 ring-black/[0.06] focus:ring-coral"
              />
              <span className="font-black">%</span>
            </div>
            <span className="mt-2 block text-lg font-black">{formatAmount(calculation.tax, displayCurrency)}</span>
          </label>
          <div className="rounded-studio bg-ink p-4 text-white">
            <p className="text-xs font-black text-white/55">{t("projectBudgetTotal")}</p>
            <p className="mt-2 text-3xl font-black">{formatAmount(calculation.total, displayCurrency)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs font-bold leading-5 text-ink/65">{t("projectBudgetFormula")}</p>
        <div className="mt-3">
          {saveControl(
            valuesMatch(
              { contingencyPercent: value.contingencyPercent, taxPercent: value.taxPercent },
              savedValue
                ? {
                    contingencyPercent: savedValue.contingencyPercent,
                    taxPercent: savedValue.taxPercent
                  }
                : undefined
            ),
            t("projectBudgetTotal"),
            { kind: "totals" }
          )}
        </div>
      </section>
    </div>
  );
}
