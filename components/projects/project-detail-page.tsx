"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Activity,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileStack,
  GitBranch,
  Share2,
  TrendingUp,
  UserRound,
  Wrench
} from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionHeader } from "@/components/ui/section-header";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { ProjectTimelineChart } from "@/components/projects/project-timeline-chart";
import { ProjectTimelineSettingsModal } from "@/components/projects/project-timeline-settings-modal";
import { ProjectPaymentSettings } from "@/components/projects/project-payment-settings";
import { groupsApi, projectsApi } from "@/lib/api";
import { getProjectSubscriptionCost } from "@/lib/mock";
import {
  activityTitleKeys,
  activityToneClasses,
  deliverableTitleKeys,
  deliverableDescriptionKey,
  groupNameKeys,
  materialNameKeys,
  materialStatusKeys,
  materialTypeKeys,
  phaseDescriptionKey,
  phaseNameKeys,
  projectDescriptionKey,
  projectNameKeys,
  statusKeys,
  taskTitleKeys,
  translateDomainLabel,
  versionNameKeys,
  versionStatusKeys,
  versionSummaryKeys
} from "@/lib/i18n/domain-labels";
import type { Person, Project, ProjectGroup } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, toCny } from "@/lib/utils/money";

type ProjectDetailData = {
  project: Project;
  groups: ProjectGroup[];
};

const phaseTone = {
  completed: "bg-limepop text-ink",
  active: "bg-coral text-white",
  "not-started": "bg-cloud text-muted"
} as const;

const materialStatusTone = {
  draft: "cloud",
  review: "coral",
  approved: "lime"
} as const;

