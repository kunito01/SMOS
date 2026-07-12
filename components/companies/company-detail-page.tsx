"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Calculator, FolderKanban, Layers3, Pencil, Rocket, Trash2 } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { CompanyBasicsEditModal } from "@/components/companies/company-basics-edit-modal";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { ProjectGroupManagerModal } from "@/components/companies/project-group-manager-modal";
import { ProjectCard } from "@/components/domain/project-card";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
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
import type { ExchangeRateSnapshot, MoneyCurrency } from "@/lib/utils/money";

type CompanyDetailData = {
  company: Company;
  groups: ProjectGroup[];
  groupSummaries: ProjectGroupSummary[];
  linkedProjectCount: number;
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

const loadCompanyDetailData = async (
  companyId: string,
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot
): Promise<CompanyDetailData> => {
  const [company, groupSummaries, projects, archivedProjects, overview] = await Promise.all([
    companiesApi.getCompany(companyId),
    groupsApi.listGroupSummaries({ companyId, currency, snapshot }),
    companiesApi.listCompanyProjects(companyId),
    projectsApi.listArchivedProjects({ type: "company", id: companyId }),
    projectsApi.getDashboardOverview(
      { type: "company", id: companyId },
      { includeArchivedTotal: false, currency, snapshot }
    )
  ]);

  return {
    company,
    groups: groupSummaries.map((summary) => summary.group),
    groupSummaries,
    linkedProjectCount: projects.length + archivedProjects.length,
    projects,
    overview
  };
};

export function CompanyDetailPage({ companyId }: { companyId: string }) {
  const { language, t } = useI18n();
  const router = useRouter();
  const {
    displayCurrency,
    exchangeRateSnapshot,
    formatAmount,
    isReady: isCurrencyReady
  } = useCostDisplayCurrency();
  const [data, setData] = useState<CompanyDetailData | null>(null);
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function load() {
      const nextData = await loadCompanyDetailData(companyId, displayCurrency, exchangeRateSnapshot);

      if (isMounted) {
        setData(nextData);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [companyId, displayCurrency, exchangeRateSnapshot, isCurrencyReady]);

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

  const handleCompanyDeleted = async () => {
    if (!data || deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError("");
    try {
      await companiesApi.deleteCompany(data.company.id);
      router.replace("/companies");
    } catch {
      setDeleteDialogOpen(false);
      setDeleteError(t("deleteCompanyError"));
    } finally {
      setDeleting(false);
    }
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

              <div className="grid min-w-0 self-end grid-cols-5 gap-[clamp(4px,0.8vw,8px)]">
                {[
                  { label: t("projectsCount"), value: data.overview.totalProjectCount, icon: Layers3, iconClassName: "bg-limepop text-ink" },
                  { label: t("projectGroupsCount"), value: data.groups.length, icon: FolderKanban, iconClassName: "bg-aqua text-ink" },
                  { label: t("activeCount"), value: data.overview.activeProjectCount, icon: Rocket, iconClassName: "bg-coral text-white" },
                  { label: t("averageProgressShort"), value: `${data.overview.averageProgress}%`, icon: ArrowRight, iconClassName: "bg-ink text-white" },
                  { label: t("projectBudgetTotal"), value: formatAmount(data.overview.budgetCostTotal, data.overview.currency), icon: Calculator, iconClassName: "bg-[#ffc700] text-ink" }
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
                    <p className="mt-2 text-xl font-black">
                      {t("projectBudgetTotal")}: {formatAmount(summary.budgetCostTotal, summary.currency)}
                    </p>
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

            <section className="mt-6">
              <Card tone="white" className="p-5 sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0 max-w-3xl">
                    <span className="grid size-11 place-items-center rounded-full bg-coral text-white">
                      <Trash2 size={19} />
                    </span>
                    <h2 className="mt-4 text-2xl font-black leading-tight">{t("deleteCompany")}</h2>
                    <p className="mt-2 text-sm font-bold leading-6 text-muted">{t("deleteCompanyBody")}</p>

                    {data.linkedProjectCount > 0 ? (
                      <div className="mt-5 max-w-xl rounded-studio bg-cloud p-4">
                        <p className="text-sm font-black">
                          {data.linkedProjectCount} {t("projectsCount")}
                        </p>
                        <p className="mt-2 text-xs font-bold leading-5 text-muted">
                          {t("deleteCompanyUnlinkProjectsHint")}
                        </p>
                      </div>
                    ) : null}

                    {deleteError ? (
                      <p className="mt-4 rounded-studio bg-coral/10 p-4 text-sm font-black text-coral">
                        {deleteError}
                      </p>
                    ) : null}
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    className="bg-coral text-white"
                    disabled={deleting}
                    onClick={() => {
                      setDeleteError("");
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 size={19} />
                    {t("deleteCompany")}
                  </Button>
                </div>
              </Card>
            </section>

            <CompanyBasicsEditModal
              open={basicsOpen}
              company={data.company}
              t={t}
              onClose={() => setBasicsOpen(false)}
              onSaved={handleBasicsSaved}
            />
            <DeleteConfirmDialog
              open={deleteDialogOpen}
              busy={deleting}
              title={t("deleteCompanyConfirmTitle")}
              description={`${t("deleteCompanyConfirmDescription")}${
                data.linkedProjectCount > 0
                  ? ` ${data.linkedProjectCount} ${t("projectsCount")}.`
                  : ""
              }`}
              warning={t("deleteCompanyWarning")}
              cancelLabel={t("cancel")}
              confirmLabel={t("confirmDelete")}
              onCancel={() => setDeleteDialogOpen(false)}
              onConfirm={() => {
                void handleCompanyDeleted();
              }}
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
        onChanged={async () =>
          setData(await loadCompanyDetailData(companyId, displayCurrency, exchangeRateSnapshot))
        }
      />
    </AppShell>
  );
}
