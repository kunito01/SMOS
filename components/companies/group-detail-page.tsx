"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FolderKanban, Layers3, Rocket, Sparkles } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { MetricTile } from "@/components/domain/metric-tile";
import { ProjectCard } from "@/components/domain/project-card";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi, projectsApi } from "@/lib/api";
import { groupDescriptionKeys, groupNameKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import type { Company, DashboardOverview, Project, ProjectGroup } from "@/lib/types";

type GroupDetailData = {
  group: ProjectGroup;
  company: Company;
  siblingGroups: ProjectGroup[];
  projects: Project[];
  overview: DashboardOverview;
};

export function GroupDetailPage({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<GroupDetailData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const group = await groupsApi.getGroup(groupId);
      const [company, siblingGroups, projects, overview] = await Promise.all([
        companiesApi.getCompany(group.companyId),
        companiesApi.listCompanyGroups(group.companyId),
        groupsApi.listGroupProjects(groupId),
        projectsApi.getDashboardOverview({ type: "group", id: groupId })
      ]);

      if (isMounted) {
        setData({ group, company, siblingGroups, projects, overview });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [groupId]);

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.48fr)]">
              <ImageCard
                imageUrl={data.group.coverImage}
                title={translateDomainLabel(data.group.name, groupNameKeys, t)}
                meta={data.company.name}
                heightClassName="min-h-[28rem]"
              >
                <p className="max-w-2xl text-base font-bold leading-7 text-white/80">
                  {translateDomainLabel(data.group.name, groupDescriptionKeys, t)}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={`/companies/${data.company.id}`} prefetch={false}>
                    <Button variant="ghost" size="md">
                      <ArrowLeft size={18} />
                      {t("companyOverview")}
                    </Button>
                  </Link>
                </div>
              </ImageCard>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricTile label={t("projectsCount")} value={data.overview.totalProjectCount} icon={Layers3} tone="lime" />
                <MetricTile label={t("activeCount")} value={data.overview.activeProjectCount} icon={Rocket} tone="aqua" />
                <MetricTile label={t("averageProgressShort")} value={`${data.overview.averageProgress}%`} icon={Sparkles} tone="coral" />
                <MetricTile label={t("projectGroupsCount")} value={data.siblingGroups.length} icon={FolderKanban} tone="dark" />
              </div>
            </section>

            <section className="mt-6">
              <SectionHeader eyebrow={t("projectsInside")} title={t("creativeProjects")} />
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} groups={data.siblingGroups} t={t} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
