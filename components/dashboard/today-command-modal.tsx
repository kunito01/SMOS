"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  formatDemoEntityName,
  phaseNameKeys,
  projectNameKeys,
  statusKeys,
  taskTitleKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import type { Project, Task } from "@/lib/types";
import { projectPath } from "@/lib/utils/app-routes";
import { cn } from "@/lib/utils/cn";

type TodayCommandModalProps = {
  open: boolean;
  project?: Project;
  tasks: Task[];
  onClose: () => void;
};

export function TodayCommandModal({ open, project, tasks, onClose }: TodayCommandModalProps) {
  const { language, t } = useI18n();

  if (!open) {
    return null;
  }

  const currentPhase = project?.phases.find((phase) => phase.id === project.currentPhaseId);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm">
      <Card tone="white" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-5 sm:p-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-limepop">
                <CalendarDays size={21} />
              </span>
              <p className="text-sm font-black uppercase text-muted">{t("openToday")}</p>
            </div>
            <h2 className="mt-3 text-3xl font-black leading-none">{t("todayCommandCenter")}</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">{t("todayCommandBody")}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label={t("cancel")} onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <div className="studio-scroll max-h-[68vh] overflow-y-auto p-5 sm:p-6">
          {project ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(280px,0.4fr)]">
              <Card tone="dark" className="p-5">
                <p className="text-sm font-bold text-white/60">{t("todayProjectSignal")}</p>
                <h3 className="mt-2 text-3xl font-black leading-tight">
                  {formatDemoEntityName(
                    translateDomainLabel(project.name, projectNameKeys, t),
                    project.id,
                    "project",
                    t
                  )}
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Pill tone="lime">{t(statusKeys[project.status])}</Pill>
                  <Pill tone="cloud">
                    {translateDomainLabel(currentPhase?.name ?? "", phaseNameKeys, t) || t("untitledStage")}
                  </Pill>
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-sm font-black text-white/70">
                    <span>{t("averageProgressShort")}</span>
                    <span>{project.progress}%</span>
                  </div>
                  <ProgressBar value={project.progress} className="bg-white/15" barClassName="bg-limepop" />
                </div>
                <Link href={projectPath(project.id)} prefetch={false}>
                  <Button variant="secondary" size="md" className="mt-5">
                    {t("openProjectDetail")}
                  </Button>
                </Link>
              </Card>

              <Card tone="lime" className="p-5">
                <p className="text-sm font-bold text-ink/60">{t("todayDueSoon")}</p>
                <h3 className="mt-2 text-3xl font-black">{tasks.filter((task) => !task.completed).length}</h3>
                <p className="mt-3 text-sm font-bold leading-6 text-ink/70">
                  {formatLocalizedDate(project.endDate, language)}
                </p>
              </Card>

              <Card tone="white" className="p-5 xl:col-span-2">
                <h3 className="text-2xl font-black">{t("todayNextUp")}</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {tasks.length ? (
                    tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 rounded-studio bg-cloud/70 p-3">
                        <span
                          className={cn(
                            "grid size-11 shrink-0 place-items-center rounded-full",
                            task.completed ? "bg-limepop text-ink" : "bg-white text-muted"
                          )}
                        >
                          {task.completed ? <CheckCircle2 size={22} /> : <Clock3 size={21} />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-black">
                            {translateDomainLabel(task.title, taskTitleKeys, t) || t("untitledTask")}
                          </p>
                          <p className="mt-1 text-xs font-bold text-muted">
                            {formatLocalizedDate(task.dueDate ?? project.endDate, language)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm font-bold text-muted">{t("todayNoTasks")}</p>
                  )}
                </div>
              </Card>
            </div>
          ) : (
            <p className="text-sm font-bold text-muted">{t("noProjects")}</p>
          )}
        </div>
      </Card>
    </div>
    </ModalPortal>
  );
}
