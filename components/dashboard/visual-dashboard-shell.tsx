"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calculator,
  CalendarDays,
  ChartPie,
  CheckCircle2,
  CircleDollarSign,
  FolderKanban,
  Layers3,
  Network,
  Rocket,
  Users
} from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { PixelHeroScene } from "@/components/auth/pixel-hero-scene";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectReleaseBadges } from "@/components/projects/project-release-badges";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi, projectsApi } from "@/lib/api";
import {
  formatDemoEntityName,
  getProjectGroupDisplayName,
  projectNameKeys,
  statusKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Company, DashboardOverview, DashboardScope, Project, ProjectGroup } from "@/lib/types";
import { projectPath } from "@/lib/utils/app-routes";
import { cn } from "@/lib/utils/cn";
import { fixedNumericLocale } from "@/lib/utils/money";

const spring = {
  type: "spring",
  stiffness: 150,
  damping: 18
} as const;

type MetricValueKey = "totalProjectCount" | "activeProjectCount" | "averageProgress" | "releasedProjectCount";

const metrics: Array<{
  labelKey: TranslationKey;
  valueKey: MetricValueKey;
  valueFormat: "count" | "percent";
  tone: "aqua" | "coral" | "lime";
  icon: typeof Layers3;
}> = [
  { labelKey: "metricMapped", valueKey: "totalProjectCount", valueFormat: "count", tone: "lime", icon: Layers3 },
  { labelKey: "metricActive", valueKey: "activeProjectCount", valueFormat: "count", tone: "aqua", icon: Rocket },
  { labelKey: "metricCompleted", valueKey: "averageProgress", valueFormat: "percent", tone: "lime", icon: CheckCircle2 },
  { labelKey: "metricDue", valueKey: "releasedProjectCount", valueFormat: "count", tone: "coral", icon: CalendarDays }
];

const metricIconToneStyles = {
  aqua: "bg-aqua text-ink",
  coral: "bg-coral text-white",
  lime: "bg-limepop text-ink"
} as const;

const projectStatusTone: Record<Project["status"], "aqua" | "lime" | "coral" | "dark" | "cloud"> = {
  planning: "cloud",
  active: "coral",
  paused: "dark",
  terminated: "cloud",
  completed: "lime"
};

type DashboardData = {
  companies: Company[];
  groups: ProjectGroup[];
  projects: Project[];
};

