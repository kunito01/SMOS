"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { projectsApi, workflowsApi } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ComfyUiWorkflow, Project } from "@/lib/types";

type ProjectComfySectionProps = {
  project: Project;
  t: (key: TranslationKey) => string;
};

export function ProjectComfySection({ project, t }: ProjectComfySectionProps) {
  const [linked, setLinked] = useState<ComfyUiWorkflow[]>([]);
  const [library, setLibrary] = useState<ComfyUiWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [nextLinked, nextLibrary] = await Promise.all([
        projectsApi.listProjectComfyWorkflows(project.id),
        workflowsApi.listComfyWorkflows()
      ]);
      if (!cancelled) {
        setLinked(nextLinked);
        setLibrary(nextLibrary);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const linkedIds = useMemo(() => new Set(linked.map((workflow) => workflow.id)), [linked]);
  const available = useMemo(
    () => library.filter((workflow) => !linkedIds.has(workflow.id)),
    [library, linkedIds]
  );

  const linkSelected = async () => {
    const workflow = available.find((item) => item.id === selectedId);
    if (!workflow || busy) {
      return;
    }

    setBusy(true);
    try {
      await projectsApi.linkProjectComfyWorkflow(project.id, workflow.id);
      setLinked((current) => [...current, workflow]);
      setSelectedId("");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (comfyWorkflowId: string) => {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      await projectsApi.unlinkProjectComfyWorkflow(project.id, comfyWorkflowId);
      setLinked((current) => current.filter((workflow) => workflow.id !== comfyWorkflowId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card tone="glass" className="mt-4 min-w-0 overflow-hidden bg-[#e7e4df] p-4 max-[360px]:p-3 sm:p-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white">
            <Cpu size={20} strokeWidth={2.35} />
          </span>
          <h3 className="text-2xl font-black leading-tight">ComfyUI</h3>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {available.length ? (
            <>
              <Select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="h-11 min-w-44 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
              >
                <option value="">{t("comfyLinkAdd")}</option>
                {available.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                    {workflow.host ? ` · ${workflow.host}` : ""}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={busy || !selectedId}
                onClick={() => void linkSelected()}
              >
                <Plus size={16} />
                {t("comfyLinkAdd")}
              </Button>
            </>
          ) : (
            <p className="text-xs font-bold leading-5 text-muted">{t("comfyLinkNoneAvailable")}</p>
          )}
        </div>
      </div>

      {linked.length ? (
        <ul className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3">
          {linked.map((workflow) => (
            <li key={workflow.id} className="min-w-0 rounded-studio bg-white/75 p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="flex min-w-0 items-baseline gap-1.5">
                  <span className="min-w-0 truncate font-black">{workflow.name}</span>
                  {workflow.host ? (
                    <span className="shrink-0 text-[10px] font-normal text-ink/40">{workflow.host}</span>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={() => void unlink(workflow.id)}
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink transition hover:bg-coral hover:text-white"
                  aria-label={`${t("wishListRemove")} · ${workflow.name}`}
                >
                  <X size={12} />
                </button>
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
        <p className="mt-4 text-sm font-semibold leading-6 text-muted">{t("comfyLinkEmpty")}</p>
      )}
    </Card>
  );
}