const versionStatusTone = {
  draft: "cloud",
  review: "coral",
  released: "lime"
} as const;

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<ProjectDetailData | null>(null);
  const [notice, setNotice] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false);

  const loadProject = async () => {
    const [project, groups] = await Promise.all([
      projectsApi.getProject(projectId),
      groupsApi.listGroups()
    ]);
    setData({ project, groups });
  };

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [project, groups] = await Promise.all([
        projectsApi.getProject(projectId),
        groupsApi.listGroups()
      ]);

      if (isMounted) {
        setData({ project, groups });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const peopleById = useMemo(() => {
    return new Map((data?.project.people ?? []).map((person) => [person.id, person]));
  }, [data?.project.people]);
  const group = data?.groups.find((item) => item.id === data.project.groupId);
  const currentPhase = data?.project.phases.find((phase) => phase.id === data.project.currentPhaseId);
  const avatars = data?.project.people.map((person) => ({ name: person.name, image: person.avatar })) ?? [];
  const projectDeliverables = data?.project.phases.flatMap((phase) => phase.deliverables) ?? [];
  const projectTasks = projectDeliverables.flatMap((deliverable) => deliverable.tasks);
  const completedTaskCount = projectTasks.filter((task) => task.completed).length;
  const paymentSummary = useMemo(() => {
    if (!data?.project) {
      return {
        actualCost: 0,
        actualProfit: 0,
        plannedReceivable: 0,
        receivedRevenue: 0
      };
    }

    const plannedReceivable = (data.project.payments ?? [])
      .filter((payment) => payment.type === "planned")
      .reduce((sum, payment) => sum + toCny(payment.amount, payment.currency), 0);
    const receivedRevenue = (data.project.payments ?? [])
      .filter((payment) => payment.type === "received")
      .reduce((sum, payment) => sum + toCny(payment.amount, payment.currency), 0);
    const actualCost = data.project.costs
      .filter((cost) => cost.isActual)
      .reduce((sum, cost) => sum + toCny(cost.amount, cost.currency), 0) + getProjectSubscriptionCost(data.project);

    return {
      actualCost,
      actualProfit: receivedRevenue - actualCost,
      plannedReceivable,
      receivedRevenue
    };
  }, [data?.project]);

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
    setNotice(t("paymentStatusUpdated"));
    window.setTimeout(() => setNotice(""), 1600);
  };

  const personName = (person?: Person) => person?.name ?? t("ownerProduction");

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)]">
              <ImageCard
                imageUrl={data.project.coverImage}
                title={translateDomainLabel(data.project.name, projectNameKeys, t)}
                meta={translateDomainLabel(group?.name ?? "", groupNameKeys, t)}
                heightClassName="min-h-[31rem]"
              >
                <p className="max-w-2xl text-base font-bold leading-7 text-white/80">
                  {t(projectDescriptionKey)}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <AvatarStack avatars={avatars} />
                  <Pill tone="lime">{t(statusKeys[data.project.status])}</Pill>
                  <Link href="/projects" prefetch={false}>
                    <Button variant="ghost" size="md">
                      <ArrowLeft size={18} />
                      {t("allProjects")}
                    </Button>
                  </Link>
                </div>
              </ImageCard>

              <div className="grid gap-4">
                <Card
                  tone="white"
                  className="p-5 shadow-lift ring-1 ring-white/[0.34] backdrop-blur-xl"
                  style={{ backgroundColor: "#98dbb1" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black uppercase text-ink/60">{t("projectSummary")}</p>
                      <h2 className="mt-2 text-3xl font-black leading-none">{translateDomainLabel(data.project.name, projectNameKeys, t)}</h2>
                    </div>
                    <ProgressRing value={data.project.progress} size={104} strokeWidth={12} />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[
                      { label: t("averageProgressShort"), value: `${data.project.progress}%`, icon: Activity },
                      {
                        label: t("currentPhase"),
                        value: translateDomainLabel(currentPhase?.name ?? "", phaseNameKeys, t),
                        icon: GitBranch
                      },
                      { label: t("peopleTeam"), value: data.project.people.length, icon: UserRound },
                      { label: t("tools"), value: data.project.tools.length, icon: Wrench },
                      { label: t("deliverables"), value: `${projectDeliverables.filter((item) => !item.completed).length} / ${projectDeliverables.length}`, icon: FileStack },
                      { label: t("tasks"), value: `${completedTaskCount} / ${projectTasks.length}`, icon: CheckCircle2 },
                      { label: t("receivedPayment"), value: formatCurrency(paymentSummary.receivedRevenue), icon: Banknote },
                      { label: t("currentProfit"), value: formatCurrency(paymentSummary.actualProfit), icon: TrendingUp }
                    ].map((item) => {
                      const Icon = item.icon;

                      return (
                        <div key={item.label} className="rounded-studio bg-white/58 p-3 shadow-soft ring-1 ring-white/[0.38]">
                          <div className="flex items-center gap-2">
                            <span className="grid size-8 place-items-center rounded-full bg-limepop text-ink">
                              <Icon size={16} />
                            </span>
                            <span className="text-xs font-black uppercase text-ink/58">{item.label}</span>
                          </div>
                          <p className="mt-3 truncate text-2xl font-black">{item.value}</p>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card tone="dark" className="p-5">
                  <p className="text-sm font-bold text-white/60">{t("projectActions")}</p>
                  <div className="mt-4 grid gap-3">
                    <Link href={`/projects/${data.project.id}/costs`} prefetch={false}>
                      <Button variant="secondary" size="lg" className="w-full">
                        <CircleDollarSign size={19} />
                        {t("openCosts")}
                      </Button>
                    </Link>
                    <Link href={`/projects/${data.project.id}/share`} prefetch={false}>
                      <Button variant="ghost" size="lg" className="w-full">
                        <Share2 size={19} />
                        {t("shareSettings")}
                      </Button>
                    </Link>
                  </div>
                  {notice ? <p className="mt-4 text-sm font-black text-limepop">{notice}</p> : null}
                </Card>
              </div>
            </section>

            <ProjectTimelineChart
              project={data.project}
              t={t}
              onEdit={() => setTimelineOpen(true)}
              onTaskToggle={(taskId, completed) => {
                void handleTaskToggle(taskId, completed);
              }}
            />
            <ProjectTimelineSettingsModal
              open={timelineOpen}
              project={data.project}
              t={t}
              onClose={() => setTimelineOpen(false)}
              onSaved={handleTimelineSaved}
            />
            <ProjectPaymentSettings project={data.project} t={t} onSaved={handlePaymentsSaved} />

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(320px,0.42fr)]">
              <Card tone="white" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("timeline")} title={t("phases")} />
                <div className="mt-5 grid gap-3">
                  {data.project.phases.map((phase, index) => (
                    <motion.div
                      key={phase.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="grid gap-3 rounded-studio bg-cloud/70 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                    >
                      <span className={cn("grid size-12 place-items-center rounded-full font-black", phaseTone[phase.status])}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xl font-black">{translateDomainLabel(phase.name, phaseNameKeys, t)}</h3>
                        <p className="mt-1 text-sm font-semibold leading-6 text-muted">
                          {phase.description || t(phaseDescriptionKey)}
                        </p>
                      </div>
                      <div className="text-sm font-black text-muted">
                        <CalendarDays size={17} className="mb-1" />
                        {phase.endDate}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>

              <div className="grid gap-4">
                <Card tone="lime" className="p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <Wrench size={20} />
                    <h2 className="text-2xl font-black">{t("tools")}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.project.tools.map((tool) => (
                      <Pill key={tool.id} tone="cloud">{tool.name}</Pill>
                    ))}
                  </div>
                </Card>

                <Card tone="white" className="p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <UserRound size={20} />
                    <h2 className="text-2xl font-black">{t("peopleTeam")}</h2>
                  </div>
                  <div className="grid gap-3">
                    {data.project.people.map((person) => (
                      <div key={person.id} className="flex items-center gap-3 rounded-studio bg-cloud/70 p-3">
                        <span className="grid size-10 place-items-center rounded-full bg-ink text-sm font-black text-white">
                          {person.name.slice(0, 1)}
                        </span>
                        <div>
                          <p className="font-black">{person.name}</p>
                          <p className="text-sm font-semibold text-muted">{person.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </section>

            <section className="mt-6">
              <SectionHeader eyebrow={t("contentBoard")} title={t("materials")} />
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.44fr)]">
                <Card tone="white" className="p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <FileStack size={22} />
                    <h2 className="text-2xl font-black">{t("materials")}</h2>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {data.project.materials.map((material) => (
                      <div key={material.id} className="rounded-studio bg-cloud/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase text-muted">
                              {t(materialTypeKeys[material.type])}
                            </p>
                            <h3 className="mt-1 truncate text-xl font-black">
                              {translateDomainLabel(material.name, materialNameKeys, t)}
                            </h3>
                          </div>
                          <Pill tone={materialStatusTone[material.status]}>
                            {t(materialStatusKeys[material.status])}
                          </Pill>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-muted">
                          {t("owner")}: {personName(peopleById.get(material.ownerId))}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-muted">
                          {t("updated")}: {material.updatedAt}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="grid gap-4">
                  <Card tone="dark" className="p-5">
                    <div className="flex items-center gap-3">
                      <GitBranch size={21} className="text-limepop" />
                      <h2 className="text-2xl font-black">{t("versions")}</h2>
                    </div>
                    <div className="mt-5 grid gap-3">
                      {data.project.versions.map((version) => (
                        <div key={version.id} className="rounded-studio bg-white/10 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-black">
                              {translateDomainLabel(version.name, versionNameKeys, t)}
                            </h3>
                            <Pill tone={versionStatusTone[version.status]}>
                              {t(versionStatusKeys[version.status])}
                            </Pill>
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-6 text-white/65">
                            {translateDomainLabel(version.summary, versionSummaryKeys, t)}
                          </p>
                          <p className="mt-2 text-xs font-black text-white/45">
                            {t("created")}: {version.createdAt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card tone="lime" className="p-5">
                    <div className="flex items-center gap-3">
                      <Activity size={21} />
                      <h2 className="text-2xl font-black">{t("recentActivity")}</h2>
                    </div>
                    <div className="mt-5 grid gap-3">
                      {data.project.activity.map((event) => (
                        <div key={event.id} className="flex gap-3 rounded-studio bg-white/65 p-3">
                          <span className={cn("mt-1 size-3 shrink-0 rounded-full", activityToneClasses[event.tone])} />
                          <div className="min-w-0">
                            <p className="font-black">
                              {translateDomainLabel(event.title, activityTitleKeys, t)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-ink/60">
                              {personName(peopleById.get(event.actorId))} · {event.createdAt}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </section>

            <section className="mt-6">
              <SectionHeader eyebrow={t("deliverables")} title={t("tasks")} />
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {data.project.phases.flatMap((phase) =>
                  phase.deliverables.map((deliverable) => (
                    <Card key={deliverable.id} tone="white" className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-muted">
                            {translateDomainLabel(phase.name, phaseNameKeys, t)}
                          </p>
                          <h3 className="mt-1 text-2xl font-black">
                            {translateDomainLabel(deliverable.title, deliverableTitleKeys, t)}
                          </h3>
                        </div>
                        <span className={cn("grid size-11 place-items-center rounded-full", deliverable.completed ? "bg-limepop" : "bg-cloud")}>
                          {deliverable.completed ? <CheckCircle2 size={22} /> : <Clock3 size={21} />}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-6 text-muted">{t(deliverableDescriptionKey)}</p>
                      <div className="mt-4 grid gap-2">
                        {deliverable.tasks.map((task) => (
                          <label key={task.id} className="flex cursor-pointer items-center gap-3 rounded-studio bg-cloud/70 p-3">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={(event) => handleTaskToggle(task.id, event.target.checked)}
                              className="size-5 accent-coral"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-black">
                                {translateDomainLabel(task.title, taskTitleKeys, t)}
                              </span>
                              <span className="mt-1 block text-xs font-semibold text-muted">
                                {t("owner")}: {personName(peopleById.get(task.assigneeId))} · {t("dueDate")}: {task.dueDate}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
