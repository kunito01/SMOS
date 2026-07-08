"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, BarChart3, CircleDollarSign, Layers3, ReceiptText, TrendingUp } from "lucide-react";
import { MetricTile } from "@/components/domain/metric-tile";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { costsApi, groupsApi, projectsApi } from "@/lib/api";
import { costCategoryKeys, groupNameKeys, projectNameKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import type { CostItem, Project, ProjectGroup } from "@/lib/types";

type CostSummary = {
  actualCostSoFar: number;
  futureEstimatedCost: number;
  totalProjectCost: number;
  plannedReceivable: number;
  receivedRevenue: number;
  actualProfit: number;
  projectedProfit: number;
  byCategory: Record<string, number>;
};

type ProjectCostSummary = {
  projectId: string;
  actualCostSoFar: number;
  futureEstimatedCost: number;
  totalProjectCost: number;
  plannedReceivable: number;
  receivedRevenue: number;
  actualProfit: number;
  projectedProfit: number;
};

type GlobalCostsData = {
  projects: Project[];
  groups: ProjectGroup[];
  globalSummary: CostSummary;
  projectSummaries: ProjectCostSummary[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    currency: "CNY",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);

export function GlobalCostsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<GlobalCostsData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [projects, groups, globalSummary] = await Promise.all([
        projectsApi.listProjects(),
        groupsApi.listGroups(),
        costsApi.getGlobalCostSummary()
      ]);
      const projectSummaries = await Promise.all(
        projects.map((project) => costsApi.getProjectCostSummary(project.id))
      );

      if (isMounted) {
        setData({ projects, groups, globalSummary, projectSummaries });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const projectSummaryById = useMemo(
    () => new Map((data?.projectSummaries ?? []).map((summary) => [summary.projectId, summary])),
    [data?.projectSummaries]
  );
  const maxCategory = Math.max(1, ...Object.values(data?.globalSummary.byCategory ?? {}));

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
              <Card tone="coral" className="relative overflow-hidden p-6 sm:p-8">
                <p className="text-sm font-black uppercase text-white/65">{t("privateCost")}</p>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] sm:text-6xl">
                  {t("globalCostsTitle")}
                </h1>
                <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-white/75">
                  {t("globalCostsBody")}
                </p>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricTile label={t("actualCostSoFar")} value={formatCurrency(data.globalSummary.actualCostSoFar)} icon={CircleDollarSign} tone="lime" />
                <MetricTile label={t("futureEstimatedCost")} value={formatCurrency(data.globalSummary.futureEstimatedCost)} icon={BarChart3} tone="aqua" />
                <MetricTile label={t("plannedReceivable")} value={formatCurrency(data.globalSummary.plannedReceivable)} icon={ReceiptText} tone="dark" />
                <MetricTile label={t("receivedPayment")} value={formatCurrency(data.globalSummary.receivedRevenue)} icon={Banknote} tone="aqua" />
                <MetricTile
                  label={t("currentProfit")}
                  value={formatCurrency(data.globalSummary.actualProfit)}
                  icon={TrendingUp}
                  tone={data.globalSummary.actualProfit >= 0 ? "lime" : "coral"}
                />
                <MetricTile label={t("projectsCount")} value={data.projects.length} icon={Layers3} tone="dark" />
              </div>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(320px,0.42fr)]">
              <Card tone="white" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("projectCostItems")} title={t("creativeProjects")} />
                <div className="mt-5 grid gap-3">
                  {data.projects.map((project) => {
                    const summary = projectSummaryById.get(project.id);
                    const group = data.groups.find((item) => item.id === project.groupId);

                    return (
                      <Link key={project.id} href={`/projects/${project.id}/costs`} prefetch={false}>
                        <div className="rounded-studio bg-cloud/70 p-4 transition duration-200 hover:-translate-y-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-muted">
                                {translateDomainLabel(group?.name ?? "", groupNameKeys, t)}
                              </p>
                              <h3 className="mt-1 text-xl font-black">
                                {translateDomainLabel(project.name, projectNameKeys, t)}
                              </h3>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-black">{formatCurrency(summary?.totalProjectCost ?? 0)}</p>
                              <p className="mt-1 text-sm font-bold text-muted">
                                {t("currentProfit")}: {formatCurrency(summary?.actualProfit ?? 0)}
                              </p>
                              <span className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-limepop px-4 text-sm font-semibold text-ink">
                                {t("openCosts")}
                                <ArrowRight size={16} />
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>

              <Card tone="lime" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("costPulse")} title={t("privateCost")} />
                <div className="mt-5 grid gap-4">
                  {Object.entries(data.globalSummary.byCategory).map(([category, value]) => (
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
