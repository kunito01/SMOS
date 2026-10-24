"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Download,
  KeyRound,
  Layers3,
  Sparkles,
  Upload
} from "lucide-react";
import { WorkspaceKeyDialog } from "@/components/auth/workspace-key-dialog";
import { ImageCard } from "@/components/cards/image-card";
import { PixelCanyonScene } from "@/components/dashboard/pixel-canyon-scene";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { ArchiveStorageSyncCard } from "@/components/storage/archive-storage-sync-card";
import { AgentBridgeCard } from "@/components/storage/agent-bridge-card";
import { GoogleCalendarSyncCard } from "@/components/storage/google-calendar-sync-card";
import { isWorkspaceSyncConflictError } from "@/lib/storage/workspace-write-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { authApi, companiesApi, groupsApi, projectsApi } from "@/lib/api";
import { LocalAuthError } from "@/lib/api/auth";
import { formatWorkspaceCode } from "@/lib/security/workspace-crypto";
import {
  captureMockDatabaseWorkspaceStorage,
  createMockDatabaseBackup,
  restoreMockDatabaseWorkspaceStorage,
  restoreMockDatabaseBackup,
  validateMockDatabaseBackup
} from "@/lib/api/mock-persistence";
import {
  formatDemoEntityName,
  getProjectGroupDisplayName,
  projectNameKeys,
  statusKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import {
  parseEncryptedWorkspaceEnvelope,
  type EncryptedWorkspaceEnvelope
} from "@/lib/security/workspace-crypto";
import type { Company, Project, ProjectGroup } from "@/lib/types";
import type { ImportedSiteBackup } from "@/lib/api/auth";
import { projectPath, withBasePath } from "@/lib/utils/app-routes";

type ArchiveData = {
  companies: Company[];
  groups: ProjectGroup[];
  projects: Project[];
};

type BackupNotice = {
  message: string;
  tone: "error" | "success";
};

const maxBackupFileBytes = 64 * 1024 * 1024;
const restoredNoticeStorageKey = "studio-map-os.backup-restored-notice";
const restoredLoginNoticeStorageKey = "studio-map-os.full-site-restored-login-notice";
const restoreFailedLoginNoticeStorageKey = "studio-map-os.full-site-restore-failed-login-notice";

const createBackupFileName = (exportedAt: string) =>
  `studio-map-os-${exportedAt.replace(/[:.]/g, "-")}.smos-backup.json`;

const createWorkspaceBackupFileName = (exportedAt: string) =>
  `studio-map-os-workspace-${exportedAt.replace(/[:.]/g, "-")}.smos-backup.json`;

export function ArchivePage() {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const [data, setData] = useState<ArchiveData | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const restoreInFlightRef = useRef(false);
  const [backupBusy, setBackupBusy] = useState<
    "export" | "workspace-export" | "import" | "restore" | null
  >(null);
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null);
  const [pendingBackup, setPendingBackup] = useState<ImportedSiteBackup | null>(null);
  const [pendingEncryptedBackup, setPendingEncryptedBackup] = useState<EncryptedWorkspaceEnvelope | null>(null);
  const [pendingBackupExport, setPendingBackupExport] = useState<"device" | "workspace" | null>(null);
  const [exportUnlockError, setExportUnlockError] = useState("");
  const [unlockError, setUnlockError] = useState("");
  // Apple ID workspaces start without a recovery key; until one exists no
  // backup can be exported, so the export buttons stay locked and the card
  // offers to create the key.
  // "checking" → "missing" (create offered, exports locked) → "creating" →
  // "created" (key shown once; exports stay locked until the user confirms it
  // is saved) → "ready". The registry is the source of truth, so the check
  // re-runs whenever the tab regains focus (another tab may have created a key).
  const [recoveryKeyState, setRecoveryKeyState] = useState<
    "checking" | "missing" | "creating" | "created" | "ready"
  >("checking");
  const [createdRecoveryKey, setCreatedRecoveryKey] = useState<string | null>(null);
  const [recoveryKeyHandled, setRecoveryKeyHandled] = useState(false);
  const [recoveryKeyCopied, setRecoveryKeyCopied] = useState(false);
  const [recoveryKeyCopyFailed, setRecoveryKeyCopyFailed] = useState(false);
  const [recoveryKeyError, setRecoveryKeyError] = useState("");
  const [replaceRecoveryKeyOpen, setReplaceRecoveryKeyOpen] = useState(false);
  const recoveryKeyInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user?.isAppleAccount) {
      setRecoveryKeyState("ready");
      return;
    }
    let cancelled = false;
    const check = () => {
      void authApi
        .getActiveAppleWorkspaceRecoveryState()
        .then((state) => {
          if (cancelled) {
            return;
          }
          setRecoveryKeyState((current) => {
            // Never hide a key that is still on screen.
            if (current === "created" || current === "creating") {
              return current;
            }
            return state === "has-key" ? "ready" : "missing";
          });
        })
        .catch(() => {
          if (!cancelled) {
            setRecoveryKeyState((current) => (current === "created" || current === "creating" ? current : "missing"));
          }
        });
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [user?.isAppleAccount]);

  const createRecoveryKey = async (replace = false) => {
    setRecoveryKeyState("creating");
    setRecoveryKeyError("");
    try {
      const { workspaceCode } = await authApi.createRecoveryKeyForActiveAppleWorkspace({ replace });
      setCreatedRecoveryKey(workspaceCode);
      setRecoveryKeyHandled(false);
      setRecoveryKeyCopied(false);
      setRecoveryKeyCopyFailed(false);
      setRecoveryKeyState("created");
    } catch (error) {
      const exists = error instanceof LocalAuthError && error.code === "RECOVERY_KEY_EXISTS";
      setRecoveryKeyError(exists ? t("appleRecoveryKeyExists") : t("appleRecoveryKeyFailed"));
      setRecoveryKeyState(exists ? "ready" : "missing");
    }
  };

  const copyRecoveryKey = async () => {
    if (!createdRecoveryKey) {
      return;
    }
    const text = formatWorkspaceCode(createdRecoveryKey);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Fall back to the legacy command; some embedded browsers lack the API.
      const input = recoveryKeyInputRef.current;
      try {
        input?.focus();
        input?.select();
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
    }
    setRecoveryKeyCopied(copied);
    setRecoveryKeyCopyFailed(!copied);
    if (copied) {
      setRecoveryKeyHandled(true);
    }
  };

  const downloadRecoveryCard = () => {
    if (!createdRecoveryKey) {
      return;
    }
    const content = [
      t("workspaceRecoveryCardTitle"),
      "Studio Map OS",
      "",
      t("appleRecoveryKeyTitle"),
      `${t("registerName")}: ${user?.name ?? ""}`,
      `${formatLocalizedDate(new Date().toISOString(), language)}`,
      "",
      `${t("workspaceKeyLabel")}: ${formatWorkspaceCode(createdRecoveryKey)}`,
      "",
      t("workspaceKeyOnlyOnce"),
      "",
      t("workspaceRecoveryCardDataNotice")
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "studio-map-os-recovery-card.txt";
    link.click();
    // Safari starts the download asynchronously; revoking at once can cancel it.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setRecoveryKeyHandled(true);
  };

  const dismissCreatedRecoveryKey = () => {
    setCreatedRecoveryKey(null);
    setRecoveryKeyCopied(false);
    setRecoveryKeyCopyFailed(false);
    setRecoveryKeyState("ready");
  };

  const exportLocked = Boolean(user?.isAppleAccount) && recoveryKeyState !== "ready";

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

  const downloadSiteBackup = async (workspaceCode: string) => {
    setBackupBusy("export");
    setBackupNotice(null);
    setExportUnlockError("");

    try {
      const encryptedBackup = await authApi.createEncryptedFullSiteBackup(workspaceCode);
      const content = JSON.stringify(encryptedBackup, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const link = document.createElement("a");

      link.href = url;
      link.download = createBackupFileName(encryptedBackup.exportedAt);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setPendingBackupExport(null);
      setBackupNotice({ message: t("siteBackupExportSuccess"), tone: "success" });
    } catch (cause) {
      if (cause instanceof LocalAuthError && cause.code === "RECOVERY_KEY_MISMATCH") {
        setExportUnlockError(t("backupExportKeyMismatch"));
      } else {
        setPendingBackupExport(null);
        setBackupNotice({ message: t("siteBackupExportError"), tone: "error" });
      }
    } finally {
      setBackupBusy(null);
    }
  };

  const downloadWorkspaceBackup = async (workspaceCode: string) => {
    setBackupBusy("workspace-export");
    setBackupNotice(null);
    setExportUnlockError("");

    try {
      await authApi.verifyActiveWorkspaceRecoveryCode(workspaceCode);
      const workspaceBackup = await createMockDatabaseBackup();
      const encryptedBackup = await authApi.encryptActiveWorkspaceFile(
        "workspace",
        workspaceBackup
      );
      const content = JSON.stringify(encryptedBackup, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const link = document.createElement("a");

      link.href = url;
      link.download = createWorkspaceBackupFileName(encryptedBackup.exportedAt);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setPendingBackupExport(null);
      setBackupNotice({ message: t("workspaceBackupExportSuccess"), tone: "success" });
    } catch (cause) {
      if (cause instanceof LocalAuthError && cause.code === "RECOVERY_KEY_MISMATCH") {
        setExportUnlockError(t("backupExportKeyMismatch"));
      } else {
        setPendingBackupExport(null);
        setBackupNotice({ message: t("siteBackupExportError"), tone: "error" });
      }
    } finally {
      setBackupBusy(null);
    }
  };

  const confirmBackupExport = async (workspaceCode: string) => {
    if (pendingBackupExport === "device") {
      await downloadSiteBackup(workspaceCode);
      return;
    }

    if (pendingBackupExport === "workspace") {
      await downloadWorkspaceBackup(workspaceCode);
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

      const lowerFileName = file.name.toLocaleLowerCase();
      const hasSupportedFileName = lowerFileName.endsWith(".json") || lowerFileName.endsWith(".smos-backup");
      const hasJsonMimeType =
        !file.type ||
        file.type === "application/json" ||
        file.type === "text/json" ||
        file.type === "application/octet-stream";

      if (!hasSupportedFileName || !hasJsonMimeType) {
        setBackupNotice({ message: t("siteBackupInvalid"), tone: "error" });
        return;
      }

      const encryptedBackup = parseEncryptedWorkspaceEnvelope(await file.text());
      if (encryptedBackup.kind !== "device" && encryptedBackup.kind !== "workspace") {
        throw new Error("Unsupported full-site backup kind");
      }
      setUnlockError("");
      setPendingEncryptedBackup(encryptedBackup);
    } catch {
      setBackupNotice({ message: t("workspaceEncryptedBackupOnly"), tone: "error" });
    } finally {
      setBackupBusy(null);
    }
  };

  const unlockBackup = async (workspaceCode: string) => {
    if (!pendingEncryptedBackup) {
      return;
    }

    setBackupBusy("import");
    setUnlockError("");

    try {
      const backup: ImportedSiteBackup = pendingEncryptedBackup.kind === "device"
        ? {
            format: "device",
            backup: await authApi.decryptFullSiteBackup(
              pendingEncryptedBackup,
              workspaceCode
            )
          }
        : {
            format: "legacy-workspace",
            backup: validateMockDatabaseBackup(
              await authApi.decryptActiveWorkspaceFile<unknown>(
                pendingEncryptedBackup,
                workspaceCode,
                "workspace"
              )
            )
          };

      setPendingEncryptedBackup(null);
      setPendingBackup(backup);
    } catch (cause) {
      setUnlockError(
        cause instanceof LocalAuthError && cause.code === "RECOVERY_KEY_MISMATCH"
          ? t("backupRecoveryKeyMismatch")
          : t("workspaceKeyMismatchOrCorrupt")
      );
    } finally {
      setBackupBusy(null);
    }
  };

  const confirmRestore = async () => {
    if (!pendingBackup || !user || restoreInFlightRef.current) {
      return;
    }

    restoreInFlightRef.current = true;
    setBackupBusy("restore");
    setBackupNotice(null);
    let storageSnapshot: Awaited<ReturnType<typeof captureMockDatabaseWorkspaceStorage>> | null = null;

    try {
      if (pendingBackup.format === "device") {
        await authApi.restoreFullSiteBackup(pendingBackup.backup);
        try {
          window.sessionStorage.setItem(restoredLoginNoticeStorageKey, "1");
        } catch {
          // The restored accounts and encrypted data are already durable.
        }
        setPendingBackup(null);
        window.location.assign(withBasePath("/login"));
        return;
      }

      storageSnapshot = await captureMockDatabaseWorkspaceStorage(user.workspaceId);
      await restoreMockDatabaseBackup(pendingBackup.backup);
      await authApi.ensureActiveWorkspaceMember();
      try {
        window.sessionStorage.setItem(restoredNoticeStorageKey, t("siteBackupRestoreSuccess"));
      } catch {
        // The restore itself is complete even if a private browsing mode blocks the one-time notice.
      }
      setPendingBackup(null);
      window.location.reload();
    } catch (cause) {
      if (storageSnapshot) {
        try {
          await restoreMockDatabaseWorkspaceStorage(storageSnapshot);
          await authApi.reloadActiveWorkspaceDatabase();
        } catch {
          // Keep the original restore failure visible. Reloading is deliberately
          // avoided so the current in-memory session is not silently replaced.
        }
      }
      setPendingBackup(null);
      setBackupNotice({
        message: isWorkspaceSyncConflictError(cause)
          ? t("storageConflictBlockedBody")
          : t("siteBackupRestoreError"),
        tone: "error"
      });
      setBackupBusy(null);
      restoreInFlightRef.current = false;
      if (cause instanceof LocalAuthError && cause.code === "STORAGE_CORRUPT") {
        try {
          window.sessionStorage.setItem(restoreFailedLoginNoticeStorageKey, "1");
        } catch {
          // Navigation still returns to a fail-closed login screen.
        }
        window.location.assign(withBasePath("/login"));
      }
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
                                  href={projectPath(project.id)}
                                  prefetch={false}
                                  className="block rounded-studio-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
                                >
                                  <ImageCard
                                    imageUrl={project.coverImage}
                                    title={formatDemoEntityName(
                                      translateDomainLabel(project.name, projectNameKeys, t),
                                      project.id,
                                      "project",
                                      t,
                                      project.isExample
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

        {data && user ? (
          <section className="mt-6">
            <ArchiveStorageSyncCard workspaceId={user.workspaceId} />
          </section>
        ) : null}

        {data && user ? (
          <section className="mt-6">
            <GoogleCalendarSyncCard workspaceId={user.workspaceId} />
          </section>
        ) : null}

        {data && user ? (
          <section className="mt-6">
            <AgentBridgeCard workspaceId={user.workspaceId} />
          </section>
        ) : null}

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
              <p className="mt-4 max-w-3xl rounded-studio bg-white/[0.07] p-4 text-xs font-bold leading-5 text-white/72 ring-1 ring-white/10">
                {t("siteBackupCredentialsHint")}
              </p>
              {user?.isAppleAccount && recoveryKeyState !== "ready" && recoveryKeyState !== "checking" ? (
                <div className="mt-4 max-w-3xl rounded-studio bg-[#ffc700]/14 p-4 ring-1 ring-[#ffc700]/40">
                  <div className="flex items-start gap-3">
                    <KeyRound className="mt-0.5 shrink-0 text-[#ffc700]" size={20} />
                    <div className="min-w-0 flex-1">
                      {recoveryKeyState === "created" && createdRecoveryKey ? (
                        <>
                          <p className="text-sm font-black text-white">{t("appleRecoveryKeyCreatedTitle")}</p>
                          <input
                            ref={recoveryKeyInputRef}
                            readOnly
                            value={formatWorkspaceCode(createdRecoveryKey)}
                            aria-label={t("workspaceKeyLabel")}
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.currentTarget.select()}
                            className="mt-3 h-14 w-full rounded-studio bg-white/[0.08] px-3 text-center font-mono text-[clamp(1rem,4vw,1.45rem)] font-black tracking-[0.08em] text-limepop outline-none ring-1 ring-white/10"
                          />
                          <p className="mt-3 text-xs font-bold leading-5 text-white/62">{t("workspaceKeyOnlyOnce")}</p>
                          {recoveryKeyCopyFailed ? (
                            <p role="alert" className="mt-2 text-xs font-black text-[#ffb7a8]">
                              {t("workspaceKeyCopyFailed")}
                            </p>
                          ) : null}
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <Button type="button" variant="secondary" size="md" onClick={() => void copyRecoveryKey()} className="w-full">
                              <Copy size={17} />
                              {recoveryKeyCopied ? t("workspaceKeyCopied") : t("workspaceKeyCopy")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="md"
                              onClick={downloadRecoveryCard}
                              className="w-full bg-white/10 text-white hover:bg-white/18"
                            >
                              <Download size={17} />
                              {t("workspaceKeyDownload")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="md"
                              disabled={!recoveryKeyHandled}
                              onClick={dismissCreatedRecoveryKey}
                              className="w-full bg-white/10 text-white hover:bg-white/18"
                            >
                              <Check size={17} />
                              {t("appleRecoveryKeySaved")}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-black text-white">{t("appleRecoveryKeyTitle")}</p>
                          <p className="mt-1 text-xs font-bold leading-5 text-white/62">{t("appleRecoveryKeyBody")}</p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={recoveryKeyState !== "missing" || Boolean(backupBusy)}
                            onClick={() => void createRecoveryKey()}
                            className="mt-3 w-full bg-[#ffc700] hover:bg-[#ffc700] sm:w-auto"
                          >
                            <KeyRound size={17} />
                            {recoveryKeyState === "creating" ? t("saving") : t("appleRecoveryKeyCreate")}
                          </Button>
                          {recoveryKeyError ? (
                            <p role="alert" className="mt-2 text-xs font-black text-[#ffb7a8]">
                              {recoveryKeyError}
                            </p>
                          ) : null}
                          {recoveryKeyState === "missing" ? (
                            <p className="mt-2 text-xs font-bold text-white/55">{t("appleRecoveryKeyRequiredForExport")}</p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
              {user?.isAppleAccount && recoveryKeyState === "ready" && recoveryKeyError ? (
                <p role="alert" className="mt-3 text-xs font-black text-[#ffb7a8]">
                  {recoveryKeyError}
                </p>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={Boolean(backupBusy) || exportLocked}
                  onClick={() => {
                    setExportUnlockError("");
                    setPendingBackupExport("device");
                  }}
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
              <p className="mt-3 text-xs font-bold leading-5 text-white/48">
                {t("workspaceBackupEncryptedHint")}
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-white/48">
                {t("siteBackupFileHint")}
              </p>
              {user?.isAppleAccount && recoveryKeyState === "ready" ? (
                <button
                  type="button"
                  disabled={Boolean(backupBusy)}
                  onClick={() => setReplaceRecoveryKeyOpen(true)}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-black text-white/62 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                >
                  <KeyRound size={15} />
                  {t("appleRecoveryKeyReplace")}
                </button>
              ) : null}
              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="max-w-3xl text-xs font-bold leading-5 text-white/62">
                  {t("workspaceBackupShareHint")}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  disabled={Boolean(backupBusy) || exportLocked}
                  onClick={() => {
                    setExportUnlockError("");
                    setPendingBackupExport("workspace");
                  }}
                  className="mt-3 w-full bg-white/10 text-white hover:bg-white/18 sm:w-auto"
                >
                  <Download size={19} />
                  {backupBusy === "workspace-export"
                    ? t("saving")
                    : t("downloadWorkspaceBackup")}
                </Button>
              </div>
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
                accept=".json,.smos-backup,application/json,application/octet-stream"
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
        open={replaceRecoveryKeyOpen}
        busy={recoveryKeyState === "creating"}
        acknowledgementLabel={t("dangerousActionAcknowledgement")}
        title={t("appleRecoveryKeyReplace")}
        description={t("appleRecoveryKeyReplaceBody")}
        warning={t("workspaceKeyOnlyOnce")}
        cancelLabel={t("cancel")}
        confirmLabel={t("appleRecoveryKeyReplace")}
        onCancel={() => setReplaceRecoveryKeyOpen(false)}
        onConfirm={() => {
          setReplaceRecoveryKeyOpen(false);
          void createRecoveryKey(true);
        }}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingBackup)}
        busy={backupBusy === "restore"}
        acknowledgementLabel={t("dangerousActionAcknowledgement")}
        title={t("siteBackupRestoreConfirmTitle")}
        description={t("siteBackupRestoreConfirmBody")}
        warning={t("siteBackupRestoreWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("restoreSiteBackup")}
        onCancel={() => setPendingBackup(null)}
        onConfirm={confirmRestore}
      />
      <WorkspaceKeyDialog
        open={Boolean(pendingBackupExport)}
        busy={backupBusy === "export" || backupBusy === "workspace-export"}
        error={exportUnlockError}
        title={t("backupExportVerifyTitle")}
        description={t("backupExportVerifyBody")}
        confirmLabel={t("backupExportVerifyAction")}
        onCancel={() => {
          setPendingBackupExport(null);
          setExportUnlockError("");
        }}
        onConfirm={confirmBackupExport}
      />
      <WorkspaceKeyDialog
        open={Boolean(pendingEncryptedBackup)}
        busy={backupBusy === "import"}
        error={unlockError}
        onCancel={() => {
          setPendingEncryptedBackup(null);
          setUnlockError("");
        }}
        onConfirm={unlockBackup}
      />
    </AppShell>
  );
}
