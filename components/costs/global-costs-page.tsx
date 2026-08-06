"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Calculator, ChevronDown, ChevronUp, CircleDollarSign, ReceiptText, TrendingUp } from "lucide-react";
import { CostCurrencySelector } from "@/components/costs/cost-currency-selector";
import { PixelUnderseaScene } from "@/components/costs/pixel-undersea-scene";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, costsApi, groupsApi, projectsApi } from "@/lib/api";
import type { CostSummary, ProjectCostSummary } from "@/lib/api/costs";
import {
  budgetCostCategoryKeys,
  costCategoryKeys,
  formatDemoEntityName,
  getProjectGroupDisplayName,
  projectNameKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { Company, CostItem, Project, ProjectGroup } from "@/lib/types";
import { projectCostsPath } from "@/lib/utils/app-routes";

type GlobalCostsData = {
  companies: Company[];
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
  const [collapsedCompanyIds, setCollapsedCompanyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function load() {
      const [companies, projects, groups, globalSummary] = await Promise.all([
        companiesApi.listCompanies(),
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
        setData({ companies, projects, groups, globalSummary, projectSummaries });
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
  const groupById = useMemo(
    () => new Map((data?.groups ?? []).map((group) => [group.id, group])),
    [data?.groups]
  );
  const companyBuckets = useMemo(() => {
    const projects = data?.projects ?? [];
    const buckets = (data?.companies ?? [])
      .map((company) => ({
        id: company.id,
        name: formatDemoEntityName(company.name, company.id, "company", t),
        logoImage: company.logoImage,
        projects: projects.filter((project) => project.companyId === company.id)
      }))
      .filter((bucket) => bucket.projects.length > 0);
    const knownCompanyIds = new Set((data?.companies ?? []).map((company) => company.id));
    const unassigned = projects.filter(
      (project) => !project.companyId || !knownCompanyIds.has(project.companyId)
    );

    if (unassigned.length) {
      buckets.push({ id: "unassigned", name: t("unassignedGroup"), logoImage: undefined, projects: unassigned });
    }

    return buckets;
  }, [data?.companies, data?.projects, t]);
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
                        {t("globalBudgetCostsBody")}
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
                        label: t("projectBudgetTotal"),
                        value: formatAmount(data.globalSummary.budgetCostTotal, data.globalSummary.currency),
                        icon: Calculator,
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
                <div className="mt-5 grid gap-4">
                  {companyBuckets.map((bucket) => {
                    const isCollapsed = collapsedCompanyIds.has(bucket.id);

                    return (
                      <div key={bucket.id} className="min-w-0 rounded-studio bg-cloud/45 p-3 ring-1 ring-black/[0.04]">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedCompanyIds((current) => {
                              const next = new Set(current);
                              if (next.has(bucket.id)) {
                                next.delete(bucket.id);
                              } else {
                                next.add(bucket.id);
                              }
                              return next;
                            })
                          }
                          aria-expanded={!isCollapsed}
                          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl px-1 py-1 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            {bucket.logoImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={bucket.logoImage} alt="" className="h-7 w-auto max-w-24 shrink-0 object-contain" />
                            ) : null}
                            <span className="truncate text-lg font-black">{bucket.name}</span>
                            <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-black text-muted ring-1 ring-black/[0.05]">
                              {bucket.projects.length}
                            </span>
                          </span>
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-ink shadow-sm ring-1 ring-black/[0.05]">
                            {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
                          </span>
                        </button>
                        <div className={isCollapsed ? "hidden" : "mt-3 grid gap-3 sm:grid-cols-2"}>
                          {bucket.projects.map((project) => (
                            <Link key={project.id} href={projectCostsPath(project.id)} prefetch={false}>
                              <div
                                className={`h-full rounded-studio p-4 transition duration-200 hover:-translate-y-1 ${
                                  groupCostCardToneClasses[groupById.get(project.groupId)?.colorTheme ?? ""] ?? "bg-cloud/70 text-ink"
                                }`}
                              >
                                <p className="text-sm font-bold text-muted">
                                  {groupById.get(project.groupId)
                                    ? getProjectGroupDisplayName(groupById.get(project.groupId)!, language, t)
                                    : ""}
                                </p>
                                <h3 className="mt-1 break-words text-xl font-black">
                                  {formatDemoEntityName(
                                    translateDomainLabel(project.name, projectNameKeys, t),
                                    project.id,
                                    "project",
                                    t,
                                    project.isExample
                                  )}
                                </h3>
                                <p className="mt-3 text-2xl font-black tabular-nums">
                                  {formatAmount(
                                    projectSummaryById.get(project.id)?.budgetCostTotal ?? 0,
                                    projectSummaryById.get(project.id)?.currency ?? displayCurrency
                                  )}
                                </p>
                                <p className="mt-1 text-sm font-bold text-muted">
                                  {t("currentProfit")}: {formatAmount(
                                    projectSummaryById.get(project.id)?.actualProfit ?? 0,
                                    projectSummaryById.get(project.id)?.currency ?? displayCurrency
                                  )}
                                </p>
                                <span className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-limepop px-4 text-sm font-semibold text-ink">
                                  {t("openCosts")}
                                  <ArrowRight size={16} />
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card tone="lime" className="bg-[#ffc700] p-5 sm:p-6">
                <SectionHeader eyebrow={t("costPulse")} title={t("projectBudgetTotal")} />
                <div className="mt-5 grid gap-4">
                  {Object.entries(data.globalSummary.byCategory).map(([category, value]) => (
                    <div key={category}>
                      <div className="mb-2 flex items-center justify-between text-sm font-black">
                        <span>{t(budgetCostCategoryKeys[category] ?? costCategoryKeys[category as CostItem["category"]] ?? "costCategoryOther")}</span>
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
