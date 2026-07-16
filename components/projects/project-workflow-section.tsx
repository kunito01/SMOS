"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Download,
  Link2,
  Link2Off,
  Plus,
  Workflow as WorkflowIcon,
  X
} from "lucide-react";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Select } from "@/components/ui/select";
import { projectsApi, workflowsApi } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Project, ProjectWorkflow } from "@/lib/types";
import { downloadWorkflowShareHtml } from "@/lib/utils/workflow-share";

type ProjectWorkflowSectionProps = {
  project: Project;
  t: (key: TranslationKey) => string;
};

export function ProjectWorkflowSection({ project, t }: ProjectWorkflowSectionProps) {
  const [workflows, setWorkflows] = useState<ProjectWorkflow[]>([]);
  const [availableWorkflows, setAvailableWorkflows] = useState<ProjectWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingWorkflowId, setPendingWorkflowId] = useState("");
  const [pendingUnlinkWorkflow, setPendingUnlinkWorkflow] =
    useState<ProjectWorkflow | null>(null);
  const [saveError, setSaveError] = useState("");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const expanded = expandedProjectId === project.id;

  useEffect(() => {
    let cancelled = false;

    const loadWorkflows = async () => {
      setIsLoading(true);
      setSaveError("");

      try {
        const [linked, library] = await Promise.all([
          projectsApi.listProjectWorkflows(project.id),
          workflowsApi.listWorkflows()
        ]);

        if (cancelled) {
          return;
        }

        setWorkflows(linked);
        setAvailableWorkflows(library);
        setSelectedWorkflowId((currentId) =>
          linked.some((workflow) => workflow.id === currentId)
            ? currentId
            : (linked[0]?.id ?? "")
        );
      } catch {
        if (!cancelled) {
          setSaveError(t("projectWorkflowLoadFailed"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadWorkflows();

    return () => {
      cancelled = true;
    };
  }, [project.id, t]);

  const selectedWorkflow =
    workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? workflows[0];
  const linkedWorkflowIds = useMemo(
    () => new Set(workflows.map((workflow) => workflow.id)),
    [workflows]
  );
  const unlinkedWorkflows = useMemo(
    () => availableWorkflows.filter((workflow) => !linkedWorkflowIds.has(workflow.id)),
    [availableWorkflows, linkedWorkflowIds]
  );

  const linkWorkflow = async (workflow: ProjectWorkflow) => {
    setPendingWorkflowId(workflow.id);
    setSaveError("");

    try {
      await projectsApi.linkProjectWorkflow(project.id, workflow.id);
      setWorkflows((current) => [...current, workflow]);
      setSelectedWorkflowId(workflow.id);
      setChooserOpen(false);
      setExpandedProjectId(project.id);
    } catch {
      setSaveError(t("workflowSaveFailed"));
    } finally {
      setPendingWorkflowId("");
    }
  };

  const unlinkWorkflow = async () => {
    if (!pendingUnlinkWorkflow || pendingWorkflowId) {
      return;
    }

    const workflowToUnlink = pendingUnlinkWorkflow;
    const selectedIndex = workflows.findIndex(
      (workflow) => workflow.id === workflowToUnlink.id
    );

    setPendingWorkflowId(workflowToUnlink.id);
    setSaveError("");

    try {
      await projectsApi.unlinkProjectWorkflow(project.id, workflowToUnlink.id);
      const nextWorkflows = workflows.filter(
        (workflow) => workflow.id !== workflowToUnlink.id
      );

      setWorkflows(nextWorkflows);
      setSelectedWorkflowId((currentId) =>
        currentId === workflowToUnlink.id
          ? (nextWorkflows[Math.min(selectedIndex, nextWorkflows.length - 1)]?.id ?? "")
          : currentId
      );
      setPendingUnlinkWorkflow(null);
    } catch {
      setSaveError(t("workflowSaveFailed"));
    } finally {
      setPendingWorkflowId("");
    }
  };

  const canvasLabels = useMemo(
    () => ({
      addCircle: t("workflowAddCircle"),
      addRectangle: t("workflowAddRectangle"),
      attachment: t("workflowAttachment"),
      attachmentTooLarge: t("workflowAttachmentTooLarge"),
      deleteNode: t("workflowDeleteNode"),
      downloadAttachment: t("workflowDownloadAttachment"),
      editNodeText: t("workflowNodeTextPlaceholder"),
      fitView: t("workflowFitView"),
      invalidJson: t("workflowAttachmentInvalidJson"),
      invalidUtf8: t("workflowAttachmentInvalidUtf8"),
      newCircleText: t("workflowAddCircle"),
      newRectangleText: t("workflowAddRectangle"),
      node: t("workflowBoardLabel"),
      nodeColor: t("workflowNodeColor"),
      removeAttachment: t("workflowRemoveAttachment"),
      replaceAttachment: t("workflowReplaceAttachment"),
      shareWorkflow: t("workflowShareHtml"),
      unsupportedAttachment: t("workflowAttachmentUnsupported"),
      uploadAttachment: t("workflowUploadAttachment"),
      workflowCanvas: t("projectWorkflowTitle"),
      zoomIn: t("workflowZoomIn"),
      zoomOut: t("workflowZoomOut")
    }),
    [t]
  );

  return (
    <section className="mt-6 min-w-0" aria-labelledby="project-workflow-title">
      <Card tone="glass" className="relative min-w-0 overflow-hidden bg-[#E2DAC2] p-4 max-[360px]:p-3 sm:p-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            setExpandedProjectId((current) =>
              current === project.id ? null : project.id
            )
          }
          aria-expanded={expanded}
          aria-controls={`project-workflow-content-${project.id}`}
          aria-label={t(expanded ? "projectWorkflowCollapse" : "projectWorkflowExpand")}
          title={t(expanded ? "projectWorkflowCollapse" : "projectWorkflowExpand")}
          className="absolute right-4 top-4 z-10 size-11 bg-white/82 shadow-soft hover:translate-y-0 sm:right-6 sm:top-6"
        >
          <ChevronDown
            size={21}
            strokeWidth={2.4}
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : "rotate-0"}`}
            aria-hidden="true"
          />
        </Button>

        <div className="flex min-w-0 flex-col gap-4 pr-14 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-limepop text-ink shadow-soft">
              <WorkflowIcon size={21} strokeWidth={2.35} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2
                id="project-workflow-title"
                className="break-words text-2xl font-black leading-tight text-ink [overflow-wrap:anywhere] sm:text-3xl"
              >
                {t("projectWorkflowTitle")}
              </h2>
              <p className="mt-1 max-w-3xl break-words text-sm font-semibold leading-relaxed text-muted [overflow-wrap:anywhere]">
                {t("projectWorkflowBody")}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-10 max-w-full px-4"
              disabled={isLoading || Boolean(pendingWorkflowId)}
              onClick={() => setChooserOpen(true)}
            >
              <Plus size={17} strokeWidth={2.35} />
              <span className="min-w-0 truncate">{t("projectWorkflowAdd")}</span>
            </Button>
            {selectedWorkflow ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-10 max-w-full px-4"
                disabled={Boolean(pendingWorkflowId)}
                onClick={() => setPendingUnlinkWorkflow(selectedWorkflow)}
              >
                <Link2Off size={17} strokeWidth={2.35} />
                <span className="min-w-0 truncate">{t("projectWorkflowUnlink")}</span>
              </Button>
            ) : null}
            {selectedWorkflow ? (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-10 max-w-full px-4"
                disabled={Boolean(pendingWorkflowId)}
                onClick={() => downloadWorkflowShareHtml(selectedWorkflow)}
              >
                <Download size={17} strokeWidth={2.35} />
                <span className="min-w-0 truncate">{t("workflowShareHtml")}</span>
              </Button>
            ) : null}
          </div>
        </div>

        {saveError ? (
          <p className="mt-4 rounded-studio bg-coral/12 px-4 py-3 text-sm font-bold text-coral">
            {saveError}
          </p>
        ) : null}

        <div
          id={`project-workflow-content-${project.id}`}
          hidden={!expanded}
        >
          {expanded ? (
            isLoading ? (
              <div className="mt-5 min-h-52 animate-pulse rounded-studio-lg bg-white/55" />
            ) : selectedWorkflow ? (
              <div className="mt-5 min-w-0">
                {workflows.length > 1 ? (
                  <div className="mb-3 flex min-w-0 flex-col gap-2 sm:max-w-md">
                    <label
                      htmlFor={`project-workflow-select-${project.id}`}
                      className="text-xs font-black uppercase tracking-[0.12em] text-muted"
                    >
                      {t("workflowSelectBoard")}
                    </label>
                    <Select
                      id={`project-workflow-select-${project.id}`}
                      value={selectedWorkflow.id}
                      onChange={(event) => setSelectedWorkflowId(event.target.value)}
                      className="w-full"
                    >
                      {workflows.map((workflow) => (
                        <option key={workflow.id} value={workflow.id}>
                          {workflow.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <WorkflowCanvas
                  key={selectedWorkflow.id}
                  mode="readonly"
                  workflow={selectedWorkflow}
                  labels={canvasLabels}
                  className="h-[min(68dvh,720px)] min-h-[28rem] max-[560px]:min-h-[24rem]"
                />
              </div>
            ) : (
              <div className="mt-5 flex min-h-52 flex-col items-center justify-center rounded-studio-lg border border-dashed border-ink/15 bg-white/55 px-5 py-10 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-cloud text-muted">
                  <WorkflowIcon size={25} strokeWidth={2.2} />
                </span>
                <p className="mt-4 max-w-lg break-words text-sm font-bold leading-relaxed text-muted [overflow-wrap:anywhere]">
                  {t("projectWorkflowEmpty")}
                </p>
              </div>
            )
          ) : null}
        </div>
      </Card>

      {chooserOpen ? (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-workflow-chooser-title"
          >
            <div className="mx-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-studio-lg bg-[#f8fbf2] shadow-lift ring-1 ring-black/[0.08] sm:max-h-[calc(100dvh-3rem)]">
              <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-4 sm:p-6">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-[0.12em] text-muted">
                    {t("projectWorkflowTitle")}
                  </p>
                  <h2
                    id="project-workflow-chooser-title"
                    className="mt-1 break-words text-3xl font-black leading-tight text-ink [overflow-wrap:anywhere]"
                  >
                    {t("projectWorkflowAddTitle")}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-muted">
                    {t("projectWorkflowAddBody")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setChooserOpen(false)}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-soft"
                  aria-label={t("close")}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="studio-scroll flex-1 overflow-y-auto p-4 sm:p-6">
                {unlinkedWorkflows.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {unlinkedWorkflows.map((workflow) => (
                      <button
                        key={workflow.id}
                        type="button"
                        disabled={Boolean(pendingWorkflowId)}
                        onClick={() => void linkWorkflow(workflow)}
                        className="group flex min-h-28 min-w-0 items-center gap-3 rounded-studio bg-white p-4 text-left shadow-soft ring-1 ring-black/[0.05] transition hover:-translate-y-0.5 hover:ring-coral/25 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-limepop text-ink">
                          <Link2 size={19} strokeWidth={2.35} />
                        </span>
                        <span className="min-w-0">
                          <span className="block break-words text-base font-black leading-tight text-ink [overflow-wrap:anywhere]">
                            {workflow.name}
                          </span>
                          <span className="mt-1 block text-xs font-bold text-muted">
                            {t("projectWorkflowAdd")}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-studio border border-dashed border-ink/15 bg-white/60 p-6 text-center">
                    <WorkflowIcon size={30} strokeWidth={2.2} className="text-muted" />
                    <p className="mt-3 max-w-md text-sm font-bold leading-6 text-muted">
                      {t("projectWorkflowNoAvailable")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
      <DeleteConfirmDialog
        open={Boolean(pendingUnlinkWorkflow)}
        busy={Boolean(pendingWorkflowId)}
        title={t("projectWorkflowUnlink")}
        description={t("projectWorkflowUnlinkConfirm")}
        warning={t("projectWorkflowAddBody")}
        acknowledgementLabel={t("dangerousActionAcknowledgement")}
        cancelLabel={t("cancel")}
        confirmLabel={t("projectWorkflowUnlink")}
        onCancel={() => setPendingUnlinkWorkflow(null)}
        onConfirm={() => {
          void unlinkWorkflow();
        }}
      />
    </section>
  );
}
