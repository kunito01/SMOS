"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, BarChart3, CalendarDays, CircleDollarSign, ReceiptText, TrendingUp } from "lucide-react";
import { CostCurrencySelector } from "@/components/costs/cost-currency-selector";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { MetricTile } from "@/components/domain/metric-tile";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { costsApi, projectsApi } from "@/lib/api";
import type { ProjectCostSummary } from "@/lib/api/costs";
import {
  billingTypeKeys,
  costCategoryKeys,
  formatDemoEntityName,
  projectNameKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { CostItem, Project } from "@/lib/types";

type ProjectCostsData = {
  project: Project;
  costs: CostItem[];
  summary: ProjectCostSummary;
};

export function ProjectCostsPage({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const {
    convertToDisplayCurrency,
    displayCurrency,
    exchangeRateBasis,
    exchangeRateSnapshot,
    formatAmount,
    formatInDisplayCurrency,
    isRateUpdating,
    isReady: isCurrencyReady,
    setDisplayCurrency
  } = useCostDisplayCurrency();
  const [data, setData] = useState<ProjectCostsData | null>(null);

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function load() {
      const [project, costs, summary] = await Promise.all([
        projectsApi.getProject(projectId),
        costsApi.listProjectCosts(projectId),
        costsApi.getProjectCostSummary(projectId, displayCurrency, exchangeRateSnapshot)
      ]);

      if (isMounted) {
        setData({ project, costs, summary });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [displayCurrency, exchangeRateSnapshot, isCurrencyReady, projectId]);

  const monthlyEstimate = useMemo(
    () =>
      data?.costs
        .filter((cost) => cost.billingType === "monthly")
        .reduce((sum, cost) => sum + convertToDisplayCurrency(cost.amount, cost.currency), 0) ?? 0,
    [convertToDisplayCurrency, data?.costs]
  );
  const maxCategory = Math.max(1, ...Object.values(data?.summary.byCategory ?? {}));

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
              <Card tone="dark" className="relative overflow-hidden p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <p className="text-sm font-black uppercase text-white/55">{t("costsPrivateTitle")}</p>
                  <CostCurrencySelector
                    currency={displayCurrency}
                    exchangeRateBasis={exchangeRateBasis}
                    exchangeRateSnapshot={exchangeRateSnapshot}
                    isRateUpdating={isRateUpdating}
                    onCurrencyChange={setDisplayCurrency}
                  />
                </div>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] sm:text-6xl">
                  {formatDemoEntityName(
                    translateDomainLabel(data.project.name, projectNameKeys, t),
                    data.project.id,
                    "project",
                    t
                  )}
                </h1>
                <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-white/65">
                  {t("costsPrivateBody")}
                </p>
                <div className="mt-6">
                  <Link href={`/projects/${data.project.id}`} prefetch={false}>
                    <Button variant="ghost" size="md">
                      <ArrowLeft size={18} />
                      {t("projectWorkspace")}
                    </Button>
                  </Link>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricTile label={t("actualCostSoFar")} value={formatAmount(data.summary.actualCostSoFar, data.summary.currency)} icon={CircleDollarSign} tone="lime" />
                <MetricTile label={t("futureEstimatedCost")} value={formatAmount(data.summary.futureEstimatedCost, data.summary.currency)} icon={BarChart3} tone="aqua" />
                <MetricTile label={t("plannedReceivable")} value={formatAmount(data.summary.plannedReceivable, data.summary.currency)} icon={ReceiptText} tone="dark" />
                <MetricTile label={t("receivedPayment")} value={formatAmount(data.summary.receivedRevenue, data.summary.currency)} icon={Banknote} tone="aqua" />
                <MetricTile
                  label={t("currentProfit")}
                  value={formatAmount(data.summary.actualProfit, data.summary.currency)}
                  icon={TrendingUp}
                  tone={data.summary.actualProfit >= 0 ? "lime" : "coral"}
                />
                <MetricTile label={t("monthlyEstimate")} value={formatAmount(monthlyEstimate, displayCurrency)} icon={CalendarDays} tone="coral" />
              </div>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(320px,0.42fr)]">
              <Card tone="white" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("privateCost")} title={t("projectCostItems")} />
                <div className="mt-5 grid gap-3">
                  {data.costs.map((cost) => {
                    const showOriginalAmount = cost.currency !== displayCurrency;

                    return (
                      <div key={cost.id} className="rounded-studio bg-cloud/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-muted">{t(costCategoryKeys[cost.category])}</p>
                            <h3 className="mt-1 text-xl font-black">{cost.name}</h3>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black">
                              {formatInDisplayCurrency(cost.amount, cost.currency)}
                            </p>
                            {showOriginalAmount ? (
                              <p className="mt-1 text-xs font-bold text-muted">
                                {t("originalCurrencyAmount")}: {formatAmount(cost.amount, cost.currency)}
                              </p>
                            ) : null}
                            <p className="text-xs font-bold text-muted">
                              {t(billingTypeKeys[cost.billingType])} · {cost.isActual ? t("actual") : t("estimated")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card tone="lime" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("costPulse")} title={t("privateCost")} />
                <div className="mt-5 grid gap-4">
                  {Object.entries(data.summary.byCategory).map(([category, value]) => (
                    <div key={category}>
                      <div className="mb-2 flex items-center justify-between text-sm font-black">
                        <span>{t(costCategoryKeys[category as CostItem["category"]])}</span>
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
    </AppShell>
  );
}
