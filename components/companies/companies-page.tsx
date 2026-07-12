"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Building2, Calculator, FolderKanban, FolderPlus, ImagePlus, Layers3, Pencil, Plus, Rocket, Trash2, Upload, X } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { PixelForestScene } from "@/components/companies/pixel-forest-scene";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import {
  ProjectGroupManagerModal,
  type ProjectGroupManagerMode
} from "@/components/companies/project-group-manager-modal";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ModalPortal } from "@/components/ui/modal-portal";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi, projectsApi } from "@/lib/api";
import {
  formatDemoEntityName,
  getProjectGroupDisplayName,
  groupDescriptionKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { CompanySummary, Project, ProjectGroupSummary } from "@/lib/types";
import { companyPath } from "@/lib/utils/app-routes";
import type { ExchangeRateSnapshot, MoneyCurrency } from "@/lib/utils/money";

const spring = { type: "spring", stiffness: 150, damping: 18 } as const;
const seededGroupDescriptionSuffix = "grouped for visual planning and progress sharing.";
const maxNewBrandCoverBytes = 3 * 1024 * 1024;
const allowedNewBrandCoverTypes = new Set(["image/png", "image/webp"]);

const isSeededGroupDescription = (name: string, description: string) =>
  description === `${name}, ${seededGroupDescriptionSuffix}` ||
  (description.startsWith(`${name} under `) && description.endsWith(seededGroupDescriptionSuffix));

type CompaniesData = {
  companySummaries: CompanySummary[];
  groupSummaries: ProjectGroupSummary[];
  projects: Project[];
};

type BrandForm = {
  coverImage: string;
  description: string;
  name: string;
};

const defaultBrandForm: BrandForm = {
  coverImage: "",
  description: "",
  name: ""
};

const loadCompaniesData = async (
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot
): Promise<CompaniesData> => {
  const [companySummaries, groupSummaries, projects] = await Promise.all([
    companiesApi.listCompanySummaries(currency, snapshot),
    groupsApi.listGroupSummaries({ currency, snapshot }),
    projectsApi.listProjects()
  ]);

  return { companySummaries, groupSummaries, projects };
};

export function CompaniesPage() {
  const { language, t } = useI18n();
  const {
    displayCurrency,
    exchangeRateSnapshot,
    formatAmount,
    isReady: isCurrencyReady
  } = useCostDisplayCurrency();
  const [data, setData] = useState<CompaniesData | null>(null);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandForm, setBrandForm] = useState(defaultBrandForm);
  const [brandCoverError, setBrandCoverError] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [groupManagerMode, setGroupManagerMode] = useState<ProjectGroupManagerMode | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    let isMounted = true;

    async function load() {
      const nextData = await loadCompaniesData(displayCurrency, exchangeRateSnapshot);

      if (isMounted) {
        setData(nextData);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [displayCurrency, exchangeRateSnapshot, isCurrencyReady]);

  const totals = useMemo(() => {
    const companySummaries = data?.companySummaries ?? [];
    const groupSummaries = data?.groupSummaries ?? [];
    const projects = data?.projects ?? [];

    return {
      companies: companySummaries.length,
      groups: groupSummaries.length,
      projects: projects.length,
      active: projects.filter((project) => project.status === "active").length
    };
  }, [data]);

  const submitBrand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!brandForm.name.trim()) {
      return;
    }

    setCreatingBrand(true);
    try {
      await companiesApi.createCompany({
        coverImage: brandForm.coverImage,
        description: brandForm.description,
        name: brandForm.name
      });
      setData(await loadCompaniesData(displayCurrency, exchangeRateSnapshot));
      setBrandForm(defaultBrandForm);
      setBrandCoverError("");
      setBrandModalOpen(false);
    } finally {
      setCreatingBrand(false);
    }
  };

  const closeBrandModal = () => {
    setBrandModalOpen(false);
    setBrandForm(defaultBrandForm);
    setBrandCoverError("");
  };

  const handleNewBrandCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!allowedNewBrandCoverTypes.has(file.type)) {
      setBrandCoverError(t("newBrandCoverUnsupported"));
      event.target.value = "";
      return;
    }

    if (file.size > maxNewBrandCoverBytes) {
      setBrandCoverError(t("companyCoverTooLarge"));
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setBrandForm((current) => ({ ...current, coverImage: reader.result as string }));
        setBrandCoverError("");
      }
    };
    reader.onerror = () => setBrandCoverError(t("newBrandCoverUnsupported"));
    reader.readAsDataURL(file);
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        <section>
          <Card tone="aqua" className="relative overflow-hidden bg-[#94c98f] p-6 sm:p-8">
            <PixelForestScene />
            <div className="relative z-10 max-w-4xl">
              <p className="text-sm font-black uppercase text-ink/58 drop-shadow-[0_1px_0_rgba(232,255,224,0.42)]">{t("pageCompaniesEyebrow")}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] drop-shadow-[0_3px_0_rgba(232,255,224,0.38)] sm:text-6xl">
                {t("pageCompaniesTitle")}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/68">
                {t("pageCompaniesBody")}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => {
                    setBrandForm(defaultBrandForm);
                    setBrandCoverError("");
                    setBrandModalOpen(true);
                  }}
                >
                  <Plus size={19} />
                  {t("newBrand")}
                </Button>
              </div>
              <div className="mt-8 grid grid-cols-4 gap-[clamp(4px,1.6vw,12px)]">
                {[
                  { label: t("companiesCount"), value: totals.companies, icon: Building2 },
                  { label: t("projectGroupsCount"), value: totals.groups, icon: FolderKanban },
                  { label: t("projectsCount"), value: totals.projects, icon: Layers3 },
                  { label: t("activeCount"), value: totals.active, icon: Rocket }
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="companies-hero-metric-glass min-h-[clamp(96px,24vw,128px)] min-w-0 rounded-studio bg-white/[0.38] p-[clamp(4px,1.6vw,14px)] shadow-soft ring-1 ring-white/[0.56] backdrop-blur-xl lg:p-4"
                    >
                      <div className="flex h-full min-w-0 flex-col justify-between gap-[clamp(6px,2vw,16px)]">
                        <span className="grid size-[clamp(24px,6vw,36px)] shrink-0 place-items-center rounded-full bg-white/58 text-ink shadow-sm ring-1 ring-white/50 lg:size-10">
                          <Icon className="size-[clamp(12px,3vw,16px)] lg:size-[18px]" />
                        </span>
                        <div className="grid min-w-0 gap-[clamp(3px,1vw,8px)]">
                          <p className="max-w-full whitespace-nowrap text-[clamp(1rem,5vw,2rem)] font-black leading-none tracking-[-0.03em] tabular-nums lg:text-4xl lg:tracking-normal">
                            {item.value}
                          </p>
                          <p className="max-w-full whitespace-nowrap text-[clamp(7px,1.35vw,10px)] font-black leading-none tracking-[-0.04em] text-current/70 lg:text-sm lg:tracking-normal">
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
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            {data.companySummaries.map((summary, index) => (
              <motion.div
                key={summary.company.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: index * 0.05 }}
              >
                <Link href={companyPath(summary.company.id)} prefetch={false}>
                  <ImageCard
                    imageUrl={summary.company.coverImage}
                    title={formatDemoEntityName(summary.company.name, summary.company.id, "company", t)}
                    meta={t("companyOverview")}
                    heightClassName="h-[24rem]"
                    className="transition duration-200 hover:-translate-y-1"
                  >
                    <div className="grid gap-3 rounded-studio bg-white/90 p-4 text-ink sm:grid-cols-3">
                      <div>
                        <p className="text-2xl font-black">{summary.totalProjectCount}</p>
                        <p className="text-xs font-bold text-muted">{t("projectsCount")}</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black">{summary.activeProjectCount}</p>
                        <p className="text-xs font-bold text-muted">{t("activeCount")}</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black">{summary.averageProgress}%</p>
                        <p className="text-xs font-bold text-muted">{t("averageProgressShort")}</p>
                      </div>
                      <div className="sm:col-span-3">
                        <ProgressBar value={summary.averageProgress} />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-full bg-cloud px-3 py-2 sm:col-span-3">
                        <span className="inline-flex items-center gap-2 text-xs font-black text-muted">
                          <Calculator size={15} />
                          {t("projectBudgetTotal")}
                        </span>
                        <span className="font-black">{formatAmount(summary.budgetCostTotal, summary.currency)}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm font-black sm:col-span-3">
                        {t("openCompany")}
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </ImageCard>
                </Link>
              </motion.div>
            ))}
          </section>
        )}

        {data ? (
          <section className="mt-6">
            <SectionHeader
              eyebrow={t("projectGroupsCount")}
              title={t("groupTypes")}
              action={(
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingGroupId(null);
                      setGroupManagerMode("create");
                    }}
                  >
                    <FolderPlus size={16} />
                    {t("createGroupType")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingGroupId(null);
                      setGroupManagerMode("delete");
                    }}
                  >
                    <Trash2 size={16} />
                    {t("deleteGroupType")}
                  </Button>
                </div>
              )}
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.groupSummaries.map((summary) => (
                <Card
                  key={summary.group.id}
                  tone="white"
                  className="h-full p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-muted">{t("groupOverview")}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 bg-cloud"
                      aria-label={`${t("editGroupType")}: ${getProjectGroupDisplayName(summary.group, language, t)}`}
                      onClick={() => {
                        setEditingGroupId(summary.group.id);
                        setGroupManagerMode("edit");
                      }}
                    >
                      <Pencil size={16} />
                    </Button>
                  </div>
                  <h2 className="mt-2 text-2xl font-black leading-none">
                    {getProjectGroupDisplayName(summary.group, language, t)}
                  </h2>
                  <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-muted">
                    {isSeededGroupDescription(summary.group.name, summary.group.description)
                      ? translateDomainLabel(summary.group.name, groupDescriptionKeys, t, summary.group.description)
                      : summary.group.description}
                  </p>
                  <div className="mt-5">
                    <ProgressBar value={summary.averageProgress} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-black">{summary.totalProjectCount} {t("projectsCount")}</p>
                    <p className="text-lg font-black">
                      {t("projectBudgetTotal")}: {formatAmount(summary.budgetCostTotal, summary.currency)}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <ProjectGroupManagerModal
        open={Boolean(groupManagerMode)}
        mode={groupManagerMode ?? "create"}
        groupSummaries={data?.groupSummaries ?? []}
        initialGroupId={editingGroupId ?? undefined}
        onClose={() => {
          setGroupManagerMode(null);
          setEditingGroupId(null);
        }}
        onChanged={async () => setData(await loadCompaniesData(displayCurrency, exchangeRateSnapshot))}
      />
      {brandModalOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[120] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/32 px-4 py-6 backdrop-blur-sm">
            <form
              onSubmit={submitBrand}
              className="flex max-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col overflow-hidden rounded-studio-lg bg-white p-5 text-ink shadow-[0_28px_80px_rgba(28,35,40,0.24)] ring-1 ring-black/[0.06] sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase text-muted">{t("pageCompaniesEyebrow")}</p>
                  <h2 className="mt-1 text-2xl font-black">{t("createBrandTitle")}</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-muted">{t("createBrandBody")}</p>
                </div>
                <button
                  type="button"
                  onClick={closeBrandModal}
                  aria-label={t("cancel")}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-cloud text-muted transition hover:bg-ink hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="studio-scroll mt-5 grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1">
                <label className="grid gap-2">
                  <span className="text-sm font-black">{t("brandName")}</span>
                  <input
                    value={brandForm.name}
                    onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("brandNamePlaceholder")}
                    required
                    className="h-12 rounded-full border-0 bg-cloud px-4 text-sm font-bold outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-black">{t("brandIntro")}</span>
                  <textarea
                    value={brandForm.description}
                    onChange={(event) => setBrandForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder={t("brandIntroPlaceholder")}
                    rows={4}
                    className="resize-none rounded-[1.5rem] border-0 bg-cloud px-4 py-3 text-sm font-bold outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-black">{t("brandCoverImage")}</span>
                  <input
                    value={brandForm.coverImage.startsWith("data:") ? "" : brandForm.coverImage}
                    onChange={(event) => {
                      setBrandForm((current) => ({ ...current, coverImage: event.target.value }));
                      setBrandCoverError("");
                    }}
                    placeholder={t("brandCoverImagePlaceholder")}
                    className="h-12 rounded-full border-0 bg-cloud px-4 text-sm font-bold outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                  />
                </label>

                <div className="grid gap-2">
                  <input
                    id="new-brand-cover-upload"
                    type="file"
                    accept="image/png,image/webp"
                    onChange={handleNewBrandCoverChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="new-brand-cover-upload"
                    className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white shadow-soft transition hover:-translate-y-0.5"
                  >
                    <Upload size={18} />
                    {t("uploadCompanyCover")}
                  </label>
                  <p className="text-xs font-bold leading-5 text-muted">{t("newBrandCoverUploadHint")}</p>
                  {brandCoverError ? <p className="text-sm font-black text-coral">{brandCoverError}</p> : null}
                </div>

                {brandForm.coverImage ? (
                  <div
                    className="flex min-h-44 flex-col justify-between overflow-hidden rounded-studio bg-cover bg-center p-4 text-white shadow-soft"
                    style={{
                      backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.62)), url(${brandForm.coverImage})`
                    }}
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-white/20 backdrop-blur">
                      <ImagePlus size={18} />
                    </span>
                    <p className="text-xl font-black leading-tight">{brandForm.name || t("brandName")}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button type="submit" size="lg" className="flex-1" disabled={creatingBrand}>
                  <Plus size={18} />
                  {t("createBrand")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="flex-1"
                  onClick={closeBrandModal}
                >
                  {t("cancel")}
                </Button>
              </div>
            </form>
          </div>
        </ModalPortal>
      ) : null}
    </AppShell>
  );
}
