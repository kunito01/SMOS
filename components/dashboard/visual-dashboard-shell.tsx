"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CalendarDays,
  ChartPie,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FolderKanban,
  Layers3,
  Network,
  Plus,
  Rocket,
  Share2,
  Users,
  WandSparkles
} from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { ProjectCreateModal } from "@/components/dashboard/project-create-modal";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi, projectsApi } from "@/lib/api";
import {
  groupNameKeys,
  projectNameKeys,
  taskTitleKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Company, DashboardOverview, DashboardScope, Project, ProjectGroup } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const spring = {
  type: "spring",
  stiffness: 150,
  damping: 18
} as const;

type MetricValueKey = "totalProjectCount" | "activeProjectCount" | "averageProgress" | "upcomingDeliverableCount";

const metrics: Array<{
  labelKey: TranslationKey;
  valueKey: MetricValueKey;
  valueFormat: "count" | "percent" | "year";
  tone: "aqua" | "coral" | "lime";
  icon: typeof Layers3;
}> = [
  { labelKey: "metricMapped", valueKey: "totalProjectCount", valueFormat: "year", tone: "lime", icon: Layers3 },
  { labelKey: "metricActive", valueKey: "activeProjectCount", valueFormat: "count", tone: "aqua", icon: Rocket },
  { labelKey: "metricCompleted", valueKey: "averageProgress", valueFormat: "percent", tone: "lime", icon: CheckCircle2 },
  { labelKey: "metricDue", valueKey: "upcomingDeliverableCount", valueFormat: "count", tone: "coral", icon: CalendarDays }
];

const metricCardStyles = [
  "col-span-2 bg-[#e3f596] text-ink xl:col-span-1",
  "col-span-1 bg-[#f4e9d8] text-ink xl:col-span-1",
  "col-span-1 bg-[#f4e9d8] text-ink xl:col-span-1",
  "col-span-2 bg-[#e3f596] text-ink xl:col-span-1"
] as const;

const metricIconStyles = [
  "bg-ink text-white xl:bg-ink xl:text-white",
  "bg-aqua text-ink xl:bg-aqua xl:text-ink",
  "bg-limepop text-ink xl:bg-white/10 xl:text-white",
  "bg-coral text-white xl:bg-coral xl:text-white"
] as const;

type DashboardData = {
  companies: Company[];
  groups: ProjectGroup[];
  projects: Project[];
};

