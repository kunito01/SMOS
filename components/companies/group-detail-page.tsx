"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Layers3, Rocket, Sparkles } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { MetricTile } from "@/components/domain/metric-tile";
import { ProjectCard } from "@/components/domain/project-card";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/section-header";
import { groupsApi, projectsApi } from "@/lib/api";
import { getProjectGroupDisplayName, groupDescriptionKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import type { DashboardOverview, Project, ProjectGroup } from "@/lib/types";

type GroupDetailData = {
  group: ProjectGroup;
  groups: ProjectGroup[];
  projects: Project[];
  overview: DashboardOverview;
  associatedCompanyCount: number;
};

export function GroupDetailPage({ groupId }: { groupId: string }) {
  const { language, t } = useI18n();
  const [data, setData] = useState<GroupDetailData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const group = await groupsApi.getGroup(groupId);
      const [groups, projects, overview] = await Promise.all([
        groupsApi.listGroups(),
        groupsApi.listGroupProjects(groupId),
        projectsApi.getDashboardOverview({ type: "group", id: groupId }, { includeArchivedTotal: false })
      ]);

      if (isMounted) {
        setData({
          group,
          groups,
          projects,
          overview,
          associatedCompanyCount: new Set(projects.map((project) => project.companyId)).size
        });
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
                title={getProjectGroupDisplayName(data.group, language, t)}
                meta={t("groupOverview")}
                heightClassName="min-h-[28rem]"
              >
                <p className="max-w-2xl text-base font-bold leading-7 text-white/80">
                  {translateDomainLabel(data.group.name, groupDescriptionKeys, t, data.group.description)}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/companies" prefetch={false}>
                    <Button variant="ghost" size="md">
                      <ArrowLeft size={18} />
                      {t("navCompanies")}
                    </Button>
                  </Link>
                </div>
              </ImageCard>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricTile label={t("projectsCount")} value={data.overview.totalProjectCount} icon={Layers3} tone="lime" />
                <MetricTile label={t("activeCount")} value={data.overview.activeProjectCount} icon={Rocket} tone="aqua" />
                <MetricTile label={t("averageProgressShort")} value={`${data.overview.averageProgress}%`} icon={Sparkles} tone="coral" />
                <MetricTile label={t("companiesCount")} value={data.associatedCompanyCount} icon={Building2} tone="dark" />
              </div>
            </section>

            <section className="mt-6">
              <SectionHeader eyebrow={t("projectsInside")} title={t("creativeProjects")} />
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} groups={data.groups} t={t} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
