"use client";

import { useEffect, useState } from "react";
import { Cpu, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { useI18n } from "@/components/providers/app-providers";
import { projectsApi, workflowsApi } from "@/lib/api";
import type { ComfyUiWorkflow } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

export function ComfyWorkflowLibrary() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<ComfyUiWorkflow[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<string[]>([]);
  const [hostDraft, setHostDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [editingId, setEditingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ComfyUiWorkflow | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [nextWorkflows, devices] = await Promise.all([
      workflowsApi.listComfyWorkflows(),
      projectsApi.listKnownCodingDevices()
    ]);
    setWorkflows(nextWorkflows);
    setDeviceOptions(devices);
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [nextWorkflows, devices] = await Promise.all([
        workflowsApi.listComfyWorkflows(),
        projectsApi.listKnownCodingDevices()
      ]);
      if (!cancelled) {
        setWorkflows(nextWorkflows);
        setDeviceOptions(devices);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = () => {
    setEditingId("");
    setHostDraft("");
    setNameDraft("");
    setContentDraft("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameDraft.trim() || busy) {
      return;
    }

    setBusy(true);
    try {
      const input = { content: contentDraft, host: hostDraft, name: nameDraft };
      if (editingId) {
        await workflowsApi.updateComfyWorkflow(editingId, input);
      } else {
        await workflowsApi.createComfyWorkflow(input);
      }
      resetForm();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (workflow: ComfyUiWorkflow) => {
    setEditingId(workflow.id);
    setHostDraft(workflow.host);
    setNameDraft(workflow.name);
    setContentDraft(workflow.content);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || busy) {
      return;
    }

    setBusy(true);
    try {
      await workflowsApi.deleteComfyWorkflow(pendingDelete.id);
      if (editingId === pendingDelete.id) {
        resetForm();
      }
      setPendingDelete(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const fieldLabelClass = "text-xs font-black uppercase tracking-[0.1em] text-muted";
  const inputClass =
    "h-11 w-full rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06] focus:ring-coral";

  return (
    <section className="mt-6 min-w-0" aria-labelledby="comfy-library-title">
      <Card tone="glass" className="min-w-0 overflow-hidden bg-[#e7e4df] p-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white">
            <Cpu size={20} strokeWidth={2.35} />
          </span>
          <div className="min-w-0">
            <h2 id="comfy-library-title" className="text-2xl font-black leading-tight">
              {t("comfyLibraryTitle")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-muted">
              {t("comfyLibraryBody")}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-3 rounded-studio bg-white/55 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <label className="grid gap-2">
                <span className={fieldLabelClass}>{t("comfyHostLabel")}</span>
                <input
                  value={hostDraft}
                  onChange={(event) => setHostDraft(event.target.value)}
                  placeholder={t("comfyHostPlaceholder")}
                  className={inputClass}
                />
              </label>
              {deviceOptions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {deviceOptions.map((device) => (
                    <button
                      key={device}
                      type="button"
                      onClick={() => setHostDraft(device)}
                      className={cn(
                        "min-h-7 rounded-full px-3 text-xs font-black transition",
                        hostDraft.trim() === device
                          ? "bg-[#112f45] text-white"
                          : "bg-white text-ink ring-1 ring-black/[0.08] hover:bg-[#112f45] hover:text-white"
                      )}
                    >
                      {device}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="grid content-start gap-2">
              <span className={fieldLabelClass}>{t("comfyNameLabel")}</span>
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder={t("comfyNamePlaceholder")}
                className={inputClass}
              />
            </label>
          </div>
          <label className="grid gap-2">
            <span className={fieldLabelClass}>{t("comfyContentLabel")}</span>
            <textarea
              value={contentDraft}
              onChange={(event) => setContentDraft(event.target.value)}
              placeholder={t("comfyContentPlaceholder")}
              rows={4}
              className="min-h-28 w-full resize-y rounded-2xl border-0 bg-white p-4 text-sm font-semibold leading-6 text-ink outline-none ring-1 ring-black/[0.06] focus:ring-coral"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="md" disabled={busy || !nameDraft.trim()}>
              {editingId ? <Save size={17} /> : <Plus size={17} />}
              {editingId ? t("comfySave") : t("comfyCreate")}
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" size="md" onClick={resetForm}>
                <X size={17} />
                {t("cancel")}
              </Button>
            ) : null}
          </div>
        </form>

        {workflows.length ? (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <li key={workflow.id} className="min-w-0 rounded-studio bg-white/75 p-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="flex min-w-0 items-baseline gap-1.5">
                    <span className="min-w-0 truncate font-black">{workflow.name}</span>
                    {workflow.host ? (
                      <span className="shrink-0 text-[10px] font-normal text-ink/40">{workflow.host}</span>
                    ) : null}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEditing(workflow)}
                      className="grid size-6 place-items-center rounded-full bg-ink/[0.06] text-ink transition hover:bg-ink hover:text-white"
                      aria-label={`${t("comfyEdit")} · ${workflow.name}`}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(workflow)}
                      className="grid size-6 place-items-center rounded-full bg-ink/[0.06] text-ink transition hover:bg-coral hover:text-white"
                      aria-label={`${t("comfyDelete")} · ${workflow.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
                {workflow.content.trim() ? (
                  <p className="mt-2 line-clamp-2 break-all text-xs font-medium leading-5 text-ink/60">
                    {workflow.content}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm font-semibold leading-6 text-muted">{t("comfyEmpty")}</p>
        )}
      </Card>
      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        busy={busy}
        title={t("comfyDelete")}
        description={`${t("comfyDeleteConfirm")}${pendingDelete ? ` ${pendingDelete.name}` : ""}`}
        warning={t("deleteIrreversibleWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}
