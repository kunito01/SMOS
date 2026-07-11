"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Share2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { SectionHeader } from "@/components/ui/section-header";
import { projectsApi, shareApi } from "@/lib/api";
import { formatDemoEntityName, projectNameKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import type { Project, ShareSettings } from "@/lib/types";

const settingKeys: Array<
  keyof Pick<
    ShareSettings,
    "showPeople" | "showTools" | "showTimeline" | "showDeliverables" | "showMaterials" | "showVersions"
  >
> = [
  "showPeople",
  "showTools",
  "showTimeline",
  "showDeliverables",
  "showMaterials",
  "showVersions"
];

const settingLabelKeys = {
  showPeople: "showPeople",
  showTools: "showTools",
  showTimeline: "showTimeline",
  showDeliverables: "showDeliverables",
  showMaterials: "showMaterials",
  showVersions: "showVersions"
} as const;

export function ProjectShareSettingsPage({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { displayCurrency } = useCostDisplayCurrency();
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const loadProject = useCallback(async () => {
    const nextProject = await projectsApi.getProject(projectId);
    setProject(nextProject);
    setSettings(nextProject.shareSettings);
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const publicUrl = useMemo(() => {
    if (!settings?.token || !origin) {
      return "";
    }

    return `${origin}/share/${settings.token}`;
  }, [origin, settings?.token]);

  const updateSetting = (key: keyof ShareSettings, value: boolean) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    if (!settings.token) {
      await shareApi.createShareLink(projectId, settings.allowCostPreview, displayCurrency);
    }

    await shareApi.updateShareSettings(
      projectId,
      {
        ...settings,
        isEnabled: true
      },
      displayCurrency
    );
    await loadProject();
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!project || !settings ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
              <Card tone="aqua" className="relative overflow-hidden p-6 sm:p-8">
                <p className="text-sm font-black uppercase text-ink/60">{t("publicReadOnly")}</p>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] sm:text-6xl">
                  {t("shareSettingsTitle")}
                </h1>
                <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/65">
                  {t("shareSettingsBody")}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={`/projects/${project.id}`} prefetch={false}>
                    <Button variant="ghost" size="md">
                      <ArrowLeft size={18} />
                      {t("projectWorkspace")}
                    </Button>
                  </Link>
                </div>
              </Card>

              <Card tone="dark" className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white/60">{t("sharePublicLink")}</p>
                    <h2 className="mt-2 text-2xl font-black">
                      {formatDemoEntityName(
                        translateDomainLabel(project.name, projectNameKeys, t),
                        project.id,
                        "project",
                        t
                      )}
                    </h2>
                  </div>
                  <Share2 size={24} className="text-limepop" />
                </div>
                <div className="mt-5 rounded-studio bg-white/10 p-4">
                  <p className="break-all text-sm font-bold text-white/70">
                    {publicUrl || t("generateShareLink")}
                  </p>
                </div>
                <Button onClick={handleSave} variant="secondary" size="lg" className="mt-4 w-full">
                  <ShieldCheck size={19} />
                  {settings.token ? t("updateShareSettings") : t("generateShareLink")}
                </Button>
                {publicUrl ? (
                  <Link
                    href={publicUrl}
                    prefetch={false}
                    className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white/12 px-5 text-sm font-black text-white ring-1 ring-white/10"
                  >
                    <ExternalLink size={18} />
                    {t("sharePublicLink")}
                  </Link>
                ) : null}
              </Card>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(320px,0.42fr)]">
              <Card tone="white" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("shareSettings")} title={t("publicReadOnly")} />
                <div className="mt-5 grid gap-3">
                  {settingKeys.map((key) => (
                    <label key={key} className="flex items-center justify-between gap-4 rounded-studio bg-cloud/70 p-4">
                      <span className="font-black">{t(settingLabelKeys[key])}</span>
                      <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(event) => updateSetting(key, event.target.checked)}
                        className="size-6 accent-coral"
                      />
                    </label>
                  ))}
                  <label className="flex items-center justify-between gap-4 rounded-studio bg-coral p-4 text-white">
                    <span className="font-black">{t("allowCostPreview")}</span>
                    <input
                      type="checkbox"
                      checked={settings.allowCostPreview}
                      onChange={(event) => updateSetting("allowCostPreview", event.target.checked)}
                      className="size-6 accent-limepop"
                    />
                  </label>
                </div>
              </Card>

              <Card tone="lime" className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={22} />
                  <h2 className="text-2xl font-black">{t("sensitiveHidden")}</h2>
                </div>
                <p className="mt-4 text-sm font-bold leading-6 text-ink/70">
                  {t("costsPrivateBody")}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Pill tone="cloud">{t("publicReadOnly")}</Pill>
                  <Pill tone="cloud">{t("shareSettings")}</Pill>
                </div>
              </Card>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
