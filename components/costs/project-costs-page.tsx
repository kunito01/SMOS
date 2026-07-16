"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, Calculator, ChevronDown, CircleDollarSign, ReceiptText, Save, TrendingUp } from "lucide-react";
import { CostCurrencySelector } from "@/components/costs/cost-currency-selector";
import {
  ProjectBudgetEditor,
  type ProjectBudgetSaveTarget
} from "@/components/costs/project-budget-editor";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { MetricTile } from "@/components/domain/metric-tile";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { ActionConfirmDialog } from "@/components/ui/action-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { costsApi, librariesApi, projectsApi } from "@/lib/api";
import type { ProjectCostSummary } from "@/lib/api/costs";
import {
  billingTypeKeys,
  budgetCostCategoryKeys,
  costCategoryKeys,
  formatDemoEntityName,
  projectNameKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { CostItem, CostLibraryItem, Person, Project, ProjectBudget, Tool } from "@/lib/types";
import { projectPath } from "@/lib/utils/app-routes";
import { cn } from "@/lib/utils/cn";
import { createEmptyProjectBudget } from "@/lib/utils/project-budget";

type ProjectCostsData = {
  costTemplates: CostLibraryItem[];
  project: Project;
  costs: CostItem[];
  people: Person[];
  summary: ProjectCostSummary;
  tools: Tool[];
};

const createBlankBudgetBaseline = (project: Project): ProjectBudget => ({
  phases: project.phases.map((phase) => ({
    phaseId: phase.id,
    personnel: [],
    dailyExpenseLines: [],
    extraCosts: [],
    softwareCosts: []
  })),
  contingencyPercent: 0,
  taxPercent: 0
});

const replaceBudgetLine = <T extends { id: string }>(
  savedLines: T[],
  draftLines: T[],
  lineId: string
) => {
  const draftLine = draftLines.find((line) => line.id === lineId);
  if (!draftLine) {
    return savedLines;
  }

  return savedLines.some((line) => line.id === lineId)
    ? savedLines.map((line) => line.id === lineId ? structuredClone(draftLine) : line)
    : [...savedLines, structuredClone(draftLine)];
};

const mergeBudgetSaveTarget = (
  baseline: ProjectBudget,
  draft: ProjectBudget,
  target: ProjectBudgetSaveTarget
) => {
  const next = structuredClone(baseline);

  if (target.kind === "totals") {
    next.contingencyPercent = draft.contingencyPercent;
    next.taxPercent = draft.taxPercent;
    return next;
  }

  const draftPhase = draft.phases.find((phase) => phase.phaseId === target.phaseId);
  const savedPhase = next.phases.find((phase) => phase.phaseId === target.phaseId);
  if (!draftPhase || !savedPhase) {
    return next;
  }

  switch (target.kind) {
    case "personnel":
      savedPhase.personnel = replaceBudgetLine(savedPhase.personnel, draftPhase.personnel, target.lineId);
      break;
    case "travel":
      if (draftPhase.travel) {
        savedPhase.travel = structuredClone(draftPhase.travel);
      } else {
        delete savedPhase.travel;
      }
      break;
    case "dailyExpense":
      savedPhase.dailyExpenseLines = replaceBudgetLine(
        savedPhase.dailyExpenseLines,
        draftPhase.dailyExpenseLines,
        target.lineId
      );
      break;
    case "extraCost":
      savedPhase.extraCosts = replaceBudgetLine(savedPhase.extraCosts, draftPhase.extraCosts, target.lineId);
      break;
    case "softwareCost":
      savedPhase.softwareCosts = replaceBudgetLine(
        savedPhase.softwareCosts,
        draftPhase.softwareCosts,
        target.lineId
      );
      break;
  }

  return next;
};

type BudgetUsageLine = {
  startDate: string;
  endDate: string;
  allocationPercent: number;
};

const isValidBudgetDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value;
};

