"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, BarChart3, CalendarDays, CircleDollarSign, ReceiptText, TrendingUp } from "lucide-react";
import { MetricTile } from "@/components/domain/metric-tile";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { costsApi, projectsApi } from "@/lib/api";
import {
  billingTypeKeys,
  costCategoryKeys,
  projectNameKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { CostItem, Project } from "@/lib/types";
import { toCny } from "@/lib/utils/money";

type CostSummary = {
  projectId: string;
  actualCostSoFar: number;
  futureEstimatedCost: number;
  totalProjectCost: number;
  plannedReceivable: number;
  receivedRevenue: number;
  actualProfit: number;
  projectedProfit: number;
  byCategory: Record<string, number>;
};

type ProjectCostsData = {
  project: Project;
  costs: CostItem[];
  summary: CostSummary;
};

const formatCurrency = (value: number, currency = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);

export function ProjectCostsPage({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<ProjectCostsData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [project, costs, summary] = await Promise.all([
        projectsApi.getProject(projectId),
        costsApi.listProjectCosts(projectId),
        costsApi.getProjectCostSummary(projectId)
      ]);

      if (isMounted) {
        setData({ project, costs, summary });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const monthlyEstimate = useMemo(
    () =>
      data?.costs
        .filter((cost) => cost.billingType === "monthly")
        .reduce((sum, cost) => sum + toCny(cost.amount, cost.currency), 0) ?? 0,
    [data?.costs]
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
                <p className="text-sm font-black uppercase text-white/55">{t("costsPrivateTitle")}</p>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] sm:text-6xl">
                  {translateDomainLabel(data.project.name, projectNameKeys, t)}
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
                <MetricTile label={t("actualCostSoFar")} value={formatCurrency(data.summary.actualCostSoFar)} icon={CircleDollarSign} tone="lime" />
                <MetricTile label={t("futureEstimatedCost")} value={formatCurrency(data.summary.futureEstimatedCost)} icon={BarChart3} tone="aqua" />
                <MetricTile label={t("plannedReceivable")} value={formatCurrency(data.summary.plannedReceivable)} icon={ReceiptText} tone="dark" />
                <MetricTile label={t("receivedPayment")} value={formatCurrency(data.summary.receivedRevenue)} icon={Banknote} tone="aqua" />
                <MetricTile
                  label={t("currentProfit")}
                  value={formatCurrency(data.summary.actualProfit)}
                  icon={TrendingUp}
                  tone={data.summary.actualProfit >= 0 ? "lime" : "coral"}
                />
                <MetricTile label={t("monthlyEstimate")} value={formatCurrency(monthlyEstimate)} icon={CalendarDays} tone="coral" />
              </div>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(320px,0.42fr)]">
              <Card tone="white" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("privateCost")} title={t("projectCostItems")} />
                <div className="mt-5 grid gap-3">
                  {data.costs.map((cost) => (
                    <div key={cost.id} className="rounded-studio bg-cloud/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-muted">{t(costCategoryKeys[cost.category])}</p>
                          <h3 className="mt-1 text-xl font-black">{cost.name}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black">{formatCurrency(cost.amount, cost.currency)}</p>
                          <p className="text-xs font-bold text-muted">
                            {t(billingTypeKeys[cost.billingType])} · {cost.isActual ? t("actual") : t("estimated")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card tone="lime" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("costPulse")} title={t("privateCost")} />
                <div className="mt-5 grid gap-4">
                  {Object.entries(data.summary.byCategory).map(([category, value]) => (
                    <div key={category}>
                      <div className="mb-2 flex items-center justify-between text-sm font-black">
                        <span>{t(costCategoryKeys[category as CostItem["category"]])}</span>
                        <span>{formatCurrency(value)}</span>
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
