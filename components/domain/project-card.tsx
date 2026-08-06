"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { useI18n } from "@/components/providers/app-providers";
import { ProjectReleaseBadges } from "@/components/projects/project-release-badges";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  formatDemoEntityName,
  getProjectGroupDisplayName,
  projectNameKeys,
  statusKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Project, ProjectGroup } from "@/lib/types";
import { projectPath } from "@/lib/utils/app-routes";

type ProjectCardProps = {
  project: Project;
  groups: ProjectGroup[];
  t: (key: TranslationKey) => string;
  href?: string;
  actionLabel?: string;
};

const projectStatusTone: Record<Project["status"], "aqua" | "lime" | "coral" | "dark" | "cloud"> = {
  planning: "cloud",
  active: "coral",
  paused: "dark",
  terminated: "cloud",
  completed: "lime"
};

export function ProjectCard({ project, groups, t, href = projectPath(project.id), actionLabel }: ProjectCardProps) {
  const { language } = useI18n();
  const group = groups.find((item) => item.id === project.groupId);

  return (
    <Link href={href} prefetch={false} className="block rounded-studio-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral">
      <ImageCard
        imageUrl={project.coverImage}
        title={formatDemoEntityName(
          translateDomainLabel(project.name, projectNameKeys, t),
          project.id,
          "project",
          t,
          project.isExample
        )}
        meta={group ? getProjectGroupDisplayName(group, language, t) : ""}
        className="min-h-72 transition duration-200 hover:-translate-y-1"
        action={<ProjectReleaseBadges project={project} t={t} className="max-w-48" />}
      >
        <div className="rounded-full bg-white/[0.88] p-1">
          <ProgressBar value={project.progress} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <Pill tone={projectStatusTone[project.status]} className="min-h-7 px-3 text-xs font-black">
              {t(statusKeys[project.status])}
            </Pill>
            {project.codingDevice ? (
              <span className="inline-flex min-h-7 max-w-36 items-center rounded-full bg-[#112f45] px-3 text-xs font-black text-white">
                <span className="truncate">{project.codingDevice}</span>
              </span>
            ) : null}
          </span>
          <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-limepop px-4 text-sm font-semibold text-ink">
            {actionLabel ?? t("viewProject")}
            <ArrowRight size={16} />
          </span>
        </div>
      </ImageCard>
    </Link>
  );
}
