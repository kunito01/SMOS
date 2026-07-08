"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FolderKanban, Layers3, Rocket } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { MetricTile } from "@/components/domain/metric-tile";
import { ProjectCard } from "@/components/domain/project-card";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi, projectsApi } from "@/lib/api";
import {
  companyDescriptionKeys,
  groupDescriptionKeys,
  groupNameKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { Company, DashboardOverview, Project, ProjectGroup, ProjectGroupSummary } from "@/lib/types";

type CompanyDetailData = {
  company: Company;
  groups: ProjectGroup[];
  groupSummaries: ProjectGroupSummary[];
  projects: Project[];
  overview: DashboardOverview;
};

export function CompanyDetailPage({ companyId }: { companyId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<CompanyDetailData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [company, groups, allGroupSummaries, projects, overview] = await Promise.all([
        companiesApi.getCompany(companyId),
        companiesApi.listCompanyGroups(companyId),
        groupsApi.listGroupSummaries(),
        companiesApi.listCompanyProjects(companyId),
        projectsApi.getDashboardOverview({ type: "company", id: companyId })
      ]);

      if (isMounted) {
        setData({
          company,
          groups,
          groupSummaries: allGroupSummaries.filter((summary) => summary.group.companyId === companyId),
          projects,
          overview
        });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [companyId]);

  const groupById = useMemo(
    () => new Map((data?.groups ?? []).map((group) => [group.id, group])),
    [data?.groups]
  );

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.48fr)]">
              <ImageCard
                imageUrl={data.company.coverImage}
                title={data.company.name}
                meta={t("companyOverview")}
                heightClassName="min-h-[28rem]"
              >
                <p className="max-w-2xl text-base font-bold leading-7 text-white/80">
                  {translateDomainLabel(data.company.id, companyDescriptionKeys, t)}
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
                <MetricTile label={t("projectGroupsCount")} value={data.groups.length} icon={FolderKanban} tone="aqua" />
                <MetricTile label={t("activeCount")} value={data.overview.activeProjectCount} icon={Rocket} tone="coral" />
                <MetricTile label={t("averageProgressShort")} value={`${data.overview.averageProgress}%`} icon={ArrowRight} tone="dark" />
              </div>
            </section>

            <section className="mt-6">
              <SectionHeader eyebrow={t("groupsInside")} title={t("projectGroupsCount")} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {data.groupSummaries.map((summary) => (
                  <Link key={summary.group.id} href={`/groups/${summary.group.id}`} prefetch={false}>
                    <Card tone="white" className="h-full p-5 transition duration-200 hover:-translate-y-1">
                      <p className="text-sm font-bold text-muted">{t("groupOverview")}</p>
                      <h2 className="mt-2 text-3xl font-black leading-none">
                        {translateDomainLabel(summary.group.name, groupNameKeys, t)}
                      </h2>
                      <p className="mt-3 text-sm font-semibold leading-6 text-muted">
                        {translateDomainLabel(summary.group.name, groupDescriptionKeys, t)}
                      </p>
                      <div className="mt-5">
                        <ProgressBar value={summary.averageProgress} />
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm font-black">
                        <span>{summary.totalProjectCount} {t("projectsCount")}</span>
                        <span className="inline-flex items-center gap-2">
                          {t("viewGroup")}
                          <ArrowRight size={16} />
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <SectionHeader eyebrow={t("projectsInside")} title={t("creativeProjects")} />
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} groups={[...groupById.values()]} t={t} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
