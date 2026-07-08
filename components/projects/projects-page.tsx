"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers3, Rocket, Sparkles } from "lucide-react";
import { MetricTile } from "@/components/domain/metric-tile";
import { ProjectCard } from "@/components/domain/project-card";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/section-header";
import { groupsApi, projectsApi } from "@/lib/api";
import type { Project, ProjectGroup } from "@/lib/types";

type ProjectsData = {
  projects: Project[];
  groups: ProjectGroup[];
};

export function ProjectsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<ProjectsData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [projects, groups] = await Promise.all([
        projectsApi.listProjects(),
        groupsApi.listGroups()
      ]);

      if (isMounted) {
        setData({ projects, groups });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const projects = data?.projects ?? [];
    return {
      total: projects.length,
      active: projects.filter((project) => project.status === "active").length,
      progress: projects.length
        ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
        : 0
    };
  }, [data]);

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
          <Card tone="lime" className="relative overflow-hidden p-6 sm:p-8">
            <p className="text-sm font-black uppercase text-ink/60">{t("creativeProjects")}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] sm:text-6xl">
              {t("allProjects")}
            </h1>
            <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/65">
              {t("allProjectsBody")}
            </p>
            <div className="absolute -right-16 -top-20 size-72 rounded-full bg-white/[0.35]" />
          </Card>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <MetricTile label={t("projectsCount")} value={stats.total} icon={Layers3} tone="aqua" />
            <MetricTile label={t("activeCount")} value={stats.active} icon={Rocket} tone="coral" />
            <MetricTile label={t("averageProgressShort")} value={`${stats.progress}%`} icon={Sparkles} tone="dark" />
          </div>
        </section>

        {!data ? (
          <LoadingState label={t("loading")} className="mt-4" />
        ) : (
          <section className="mt-6">
            <SectionHeader eyebrow={t("activeMaps")} title={t("creativeProjects")} />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.projects.map((project) => (
                <ProjectCard key={project.id} project={project} groups={data.groups} t={t} />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
