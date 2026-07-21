"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Activity,
  Archive,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileStack,
  GitBranch,
  Pencil,
  RotateCcw,
  Save,
  Share2,
  Trash2,
  TrendingUp,
  UserRound,
  Wrench
} from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionHeader } from "@/components/ui/section-header";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { ProjectTimelineChart } from "@/components/projects/project-timeline-chart";
import { ProjectTimelineSettingsModal } from "@/components/projects/project-timeline-settings-modal";
import { ProjectWorkflowSection } from "@/components/projects/project-workflow-section";
import { ProjectPaymentSettings } from "@/components/projects/project-payment-settings";
import { ProjectBasicsEditModal } from "@/components/projects/project-basics-edit-modal";
import { ProjectReleaseBadges } from "@/components/projects/project-release-badges";
import { ProjectSaveControls } from "@/components/projects/project-save-controls";
import { ProjectSummaryTimeline } from "@/components/projects/project-summary-timeline";
import { costsApi, groupsApi, projectsApi } from "@/lib/api";
import type { ProjectCostSummary } from "@/lib/api/costs";
import {
  formatDemoEntityName,
  getProjectGroupDisplayName,
  phaseDescriptionKey,
  phaseNameKeys,
  projectDescriptionKey,
  projectNameKeys,
  statusKeys,
  taskTitleKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import type { Project, ProjectGroup, ProjectStatus, ProjectVersion } from "@/lib/types";
import { projectCostsPath } from "@/lib/utils/app-routes";
import { cn } from "@/lib/utils/cn";
import { findProjectReleaseVersion } from "@/lib/utils/project-release";
import { downloadProjectReportHtml } from "@/lib/utils/project-report-share";
import { buildReportChromeLabels } from "@/lib/utils/report-share-common";

type ProjectDetailData = {
  costSummary: ProjectCostSummary;
  project: Project;
  groups: ProjectGroup[];
};

const phaseTone = {
  completed: "bg-limepop text-ink",
  active: "bg-coral text-white",
  "not-started": "bg-cloud text-muted"
} as const;

const projectStatusOptions: Array<{ activeClassName: string; value: ProjectStatus }> = [
  { value: "planning", activeClassName: "bg-limepop text-ink" },
  { value: "active", activeClassName: "bg-coral text-white" },
  { value: "paused", activeClassName: "bg-cloud text-ink" },
  { value: "terminated", activeClassName: "bg-[#d4a1df] text-ink" },
  { value: "completed", activeClassName: "bg-aqua text-ink" }
];

const defaultProjectDescription =
  "A visual studio initiative managed through phases, deliverables, people, tools, and private costs.";
const summaryPanelColor = "#023436";
const summaryAccentMetricColor = "#03b5aa";
const summaryLightMetricColor = "#fffae3";
const summaryFinanceMetricColor = "#f7567c";
const reportPhaseColors = ["#e3f596", "#f4e9d8", "#8edbe8", "#f94a22", "#1c2328", "#d4a1df"];
const releaseInputClass =
  "min-h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-white px-3 py-2 text-sm font-black text-ink outline-none transition focus:border-limepop focus:ring-4 focus:ring-limepop/15 max-[560px]:min-h-10 max-[560px]:rounded-xl max-[560px]:px-2.5 max-[560px]:text-xs max-[360px]:min-h-9 max-[360px]:px-2";
const releaseLabelClass = "break-words text-xs font-black uppercase leading-tight text-white/55 max-[560px]:text-[10px]";

type ReleasePlanForm = {
  demoVersion: string;
  demoReleaseDate: string;
  officialVersion: string;
  officialReleaseDate: string;
};

const emptyReleasePlan: ReleasePlanForm = {
  demoVersion: "",
  demoReleaseDate: "",
  officialVersion: "",
  officialReleaseDate: ""
};

const releaseDateValue = (version?: ProjectVersion) =>
  (version?.releaseDate ?? (version?.kind ? "" : version?.createdAt) ?? "").slice(0, 10);

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { language, t } = useI18n();
  const {
    displayCurrency,
    exchangeRateSnapshot,
    formatAmount,
    isReady: isCurrencyReady
  } = useCostDisplayCurrency();
  const [data, setData] = useState<ProjectDetailData | null>(null);
  const [notice, setNotice] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [releasePlan, setReleasePlan] = useState<ReleasePlanForm>(emptyReleasePlan);
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [reportSharing, setReportSharing] = useState(false);
  const [statusSaving, setStatusSaving] = useState<ProjectStatus | null>(null);

  const loadProject = async () => {
    const [project, groups, costSummary] = await Promise.all([
      projectsApi.getProject(projectId),
      groupsApi.listGroups(),
      costsApi.getProjectCostSummary(projectId, displayCurrency, exchangeRateSnapshot)
    ]);
    setData({ project, groups, costSummary });
  };

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function load() {
      const [project, groups, costSummary] = await Promise.all([
        projectsApi.getProject(projectId),
        groupsApi.listGroups(),
        costsApi.getProjectCostSummary(projectId, displayCurrency, exchangeRateSnapshot)
      ]);

      if (isMounted) {
        setData({ project, groups, costSummary });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [displayCurrency, exchangeRateSnapshot, isCurrencyReady, projectId]);

  useEffect(() => {
    if (!data?.project) {
      return;
    }

    const demoVersion = findProjectReleaseVersion(data.project, "demo");
    const officialVersion = findProjectReleaseVersion(data.project, "official");

    setReleasePlan({
      demoVersion: demoVersion?.versionNumber ?? "",
      demoReleaseDate: releaseDateValue(demoVersion),
      officialVersion: officialVersion?.versionNumber ?? "",
      officialReleaseDate: releaseDateValue(officialVersion)
    });
    setReleaseSaving(false);
  }, [data?.project]);

  const group = data?.groups.find((item) => item.id === data.project.groupId);
  const currentPhase = data?.project.phases.find((phase) => phase.id === data.project.currentPhaseId);
  const projectDeliverables = data?.project.phases.flatMap((phase) => phase.deliverables) ?? [];
  const projectTasks = projectDeliverables.flatMap((deliverable) => deliverable.tasks);
  const completedTaskCount = projectTasks.filter((task) => task.completed).length;
  const paymentSummary = useMemo(() => {
    if (!data?.costSummary) {
      return {
        actualCost: 0,
        actualProfit: 0,
        plannedReceivable: 0,
        receivedRevenue: 0
      };
    }

    return {
      actualCost: data.costSummary.actualCostSoFar,
      actualProfit: data.costSummary.actualProfit,
      plannedReceivable: data.costSummary.plannedReceivable,
      receivedRevenue: data.costSummary.receivedRevenue
    };
  }, [data?.costSummary]);

  const handleTaskToggle = async (taskId: string, completed: boolean) => {
    await projectsApi.updateTaskCompletion(taskId, completed);
    await loadProject();
    setNotice(t("taskUpdated"));
    window.setTimeout(() => setNotice(""), 1600);
  };

  const handleTimelineSaved = (project: Project) => {
    setData((current) => (current ? { ...current, project } : current));
    setNotice(t("timelineUpdated"));
    window.setTimeout(() => setNotice(""), 1600);
  };

  const handlePaymentsSaved = (project: Project) => {
    setData((current) => (current ? { ...current, project } : current));
    void loadProject();
    setNotice(t("paymentStatusUpdated"));
    window.setTimeout(() => setNotice(""), 1600);
  };

  const handleBasicsSaved = (project: Project) => {
    setData((current) => (current ? { ...current, project } : current));
    setNotice(t("projectBasicsUpdated"));
    window.setTimeout(() => setNotice(""), 1600);
  };

  const handleProjectStatusChange = async (status: ProjectStatus) => {
    if (!data?.project || statusSaving || data.project.status === status) {
      return;
    }

    setStatusSaving(status);

    try {
      const project = await projectsApi.updateProjectStatus(data.project.id, status);
      setData((current) => (current ? { ...current, project } : current));
      setNotice(t("projectStatusUpdated"));
      window.setTimeout(() => setNotice(""), 1600);
    } finally {
      setStatusSaving(null);
    }
  };

  const updateReleasePlanField = (field: keyof ReleasePlanForm, value: string) => {
    setReleasePlan((current) => ({ ...current, [field]: value }));
  };

  const handleReleasePlanSaved = async () => {
    if (!data?.project || releaseSaving) {
      return;
    }

    setReleaseSaving(true);

    try {
      const project = await projectsApi.updateProjectReleasePlan(data.project.id, releasePlan);

      setData((current) => (current ? { ...current, project } : current));
      setNotice(t("releasePlanUpdated"));
      window.setTimeout(() => setNotice(""), 1600);
    } finally {
      setReleaseSaving(false);
    }
  };

  const handleReleaseNodeDeleted = async (
    versionField: keyof ReleasePlanForm,
    dateField: keyof ReleasePlanForm
  ) => {
    if (!data?.project || releaseSaving) {
      return;
    }

    const nextReleasePlan: ReleasePlanForm = {
      ...releasePlan,
      [versionField]: "",
      [dateField]: ""
    };

    setReleasePlan(nextReleasePlan);
    setReleaseSaving(true);

    try {
      const project = await projectsApi.updateProjectReleasePlan(data.project.id, nextReleasePlan);

      setData((current) => (current ? { ...current, project } : current));
      setNotice(t("releaseNodeDeleted"));
      window.setTimeout(() => setNotice(""), 1600);
    } finally {
      setReleaseSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!data?.project) {
      return;
    }

    const nextProject = data.project.archivedAt
      ? await projectsApi.restoreProject(data.project.id)
      : await projectsApi.archiveProject(data.project.id);

    setData((current) => (current ? { ...current, project: nextProject } : current));
    setNotice(data.project.archivedAt ? t("projectRestored") : t("projectArchived"));
    window.setTimeout(() => setNotice(""), 1800);
  };

  const handleProjectLoaded = (project: Project) => {
    setData((current) => (current ? { ...current, project } : current));
    window.setTimeout(() => setNotice(""), 2000);
  };

  const projectDescription =
    data?.project.description === defaultProjectDescription
      ? t(projectDescriptionKey)
      : data?.project.description ?? "";
  const projectDisplayName = data
    ? formatDemoEntityName(
        translateDomainLabel(data.project.name, projectNameKeys, t),
        data.project.id,
        "project",
        t,
        data.project.isExample
      )
    : "";

  const handleProjectReportShare = async () => {
    if (!data || reportSharing) {
      return;
    }

    setReportSharing(true);

    try {
      const project = data.project;
      const peopleById = new Map(project.people.map((person) => [person.id, person]));
      const toolsById = new Map(project.tools.map((tool) => [tool.id, tool]));
      const linkedWorkflows = await projectsApi.listProjectWorkflows(project.id);
      const collectionProgress = data.costSummary.plannedReceivable > 0
        ? Math.min(100, Math.round((data.costSummary.receivedRevenue / data.costSummary.plannedReceivable) * 100))
        : 0;

      await downloadProjectReportHtml({
        chrome: buildReportChromeLabels(t),
        projectName: projectDisplayName,
        description: projectDescription,
        groupName: group ? getProjectGroupDisplayName(group, language, t) : undefined,
        language,
        coverImageUrl: project.coverImage,
        dateRange: `${formatLocalizedDate(project.startDate, language)} - ${formatLocalizedDate(project.endDate, language)}`,
        summaryMetrics: [
          { label: t("averageProgressShort"), value: `${project.progress}%`, tone: "aqua" },
          {
            label: t("currentPhase"),
            value: translateDomainLabel(currentPhase?.name ?? "", phaseNameKeys, t) || t("untitledStage"),
            tone: "cloud"
          },
          { label: t("peopleTeam"), value: String(project.people.length), tone: "cloud" },
          { label: t("tools"), value: String(project.tools.length), tone: "aqua" },
          {
            label: t("deliverables"),
            value: `${projectDeliverables.filter((item) => !item.completed).length} / ${projectDeliverables.length}`,
            tone: "cloud"
          },
          { label: t("tasks"), value: `${completedTaskCount} / ${projectTasks.length}`, tone: "cloud" },
          {
            label: t("receivedPayment"),
            value: formatAmount(data.costSummary.receivedRevenue, data.costSummary.currency),
            tone: "coral"
          },
          {
            label: t("currentProfit"),
            value: formatAmount(data.costSummary.actualProfit, data.costSummary.currency),
            tone: "coral"
          }
        ],
        status: {
          label: t(statusKeys[project.status]),
          tone: project.status
        },
        phases: project.phases.map((phase, phaseIndex) => {
          const personIds = phase.personIds?.length
            ? phase.personIds
            : phase.assigneeId
              ? [phase.assigneeId]
              : [];
          const toolIds = phase.toolIds?.length
            ? phase.toolIds
            : project.tools.slice(0, 2).map((tool) => tool.id);

          return {
            color: phase.color ?? reportPhaseColors[phaseIndex % reportPhaseColors.length],
            name: translateDomainLabel(phase.name, phaseNameKeys, t) || t("untitledStage"),
            status:
              phase.status === "completed"
                ? t("statusCompleted")
                : phase.status === "active"
                  ? t("statusActive")
                  : t("statusPlanning"),
            period: `${formatLocalizedDate(phase.startDate, language)} - ${formatLocalizedDate(phase.endDate, language)}`,
            target: phase.description || t("phaseObjective"),
            people: personIds
              .map((personId) => peopleById.get(personId)?.name)
              .filter((name): name is string => Boolean(name)),
            tools: toolIds
              .map((toolId) => toolsById.get(toolId)?.name)
              .filter((name): name is string => Boolean(name)),
            tasks: phase.deliverables.flatMap((deliverable) =>
              deliverable.tasks.map((task) => ({
                completed: task.completed,
                dueDate: formatLocalizedDate(task.dueDate ?? phase.endDate, language),
                owner: peopleById.get(task.assigneeId)?.name ?? t("owner"),
                title: translateDomainLabel(task.title, taskTitleKeys, t) || t("untitledTask")
              }))
            ),
            notes: phase.notes || t("noNotes")
          };
        }),
        timelineRows: (project.timelineRows ?? []).map((row) => ({
          label: row.label || t("customRowLabel"),
          values: project.phases.map(
            (phase) => row.values[phase.id] || t("emptyCell")
          )
        })),
        workflows: linkedWorkflows,
        paymentMetrics: [
          {
            label: t("plannedReceivable"),
            value: formatAmount(data.costSummary.plannedReceivable, data.costSummary.currency),
            tone: "lime"
          },
          {
            label: t("receivedPayment"),
            value: formatAmount(data.costSummary.receivedRevenue, data.costSummary.currency),
            tone: "aqua"
          },
          {
            label: t("actualCostSoFar"),
            value: formatAmount(data.costSummary.actualCostSoFar, data.costSummary.currency),
            tone: "cloud"
          },
          {
            label: t("currentProfit"),
            value: formatAmount(data.costSummary.actualProfit, data.costSummary.currency),
            tone: "coral"
          },
          {
            label: t("projectedProfit"),
            value: formatAmount(data.costSummary.projectedProfit, data.costSummary.currency),
            tone: "cloud"
          }
        ],
        payments: (project.payments ?? []).map((payment) => ({
          title: payment.title,
          type: t(payment.type === "planned" ? "plannedReceivable" : "receivedPayment"),
          amount: formatAmount(payment.amount, payment.currency),
          dueDate: formatLocalizedDate(payment.dueDate, language),
          receivedDate: payment.receivedDate ? formatLocalizedDate(payment.receivedDate, language) : undefined,
          notes: payment.notes ?? ""
        })),
        collectionProgress,
        collectionBody: t("paymentStatusBudgetBody"),
        labels: {
          collectionProgress: t("collectionProgress"),
          dueDate: t("dueDate"),
          notes: t("notes"),
          owner: t("owner"),
          paymentItems: t("paymentItems"),
          paymentReceivedDate: t("paymentReceivedDate"),
          paymentStatus: t("paymentStatus"),
          people: t("stagePeople"),
          projectContent: t("projectContent"),
          projectSettings: t("projectSettings"),
          projectStatus: t("projectStatus"),
          projectSummary: t("projectSummary"),
          projectTimeline:
            project.timelineTitle && project.timelineTitle !== "Timeline board"
              ? project.timelineTitle
              : t("timelineBoard"),
          period: t("period"),
          stage: t("stage"),
          status: t("projectStatus"),
          target: t("timelineTarget"),
          tasks: t("tasks"),
          tools: t("stageTools"),
          workflow: t("projectWorkflowTitle"),
          workflowDownloadAttachment: t("workflowDownloadAttachment"),
          workflowEmpty: t("projectWorkflowEmpty"),
          workflowFitView: t("workflowFitView"),
          workflowZoomIn: t("workflowZoomIn"),
          workflowZoomOut: t("workflowZoomOut")
        }
      });
    } finally {
      setReportSharing(false);
    }
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section
              data-project-fixed-top="true"
              className="flex w-full max-w-none shrink-0 flex-col gap-4"
            >
              <ImageCard
                imageUrl={data.project.coverImage}
                title={projectDisplayName}
                meta={group ? getProjectGroupDisplayName(group, language, t) : ""}
                heightClassName="h-[31rem] min-h-0 shrink-0"
                className="min-w-0 [&>div.relative>h3]:max-w-56 [&>div.relative>h3]:text-2xl [&>div.relative>h3]:leading-none [&>div.relative>p]:text-sm"
                action={
                  <div className="flex max-w-[36rem] items-center justify-end gap-3">
                    <ProjectReleaseBadges
                      project={data.project}
                      t={t}
                      size="hero"
                      fixedLayout
                      className="max-w-full gap-2 [&>span]:h-12 [&>span]:min-h-12 [&>span]:px-5 [&>span]:text-base"
                    />
                    <Button
                      variant="ghost"
                      size="md"
                      disabled={reportSharing}
                      onClick={() => {
                        void handleProjectReportShare();
                      }}
                      aria-label={t("navShare")}
                      aria-busy={reportSharing}
                      className="bg-white/82 px-4 font-black shadow-soft backdrop-blur"
                    >
                      <Share2 className="size-[18px]" />
                      <span>{t("navShare")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBasicsOpen(true)}
                      aria-label={t("editProjectBasics")}
                      className="bg-white/82 font-black shadow-soft backdrop-blur"
                    >
                      <Pencil className="size-[18px]" />
                    </Button>
                  </div>
                }
              >
                <p className="max-w-2xl break-words text-base font-bold leading-7 text-white/80 [overflow-wrap:anywhere]">
                  {projectDescription}
                </p>
                <div className="mt-5 flex min-w-0 flex-wrap items-center gap-3">
                  <Link className="min-w-0 max-w-full" href={data.project.archivedAt ? "/archive" : "/projects"} prefetch={false}>
                    <Button
                      variant="ghost"
                      size="md"
                      className="min-w-0 max-w-full"
                    >
                      <ArrowLeft className="size-[18px] shrink-0" />
                      <span className="truncate">{data.project.archivedAt ? t("navArchive") : t("allProjects")}</span>
                    </Button>
                  </Link>
                </div>
              </ImageCard>

              <div className="grid gap-4">
                <Card
                  tone="white"
                  className="min-w-0 p-5 shadow-lift ring-1 ring-white/[0.34] backdrop-blur-xl"
                  style={{ backgroundColor: summaryPanelColor }}
                >
                  <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-black uppercase leading-tight text-white">
                        {t("projectSummary")}
                      </p>
                      <h2 className="mt-2 break-words text-3xl font-black leading-none text-white [overflow-wrap:anywhere]">
                        {projectDisplayName}
                      </h2>
                    </div>
                    <ProgressRing
                      value={data.project.progress}
                      size={104}
                      strokeWidth={12}
                      label={`${t("averageProgressShort")} ${data.project.progress}%`}
                      className="shrink-0 text-white"
                    />
                  </div>
                  <div className="mt-5 grid min-w-0 grid-cols-6 gap-3">
                    {[
                      {
                        label: t("averageProgressShort"),
                        value: `${data.project.progress}%`,
                        icon: Activity,
                        backgroundColor: summaryAccentMetricColor
                      },
                      {
                        label: t("currentPhase"),
                        value: translateDomainLabel(currentPhase?.name ?? "", phaseNameKeys, t),
                        icon: GitBranch,
                        backgroundColor: summaryLightMetricColor
                      },
                      { label: t("peopleTeam"), value: data.project.people.length, icon: UserRound, backgroundColor: summaryLightMetricColor },
                      { label: t("tools"), value: data.project.tools.length, icon: Wrench, backgroundColor: summaryAccentMetricColor },
                      {
                        label: t("deliverables"),
                        value: `${projectDeliverables.filter((item) => !item.completed).length} / ${projectDeliverables.length}`,
                        icon: FileStack,
                        backgroundColor: summaryLightMetricColor
                      },
                      { label: t("tasks"), value: `${completedTaskCount} / ${projectTasks.length}`, icon: CheckCircle2, backgroundColor: summaryLightMetricColor },
                      { label: t("receivedPayment"), value: formatAmount(paymentSummary.receivedRevenue, data.costSummary.currency), icon: Banknote, backgroundColor: summaryFinanceMetricColor },
                      { label: t("currentProfit"), value: formatAmount(paymentSummary.actualProfit, data.costSummary.currency), icon: TrendingUp, backgroundColor: summaryFinanceMetricColor }
                    ].map((item, index) => {
                      const Icon = item.icon;
                      const isAtomicValue = index !== 1;

                      return (
                        <div
                          key={item.label}
                          className={cn(
                            "min-w-0 rounded-studio p-3 shadow-soft ring-1 ring-white/[0.38]",
                            index < 6 ? "col-span-2" : "col-span-3"
                          )}
                          style={{ backgroundColor: item.backgroundColor }}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-limepop text-ink">
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 break-words text-xs font-black uppercase leading-tight text-ink/58 [overflow-wrap:anywhere]">
                              {item.label}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "mt-3 min-w-0 font-black leading-tight",
                              isAtomicValue
                                ? "max-w-full whitespace-nowrap text-[clamp(0.72rem,2.1vw,1.5rem)] tabular-nums tracking-[-0.025em]"
                                : "break-words text-2xl [overflow-wrap:anywhere]"
                            )}
                          >
                            {item.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <ProjectSummaryTimeline project={data.project} t={t} fixedLayout />
                </Card>
              </div>
            </section>

            <section className="mt-6">
              <Card tone="dark" className="p-5 max-[560px]:p-4 max-[360px]:p-3 sm:p-6">
                <p className="break-words text-xs font-black uppercase tracking-[0.12em] text-white/65 max-[360px]:text-[10px] max-[360px]:tracking-[0.08em]">
                  {t("projectStatus")}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:grid-cols-5" role="group" aria-label={t("projectStatus")}>
                  {projectStatusOptions.map((option) => {
                    const isActive = data.project.status === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isActive}
                        aria-busy={statusSaving === option.value}
                        disabled={Boolean(statusSaving)}
                        onClick={() => {
                          void handleProjectStatusChange(option.value);
                        }}
                        className={cn(
                          "min-h-10 min-w-0 break-words rounded-full px-3 py-2 text-xs font-black leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-limepop disabled:cursor-wait disabled:opacity-65 max-[560px]:min-h-9 max-[560px]:px-2 max-[560px]:text-[clamp(9px,2.2vw,12px)] max-[399px]:last:col-span-2",
                          isActive
                            ? option.activeClassName
                            : "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
                        )}
                      >
                        {t(statusKeys[option.value])}
                      </button>
                    );
                  })}
                </div>
              </Card>
            </section>

            {notice ? (
              <p className="mt-4 rounded-full bg-ink px-4 py-3 text-sm font-black text-limepop shadow-soft">
                {notice}
              </p>
            ) : null}

            <ProjectWorkflowSection project={data.project} t={t} />
            <ProjectTimelineChart
              project={data.project}
              t={t}
              onEdit={() => setTimelineOpen(true)}
              onTaskToggle={(taskId, completed) => {
                void handleTaskToggle(taskId, completed);
              }}
              footerAction={
                <Link href={projectCostsPath(data.project.id)} prefetch={false}>
                  <Button variant="secondary" size="lg" className="w-full">
                    <CircleDollarSign size={19} />
                    {t("openCosts")}
                  </Button>
                </Link>
              }
            />
            <ProjectTimelineSettingsModal
              open={timelineOpen}
              project={data.project}
              t={t}
              onClose={() => setTimelineOpen(false)}
              onSaved={handleTimelineSaved}
            />
            <ProjectPaymentSettings
              project={data.project}
              currency={displayCurrency}
              exchangeRateSnapshot={exchangeRateSnapshot}
              formatAmount={formatAmount}
              t={t}
              onSaved={handlePaymentsSaved}
            />
            <ProjectBasicsEditModal
              open={basicsOpen}
              project={data.project}
              groups={data.groups}
              t={t}
              onClose={() => setBasicsOpen(false)}
              onSaved={handleBasicsSaved}
            />

            <section className="mt-6 grid min-w-0 gap-4 max-[560px]:gap-3 xl:grid-cols-[minmax(0,0.72fr)_minmax(320px,0.42fr)]">
              <Card tone="white" className="min-w-0 p-5 max-[560px]:p-4 max-[360px]:p-3 sm:p-6">
                <SectionHeader
                  eyebrow={t("timeline")}
                  title={t("phases")}
                  className="min-w-0"
                  eyebrowClassName="max-[560px]:mb-1 max-[560px]:text-xs max-[360px]:text-[10px]"
                  titleClassName="break-words [overflow-wrap:anywhere] max-[560px]:text-[clamp(1.25rem,5vw,1.5rem)]"
                />
                <div className="mt-5 grid min-w-0 gap-3 max-[560px]:mt-4 max-[560px]:gap-2">
                  {data.project.phases.map((phase, index) => (
                    <motion.div
                      key={phase.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-studio bg-cloud/70 p-4 max-[560px]:gap-2 max-[560px]:rounded-2xl max-[560px]:p-3 max-[360px]:p-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                    >
                      <span
                        className={cn(
                          "grid size-12 shrink-0 place-items-center rounded-full font-black max-[560px]:size-[clamp(2rem,8vw,3rem)] max-[560px]:text-sm max-[360px]:text-xs",
                          phaseTone[phase.status]
                        )}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="break-words text-xl font-black leading-tight [overflow-wrap:anywhere] max-[560px]:text-[clamp(0.875rem,3.5vw,1.25rem)]">
                          {translateDomainLabel(phase.name, phaseNameKeys, t) || t("untitledStage")}
                        </h3>
                        <p className="mt-1 break-words text-sm font-semibold leading-6 text-muted [overflow-wrap:anywhere] max-[560px]:text-[clamp(10px,2.5vw,14px)] max-[560px]:leading-5 max-[360px]:leading-4">
                          {phase.description || t(phaseDescriptionKey)}
                        </p>
                      </div>
                      <div className="col-span-2 flex min-w-0 items-center gap-1.5 break-words text-sm font-black text-muted [overflow-wrap:anywhere] max-[560px]:text-[clamp(10px,2.4vw,14px)] sm:col-span-1 sm:block">
                        <CalendarDays className="size-[17px] shrink-0 sm:mb-1 max-[560px]:size-3.5" />
                        <span className="min-w-0 break-words">{formatLocalizedDate(phase.endDate, language)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>

              <div className="grid min-w-0 gap-4 max-[560px]:gap-3">
                <Card tone="lime" className="min-w-0 bg-[#9affe1] p-5 max-[560px]:p-4 max-[360px]:p-3">
                  <div className="mb-4 flex min-w-0 items-center gap-3 max-[560px]:mb-3 max-[560px]:gap-2">
                    <Wrench className="size-5 shrink-0 max-[560px]:size-4 max-[360px]:size-3.5" />
                    <h2 className="min-w-0 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere] max-[560px]:text-[clamp(1.1rem,4.5vw,1.5rem)]">
                      {t("tools")}
                    </h2>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2 max-[560px]:gap-1.5">
                    {data.project.tools.map((tool) => (
                      <Pill
                        key={tool.id}
                        tone="cloud"
                        className="max-w-full break-words [overflow-wrap:anywhere] max-[560px]:min-h-8 max-[560px]:px-3 max-[560px]:text-xs max-[360px]:min-h-7 max-[360px]:px-2 max-[360px]:text-[10px]"
                      >
                        {tool.name}
                      </Pill>
                    ))}
                  </div>
                </Card>

                <Card tone="white" className="min-w-0 p-5 max-[560px]:p-4 max-[360px]:p-3">
                  <div className="mb-4 flex min-w-0 items-center gap-3 max-[560px]:mb-3 max-[560px]:gap-2">
                    <UserRound className="size-5 shrink-0 max-[560px]:size-4 max-[360px]:size-3.5" />
                    <h2 className="min-w-0 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere] max-[560px]:text-[clamp(1.1rem,4.5vw,1.5rem)]">
                      {t("peopleTeam")}
                    </h2>
                  </div>
                  <div className="grid min-w-0 gap-3 max-[560px]:gap-2">
                    {data.project.people.map((person) => (
                      <div key={person.id} className="flex min-w-0 items-center gap-3 rounded-studio bg-cloud/70 p-3 max-[560px]:gap-2 max-[560px]:rounded-2xl max-[560px]:p-2.5 max-[360px]:p-2">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-black text-white max-[560px]:size-9 max-[560px]:text-xs max-[360px]:size-8 max-[360px]:text-[10px]">
                          {person.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                          <p className="break-words font-black leading-tight [overflow-wrap:anywhere] max-[560px]:text-sm max-[360px]:text-xs">
                            {person.name}
                          </p>
                          <p className="mt-0.5 break-words text-sm font-semibold leading-tight text-muted [overflow-wrap:anywhere] max-[560px]:text-xs max-[360px]:text-[10px]">
                            {person.role}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </section>

            <section className="mt-6">
              <Card tone="dark" className="min-w-0 p-5 max-[560px]:p-4 max-[360px]:p-3">
                    <div className="flex min-w-0 items-center gap-3 max-[560px]:gap-2">
                      <GitBranch className="size-[21px] shrink-0 text-limepop max-[560px]:size-4 max-[360px]:size-3.5" />
                      <h2 className="min-w-0 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere] max-[560px]:text-[clamp(1.1rem,4.5vw,1.5rem)]">
                        {t("releaseNodes")}
                      </h2>
                    </div>
                    <div className="mt-5 grid min-w-0 gap-3 max-[560px]:mt-4 max-[560px]:gap-2">
                      {[
                        {
                          key: "demo",
                          title: t("demoRelease"),
                          versionField: "demoVersion" as const,
                          dateField: "demoReleaseDate" as const
                        },
                        {
                          key: "official",
                          title: t("officialRelease"),
                          versionField: "officialVersion" as const,
                          dateField: "officialReleaseDate" as const
                        }
                      ].map((releaseNode) => {
                        const isFilled = Boolean(releasePlan[releaseNode.versionField] && releasePlan[releaseNode.dateField]);

                        return (
                          <div key={releaseNode.key} className="min-w-0 rounded-studio bg-white/10 p-4 max-[560px]:rounded-2xl max-[560px]:p-3 max-[360px]:p-2.5">
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 max-[560px]:gap-2">
                              <h3 className="min-w-0 break-words text-lg font-black leading-tight text-white [overflow-wrap:anywhere] max-[560px]:text-[clamp(0.9rem,3.5vw,1.125rem)]">
                                {releaseNode.title}
                              </h3>
                              <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 max-[560px]:gap-1.5">
                                <Pill
                                  tone={isFilled ? "lime" : "cloud"}
                                  className="max-w-full break-words text-center leading-tight [overflow-wrap:anywhere] max-[560px]:min-h-8 max-[560px]:px-3 max-[560px]:text-[10px] max-[360px]:min-h-7 max-[360px]:px-2"
                                >
                                  {isFilled ? t("versionReleased") : t("releasePending")}
                                </Pill>
                                {isFilled ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleReleaseNodeDeleted(releaseNode.versionField, releaseNode.dateField);
                                    }}
                                    disabled={releaseSaving}
                                    aria-label={`${t("deleteReleaseNode")} ${releaseNode.title}`}
                                    className="grid size-10 shrink-0 place-items-center rounded-full bg-white/12 text-white transition hover:bg-coral disabled:pointer-events-none disabled:opacity-50 max-[560px]:size-8"
                                  >
                                    <Trash2 className="size-[17px] max-[560px]:size-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-4 grid min-w-0 gap-3 max-[560px]:mt-3 max-[560px]:gap-2 sm:grid-cols-2">
                              <label className="grid min-w-0 gap-2 max-[560px]:gap-1.5">
                                <span className={releaseLabelClass}>{t("versionNumber")}</span>
                                <input
                                  value={releasePlan[releaseNode.versionField]}
                                  onChange={(event) => updateReleasePlanField(releaseNode.versionField, event.target.value)}
                                  className={releaseInputClass}
                                  placeholder="v1.0.0"
                                />
                              </label>
                              <label className="grid min-w-0 gap-2 max-[560px]:gap-1.5">
                                <span className={releaseLabelClass}>{t("releaseDate")}</span>
                                <input
                                  type="date"
                                  value={releasePlan[releaseNode.dateField]}
                                  onChange={(event) => updateReleasePlanField(releaseNode.dateField, event.target.value)}
                                  className={releaseInputClass}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                      <Button
                        variant="secondary"
                        size="lg"
                        className="w-full min-w-0 max-[560px]:h-11 max-[560px]:px-3 max-[560px]:text-xs max-[360px]:h-10 max-[360px]:px-2 max-[360px]:text-[10px]"
                        disabled={releaseSaving}
                        onClick={() => {
                          void handleReleasePlanSaved();
                        }}
                      >
                        <Save className="size-[19px] shrink-0 max-[560px]:size-4" />
                        <span className="min-w-0 break-words leading-tight">{releaseSaving ? t("saving") : t("saveReleasePlan")}</span>
                      </Button>
                    </div>
              </Card>
            </section>

            <section className="mt-6">
              <Card tone="white" className="min-w-0 p-5 max-[560px]:p-4 max-[360px]:p-3 sm:p-6">
                <div className="flex min-w-0 flex-col gap-5 max-[560px]:gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3 max-[560px]:gap-2">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-limepop max-[560px]:size-9 max-[360px]:size-8">
                      {data.project.archivedAt ? (
                        <RotateCcw className="size-[19px] max-[560px]:size-4 max-[360px]:size-3.5" />
                      ) : (
                        <Archive className="size-[19px] max-[560px]:size-4 max-[360px]:size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-xs font-black uppercase tracking-[0.12em] text-muted max-[560px]:text-[10px] max-[360px]:tracking-[0.08em]">
                        {t("navArchive")}
                      </p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-3 max-[560px]:gap-2">
                        <h2 className="min-w-0 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere] max-[560px]:text-[clamp(1.05rem,4.5vw,1.5rem)]">
                          {t("archiveReleaseNode")}
                        </h2>
                        <Pill
                          tone={data.project.archivedAt ? "lime" : "cloud"}
                          className="max-w-full break-words leading-tight [overflow-wrap:anywhere] max-[560px]:min-h-8 max-[560px]:px-3 max-[560px]:text-[10px] max-[360px]:min-h-7 max-[360px]:px-2"
                        >
                          {data.project.archivedAt ? t("archiveArchivedStatus") : t("archiveActiveStatus")}
                        </Pill>
                      </div>
                      {data.project.archivedAt ? (
                        <p className="mt-2 break-words text-xs font-black text-muted [overflow-wrap:anywhere] max-[360px]:text-[10px]">
                          {t("archivedOn")}: {formatLocalizedDate(data.project.archivedAt.slice(0, 10), language)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant={data.project.archivedAt ? "ghost" : "secondary"}
                    size="md"
                    className="h-auto min-h-12 w-full min-w-0 py-2 sm:w-auto max-[560px]:min-h-10 max-[560px]:px-3 max-[560px]:text-xs max-[360px]:px-2 max-[360px]:text-[10px]"
                    onClick={() => setArchiveDialogOpen(true)}
                  >
                    {data.project.archivedAt ? (
                      <RotateCcw className="size-[18px] shrink-0 max-[560px]:size-4" />
                    ) : (
                      <Archive className="size-[18px] shrink-0 max-[560px]:size-4" />
                    )}
                    <span className="min-w-0 break-words leading-tight">
                      {data.project.archivedAt ? t("restoreProject") : t("archiveProject")}
                    </span>
                  </Button>
                </div>
              </Card>
            </section>

            <ProjectSaveControls
              project={data.project}
              t={t}
	              setNotice={setNotice}
	              onLoaded={handleProjectLoaded}
	              onDeleted={() => router.replace(data.project.archivedAt ? "/archive" : "/projects")}
	            />
	            <DeleteConfirmDialog
	              open={archiveDialogOpen}
	              acknowledgementLabel={t("dangerousActionAcknowledgement")}
	              title={data.project.archivedAt ? t("restoreProjectTitle") : t("archiveProjectTitle")}
	              description={data.project.archivedAt ? t("restoreProjectDescription") : t("archiveProjectDescription")}
	              warning={data.project.archivedAt ? t("restoreProjectWarning") : t("archiveProjectWarning")}
	              cancelLabel={t("cancel")}
	              confirmLabel={data.project.archivedAt ? t("restoreProject") : t("archiveProject")}
	              onCancel={() => setArchiveDialogOpen(false)}
	              onConfirm={() => {
	                setArchiveDialogOpen(false);
	                void handleArchiveToggle();
	              }}
	            />
	          </>
	        )}
      </div>
    </AppShell>
  );
}
