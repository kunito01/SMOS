"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers3, Plus, Rocket, Sparkles } from "lucide-react";
import { ProjectCreateModal } from "@/components/dashboard/project-create-modal";
import { ProjectCard } from "@/components/domain/project-card";
import { AppShell } from "@/components/layout/app-shell";
import { PixelVolcanoScene } from "@/components/projects/pixel-volcano-scene";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi, projectsApi } from "@/lib/api";
import type { Company, Project, ProjectGroup } from "@/lib/types";
import { projectPath } from "@/lib/utils/app-routes";

type ProjectsData = {
  companies: Company[];
  projects: Project[];
  groups: ProjectGroup[];
};

export function ProjectsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [data, setData] = useState<ProjectsData | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [companies, projects, groups] = await Promise.all([
        companiesApi.listCompanies(),
        projectsApi.listProjects(),
        groupsApi.listGroups()
      ]);

      if (isMounted) {
        setData({ companies, projects, groups });
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

  const openCreateModal = async () => {
    const groups = await groupsApi.listGroups();
    setData((current) => (current ? { ...current, groups } : current));
    setCreateOpen(true);
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        <section>
          <Card tone="lime" className="relative min-h-[30rem] overflow-hidden bg-[#e8663f] p-6 sm:p-8">
            <PixelVolcanoScene />
            <div className="projects-volcano-copy-wash" />
            <div className="relative z-10 flex min-h-[26rem] flex-col justify-between gap-8">
              <div className="max-w-4xl">
                <p className="text-sm font-black uppercase text-ink/62 drop-shadow-[0_1px_0_rgba(255,225,143,0.48)]">{t("creativeProjects")}</p>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] drop-shadow-[0_3px_0_rgba(255,225,143,0.4)] sm:text-6xl">
                  {t("allProjects")}
                </h1>
                <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/80 drop-shadow-[0_1px_0_rgba(255,225,143,0.34)]">
                  {t("allProjectsBody")}
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Button size="lg" disabled={!data} onClick={() => void openCreateModal()}>
                    <Plus size={19} />
                    {t("newProject")}
                  </Button>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-3 gap-[clamp(4px,1.6vw,12px)]">
                {[
                  { label: t("projectsCount"), value: stats.total, icon: Layers3 },
                  { label: t("activeCount"), value: stats.active, icon: Rocket },
                  { label: t("averageProgressShort"), value: `${stats.progress}%`, icon: Sparkles }
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="companies-hero-metric-glass min-h-[clamp(92px,25vw,128px)] min-w-0 overflow-hidden rounded-studio bg-white/[0.38] p-[clamp(5px,2vw,16px)] text-ink shadow-soft ring-1 ring-white/[0.56] backdrop-blur-xl"
                    >
                      <div className="flex h-full min-w-0 flex-col justify-between gap-[clamp(6px,2vw,16px)]">
                        <span className="grid size-[clamp(22px,7vw,40px)] shrink-0 place-items-center rounded-full bg-white/58 text-ink shadow-sm ring-1 ring-white/50">
                          <Icon className="size-[clamp(12px,3.5vw,18px)]" />
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-full whitespace-nowrap text-[clamp(1rem,6vw,2.25rem)] font-black leading-none tracking-[-0.03em] tabular-nums">
                            {item.value}
                          </p>
                          <p className="mt-[clamp(3px,1vw,8px)] max-w-full whitespace-nowrap text-[clamp(8px,2.2vw,14px)] font-black leading-none tracking-[-0.04em] text-current/70">
                            {item.label}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </section>

        {!data ? (
          <LoadingState label={t("loading")} className="mt-4" />
        ) : (
          <section className="mt-6">
            <SectionHeader eyebrow={t("activeMaps")} title={t("projectIndexTitle")} />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.projects.map((project) => (
                <ProjectCard key={project.id} project={project} groups={data.groups} t={t} />
              ))}
            </div>
          </section>
        )}
        <ProjectCreateModal
          open={createOpen}
          companies={data?.companies ?? []}
          groups={data?.groups ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={(project) => {
            setCreateOpen(false);
            router.push(projectPath(project.id));
          }}
        />
      </div>
    </AppShell>
  );
}
