"use client";

import { useRef, useState } from "react";
import { Download, FolderOpen, Save, Trash2 } from "lucide-react";
import { WorkspaceKeyDialog } from "@/components/auth/workspace-key-dialog";
import { authApi, projectsApi } from "@/lib/api";
import { LocalAuthError } from "@/lib/api/auth";
import {
  ProjectImportTargetError,
  type ProjectImportPlan
} from "@/lib/api/projects";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  parseEncryptedWorkspaceEnvelope,
  type EncryptedWorkspaceEnvelope
} from "@/lib/security/workspace-crypto";
import type { Project } from "@/lib/types";
import {
  createProjectSave,
  validateProjectSave,
  type ValidatedProjectSave
} from "@/lib/utils/project-import";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { SectionHeader } from "@/components/ui/section-header";

type ProjectSaveControlsProps = {
  onDeleted: () => void;
  onLoaded: (project: Project) => void;
  project: Project;
  setNotice: (notice: string) => void;
  t: (key: TranslationKey) => string;
};

type PendingProjectImport = {
  archive: ValidatedProjectSave;
  plan: ProjectImportPlan;
};

type LocalFileHandle = {
  getFile?: () => Promise<File>;
};

type WindowWithFilePickers = Window & {
  showOpenFilePicker?: (options?: {
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
    types?: Array<{
      accept: Record<string, string[]>;
      description: string;
    }>;
  }) => Promise<LocalFileHandle[]>;
};

const maxEncryptedProjectFileBytes = 16 * 1024 * 1024;

const filePickerOptions = {
  excludeAcceptAllOption: false,
  multiple: false,
  types: [
    {
      accept: { "application/json": [".json"] },
      description: "Studio Map OS project save"
    }
  ]
};

const createProjectFileName = (exportedAt: string) =>
  `studio-map-os-project-${exportedAt.replace(/[:.]/g, "-")}.smos-project.json`;