const getUsageValidationIssue = (
  line: BudgetUsageLine,
  phase: Pick<Project["phases"][number], "startDate" | "endDate">
) => {
  if (
    !line.startDate ||
    !line.endDate ||
    !Number.isFinite(line.allocationPercent) ||
    line.allocationPercent <= 0 ||
    line.allocationPercent > 100
  ) {
    return "required" as const;
  }

  if (
    !isValidBudgetDate(line.startDate) ||
    !isValidBudgetDate(line.endDate) ||
    line.endDate < line.startDate ||
    line.startDate < phase.startDate ||
    line.endDate > phase.endDate
  ) {
    return "outside" as const;
  }

  return null;
};

export function ProjectCostsPage({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const {
    displayCurrency,
    exchangeRateBasis,
    exchangeRateSnapshot,
    formatAmount,
    isRateUpdating,
    isReady: isCurrencyReady,
    setDisplayCurrency
  } = useCostDisplayCurrency();
  const [data, setData] = useState<ProjectCostsData | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<ProjectBudget | null>(null);
  const [budgetBaseline, setBudgetBaseline] = useState<ProjectBudget | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [budgetMessage, setBudgetMessage] = useState("");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const approvedNavigationRef = useRef(false);

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function load() {
      const [project, costs, summary, people, tools, costTemplates] = await Promise.all([
        projectsApi.getProject(projectId),
        costsApi.listProjectCosts(projectId),
        costsApi.getProjectCostSummary(projectId, displayCurrency, exchangeRateSnapshot),
        librariesApi.listPeople(),
        librariesApi.listTools(),
        librariesApi.listCostTemplates()
      ]);

      if (isMounted) {
        setData({ project, costs, summary, people, tools, costTemplates });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [displayCurrency, exchangeRateSnapshot, isCurrencyReady, projectId]);

  useEffect(() => {
    setBudgetDraft(null);
    setBudgetBaseline(null);
    setBudgetOpen(false);
    setBudgetMessage("");
    setLeaveConfirmOpen(false);
    setDiscardConfirmOpen(false);
    pendingNavigationRef.current = null;
  }, [projectId]);

  const actualCosts = useMemo(
    () => data?.costs.filter((cost) => cost.isActual) ?? [],
    [data?.costs]
  );
  const isBudgetDirty = useMemo(
    () => Boolean(
      budgetDraft &&
      budgetBaseline &&
      JSON.stringify(budgetDraft) !== JSON.stringify(budgetBaseline)
    ),
    [budgetBaseline, budgetDraft]
  );
  const maxCategory = Math.max(1, ...Object.values(data?.summary.byCategory ?? {}));

  useEffect(() => {
    if (!isBudgetDirty) {
      return;
    }

    // Browsers require their own native prompt for refresh/tab-close and do not
    // allow an application-styled dialog in the beforeunload lifecycle.
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBudgetDirty]);

  const confirmBudgetNavigation = useCallback(
    (proceed: () => void) => {
      if (approvedNavigationRef.current) {
        approvedNavigationRef.current = false;
        return true;
      }

      if (!isBudgetDirty) {
        return true;
      }

      if (!pendingNavigationRef.current) {
        pendingNavigationRef.current = proceed;
      }
      setLeaveConfirmOpen(true);
      return false;
    },
    [isBudgetDirty]
  );

  const toggleBudgetChecklist = () => {
    if (!data) {
      return;
    }

    setBudgetMessage("");
    if (!budgetDraft) {
      const initialBudget = structuredClone(
        data.project.budget ??
        createEmptyProjectBudget(data.project.phases, data.tools, displayCurrency)
      );

      setBudgetDraft(initialBudget);
      setBudgetBaseline(structuredClone(
        data.project.budget ?? createBlankBudgetBaseline(data.project)
      ));
    }
    setBudgetOpen((current) => !current);
  };

  const resetBudgetChanges = () => {
    setBudgetDraft(null);
    setBudgetBaseline(null);
    setBudgetOpen(false);
    setBudgetMessage("");
  };

  const discardBudgetChanges = () => {
    if (isBudgetDirty) {
      setDiscardConfirmOpen(true);
      return;
    }

    resetBudgetChanges();
  };

  const saveBudget = async (target?: ProjectBudgetSaveTarget) => {
    if (!data || !budgetDraft || isSavingBudget) {
      return false;
    }

    const usageIssues = budgetDraft.phases.flatMap((phaseBudget) => {
      if (target && target.kind !== "personnel" && target.kind !== "softwareCost") {
        return [];
      }
      if (target && target.phaseId !== phaseBudget.phaseId) {
        return [];
      }

      const phase = data.project.phases.find((item) => item.id === phaseBudget.phaseId);
      if (!phase) {
        return ["outside" as const];
      }

      const personnelIssues = phaseBudget.personnel.flatMap((line) => {
        if (
          line.headcount <= 0 ||
          line.hourlyRate <= 0 ||
          (target?.kind === "personnel" && target.lineId !== line.id) ||
          target?.kind === "softwareCost"
        ) {
          return [];
        }
        const issue = getUsageValidationIssue(line, phase);
        return issue ? [issue] : [];
      });
      const softwareIssues = phaseBudget.softwareCosts.flatMap((line) => {
        if (
          line.amount <= 0 ||
          (target?.kind === "softwareCost" && target.lineId !== line.id) ||
          target?.kind === "personnel"
        ) {
          return [];
        }
        const issue = getUsageValidationIssue(line, phase);
        return issue ? [issue] : [];
      });

      return [...personnelIssues, ...softwareIssues];
    });

    if (usageIssues.length > 0) {
      setBudgetMessage(t(
        usageIssues.includes("outside")
          ? "projectBudgetUsageOutsidePhase"
          : "projectBudgetUsageRangeRequired"
      ));
      return false;
    }

    const budgetToSave = target
      ? mergeBudgetSaveTarget(
          budgetBaseline ?? createBlankBudgetBaseline(data.project),
          budgetDraft,
          target
        )
      : budgetDraft;

    setIsSavingBudget(true);
    setBudgetMessage("");

    try {
      const project = await projectsApi.updateProjectBudget(data.project.id, budgetToSave);
      const [costs, summary] = await Promise.all([
        costsApi.listProjectCosts(data.project.id),
        costsApi.getProjectCostSummary(data.project.id, displayCurrency, exchangeRateSnapshot)
      ]);
      setData((current) => current ? { ...current, project, costs, summary } : current);
      const savedBudget = structuredClone(project.budget ?? budgetToSave);
      if (!target) {
        setBudgetDraft(savedBudget);
      }
      setBudgetBaseline(structuredClone(savedBudget));
      setBudgetOpen(true);
      setBudgetMessage(t("projectBudgetSaved"));
      return true;
    } catch {
      setBudgetMessage(t("projectBudgetSaveError"));
      return false;
    } finally {
      setIsSavingBudget(false);
    }
  };

  return (
    <AppShell beforeNavigate={confirmBudgetNavigation}>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
              <Card
                tone="dark"
                className="image-vignette relative overflow-hidden bg-cover bg-center p-6 text-white sm:p-8"
                style={{ backgroundImage: `url(${data.project.coverImage})` }}
              >
                <div className="relative z-10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <p className="text-sm font-black uppercase text-white/70">{t("costsPrivateTitle")}</p>
                    <CostCurrencySelector
                      currency={displayCurrency}
                      exchangeRateBasis={exchangeRateBasis}
                      exchangeRateSnapshot={exchangeRateSnapshot}
                      isRateUpdating={isRateUpdating}
                      onCurrencyChange={setDisplayCurrency}
                    />
                  </div>
                  <h1 className="mt-4 max-w-4xl text-lg font-black leading-[0.96] sm:text-3xl">
                    {formatDemoEntityName(
                      translateDomainLabel(data.project.name, projectNameKeys, t),
                      data.project.id,
                      "project",
                      t,
                      data.project.isExample
                    )}
                  </h1>
                  <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-white/80">
                    {t("projectBudgetCostsBody")}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={projectPath(data.project.id)}
                      prefetch={false}
                      onNavigate={(event) => {
                        if (!confirmBudgetNavigation(() => router.push(projectPath(data.project.id)))) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <Button variant="ghost" size="md">
                        <ArrowLeft size={18} />
                        {t("projectWorkspace")}
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricTile label={t("actualCostSoFar")} value={formatAmount(data.summary.actualCostSoFar, data.summary.currency)} icon={CircleDollarSign} tone="lime" />
                <MetricTile label={t("projectBudgetCost")} value={formatAmount(data.summary.budgetCostTotal, data.summary.currency)} icon={Calculator} tone="aqua" />
                <MetricTile label={t("plannedReceivable")} value={formatAmount(data.summary.plannedReceivable, data.summary.currency)} icon={ReceiptText} tone="dark" />
                <MetricTile label={t("receivedPayment")} value={formatAmount(data.summary.receivedRevenue, data.summary.currency)} icon={Banknote} tone="aqua" />
                <MetricTile
                  label={t("currentProfit")}
                  value={formatAmount(data.summary.actualProfit, data.summary.currency)}
                  icon={TrendingUp}
                  tone={data.summary.actualProfit >= 0 ? "lime" : "coral"}
                />
                <MetricTile label={t("projectedProfit")} value={formatAmount(data.summary.projectedProfit, data.summary.currency)} icon={TrendingUp} tone={data.summary.projectedProfit >= 0 ? "aqua" : "coral"} />
              </div>
            </section>

            {data.project.timelineConfigured === false ? (
              <section className="mt-6 rounded-studio bg-[#92bad5] p-5 shadow-soft sm:p-6">
                <p className="text-sm font-black uppercase text-ink/55">{t("projectBudgetPhaseTwo")}</p>
                <h2 className="mt-2 text-2xl font-black text-ink">{t("projectBudgetTimelineRequired")}</h2>
                <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-ink/70">
                  {t("projectBudgetTimelineRequiredBody")}
                </p>
                <Link href={projectPath(data.project.id)} prefetch={false} className="mt-4 inline-flex">
                  <Button type="button" variant="secondary" size="sm">
                    <ArrowLeft size={16} />
                    {t("projectWorkspace")}
                  </Button>
                </Link>
              </section>
            ) : (
            <section className="mt-6 overflow-hidden rounded-studio bg-white shadow-soft ring-1 ring-black/[0.04]">
              <button
                type="button"
                aria-expanded={budgetOpen}
                aria-controls="project-budget-checklist-content"
                onClick={toggleBudgetChecklist}
                className="flex w-full items-center justify-between gap-4 bg-[#92bad5] p-4 text-left transition hover:bg-[#a4c7df] sm:p-6"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ffc700] text-ink">
                    <Calculator size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xl font-black text-ink">{t("projectBudgetPlanner")}</span>
                    <span className="mt-1 block text-sm font-bold leading-6 text-muted">
                      {t("projectBudgetChecklistCollapsedBody")}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      "hidden rounded-full px-3 py-1.5 text-xs font-black sm:inline-flex",
                      isBudgetDirty ? "bg-coral text-white" : "bg-cloud text-muted"
                    )}
                  >
                    {isBudgetDirty
                      ? t("projectBudgetUnsaved")
                      : data.project.budget
                        ? t("projectBudgetSavedState")
                        : t("noProjectBudget")}
                  </span>
                  <span className="grid size-10 place-items-center rounded-full bg-ink text-white">
                    <ChevronDown
                      size={19}
                      className={cn("transition-transform", budgetOpen && "rotate-180")}
                    />
                  </span>
                </span>
              </button>

              {budgetOpen && budgetDraft ? (
                <div id="project-budget-checklist-content" className="border-t border-black/[0.06] p-4 sm:p-6">
                  <ProjectBudgetEditor
                    value={budgetDraft}
                    onChange={setBudgetDraft}
                    phases={data.project.phases}
                    tools={data.tools}
                    people={data.people}
                    costTemplates={data.costTemplates}
                    showHeader={false}
                    savedValue={data.project.budget ? budgetBaseline : null}
                    onSave={saveBudget}
                    isSaving={isSavingBudget}
                    displayCurrency={displayCurrency}
                    exchangeRateSnapshot={exchangeRateSnapshot}
                    formatAmount={formatAmount}
                  />
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-studio bg-[#26cbd1] p-4">
                    <p className="max-w-2xl text-sm font-bold leading-6 text-[#62717a]">
                      {t("projectBudgetSaveReminder")}
                    </p>
                    <div className="flex flex-wrap justify-end gap-3">
                      <Button type="button" variant="ghost" size="sm" className="w-36 justify-center whitespace-nowrap px-4 text-xs" onClick={discardBudgetChanges}>
                        {t("discardProjectBudgetChanges")}
                      </Button>
                      <Button type="button" size="sm" className="w-36 justify-center whitespace-nowrap px-4 text-xs" onClick={() => void saveBudget()} disabled={isSavingBudget || !isBudgetDirty}>
                        <Save size={18} />
                        {t("saveProjectBudget")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
            )}

            {data.project.timelineConfigured !== false && budgetMessage ? (
              <p className="mt-4 rounded-full bg-limepop px-4 py-3 text-sm font-black text-ink" role="status">
                {budgetMessage}
              </p>
            ) : null}

            {data.project.timelineConfigured !== false && !data.project.budget ? (
              <p className="mt-4 rounded-studio bg-aqua/60 p-4 text-sm font-bold leading-6 text-ink">
                {t("legacyProjectBudget")}
              </p>
            ) : null}

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(320px,0.42fr)]">
              <Card tone="white" className="bg-[#D03D01] p-5 sm:p-6">
                <SectionHeader
                  eyebrow={t("privateCost")}
                  title={t("actualCostRecords")}
                  eyebrowClassName="text-[#ebe4cf]"
                />
                <p className="mt-3 text-sm font-bold leading-6 text-[#ebe4cf]">{t("actualCostRecordsBody")}</p>
                <div className="mt-4 grid gap-3">
                  {actualCosts.map((cost) => (
                    <div key={cost.id} className="rounded-studio bg-cloud/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-black">{t(costCategoryKeys[cost.category])}</p>
                          <h3 className="mt-1 text-xl font-black">{cost.name}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black">
                            {formatAmount(cost.amount, cost.currency)}
                          </p>
                          <p className="text-xs font-bold text-black">
                            {t(billingTypeKeys[cost.billingType])} · {t("actual")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {actualCosts.length === 0 ? (
                    <p className="rounded-studio bg-cloud/70 p-4 text-sm font-bold text-muted">
                      {t("noActualCostRecords")}
                    </p>
                  ) : null}
                </div>
              </Card>

              <Card tone="lime" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("costPulse")} title={t("projectBudgetTotal")} />
                <div className="mt-5 grid gap-4">
                  {Object.entries(data.summary.byCategory).map(([category, value]) => (
                    <div key={category}>
                      <div className="mb-2 flex items-center justify-between text-sm font-black">
                        <span>{t(budgetCostCategoryKeys[category] ?? costCategoryKeys[category as CostItem["category"]] ?? "costCategoryOther")}</span>
                        <span>{formatAmount(value, data.summary.currency)}</span>
                      </div>
                      <ProgressBar value={(value / maxCategory) * 100} className="bg-white/70" barClassName="bg-ink" />
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </>
        )}
      </div>
      <ActionConfirmDialog
        open={leaveConfirmOpen}
        title={t("unsavedChangesTitle")}
        description={t("projectBudgetLeaveWarning")}
        warning={t("unsavedChangesWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("leaveWithoutSaving")}
        onCancel={() => {
          pendingNavigationRef.current = null;
          setLeaveConfirmOpen(false);
        }}
        onConfirm={() => {
          const proceed = pendingNavigationRef.current;
          pendingNavigationRef.current = null;
          approvedNavigationRef.current = true;
          setLeaveConfirmOpen(false);
          resetBudgetChanges();
          proceed?.();
        }}
      />
      <ActionConfirmDialog
        open={discardConfirmOpen}
        title={t("unsavedChangesTitle")}
        description={t("discardProjectBudgetWarning")}
        warning={t("unsavedChangesWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDiscardChanges")}
        onCancel={() => setDiscardConfirmOpen(false)}
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          resetBudgetChanges();
        }}
      />
    </AppShell>
  );
}
