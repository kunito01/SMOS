"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, Building2, Download, Layers3, Sparkles, Upload } from "lucide-react";
import { ImageCard } from "@/components/cards/image-card";
import { PixelCanyonScene } from "@/components/dashboard/pixel-canyon-scene";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { companiesApi, groupsApi, projectsApi } from "@/lib/api";
import {
  createMockDatabaseBackup,
  parseMockDatabaseBackup,
  restoreMockDatabaseBackup,
  type MockDatabaseBackup
} from "@/lib/api/mock-persistence";
import {
  formatDemoEntityName,
  getProjectGroupDisplayName,
  projectNameKeys,
  statusKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import type { Company, Project, ProjectGroup } from "@/lib/types";

type ArchiveData = {
  companies: Company[];
  groups: ProjectGroup[];
  projects: Project[];
};

type BackupNotice = {
  message: string;
  tone: "error" | "success";
};

const maxBackupFileBytes = 10 * 1024 * 1024;
const restoredNoticeStorageKey = "studio-map-os.backup-restored-notice";

const createBackupFileName = (exportedAt: string) =>
  `studio-map-os-${exportedAt.replace(/[:.]/g, "-")}.smos-backup.json`;

export function ArchivePage() {
  const { language, t } = useI18n();
  const [data, setData] = useState<ArchiveData | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [backupBusy, setBackupBusy] = useState<"export" | "import" | "restore" | null>(null);
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null);
  const [pendingBackup, setPendingBackup] = useState<MockDatabaseBackup | null>(null);

  useEffect(() => {
    const restoredNotice = window.sessionStorage.getItem(restoredNoticeStorageKey);

    if (restoredNotice) {
      setBackupNotice({ message: restoredNotice, tone: "success" });
      window.sessionStorage.removeItem(restoredNoticeStorageKey);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [companies, groups, projects] = await Promise.all([
        companiesApi.listCompanies(),
        groupsApi.listGroups(),
        projectsApi.listArchivedProjects()
      ]);

      if (isMounted) {
        setData({ companies, groups, projects });
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const projects = data?.projects ?? [];
    const archivedCompanyIds = new Set(projects.map((project) => project.companyId));

    return {
      averageProgress: projects.length
        ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
        : 0,
      brands: archivedCompanyIds.size,
      projects: projects.length
    };
  }, [data?.projects]);

  const groupedArchive = useMemo(() => {
    const companies = data?.companies ?? [];
    const groups = data?.groups ?? [];
    const projects = data?.projects ?? [];
    const groupIds = new Set(groups.map((group) => group.id));

    return companies
      .map((company) => {
        const companyProjects = projects.filter((project) => project.companyId === company.id);
        const assignedGroups = groups
          .map((group) => ({
            group,
            projects: companyProjects.filter((project) => project.groupId === group.id)
          }))
          .filter((branch) => branch.projects.length > 0);
        const unassignedProjects = companyProjects.filter((project) => !groupIds.has(project.groupId));
        const companyGroups = unassignedProjects.length
          ? [...assignedGroups, { group: null, projects: unassignedProjects }]
          : assignedGroups;

        return { company, groups: companyGroups };
      })
      .filter((branch) => branch.groups.length > 0);
  }, [data]);

  const downloadSiteBackup = () => {
    setBackupBusy("export");
    setBackupNotice(null);

    try {
      const backup = createMockDatabaseBackup();
      const content = JSON.stringify(backup, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const link = document.createElement("a");

      link.href = url;
      link.download = createBackupFileName(backup.exportedAt);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupNotice({ message: t("siteBackupExportSuccess"), tone: "success" });
    } catch {
      setBackupNotice({ message: t("siteBackupExportError"), tone: "error" });
    } finally {
      setBackupBusy(null);
    }
  };

  const readBackupFile = async (file: File) => {
    setBackupBusy("import");
    setBackupNotice(null);

    try {
      if (file.size > maxBackupFileBytes) {
        setBackupNotice({ message: t("siteBackupTooLarge"), tone: "error" });
        return;
      }

      const hasJsonFileName = file.name.toLocaleLowerCase().endsWith(".json");
      const hasJsonMimeType = !file.type || file.type === "application/json" || file.type === "text/json";

      if (!hasJsonFileName || !hasJsonMimeType) {
        setBackupNotice({ message: t("siteBackupInvalid"), tone: "error" });
        return;
      }

      const backup = parseMockDatabaseBackup(await file.text());
      setPendingBackup(backup);
    } catch {
      setBackupNotice({ message: t("siteBackupInvalid"), tone: "error" });
    } finally {
      setBackupBusy(null);
    }
  };

  const confirmRestore = () => {
    if (!pendingBackup) {
      return;
    }

    setBackupBusy("restore");
    setBackupNotice(null);

    try {
      restoreMockDatabaseBackup(pendingBackup);
      try {
        window.sessionStorage.setItem(restoredNoticeStorageKey, t("siteBackupRestoreSuccess"));
      } catch {
        // The restore itself is complete even if a private browsing mode blocks the one-time notice.
      }
      setPendingBackup(null);
      window.location.reload();
    } catch {
      setPendingBackup(null);
      setBackupNotice({ message: t("siteBackupRestoreError"), tone: "error" });
      setBackupBusy(null);
    }
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section>
              <Card tone="dark" className="relative min-h-[31rem] overflow-hidden bg-[#265154] p-6 sm:p-8">
                <PixelCanyonScene />
                <div className="absolute inset-0 bg-white/30" aria-hidden="true" />
                <div className="relative z-10 flex min-h-[27rem] flex-col justify-between gap-8">
                  <div className="max-w-4xl">
                    <p className="text-sm font-black uppercase text-ink/68 drop-shadow-[0_1px_0_rgba(255,255,255,0.34)]">
                      {t("navArchive")}
                    </p>
                    <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] text-ink drop-shadow-[0_3px_0_rgba(255,238,181,0.38)] sm:text-6xl">
                      {t("archiveTitle")}
                    </h1>
                    <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/76 drop-shadow-[0_1px_0_rgba(255,255,255,0.28)]">
                      {t("archiveBody")}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-[clamp(3px,1.2vw,12px)]">
                    {[
                      { label: t("archiveCount"), value: stats.projects, icon: Archive },
                      { label: t("archivedBrands"), value: stats.brands, icon: Building2 },
                      { label: t("archivedAverageProgress"), value: `${stats.averageProgress}%`, icon: Sparkles }
                    ].map((item) => {
                      const Icon = item.icon;

                      return (
                        <div
                          key={item.label}
                          className="companies-hero-metric-glass min-h-[clamp(84px,22vw,128px)] min-w-0 rounded-studio bg-white/[0.44] p-[clamp(3px,1.4vw,14px)] text-ink shadow-soft ring-1 ring-white/[0.56] backdrop-blur-xl"
                        >
                          <div className="flex h-full min-w-0 flex-col justify-between gap-[clamp(4px,1.6vw,16px)]">
                            <span className="grid size-[clamp(20px,6vw,40px)] shrink-0 place-items-center rounded-full bg-white/64 text-ink shadow-sm ring-1 ring-white/50">
                              <Icon className="size-[clamp(10px,3vw,18px)]" />
                            </span>
                            <div className="grid min-w-0 gap-[clamp(2px,0.8vw,8px)]">
                              <p className="max-w-full whitespace-nowrap text-[clamp(0.6rem,3.1vw,2.25rem)] font-black leading-none tracking-[-0.04em] tabular-nums">{item.value}</p>
                              <p className="min-h-[3em] max-w-full break-words text-[clamp(7px,1.1vw,12px)] font-black leading-[1.05] tracking-[-0.02em] text-current/70">{item.label}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </section>

            {data.projects.length ? (
              <section className="mt-6">
                <SectionHeader eyebrow={t("navArchive")} title={t("archivedProjects")} />
                <div className="mt-4 grid gap-5">
                  {groupedArchive.map(({ company, groups }) => (
                    <Card key={company.id} tone="white" className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black uppercase text-muted">{t("scopeCompany")}</p>
                          <h2 className="mt-1 truncate text-3xl font-black">
                            {formatDemoEntityName(company.name, company.id, "company", t)}
                          </h2>
                        </div>
                        <span className="grid size-12 place-items-center rounded-full bg-limepop text-ink">
                          <Layers3 size={21} />
                        </span>
                      </div>

                      <div className="mt-5 grid gap-5">
                        {groups.map(({ group, projects }) => (
                          <div key={group?.id ?? "unassigned"}>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                              <h3 className="text-xl font-black">
                                {group ? getProjectGroupDisplayName(group, language, t) : t("unassignedGroup")}
                              </h3>
                              <span className="rounded-full bg-aqua px-3 py-1 text-xs font-black text-ink">
                                {projects.length} {t("projectsCount")}
                              </span>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              {projects.map((project) => (
                                <Link
                                  key={project.id}
                                  href={`/projects/${project.id}`}
                                  prefetch={false}
                                  className="block rounded-studio-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
                                >
                                  <ImageCard
                                    imageUrl={project.coverImage}
                                    title={formatDemoEntityName(
                                      translateDomainLabel(project.name, projectNameKeys, t),
                                      project.id,
                                      "project",
                                      t
                                    )}
                                    meta={group ? getProjectGroupDisplayName(group, language, t) : ""}
                                    className="min-h-72 transition duration-200 hover:-translate-y-1"
                                  >
                                    <div className="rounded-full bg-white/[0.88] p-1">
                                      <ProgressBar value={project.progress} />
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                      <Pill tone="dark" className="min-h-8 px-3 text-xs">
                                        {t(statusKeys[project.status])}
                                      </Pill>
                                      <span className="text-xs font-black text-white/78">
                                        {t("archivedOn")}: {project.archivedAt ? formatLocalizedDate(project.archivedAt.slice(0, 10), language) : "-"}
                                      </span>
                                    </div>
                                    <span className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-limepop px-4 text-sm font-semibold text-ink">
                                      {t("viewArchivedProject")}
                                      <ArrowRight size={16} />
                                    </span>
                                  </ImageCard>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ) : (
              <section className="mt-6">
                <Card tone="white" className="bg-[#6C6EA0] p-6 text-center text-white sm:p-8">
                  <h2 className="text-3xl font-black text-white">{t("archiveEmptyTitle")}</h2>
                  <p className="mx-auto mt-3 max-w-xl text-sm font-bold leading-6 text-white">
                    {t("archiveEmptyBody")}
                  </p>
                  <Link href="/projects" prefetch={false} className="mt-5 inline-flex">
                    <Button variant="secondary" size="lg" className="bg-[#ffc700] hover:bg-[#ffc700]">
                      <Layers3 size={19} />
                      {t("navProjects")}
                    </Button>
                  </Link>
                </Card>
              </section>
            )}
          </>
        )}

        {data ? (
          <section className="mt-6">
            <Card tone="dark" className="bg-ink p-5 text-white sm:p-6">
              <SectionHeader
                eyebrow={t("siteBackupEyebrow")}
                title={t("siteBackupTitle")}
                eyebrowClassName="text-white/55"
                titleClassName="text-white"
              />
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/62">
                {t("siteBackupBody")}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={Boolean(backupBusy)}
                  onClick={downloadSiteBackup}
                  className="w-full"
                >
                  <Download size={19} />
                  {backupBusy === "export" ? t("saving") : t("downloadSiteBackup")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  disabled={Boolean(backupBusy)}
                  onClick={() => backupInputRef.current?.click()}
                  className="w-full bg-white/10 text-white hover:bg-white/18"
                >
                  <Upload size={19} />
                  {backupBusy === "import" || backupBusy === "restore" ? t("loading") : t("restoreSiteBackup")}
                </Button>
              </div>
              <p className="mt-3 text-xs font-bold leading-5 text-white/48">{t("siteBackupFileHint")}</p>
              {backupNotice ? (
                <p
                  role={backupNotice.tone === "error" ? "alert" : "status"}
                  className={`mt-4 rounded-studio p-3 text-sm font-black ${
                    backupNotice.tone === "error" ? "bg-coral/18 text-[#ffb7a8]" : "bg-limepop/14 text-limepop"
                  }`}
                >
                  {backupNotice.message}
                </p>
              ) : null}
              <input
                ref={backupInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  event.target.value = "";

                  if (file) {
                    void readBackupFile(file);
                  }
                }}
              />
            </Card>
          </section>
        ) : null}
      </div>
      <DeleteConfirmDialog
        open={Boolean(pendingBackup)}
        title={t("siteBackupRestoreConfirmTitle")}
        description={t("siteBackupRestoreConfirmBody")}
        warning={t("siteBackupRestoreWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("restoreSiteBackup")}
        onCancel={() => setPendingBackup(null)}
        onConfirm={confirmRestore}
      />
    </AppShell>
  );
}