const downloadFallback = (content: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

export function ProjectSaveControls({
  onDeleted,
  onLoaded,
  project,
  setNotice,
  t
}: ProjectSaveControlsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<"delete" | "load" | "save" | null>(null);
  const [pendingEncryptedSave, setPendingEncryptedSave] = useState<EncryptedWorkspaceEnvelope | null>(null);
  const [pendingProjectImport, setPendingProjectImport] = useState<PendingProjectImport | null>(null);
  const [unlockError, setUnlockError] = useState("");

  const saveProject = async () => {
    setBusy("save");

    try {
      const exportProject = await projectsApi.ensureProjectArchiveIdentity(project.id);
      const encryptedSave = await authApi.encryptActiveWorkspaceFile(
        "project",
        createProjectSave(exportProject)
      );
      const content = JSON.stringify(encryptedSave, null, 2);
      const fileName = createProjectFileName(encryptedSave.exportedAt);

      downloadFallback(content, fileName);

      onLoaded(exportProject);
      setNotice(t("projectSavedFile"));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setNotice(t("projectFileInvalid"));
      }
    } finally {
      setBusy(null);
    }
  };

  const importProject = async (file: File) => {
    setBusy("load");

    try {
      if (file.size > maxEncryptedProjectFileBytes) {
        throw new Error("Encrypted project save is too large");
      }

      const encryptedSave = parseEncryptedWorkspaceEnvelope(await file.text(), "project");

      setUnlockError("");
      setPendingProjectImport(null);
      setPendingEncryptedSave(encryptedSave);
    } catch {
      setNotice(t("workspaceEncryptedBackupOnly"));
    } finally {
      setBusy(null);
    }
  };

  const unlockProject = async (workspaceCode: string) => {
    if (!pendingEncryptedSave) {
      return;
    }

    setBusy("load");
    setUnlockError("");

    try {
      const payload = await authApi.decryptActiveWorkspaceFile<unknown>(
        pendingEncryptedSave,
        workspaceCode,
        "project"
      );
      const archive = validateProjectSave(payload);
      const plan = await projectsApi.inspectProjectImport(project.id, archive);

      setPendingEncryptedSave(null);
      setPendingProjectImport({ archive, plan });
    } catch (cause) {
      if (cause instanceof ProjectImportTargetError) {
        setUnlockError(
          cause.reason === "name"
            ? t("projectImportNameMismatch")
            : cause.reason === "legacy"
              ? t("projectImportLegacyRestricted")
              : t("projectImportTargetMismatch")
        );
      } else if (cause instanceof LocalAuthError && cause.code === "RECOVERY_KEY_MISMATCH") {
        setUnlockError(t("backupRecoveryKeyMismatch"));
      } else {
        setUnlockError(t("projectFileInvalid"));
      }
    } finally {
      setBusy(null);
    }
  };

  const confirmProjectImport = async () => {
    if (!pendingProjectImport) {
      return;
    }

    setBusy("load");

    try {
      const result = await projectsApi.replaceProjectFromArchive(
        project.id,
        pendingProjectImport.archive
      );

      setPendingProjectImport(null);
      onLoaded(result.project);
      setNotice(
        result.mode === "blank-target"
          ? t("projectImportSuccessBlank")
          : t("projectImportSuccessSame")
      );
    } catch (cause) {
      setPendingProjectImport(null);
      setNotice(
        cause instanceof ProjectImportTargetError && cause.reason === "name"
          ? t("projectImportNameMismatch")
          : t("projectImportTargetMismatch")
      );
    } finally {
      setBusy(null);
    }
  };

  const loadProject = async () => {
    const pickerWindow = window as WindowWithFilePickers;

    if (pickerWindow.showOpenFilePicker) {
      setBusy("load");

      try {
        const [fileHandle] = await pickerWindow.showOpenFilePicker(filePickerOptions);
        const file = await fileHandle.getFile?.();

        if (file) {
          await importProject(file);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setNotice(t("projectFileInvalid"));
        }
        setBusy(null);
      }
      return;
    }

    inputRef.current?.click();
  };

  const deleteProject = async () => {
    setBusy("delete");
    await projectsApi.deleteProject(project.id);
    setBusy(null);
    onDeleted();
  };

  return (
    <>
      <Card tone="dark" className="mt-6 p-5 max-[560px]:p-4 max-[360px]:p-3 sm:p-6">
        <SectionHeader
          eyebrow={t("projectSettings")}
          title={t("projectSaveConsole")}
          className="min-w-0"
          eyebrowClassName="max-[480px]:mb-1 max-[480px]:text-xs max-[360px]:text-[10px]"
          titleClassName="max-[480px]:text-xl max-[360px]:text-lg"
        />
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/62 [overflow-wrap:anywhere] max-[560px]:text-xs max-[560px]:leading-5 max-[360px]:mt-2 max-[360px]:text-[10px] max-[360px]:leading-4">
          {t("projectSaveConsoleBody")}
        </p>
        <p className="mt-2 max-w-3xl text-xs font-black leading-5 text-limepop/72 [overflow-wrap:anywhere]">
          {t("workspaceBackupEncryptedHint")}
        </p>
        <div className="mt-5 grid min-w-0 gap-3 max-[560px]:mt-4 max-[560px]:gap-2 md:grid-cols-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={saveProject}
            disabled={Boolean(busy)}
            className="min-w-0 max-[560px]:h-11 max-[560px]:w-full max-[560px]:px-3 max-[560px]:text-sm max-[360px]:h-9 max-[360px]:px-2 max-[360px]:text-xs max-[360px]:[&_svg]:size-4"
          >
            {busy === "save" ? <Download size={19} /> : <Save size={19} />}
            {t("saveProjectFile")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={loadProject}
            disabled={Boolean(busy)}
            className="min-w-0 max-[560px]:h-11 max-[560px]:w-full max-[560px]:px-3 max-[560px]:text-sm max-[360px]:h-9 max-[360px]:px-2 max-[360px]:text-xs max-[360px]:[&_svg]:size-4"
          >
            <FolderOpen size={19} />
            {t("loadProjectFile")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => setDeleteOpen(true)}
            disabled={Boolean(busy)}
            className="min-w-0 bg-coral text-white max-[560px]:h-11 max-[560px]:w-full max-[560px]:px-3 max-[560px]:text-sm max-[360px]:h-9 max-[360px]:px-2 max-[360px]:text-xs max-[360px]:[&_svg]:size-4"
          >
            <Trash2 size={19} />
            {t("deleteProject")}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.smos-project.json,application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];

            event.target.value = "";

            if (file) {
              void importProject(file);
            }
          }}
        />
      </Card>
      <DeleteConfirmDialog
        open={deleteOpen}
        title={t("deleteProjectTitle")}
        description={t("deleteProjectDescription")}
        warning={t("deleteIrreversibleWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          void deleteProject();
        }}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingProjectImport)}
        busy={busy === "load"}
        title={
          pendingProjectImport?.plan.mode === "blank-target"
            ? t("projectImportConfirmBlankTitle")
            : t("projectImportConfirmSameTitle")
        }
        description={
          pendingProjectImport?.plan.mode === "blank-target"
            ? t("projectImportConfirmBlankBody")
            : t("projectImportConfirmSameBody")
        }
        warning={
          pendingProjectImport
            ? `${t("projectImportSourceLabel")}: ${pendingProjectImport.plan.sourceName} · ${t("projectImportTargetLabel")}: ${pendingProjectImport.plan.targetName}`
            : ""
        }
        cancelLabel={t("cancel")}
        confirmLabel={t("projectImportConfirmAction")}
        onCancel={() => setPendingProjectImport(null)}
        onConfirm={() => void confirmProjectImport()}
      />
      <WorkspaceKeyDialog
        open={Boolean(pendingEncryptedSave)}
        busy={busy === "load"}
        error={unlockError}
        onCancel={() => {
          setPendingEncryptedSave(null);
          setUnlockError("");
        }}
        onConfirm={unlockProject}
      />
    </>
  );
}