export function VisualDashboardShell() {
  const { language, t } = useI18n();
  const {
    displayCurrency,
    exchangeRateSnapshot,
    isReady: isCurrencyReady
  } = useCostDisplayCurrency();
  const [data, setData] = useState<DashboardData | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [scope, setScope] = useState<DashboardScope>({ type: "all" });

  useEffect(() => {
    let isMounted = true;

    async function loadScopeData() {
      const [companies, groups, projects] = await Promise.all([
        companiesApi.listCompanies(),
        groupsApi.listGroups(),
        projectsApi.listProjects()
      ]);

      if (isMounted) {
        setData({ companies, groups, projects });
      }
    }

    loadScopeData();

    return () => {
      isMounted = false;
    };
  }, []);

  const scopeId = scope.type === "all" ? "" : scope.id;

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function loadDashboardOverview() {
      const nextOverview = await projectsApi.getDashboardOverview(scope, {
        currency: displayCurrency,
        snapshot: exchangeRateSnapshot
      });

      if (isMounted) {
        setOverview(nextOverview);
      }
    }

    loadDashboardOverview();

    return () => {
      isMounted = false;
    };
  }, [displayCurrency, exchangeRateSnapshot, isCurrencyReady, scope, scopeId]);

  const groupById = useMemo(
    () => new Map((data?.groups ?? []).map((group) => [group.id, group])),
    [data?.groups]
  );
  const spotlightProjects = overview?.spotlightProjects ?? [];
  const atlasProject = spotlightProjects[0];

  const scopedProjects = useMemo(() => {
    const projects = data?.projects ?? [];

    if (scope.type === "company") {
      return projects.filter((project) => project.companyId === scope.id);
    }

    if (scope.type === "group") {
      return projects.filter((project) => project.groupId === scope.id);
    }

    return projects;
  }, [data?.projects, scope]);
  const displayName = (value: string, dictionary: Record<string, TranslationKey>) =>
    translateDomainLabel(value, dictionary, t);
  const displayGroupName = (group: ProjectGroup | null | undefined) =>
    group ? getProjectGroupDisplayName(group, language, t) : "";
  const formatMetricValue = (metric: (typeof metrics)[number], value: number) => {
    if (metric.valueFormat === "percent") {
      return `${value}%`;
    }

    return String(value).padStart(2, "0");
  };
  const overviewCurrency = overview?.currency ?? displayCurrency;
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(fixedNumericLocale, {
        compactDisplay: "short",
        currency: overviewCurrency,
        maximumFractionDigits: 1,
        notation: "compact",
        style: "currency"
      }),
    [overviewCurrency]
  );
  const formatCurrency = (value: number) => currencyFormatter.format(value);
  const linkedToolCount = new Set(spotlightProjects.flatMap((project) => project.tools.map((tool) => tool.id))).size;
  const sharedProjectCount = scopedProjects.filter((project) => project.shareSettings.isEnabled).length;
  const leadPeopleCount = atlasProject?.people.length ?? 0;
  const statusSegments = [
    { key: "active", label: t("statusActive"), color: "#f94622" },
    { key: "planning", label: t("statusPlanning"), color: "#e3f596" },
    { key: "completed", label: t("statusCompleted"), color: "#8edbe8" },
    { key: "paused", label: t("statusPaused"), color: "#1c2328" },
    { key: "terminated", label: t("statusTerminated"), color: "#d4a1df" }
  ].map((segment) => ({
    ...segment,
    count: scopedProjects.filter((project) => project.status === segment.key).length
  }));
  const statusTotal = Math.max(scopedProjects.length, 1);
  let pieOffset = 0;
  const pieGradient = statusSegments.some((segment) => segment.count > 0)
    ? `conic-gradient(${statusSegments
        .filter((segment) => segment.count > 0)
        .map((segment) => {
          const start = pieOffset;
          const end = pieOffset + (segment.count / statusTotal) * 100;
          pieOffset = end;
          return `${segment.color} ${start}% ${end}%`;
        })
        .join(", ")})`
    : "conic-gradient(#e3f596 0% 100%)";
  const companyTree = (data?.companies ?? [])
    .map((company) => {
      const companyProjects = scopedProjects.filter((project) => project.companyId === company.id);
      const groupBranches = (data?.groups ?? [])
        .map((group) => ({
          group,
          projects: companyProjects.filter((project) => project.groupId === group.id)
        }))
        .filter((groupBranch) => groupBranch.projects.length > 0);
      const unassignedProjects = companyProjects.filter(
        (project) => !project.groupId || !groupById.has(project.groupId)
      );
      const groups = unassignedProjects.length
        ? [...groupBranches, { group: null, projects: unassignedProjects }]
        : groupBranches;

      return { company, groups };
    })
    .filter((companyBranch) => companyBranch.groups.length > 0);
  const opsItems = [
    {
      bodyKey: "opsPipelineHealth",
      detailKey: "opsPipelineHealthBody",
      icon: Layers3,
      tone: "bg-aqua",
      value: `${overview?.activeProjectCount ?? 0} / ${scopedProjects.length}`
    },
    {
      bodyKey: "opsCrewLoad",
      detailKey: "opsCrewLoadBody",
      icon: Users,
      tone: "bg-cloud",
      value: `${leadPeopleCount} / ${linkedToolCount}`
    },
    {
      bodyKey: "opsClientReady",
      detailKey: "opsClientReadyBody",
      icon: Network,
      tone: "bg-coral text-white",
      value: `${sharedProjectCount} / ${scopedProjects.length}`
    }
  ] as const;
  const chooseScopeType = (nextType: DashboardScope["type"]) => {
    if (nextType === "all") {
      setScope({ type: "all" });
      return;
    }

    if (nextType === "company") {
      const firstCompany = data?.companies[0];

      if (firstCompany) {
        setScope({ type: "company", id: firstCompany.id });
      }
      return;
    }

    const firstGroup = data?.groups[0];

    if (firstGroup) {
      setScope({ type: "group", id: firstGroup.id });
    }
  };
  const scopeItems =
    scope.type === "company"
      ? data?.companies ?? []
      : scope.type === "group"
        ? data?.groups ?? []
        : [];
  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto bg-white/[0.08] px-4 pb-8 backdrop-blur-sm sm:px-6 xl:px-8">
        <section>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            <Card tone="aqua" className="relative min-h-[40rem] overflow-hidden bg-[#f6b56a] p-6 sm:p-8 xl:min-h-[44rem]">
              <PixelHeroScene />
              <div className="relative z-10 flex min-h-[36rem] flex-col justify-between gap-8 xl:min-h-[40rem]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Pill tone="lime" className="bg-transparent px-0 font-black">
                      {t("dashboardLabel")}
                    </Pill>
                  </div>

                  <div className="flex max-w-full flex-nowrap items-center gap-[clamp(2px,1vw,8px)] rounded-full bg-white/45 p-[clamp(2px,0.8vw,4px)] shadow-soft ring-1 ring-white/45 backdrop-blur-xl">
                    {[
                      { type: "all", label: t("scopeAll"), icon: Layers3 },
                      { type: "company", label: t("scopeCompany"), icon: Building2 },
                      { type: "group", label: t("scopeGroup"), icon: FolderKanban }
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = scope.type === item.type;

                      return (
                        <button
                          key={item.type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => chooseScopeType(item.type as DashboardScope["type"])}
                          className={cn(
                            "inline-flex h-[clamp(28px,8vw,40px)] min-w-0 shrink items-center gap-[clamp(2px,1vw,8px)] whitespace-nowrap rounded-full px-[clamp(3px,1.6vw,16px)] text-[clamp(8px,2.5vw,14px)] font-black leading-none transition",
                            active ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-ink"
                          )}
                        >
                          <Icon className="size-[clamp(10px,3vw,17px)] shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="max-w-4xl">
                  <h1 className="max-w-4xl text-[clamp(2rem,6vw,4.5rem)] font-black leading-[0.98] text-ink drop-shadow-[0_3px_0_rgba(255,238,181,0.42)]">
                    {t("heroTitle")}
                  </h1>
                  <p className="mt-5 max-w-3xl text-[clamp(0.95rem,2vw,1.25rem)] font-bold leading-relaxed text-ink/76">
                    {t("heroBody")}
                  </p>
                  <p className="mt-3 max-w-3xl text-[clamp(0.68rem,1.35vw,0.8rem)] font-semibold italic leading-relaxed text-ink/52">
                    {t("demoCleanupNote")}
                  </p>
                  {scope.type !== "all" ? (
                    <div className="mt-4 flex max-w-full flex-wrap items-center gap-x-[clamp(2px,1vw,8px)] gap-y-[clamp(4px,1.2vw,8px)] max-[360px]:gap-x-px max-[360px]:gap-y-1">
                      <span className="whitespace-nowrap text-[clamp(8px,2.5vw,14px)] font-black leading-none text-ink/55 max-[360px]:text-[7px]">
                        {scope.type === "company" ? t("scopeChooseCompany") : t("scopeChooseGroup")}
                      </span>
                      {scopeItems.map((item) => {
                        const active = scope.id === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (scope.type === "company") {
                                setScope({ type: "company", id: item.id });
                              }

                              if (scope.type === "group") {
                                setScope({ type: "group", id: item.id });
                              }
                            }}
                            className={cn(
                              "h-[clamp(28px,8vw,40px)] min-w-0 max-w-full truncate whitespace-nowrap rounded-full px-[clamp(3px,1.6vw,16px)] text-[clamp(8px,2.5vw,14px)] font-black leading-none transition max-[360px]:h-[26px] max-[360px]:px-0.5 max-[360px]:text-[7px]",
                              active ? "bg-coral text-white shadow-soft" : "bg-white/72 text-ink hover:bg-white"
                            )}
                          >
                            {"colorTheme" in item
                              ? getProjectGroupDisplayName(item, language, t)
                              : formatDemoEntityName(item.name, item.id, "company", t)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-4 gap-[clamp(4px,1.6vw,12px)]">
                  {metrics.map((metric) => {
                    const Icon = metric.icon;
                    const value = overview?.[metric.valueKey] ?? 0;
                    const formattedValue = formatMetricValue(metric, value);

                    return (
                      <div
                        key={metric.labelKey}
                        className={cn(
                          "dashboard-hero-metric-glass relative min-w-0 overflow-hidden rounded-studio p-[clamp(4px,1.6vw,14px)] text-ink shadow-soft ring-1 ring-white/[0.46]",
                          "min-h-[clamp(96px,24vw,128px)]"
                        )}
                      >
                        <div className="flex h-full min-w-0 flex-col justify-between gap-[clamp(6px,2vw,16px)]">
                          <div className="flex min-w-0 items-start justify-between">
                            <span
                              className={cn(
                                "grid size-[clamp(24px,6vw,36px)] shrink-0 place-items-center rounded-full shadow-sm ring-1 ring-white/40",
                                metricIconToneStyles[metric.tone]
                              )}
                            >
                              <Icon className="size-[clamp(12px,3vw,16px)]" />
                            </span>
                          </div>

                          <div className="grid min-w-0 gap-[clamp(3px,1vw,8px)]">
                            <div className="min-w-0">
                              <h3 className="w-full whitespace-nowrap text-[clamp(4px,1.35vw,10px)] font-black leading-none tracking-[-0.04em] text-current/80">
                                {t(metric.labelKey)}
                              </h3>
                            </div>
                            <div className="min-w-0">
                              <p className="max-w-full whitespace-nowrap text-[clamp(1rem,5vw,2rem)] font-black leading-none tracking-[-0.03em] tabular-nums">
                                {formattedValue}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </motion.div>
        </section>

        <section className="mt-8 grid gap-4 overflow-visible min-[560px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <SectionHeader
            className="min-[560px]:col-span-2 lg:col-span-3 xl:col-span-4"
            eyebrow={t("activeMaps")}
            title={t("activeProjectsSectionTitle")}
            action={
              <Link href="/projects" prefetch={false}>
                <Button variant="ghost" size="icon" aria-label={t("browseProjects")}>
                  <ArrowRight size={21} />
                </Button>
              </Link>
            }
          />
          {spotlightProjects.map((project, index) => (
            <Link key={project.id} href={projectPath(project.id)} prefetch={false} className="block rounded-studio-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral">
              <motion.div
              key={project.id}
              className="rounded-studio-xl shadow-soft ring-1 ring-black/[0.04]"
              whileHover={{ y: -10 }}
              whileTap={{ scale: 0.98 }}
              transition={spring}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ transformOrigin: "center" }}
            >
              <ImageCard
                imageUrl={project.coverImage}
                title={formatDemoEntityName(displayName(project.name, projectNameKeys), project.id, "project", t)}
                meta={displayGroupName(groupById.get(project.groupId))}
                className="shadow-none"
                action={<ProjectReleaseBadges project={project} t={t} className="max-w-48" />}
              >
                <div className="rounded-full bg-white/[0.88] p-1">
                  <ProgressBar value={project.progress} barClassName={index === 1 ? "bg-limepop" : "bg-coral"} />
                </div>
                <Pill
                  tone={projectStatusTone[project.status]}
                  className="mt-3 min-h-7 px-3 text-xs font-black"
                >
                  {t(statusKeys[project.status])}
                </Pill>
              </ImageCard>
              </motion.div>
            </Link>
          ))}
        </section>

        <section className="mt-6">
          <Card
            tone="white"
            className="p-5 shadow-lift ring-1 ring-white/[0.34] backdrop-blur-xl sm:p-6"
            style={{ backgroundColor: "#75C3D1" }}
          >
            <SectionHeader
              eyebrow={t("studioSummary")}
              title={t("studioSummaryTitle")}
              action={
                <span className="grid size-12 place-items-center rounded-full bg-limepop">
                  <Network size={21} />
                </span>
              }
            />
            <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
              {opsItems.map((item) => {
                const Icon = item.icon;
                const isDeepBlueCard = item.bodyKey === "opsCrewLoad" || item.bodyKey === "opsClientReady";

                return (
                  <div
                    key={item.bodyKey}
                    className={cn(
                      "rounded-studio p-4 shadow-soft ring-1 ring-white/[0.38] backdrop-blur-xl",
                      isDeepBlueCard ? "bg-[#3078A4] text-[#E5D4C5]" : "bg-[#FAFCD9] text-ink"
                    )}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className={cn("grid size-10 place-items-center rounded-full", item.tone)}>
                        <Icon size={18} />
                      </span>
                      <span className="text-xl font-black">{item.value}</span>
                    </div>
                    <h3 className="text-sm font-black">{t(item.bodyKey)}</h3>
                    <p className={cn("mt-2 text-xs font-semibold leading-5", isDeepBlueCard ? "text-[#F2FFE9]" : "text-muted")}>
                      {t(item.detailKey)}
                    </p>
                  </div>
                );
              })}

              <div className="rounded-studio bg-ink p-4 text-white shadow-soft">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-limepop text-ink">
                    <CircleDollarSign size={18} />
                  </span>
                  <span className="text-xl font-black">{formatCurrency(overview?.actualCostSoFar ?? 0)}</span>
                </div>
                <h3 className="text-sm font-black">{t("actualCostSoFar")}</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-white/62">{t("costPulse")}</p>
              </div>

              <div className="rounded-studio bg-ink p-4 text-white shadow-soft">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-aqua text-ink">
                    <Calculator size={18} />
                  </span>
                  <span className="text-xl font-black">{formatCurrency(overview?.budgetCostTotal ?? 0)}</span>
                </div>
                <h3 className="text-sm font-black">{t("projectBudgetTotal")}</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-white/62">{t("projectBudgetPlannerBody")}</p>
              </div>

              <div className="rounded-studio bg-coral p-4 text-white shadow-soft">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-white/18 text-white">
                    <AlertTriangle size={18} />
                  </span>
                  <span className="text-xl font-black">{overview?.overdueTaskCount ?? 0}</span>
                </div>
                <h3 className="text-sm font-black">{t("overdueHighPriority")}</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-white/76">{t("todayQueue")}</p>
              </div>
            </div>
            <div className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(300px,0.43fr)_minmax(0,1fr)]">
              <div className="relative min-w-0 overflow-hidden rounded-studio bg-[#A33E43] p-3 text-white shadow-soft ring-1 ring-[#FAFCD9]/35 min-[400px]:p-5">
                <div className="relative z-10 min-w-0">
                  <div className="mb-4 flex min-w-0 items-center gap-2 min-[400px]:mb-5 min-[400px]:gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FAFCD9] text-ink min-[400px]:size-11">
                      <ChartPie className="size-4 min-[400px]:size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase leading-tight text-white min-[400px]:text-sm">{t("projectStatusPie")}</p>
                      <h3 className="text-xl font-black text-white min-[400px]:text-2xl">{scopedProjects.length}</h3>
                    </div>
                  </div>

                  <div className="grid min-w-0 place-items-center">
                    <div
                      className="grid aspect-square w-full max-w-56 place-items-center rounded-full shadow-soft ring-1 ring-[#FAFCD9]/35"
                      style={{ background: pieGradient }}
                    >
                      <div className="flex aspect-square w-1/2 max-w-28 flex-col items-center justify-center rounded-full bg-[#FAFCD9] text-center text-ink shadow-soft">
                        <span className="whitespace-nowrap text-[clamp(1.5rem,8vw,2.25rem)] font-black leading-none">
                          {overview?.averageProgress ?? 0}%
                        </span>
                        <span className="mt-1 max-w-[80%] text-[clamp(8px,2.6vw,12px)] font-black uppercase leading-tight text-ink/62">
                          {t("averageProgressShort")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                    {statusSegments.map((segment) => (
                      <div key={segment.key} className="flex min-w-0 items-center justify-between gap-3 rounded-full bg-[#FAFCD9] px-3 py-2 text-sm font-black text-ink shadow-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                          <span className="truncate">{segment.label}</span>
                        </span>
                        <span className="shrink-0">{segment.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-studio bg-[#FAFCD9] p-3 shadow-soft ring-1 ring-white/[0.38] backdrop-blur-xl min-[400px]:p-5">
                <div className="mb-4 flex min-w-0 items-center gap-2 min-[400px]:mb-5 min-[400px]:gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-limepop text-ink min-[400px]:size-11">
                    <Network className="size-4 min-[400px]:size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black uppercase text-muted min-[400px]:text-sm">{t("portfolioTree")}</p>
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
                  {companyTree.map(({ company, groups }) => (
                    <div key={company.id} className="min-w-0 overflow-hidden rounded-studio bg-white/44 p-3 min-[400px]:p-4">
                      <div className="flex min-w-0 items-center gap-2 min-[400px]:gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white min-[400px]:size-9">
                          <Building2 className="size-4 min-[400px]:size-[17px]" />
                        </span>
                        <h3 className="min-w-0 truncate text-sm font-black min-[400px]:text-lg">
                          {formatDemoEntityName(company.name, company.id, "company", t)}
                        </h3>
                      </div>
                      <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-l-2 border-ink/10 pl-2.5 min-[400px]:mt-4 min-[400px]:gap-3 min-[400px]:pl-4">
                        {groups.map(({ group, projects }) => (
                          <div key={group?.id ?? "unassigned"} className="relative min-w-0">
                            <span className="absolute -left-[0.85rem] top-3 size-2.5 rounded-full bg-limepop ring-[3px] ring-white min-[400px]:-left-[1.15rem] min-[400px]:top-4 min-[400px]:size-3 min-[400px]:ring-4" />
                            <div className="min-w-0 rounded-studio bg-white/76 p-2 min-[400px]:p-3">
                              <div className="mb-2 flex min-w-0 items-center justify-between gap-1.5 min-[400px]:mb-3 min-[400px]:gap-3">
                                <span className="min-w-0 truncate text-xs font-black min-[400px]:text-base">
                                  {group ? displayGroupName(group) : t("unassignedGroup")}
                                </span>
                                <span className="shrink-0 rounded-full bg-aqua px-2 py-1 text-[10px] font-black min-[400px]:px-3 min-[400px]:text-xs">
                                  {projects.length}
                                </span>
                              </div>
                              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                                {projects.map((project, projectIndex) => (
                                  <Link
                                    key={project.id}
                                    href={projectPath(project.id)}
                                    prefetch={false}
                                    className="relative block w-full min-w-0 max-w-full overflow-hidden rounded-full bg-white/78 px-2 py-1.5 text-[11px] font-black shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft min-[400px]:px-3 min-[400px]:py-2 min-[400px]:text-sm"
                                  >
                                    <span
                                      className="absolute inset-y-0 left-0 rounded-full"
                                      style={{
                                        backgroundColor: projectIndex % 2 === 0 ? "rgba(241, 244, 39, 0.58)" : "rgba(176, 235, 239, 0.62)",
                                        width: `${project.progress}%`
                                      }}
                                    />
                                    <span className="relative z-10 flex min-w-0 items-center justify-between gap-1.5 min-[400px]:gap-3">
                                      <span className="min-w-0 truncate">
                                        {formatDemoEntityName(displayName(project.name, projectNameKeys), project.id, "project", t)}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-1 text-ink/62 min-[400px]:gap-1.5">
                                        <Pill
                                          tone={projectStatusTone[project.status]}
                                          className="min-h-5 px-1.5 text-[8px] font-black min-[400px]:min-h-6 min-[400px]:px-2 min-[400px]:text-[10px]"
                                        >
                                          {t(statusKeys[project.status])}
                                        </Pill>
                                        <span>{project.progress}%</span>
                                      </span>
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