export function VisualDashboardShell() {
  const router = useRouter();
  const { language, t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [scope, setScope] = useState<DashboardScope>({ type: "all" });
  const [createOpen, setCreateOpen] = useState(false);
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());

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
    let isMounted = true;

    async function loadDashboardOverview() {
      const nextOverview = await projectsApi.getDashboardOverview(scope);

      if (isMounted) {
        setOverview(nextOverview);
      }
    }

    loadDashboardOverview();

    return () => {
      isMounted = false;
    };
  }, [scope, scopeId]);

  const groupById = useMemo(
    () => new Map((data?.groups ?? []).map((group) => [group.id, group])),
    [data?.groups]
  );
  const spotlightProjects = overview?.spotlightProjects ?? [];
  const atlasProject = spotlightProjects[0];
  const focusTasks = useMemo(
    () =>
      atlasProject?.phases
        .flatMap((phase) => phase.deliverables.flatMap((deliverable) => deliverable.tasks))
        .slice(0, 4) ?? [],
    [atlasProject]
  );

  useEffect(() => {
    setCompletedTaskIds(new Set(focusTasks.filter((task) => task.completed).map((task) => task.id)));
  }, [focusTasks]);

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
  const formatMetricValue = (metric: (typeof metrics)[number], value: number) => {
    if (metric.valueFormat === "year") {
      return "2026";
    }

    if (metric.valueFormat === "percent") {
      return `${value}%`;
    }

    return String(value).padStart(2, "0");
  };
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", {
        compactDisplay: "short",
        currency: "CNY",
        maximumFractionDigits: 1,
        notation: "compact",
        style: "currency"
      }),
    [language]
  );
  const formatCurrency = (value: number) => currencyFormatter.format(value);
  const linkedToolCount = new Set(spotlightProjects.flatMap((project) => project.tools.map((tool) => tool.id))).size;
  const clientReadyCount = spotlightProjects.filter((project) => project.shareSettings.isEnabled).length;
  const leadPeopleCount = atlasProject?.people.length ?? 0;
  const statusSegments = [
    { key: "active", label: t("statusActive"), color: "#f94622" },
    { key: "planning", label: t("statusPlanning"), color: "#e3f596" },
    { key: "completed", label: t("statusCompleted"), color: "#8edbe8" },
    { key: "paused", label: t("statusPaused"), color: "#1c2328" }
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
      const groups = (data?.groups ?? [])
        .filter((group) => group.companyId === company.id)
        .map((group) => ({
          group,
          projects: scopedProjects.filter((project) => project.groupId === group.id)
        }))
        .filter((groupBranch) => groupBranch.projects.length > 0);

      return { company, groups };
    })
    .filter((companyBranch) => companyBranch.groups.length > 0);
  const opsItems = [
    {
      bodyKey: "opsCashWatch",
      detailKey: "opsCashWatchBody",
      icon: CircleDollarSign,
      tone: "bg-limepop",
      value: formatCurrency(overview?.futureEstimatedCost ?? 0)
    },
    {
      bodyKey: "opsPipelineHealth",
      detailKey: "opsPipelineHealthBody",
      icon: Layers3,
      tone: "bg-aqua",
      value: `${overview?.activeProjectCount ?? 0} / ${overview?.completedProjectCount ?? 0}`
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
      icon: Share2,
      tone: "bg-coral text-white",
      value: `${clientReadyCount} / ${spotlightProjects.length}`
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
  const handleProjectCreated = (project: Project) => {
    setCreateOpen(false);
    router.push(`/projects/${project.id}`);
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto bg-white/[0.08] px-4 pb-8 backdrop-blur-sm sm:px-6 xl:px-8">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            <Card tone="aqua" className="relative min-h-[28rem] overflow-hidden p-6 sm:p-8 xl:min-h-[32rem]">
              <div className="relative z-10 flex h-full flex-col justify-between gap-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Pill tone="lime">{t("heroPillProduct")}</Pill>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded-full bg-white/70 p-1 shadow-soft">
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
                            "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-black transition",
                            active ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-ink"
                          )}
                        >
                          <Icon size={17} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="max-w-3xl">
                  <h1 className="max-w-3xl text-4xl font-black leading-[0.95] text-ink sm:text-6xl xl:text-7xl">
                    {t("heroTitle")}
                  </h1>
                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <Button size="lg" disabled={!data} onClick={() => setCreateOpen(true)}>
                      <Plus size={19} />
                      {t("newProject")}
                    </Button>
                  </div>
                  {scope.type !== "all" ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-ink/55">
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
                              "h-10 rounded-full px-4 text-sm font-black transition",
                              active ? "bg-coral text-white shadow-soft" : "bg-white/72 text-ink hover:bg-white"
                            )}
                          >
                            {scope.type === "group" ? displayName(item.name, groupNameKeys) : item.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-3 gap-3 xl:grid-cols-4 xl:gap-4">
                  {metrics.map((metric, index) => {
                    const Icon = metric.icon;
                    const value = overview?.[metric.valueKey] ?? 0;
                    const formattedValue = formatMetricValue(metric, value);

                    return (
                      <div
                        key={metric.labelKey}
                        className={cn(
                          "relative min-h-[9.75rem] overflow-hidden rounded-studio-lg p-4 shadow-soft ring-1 ring-black/[0.04]",
                          "xl:min-h-[15.75rem] xl:rounded-[2.15rem] xl:p-5",
                          metricCardStyles[index]
                        )}
                      >
                        <div className="flex h-full flex-col justify-between gap-6">
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={cn(
                                "grid size-9 shrink-0 place-items-center rounded-full xl:size-11",
                                metricIconStyles[index]
                              )}
                            >
                              <Icon size={17} className="xl:size-5" />
                            </span>
                          </div>

                          <div className="grid gap-3 xl:gap-6">
                            <div>
                              <h3 className="max-w-[8.5rem] text-sm font-black leading-tight text-current/80 xl:max-w-none xl:text-base">
                                {t(metric.labelKey)}
                              </h3>
                            </div>
                            <div>
                              <p className="text-5xl font-black leading-[0.82] tracking-normal xl:text-7xl">
                                {formattedValue}
                              </p>
                              <div className="mt-3 h-1 w-20 rounded-full bg-current/35 xl:w-24" />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="absolute -right-20 -top-16 size-72 rounded-full bg-white/[0.35]" />
              <div className="absolute bottom-12 right-7 hidden h-48 w-20 rounded-full bg-limepop sm:block" />
            </Card>
          </motion.div>

          <motion.div
            className="grid self-start gap-3"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.06 }}
          >
            <Card tone="dark" className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-white/60">{t("todayQueue")}</p>
                  <h2 className="mt-2 text-3xl font-black leading-none">{t("deliverableFocus")}</h2>
                </div>
                <span className="grid size-12 place-items-center rounded-full bg-limepop text-ink">
                  <BellRing size={21} />
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {focusTasks.map((task) => {
                  const isComplete = completedTaskIds.has(task.id);

                  return (
                    <motion.button
                      key={task.id}
                      type="button"
                      aria-pressed={isComplete}
                      onClick={() => {
                        setCompletedTaskIds((current) => {
                          const next = new Set(current);

                          if (next.has(task.id)) {
                            next.delete(task.id);
                          } else {
                            next.add(task.id);
                          }

                          return next;
                        });
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-studio p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-limepop",
                        isComplete ? "bg-white/[0.07] text-white/56" : "bg-white/10 text-white hover:bg-white/[0.15]"
                      )}
                      whileHover={{ x: 4 }}
                      transition={spring}
                    >
                      <span
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-full transition",
                          isComplete ? "bg-limepop text-ink" : "bg-white/[0.12] text-white"
                        )}
                      >
                        {isComplete ? <CheckCircle2 size={22} /> : <Clock3 size={21} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate font-black decoration-limepop decoration-2 underline-offset-4",
                            isComplete && "line-through"
                          )}
                        >
                          {displayName(task.title, taskTitleKeys)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-white/60">
                          {atlasProject?.people.find((person) => person.id === task.assigneeId)?.role ?? t("ownerProduction")}
                        </p>
                      </div>
                      <WandSparkles size={19} className={cn("shrink-0", isComplete ? "text-white/32" : "text-white/60")} />
                    </motion.button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-studio bg-coral p-4">
                <div className="flex items-center gap-3">
                  <Users size={20} />
                  <span className="font-black">{t("studioSync")}</span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/80">
                  {t("studioSyncBody")}
                </p>
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
            <Link key={project.id} href={`/projects/${project.id}`} prefetch={false} className="block rounded-studio-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral">
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
                title={displayName(project.name, projectNameKeys)}
                meta={displayName(groupById.get(project.groupId)?.name ?? "", groupNameKeys)}
                className="shadow-none"
              >
                <div className="rounded-full bg-white/[0.88] p-1">
                  <ProgressBar value={project.progress} barClassName={index === 1 ? "bg-limepop" : "bg-coral"} />
                </div>
              </ImageCard>
              </motion.div>
            </Link>
          ))}
        </section>

        <section className="mt-6">
          <Card
            tone="white"
            className="p-5 shadow-lift ring-1 ring-white/[0.34] backdrop-blur-xl sm:p-6"
            style={{ backgroundColor: "#98dbb1" }}
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
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              {opsItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.bodyKey} className="rounded-studio bg-white/62 p-4 shadow-soft ring-1 ring-white/[0.38] backdrop-blur-xl xl:col-span-1">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className={cn("grid size-10 place-items-center rounded-full", item.tone)}>
                        <Icon size={18} />
                      </span>
                      <span className="text-xl font-black">{item.value}</span>
                    </div>
                    <h3 className="text-sm font-black">{t(item.bodyKey)}</h3>
                    <p className="mt-2 text-xs font-semibold leading-5 text-muted">{t(item.detailKey)}</p>
                  </div>
                );
              })}

              <div className="rounded-studio bg-ink p-4 text-white shadow-soft xl:col-span-1">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-limepop text-ink">
                    <CircleDollarSign size={18} />
                  </span>
                  <span className="text-xl font-black">{formatCurrency(overview?.actualCostSoFar ?? 0)}</span>
                </div>
                <h3 className="text-sm font-black">{t("actualCostSoFar")}</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-white/62">{t("costPulse")}</p>
              </div>

              <div className="rounded-studio bg-ink p-4 text-white shadow-soft xl:col-span-1">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-aqua text-ink">
                    <CircleDollarSign size={18} />
                  </span>
                  <span className="text-xl font-black">{formatCurrency(overview?.futureEstimatedCost ?? 0)}</span>
                </div>
                <h3 className="text-sm font-black">{t("futureEstimatedCost")}</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-white/62">{t("costOverview")}</p>
              </div>

              <div className="rounded-studio bg-coral p-4 text-white shadow-soft xl:col-span-1">
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
            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(300px,0.43fr)_minmax(0,1fr)]">
              <div className="rounded-studio bg-white/64 p-5 shadow-soft ring-1 ring-white/[0.38] backdrop-blur-xl">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-ink text-white">
                    <ChartPie size={20} />
                  </span>
                  <div>
                    <p className="text-sm font-black uppercase text-muted">{t("projectStatusPie")}</p>
                    <h3 className="text-2xl font-black">{scopedProjects.length}</h3>
                  </div>
                </div>
                <div className="grid place-items-center">
                  <div
                    className="grid size-56 place-items-center rounded-full shadow-soft ring-1 ring-black/[0.04]"
                    style={{ background: pieGradient }}
                  >
                    <div className="grid size-28 place-items-center rounded-full bg-white text-center shadow-soft">
                      <span className="text-4xl font-black leading-none">{overview?.averageProgress ?? 0}%</span>
                      <span className="mt-1 text-xs font-black uppercase text-muted">{t("averageProgressShort")}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid gap-2">
                  {statusSegments.map((segment) => (
                    <div key={segment.key} className="flex items-center justify-between gap-3 rounded-full bg-cloud/70 px-3 py-2 text-sm font-black">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="truncate">{segment.label}</span>
                      </span>
                      <span>{segment.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-studio bg-white/64 p-5 shadow-soft ring-1 ring-white/[0.38] backdrop-blur-xl">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-limepop text-ink">
                    <Network size={20} />
                  </span>
                  <div>
                    <p className="text-sm font-black uppercase text-muted">{t("portfolioTree")}</p>
                    <h3 className="text-2xl font-black">{t("creativeProjects")}</h3>
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {companyTree.map(({ company, groups }) => (
                    <div key={company.id} className="rounded-studio bg-white/44 p-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-ink text-white">
                          <Building2 size={17} />
                        </span>
                        <h3 className="min-w-0 truncate text-lg font-black">{company.name}</h3>
                      </div>
                      <div className="mt-4 grid gap-3 border-l-2 border-ink/10 pl-4">
                        {groups.map(({ group, projects }) => (
                          <div key={group.id} className="relative">
                            <span className="absolute -left-[1.15rem] top-4 size-3 rounded-full bg-limepop ring-4 ring-white" />
                            <div className="rounded-studio bg-white/76 p-3">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <span className="truncate font-black">{displayName(group.name, groupNameKeys)}</span>
                                <span className="rounded-full bg-aqua px-3 py-1 text-xs font-black">{projects.length}</span>
                              </div>
                              <div className="grid gap-2">
                                {projects.map((project, projectIndex) => (
                                  <Link
                                    key={project.id}
                                    href={`/projects/${project.id}`}
                                    prefetch={false}
                                    className="relative block overflow-hidden rounded-full bg-white/78 px-3 py-2 text-sm font-black shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                                  >
                                    <span
                                      className="absolute inset-y-0 left-0 rounded-full"
                                      style={{
                                        backgroundColor: projectIndex % 2 === 0 ? "rgba(241, 244, 39, 0.58)" : "rgba(176, 235, 239, 0.62)",
                                        width: `${project.progress}%`
                                      }}
                                    />
                                    <span className="relative z-10 flex min-w-0 items-center justify-between gap-3">
                                      <span className="min-w-0 truncate">{displayName(project.name, projectNameKeys)}</span>
                                      <span className="shrink-0 text-ink/62">{project.progress}%</span>
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
        <ProjectCreateModal
          open={createOpen}
          companies={data?.companies ?? []}
          groups={data?.groups ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={handleProjectCreated}
        />
      </div>
    </AppShell>
  );
}
