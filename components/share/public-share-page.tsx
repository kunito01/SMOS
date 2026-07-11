"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileStack, GitBranch, Sparkles, Wrench } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { AppShell } from "@/components/layout/app-shell";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionHeader } from "@/components/ui/section-header";
import { useI18n } from "@/components/providers/app-providers";
import { shareApi } from "@/lib/api";
import { createProjectSubscriptionCostItems } from "@/lib/mock";
import {
  costCategoryKeys,
  deliverableDescriptionKey,
  deliverableTitleKeys,
  formatDemoEntityName,
  materialNameKeys,
  materialStatusKeys,
  materialTypeKeys,
  phaseDescriptionKey,
  phaseNameKeys,
  projectDescriptionKey,
  projectNameKeys,
  statusKeys,
  translateDomainLabel,
  versionNameKeys,
  versionStatusKeys,
  versionSummaryKeys
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import { languageLocales } from "@/lib/i18n/translations";
import type { Project, ShareLink } from "@/lib/types";
import { formatCurrency, toCny } from "@/lib/utils/money";

type SharedProjectData = {
  project: Project;
  shareLink: ShareLink;
  canShowCost: boolean;
};

const materialStatusTone = {
  draft: "cloud",
  review: "coral",
  approved: "lime"
} as const;

const versionStatusTone = {
  draft: "cloud",
  review: "coral",
  released: "lime"
} as const;

export function PublicSharePage({ token }: { token: string }) {
  const { language, t } = useI18n();
  const [data, setData] = useState<SharedProjectData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const nextData = await shareApi.getSharedProject(token);

        if (isMounted) {
          setData(nextData);
        }
      } catch {
        if (isMounted) {
          setFailed(true);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const actualCost = useMemo(
    () =>
      data?.project
        ? [...data.project.costs, ...createProjectSubscriptionCostItems(data.project)]
            .filter((cost) => cost.isActual)
            .reduce((sum, cost) => sum + toCny(cost.amount, cost.currency), 0)
        : 0,
    [data?.project]
  );
  const estimatedCost = useMemo(
    () => data?.project.costs.filter((cost) => !cost.isActual).reduce((sum, cost) => sum + toCny(cost.amount, cost.currency), 0) ?? 0,
    [data?.project.costs]
  );
  const categoryPreview = useMemo(() => {
    const costs = data?.project ? [...data.project.costs, ...createProjectSubscriptionCostItems(data.project)] : [];

    return costs.reduce<Record<string, number>>((acc, cost) => {
      acc[cost.category] = (acc[cost.category] ?? 0) + toCny(cost.amount, cost.currency);
      return acc;
    }, {});
  }, [data?.project]);
  const peopleById = useMemo(() => {
    return new Map((data?.project.people ?? []).map((person) => [person.id, person]));
  }, [data?.project.people]);

  const personName = (personId: string) => peopleById.get(personId)?.name ?? t("ownerProduction");
  const formatCost = (value: number) => formatCurrency(value, "CNY", languageLocales[language]);

  if (failed) {
    return (
      <AppShell>
        <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
          <div className="grid min-h-[28rem] place-items-center">
            <Card tone="white" className="max-w-xl p-8 text-center">
              <h1 className="text-3xl font-black">{t("shareUnavailable")}</h1>
              <Link
                href="/login"
                className="font-brand mt-6 inline-flex h-12 items-center rounded-full bg-ink px-5 text-sm text-white"
              >
                Studio Map OS
              </Link>
            </Card>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        <div className="mx-auto max-w-[1320px]">
          {!data ? (
            <LoadingState label={t("loading")} className="min-h-[28rem]" />
          ) : (
            <>
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
              <ImageCard
                imageUrl={data.project.coverImage}
                title={formatDemoEntityName(
                  translateDomainLabel(data.project.name, projectNameKeys, t),
                  data.project.id,
                  "project",
                  t
                )}
                meta={t("publicReadOnly")}
                heightClassName="min-h-[32rem]"
              >
                <p className="max-w-2xl text-base font-bold leading-7 text-white/80">{t(projectDescriptionKey)}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Pill tone="lime">{t(statusKeys[data.project.status])}</Pill>
                  <Pill tone="cloud">{t("sensitiveHidden")}</Pill>
                </div>
              </ImageCard>

              <Card tone="white" className="grid gap-5 p-5">
                <ProgressRing
                  value={data.project.progress}
                  label={`${t("averageProgressShort")} ${data.project.progress}%`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-coral" />
                    <p className="text-sm font-bold text-muted">{t("averageProgressShort")}</p>
                  </div>
                  <h2 className="mt-2 text-4xl font-black leading-none">{data.project.progress}%</h2>
                  <p className="mt-4 text-sm font-semibold leading-6 text-muted">{t("publicReadOnly")}</p>
                </div>
              </Card>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(320px,0.42fr)]">
              {data.project.shareSettings.showTimeline ? (
                <Card tone="white" className="p-5 sm:p-6">
                  <SectionHeader eyebrow={t("timeline")} title={t("phases")} />
                  <div className="mt-5 grid gap-3">
                    {data.project.phases.map((phase) => (
                      <div key={phase.id} className="rounded-studio bg-cloud/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-xl font-black">
                            {translateDomainLabel(phase.name, phaseNameKeys, t) || t("untitledStage")}
                          </h3>
                          <Pill tone={phase.status === "completed" ? "lime" : phase.status === "active" ? "coral" : "cloud"}>
                            {formatLocalizedDate(phase.endDate, language)}
                          </Pill>
                        </div>
                        <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t(phaseDescriptionKey)}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <div className="grid gap-4">
                {data.project.shareSettings.showPeople ? (
                  <Card tone="lime" className="p-5">
                    <SectionHeader eyebrow={t("peopleTeam")} title={`${data.project.people.length}`} />
                    <div className="mt-4">
                      <AvatarStack avatars={data.project.people.map((person) => ({ name: person.name, image: person.avatar }))} />
                    </div>
                  </Card>
                ) : null}

                {data.project.shareSettings.showTools ? (
                  <Card tone="dark" className="p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <Wrench size={20} className="text-limepop" />
                      <h2 className="text-2xl font-black">{t("tools")}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.project.tools.map((tool) => (
                        <Pill key={tool.id} tone="cloud">{tool.name}</Pill>
                      ))}
                    </div>
                  </Card>
                ) : null}

                {data.canShowCost ? (
                  <Card tone="aqua" className="p-5">
                    <SectionHeader eyebrow={t("costPreview")} title={t("privateCost")} />
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-studio bg-white/75 p-4">
                        <p className="text-sm font-bold text-muted">{t("actualCostSoFar")}</p>
                        <p className="mt-1 text-2xl font-black">{formatCost(actualCost)}</p>
                      </div>
                      <div className="rounded-studio bg-white/75 p-4">
                        <p className="text-sm font-bold text-muted">{t("futureEstimatedCost")}</p>
                        <p className="mt-1 text-2xl font-black">{formatCost(estimatedCost)}</p>
                      </div>
                      {Object.entries(categoryPreview).slice(0, 3).map(([category, value]) => (
                        <div key={category}>
                          <div className="mb-1 flex items-center justify-between text-xs font-black">
                            <span>{t(costCategoryKeys[category as keyof typeof costCategoryKeys])}</span>
                            <span>{formatCost(value)}</span>
                          </div>
                          <ProgressBar value={Math.min(100, value / 300)} className="bg-white/75" />
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}
              </div>
            </section>

            {data.project.shareSettings.showMaterials || data.project.shareSettings.showVersions ? (
              <section className="mt-6 grid gap-4 xl:grid-cols-2">
                {data.project.shareSettings.showMaterials ? (
                  <Card tone="white" className="p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <FileStack size={22} />
                      <h2 className="text-2xl font-black">{t("materials")}</h2>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {data.project.materials.map((material) => (
                        <div key={material.id} className="rounded-studio bg-cloud/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-black uppercase text-muted">
                                {t(materialTypeKeys[material.type])}
                              </p>
                              <h3 className="mt-1 truncate text-lg font-black">
                                {translateDomainLabel(material.name, materialNameKeys, t)}
                              </h3>
                            </div>
                            <Pill tone={materialStatusTone[material.status]}>
                              {t(materialStatusKeys[material.status])}
                            </Pill>
                          </div>
                          <p className="mt-3 text-xs font-bold text-muted">
                            {t("owner")}: {personName(material.ownerId)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}

                {data.project.shareSettings.showVersions ? (
                  <Card tone="dark" className="p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <GitBranch size={22} className="text-limepop" />
                      <h2 className="text-2xl font-black">{t("versions")}</h2>
                    </div>
                    <div className="mt-5 grid gap-3">
                      {data.project.versions.map((version) => (
                        <div key={version.id} className="rounded-studio bg-white/10 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-lg font-black">
                              {translateDomainLabel(version.name, versionNameKeys, t)}
                            </h3>
                            <Pill tone={versionStatusTone[version.status]}>
                              {t(versionStatusKeys[version.status])}
                            </Pill>
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-6 text-white/65">
                            {translateDomainLabel(version.summary, versionSummaryKeys, t)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}
              </section>
            ) : null}

            {data.project.shareSettings.showDeliverables ? (
              <section className="mt-6">
                <SectionHeader eyebrow={t("deliverables")} title={t("tasks")} />
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.project.phases.flatMap((phase) =>
                    phase.deliverables.map((deliverable) => (
                      <Card key={deliverable.id} tone="white" className="p-5">
                        <p className="text-sm font-bold text-muted">
                          {translateDomainLabel(phase.name, phaseNameKeys, t) || t("untitledStage")}
                        </p>
                        <h3 className="mt-1 text-xl font-black">
                          {translateDomainLabel(deliverable.title, deliverableTitleKeys, t) || t("tasks")}
                        </h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                          {t(deliverableDescriptionKey)}
                        </p>
                        <div className="mt-4">
                          <ProgressBar
                            value={
                              (deliverable.tasks.filter((task) => task.completed).length / deliverable.tasks.length) * 100
                            }
                          />
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </section>
            ) : null}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
