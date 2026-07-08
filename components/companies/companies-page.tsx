"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Building2, FolderKanban, Layers3, Rocket } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi } from "@/lib/api";
import { groupDescriptionKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import type { CompanySummary, ProjectGroupSummary } from "@/lib/types";

const spring = { type: "spring", stiffness: 150, damping: 18 } as const;

type CompaniesData = {
  companySummaries: CompanySummary[];
  groupSummaries: ProjectGroupSummary[];
};

export function CompaniesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<CompaniesData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [companySummaries, groupSummaries] = await Promise.all([
        companiesApi.listCompanySummaries(),
        groupsApi.listGroupSummaries()
      ]);

      if (isMounted) {
        setData({ companySummaries, groupSummaries });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    const companySummaries = data?.companySummaries ?? [];
    const groupSummaries = data?.groupSummaries ?? [];

    return {
      companies: companySummaries.length,
      groups: groupSummaries.length,
      projects: companySummaries.reduce((sum, item) => sum + item.totalProjectCount, 0),
      active: companySummaries.reduce((sum, item) => sum + item.activeProjectCount, 0)
    };
  }, [data]);

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        <section>
          <Card tone="aqua" className="relative overflow-hidden p-6 sm:p-8">
            <div className="relative z-10 max-w-4xl">
              <p className="text-sm font-black uppercase text-ink/60">{t("pageCompaniesEyebrow")}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] sm:text-6xl">
                {t("pageCompaniesTitle")}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/65">
                {t("pageCompaniesBody")}
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: t("companiesCount"), value: totals.companies, icon: Building2, className: "bg-[#e3f596]" },
                  { label: t("projectGroupsCount"), value: totals.groups, icon: FolderKanban, className: "bg-white/72" },
                  { label: t("projectsCount"), value: totals.projects, icon: Layers3, className: "bg-[#f4e9d8]" },
                  { label: t("activeCount"), value: totals.active, icon: Rocket, className: "bg-ink text-white" }
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className={`min-h-32 rounded-studio p-4 shadow-soft ring-1 ring-black/[0.04] ${item.className}`}
                    >
                      <div className="flex h-full flex-col justify-between gap-4">
                        <span className="grid size-10 place-items-center rounded-full bg-white/72 text-ink">
                          <Icon size={18} />
                        </span>
                        <div>
                          <p className="text-4xl font-black leading-none">{item.value}</p>
                          <p className="mt-2 text-sm font-black text-current/70">{item.label}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="absolute -right-16 -top-20 size-72 rounded-full bg-white/[0.35]" />
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
                <Link href={`/companies/${summary.company.id}`} prefetch={false}>
                  <ImageCard
                    imageUrl={summary.company.coverImage}
                    title={summary.company.name}
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
            <SectionHeader eyebrow={t("projectGroupsCount")} title={t("groupsInside")} />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.groupSummaries.map((summary) => (
                <Link
                  key={summary.group.id}
                  href={`/groups/${summary.group.id}`}
                  prefetch={false}
                  className="rounded-studio focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
                >
                  <Card tone="white" className="h-full p-5 transition duration-200 hover:-translate-y-1">
                    <p className="text-sm font-bold text-muted">{t("groupOverview")}</p>
                    <h2 className="mt-2 text-2xl font-black leading-none">{summary.group.name}</h2>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-muted">
                      {translateDomainLabel(summary.group.name, groupDescriptionKeys, t)}
                    </p>
                    <div className="mt-5">
                      <ProgressBar value={summary.averageProgress} />
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm font-black">
                        <span>{summary.totalProjectCount} {t("projectsCount")}</span>
                        <ArrowRight size={17} />
                      </div>
                    </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
