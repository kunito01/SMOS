"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FolderKanban, Layers3, Pencil, Rocket } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { CompanyBasicsEditModal } from "@/components/companies/company-basics-edit-modal";
import { ProjectGroupManagerModal } from "@/components/companies/project-group-manager-modal";
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
  formatDemoEntityName,
  getProjectGroupDisplayName,
  groupDescriptionKeys,
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

const defaultCompanyDescriptions: Record<string, string> = {
  "company-northstar": "A compact AI-assisted studio for interactive games, visual systems, and launch-ready prototypes.",
  "company-color-works": "A visual production studio for short films, campaign assets, brand pages, and shareable progress rooms."
};
const seededGroupDescriptionSuffix = "grouped for visual planning and progress sharing.";

const isSeededGroupDescription = (name: string, description: string) =>
  description === `${name}, ${seededGroupDescriptionSuffix}` ||
  (description.startsWith(`${name} under `) && description.endsWith(seededGroupDescriptionSuffix));

const loadCompanyDetailData = async (companyId: string): Promise<CompanyDetailData> => {
  const [company, groupSummaries, projects, overview] = await Promise.all([
    companiesApi.getCompany(companyId),
    groupsApi.listGroupSummaries({ companyId }),
    companiesApi.listCompanyProjects(companyId),
    projectsApi.getDashboardOverview({ type: "company", id: companyId }, { includeArchivedTotal: false })
  ]);

  return {
    company,
    groups: groupSummaries.map((summary) => summary.group),
    groupSummaries,
    projects,
    overview
  };
};

export function CompanyDetailPage({ companyId }: { companyId: string }) {
  const { language, t } = useI18n();
  const [data, setData] = useState<CompanyDetailData | null>(null);
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const nextData = await loadCompanyDetailData(companyId);

      if (isMounted) {
        setData(nextData);
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

  const companyDescription = data
    ? data.company.description === defaultCompanyDescriptions[data.company.id]
      ? translateDomainLabel(data.company.id, companyDescriptionKeys, t)
      : data.company.description
    : "";

  const handleBasicsSaved = (company: Company) => {
    setData((current) => (current ? { ...current, company } : current));
    setNotice(t("companyBasicsUpdated"));
    window.setTimeout(() => setNotice(""), 1600);
  };

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
                title={formatDemoEntityName(data.company.name, data.company.id, "company", t)}
                meta={t("companyOverview")}
                heightClassName="min-h-[28rem]"
                action={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setBasicsOpen(true)}
                    aria-label={t("editCompanyBasics")}
                    className="bg-white/82 font-black shadow-soft backdrop-blur"
                  >
                    <Pencil size={18} />
                  </Button>
                }
              >
                <p className="max-w-2xl text-base font-bold leading-7 text-white/80">
                  {companyDescription}
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

              <div className="grid min-w-0 self-end grid-cols-4 gap-[clamp(4px,0.8vw,8px)]">
                {[
                  { label: t("projectsCount"), value: data.overview.totalProjectCount, icon: Layers3, iconClassName: "bg-limepop text-ink" },
                  { label: t("projectGroupsCount"), value: data.groups.length, icon: FolderKanban, iconClassName: "bg-aqua text-ink" },
                  { label: t("activeCount"), value: data.overview.activeProjectCount, icon: Rocket, iconClassName: "bg-coral text-white" },
                  { label: t("averageProgressShort"), value: `${data.overview.averageProgress}%`, icon: ArrowRight, iconClassName: "bg-ink text-white" }
                ].map((metric) => {
                  const Icon = metric.icon;

                  return (
                    <div
                      key={metric.label}
                      className="min-h-[clamp(90px,20vw,128px)] min-w-0 overflow-hidden rounded-studio bg-white/72 p-[clamp(4px,1vw,10px)] shadow-soft"
                    >
                      <div className="flex h-full min-w-0 flex-col justify-between gap-[clamp(6px,1.5vw,14px)]">
                        <span className={`grid size-[clamp(22px,5vw,36px)] shrink-0 place-items-center rounded-full ${metric.iconClassName}`}>
                          <Icon className="size-[clamp(11px,2.5vw,17px)]" />
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-full whitespace-nowrap text-[clamp(1rem,3vw,2rem)] font-black leading-none tracking-[-0.03em] tabular-nums">
                            {metric.value}
                          </p>
                          <p className="mt-[clamp(3px,0.8vw,7px)] max-w-full whitespace-nowrap text-[clamp(7px,0.8vw,9px)] font-black leading-none tracking-[-0.04em] text-muted">
                            {metric.label}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {notice ? (
              <p className="mt-4 rounded-full bg-ink px-4 py-3 text-sm font-black text-limepop shadow-soft">
                {notice}
              </p>
            ) : null}

            <section className="mt-6">
              <SectionHeader eyebrow={t("groupsInside")} title={t("projectGroupsCount")} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {data.groupSummaries.map((summary) => (
                  <Card key={summary.group.id} tone="white" className="h-full p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-muted">{t("groupOverview")}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 bg-cloud"
                        aria-label={`${t("editGroupType")}: ${getProjectGroupDisplayName(summary.group, language, t)}`}
                        onClick={() => setEditingGroupId(summary.group.id)}
                      >
                        <Pencil size={16} />
                      </Button>
                    </div>
                    <h2 className="mt-2 text-3xl font-black leading-none">
                      {getProjectGroupDisplayName(summary.group, language, t)}
                    </h2>
                    <p className="mt-3 text-sm font-semibold leading-6 text-muted">
                      {isSeededGroupDescription(summary.group.name, summary.group.description)
                        ? translateDomainLabel(summary.group.name, groupDescriptionKeys, t, summary.group.description)
                        : summary.group.description}
                    </p>
                    <div className="mt-5">
                      <ProgressBar value={summary.averageProgress} />
                    </div>
                    <p className="mt-4 text-sm font-black">{summary.totalProjectCount} {t("projectsCount")}</p>
                  </Card>
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

            <CompanyBasicsEditModal
              open={basicsOpen}
              company={data.company}
              t={t}
              onClose={() => setBasicsOpen(false)}
              onSaved={handleBasicsSaved}
            />
          </>
        )}
      </div>
      <ProjectGroupManagerModal
        open={Boolean(editingGroupId)}
        mode="edit"
        groupSummaries={data?.groupSummaries ?? []}
        initialGroupId={editingGroupId ?? undefined}
        onClose={() => setEditingGroupId(null)}
        onChanged={async () => setData(await loadCompanyDetailData(companyId))}
      />
    </AppShell>
  );
}
