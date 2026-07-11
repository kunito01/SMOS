"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, BarChart3, CircleDollarSign, ReceiptText, TrendingUp } from "lucide-react";
import { CostCurrencySelector } from "@/components/costs/cost-currency-selector";
import { PixelUnderseaScene } from "@/components/costs/pixel-undersea-scene";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { costsApi, groupsApi, projectsApi } from "@/lib/api";
import type { CostSummary, ProjectCostSummary } from "@/lib/api/costs";
import {
  costCategoryKeys,
  formatDemoEntityName,
  getProjectGroupDisplayName,
  projectNameKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { CostItem, Project, ProjectGroup } from "@/lib/types";

type GlobalCostsData = {
  projects: Project[];
  groups: ProjectGroup[];
  globalSummary: CostSummary;
  projectSummaries: ProjectCostSummary[];
};

const groupCostCardToneClasses: Record<string, string> = {
  aqua: "bg-aqua/70 text-ink",
  lime: "bg-limepop/70 text-ink"
};

export function GlobalCostsPage() {
  const { language, t } = useI18n();
  const {
    displayCurrency,
    exchangeRateBasis,
    exchangeRateSnapshot,
    formatAmount,
    isRateUpdating,
    isReady: isCurrencyReady,
    setDisplayCurrency
  } = useCostDisplayCurrency();
  const [data, setData] = useState<GlobalCostsData | null>(null);

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function load() {
      const [projects, groups, globalSummary] = await Promise.all([
        projectsApi.listProjects(),
        groupsApi.listGroups(),
        costsApi.getGlobalCostSummary(displayCurrency, exchangeRateSnapshot)
      ]);
      const projectSummaries = await Promise.all(
        projects.map((project) =>
          costsApi.getProjectCostSummary(project.id, displayCurrency, exchangeRateSnapshot)
        )
      );

      if (isMounted) {
        setData({ projects, groups, globalSummary, projectSummaries });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [displayCurrency, exchangeRateSnapshot, isCurrencyReady]);

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
            <section>
              <Card tone="coral" className="relative min-h-[34rem] overflow-hidden bg-[#072451] p-6 sm:p-8">
                <PixelUnderseaScene />
                <div className="costs-undersea-copy-wash" />
                <div className="relative z-10 flex min-h-[30rem] flex-col justify-between gap-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <p className="text-sm font-black uppercase text-cyan-50/70 drop-shadow-[0_1px_0_rgba(111,221,255,0.24)]">{t("costsHeroEyebrow")}</p>
                      <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] text-cyan-50 drop-shadow-[0_3px_0_rgba(2,14,36,0.32)] sm:text-6xl">
                        {t("globalCostsTitle")}
                      </h1>
                      <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-cyan-50/80 drop-shadow-[0_1px_0_rgba(2,14,36,0.32)]">
                        {t("globalCostsBody")}
                      </p>
                    </div>
                    <CostCurrencySelector
                      currency={displayCurrency}
                      exchangeRateBasis={exchangeRateBasis}
                      exchangeRateSnapshot={exchangeRateSnapshot}
                      isRateUpdating={isRateUpdating}
                      onCurrencyChange={setDisplayCurrency}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
                    {[
                      {
                        label: t("actualCostSoFar"),
                        value: formatAmount(data.globalSummary.actualCostSoFar, data.globalSummary.currency),
                        icon: CircleDollarSign,
                        className: "bg-[#1C4D7A] text-[#8be0e2]"
                      },
                      {
                        label: t("futureEstimatedCost"),
                        value: formatAmount(data.globalSummary.futureEstimatedCost, data.globalSummary.currency),
                        icon: BarChart3,
                        className: "bg-[#1C4D7A] text-[#8be0e2]"
                      },
                      {
                        label: t("plannedReceivable"),
                        value: formatAmount(data.globalSummary.plannedReceivable, data.globalSummary.currency),
                        icon: ReceiptText,
                        className: "bg-[#c8c078] text-[#d15a30]"
                      },
                      {
                        label: t("receivedPayment"),
                        value: formatAmount(data.globalSummary.receivedRevenue, data.globalSummary.currency),
                        icon: Banknote,
                        className: "bg-[#c8c078] text-[#d15a30]"
                      },
                      {
                        label: t("currentProfit"),
                        value: formatAmount(data.globalSummary.actualProfit, data.globalSummary.currency),
                        icon: TrendingUp,
                        className: "bg-[#8D3244] text-[#c8c078]"
                      }
                    ].map((item) => {
                      const Icon = item.icon;

                      return (
                        <div
                          key={item.label}
                          className={`companies-hero-metric-glass min-h-32 rounded-studio p-4 shadow-soft ring-1 ring-white/[0.56] backdrop-blur-xl ${item.className ?? "bg-white/[0.38] text-ink"}`}
                        >
                          <div className="flex h-full flex-col justify-between gap-4">
                            <span className="grid size-10 place-items-center rounded-full bg-white/58 text-ink shadow-sm ring-1 ring-white/50">
                              <Icon size={18} />
                            </span>
                            <div>
                              <p className="text-3xl font-black leading-none sm:text-4xl">{item.value}</p>
                              <p className="mt-2 text-sm font-black text-current/70">{item.label}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
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
                        <div
                          className={`rounded-studio p-4 transition duration-200 hover:-translate-y-1 ${
                            groupCostCardToneClasses[group?.colorTheme ?? ""] ?? "bg-cloud/70 text-ink"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-muted">
                                {group ? getProjectGroupDisplayName(group, language, t) : ""}
                              </p>
                              <h3 className="mt-1 text-xl font-black">
                                {formatDemoEntityName(
                                  translateDomainLabel(project.name, projectNameKeys, t),
                                  project.id,
                                  "project",
                                  t
                                )}
                              </h3>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-black">
                                {formatAmount(summary?.totalProjectCost ?? 0, summary?.currency ?? displayCurrency)}
                              </p>
                              <p className="mt-1 text-sm font-bold text-muted">
                                {t("currentProfit")}: {formatAmount(summary?.actualProfit ?? 0, summary?.currency ?? displayCurrency)}
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

              <Card tone="lime" className="bg-[#ffc700] p-5 sm:p-6">
                <SectionHeader eyebrow={t("costPulse")} title={t("privateCost")} />
                <div className="mt-5 grid gap-4">
                  {Object.entries(data.globalSummary.byCategory).map(([category, value]) => (
                    <div key={category}>
                      <div className="mb-2 flex items-center justify-between text-sm font-black">
                        <span>{t(costCategoryKeys[category as CostItem["category"]])}</span>
                        <span>{formatAmount(value, data.globalSummary.currency)}</span>
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
