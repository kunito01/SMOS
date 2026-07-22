"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  AlertTriangle,
  Check,
  Plus,
  Save,
  Trash2,
  Workflow as WorkflowIcon
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { ActionConfirmDialog } from "@/components/ui/action-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  updateWorkflow as persistWorkflow
} from "@/lib/api/workflows";
import type { ProjectWorkflow } from "@/lib/types";
import { buildReportChromeLabels } from "@/lib/utils/report-share-common";
import { downloadWorkflowShareHtml } from "@/lib/utils/workflow-share";

type SaveState = "idle" | "saving" | "saved" | "error";

// Viewport pan/zoom is navigation, not an edit — compare only the content a save
// would persist, so panning around the board never counts as unsaved work.
const sameWorkflowContent = (a: ProjectWorkflow, b: ProjectWorkflow) =>
  a.name === b.name &&
  JSON.stringify(a.nodes) === JSON.stringify(b.nodes) &&
  JSON.stringify(a.edges) === JSON.stringify(b.edges);

export function WorkflowPage() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<ProjectWorkflow[] | null>(null);
  const workflowsRef = useRef<ProjectWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState("");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const [pendingDeleteWorkflow, setPendingDeleteWorkflow] =
    useState<ProjectWorkflow | null>(null);
  const isMountedRef = useRef(true);
  const saveRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    isMountedRef.current = true;
    let isMounted = true;

    async function load() {
      const nextWorkflows = await listWorkflows();

      if (!isMounted) {
        return;
      }

      workflowsRef.current = nextWorkflows;
      setWorkflows(nextWorkflows);
      setSelectedWorkflowId("");
    }

    void load();

    return () => {
      isMounted = false;
      isMountedRef.current = false;
    };
  }, []);

  const selectedWorkflow = useMemo(
    () => workflows?.find((workflow) => workflow.id === selectedWorkflowId),
    [selectedWorkflowId, workflows]
  );

  useEffect(() => {
    if (
      selectedWorkflowId &&
      !workflows?.some((workflow) => workflow.id === selectedWorkflowId)
    ) {
      setSelectedWorkflowId("");
    }
  }, [selectedWorkflowId, workflows]);

  useEffect(() => {
    setNameDraft(selectedWorkflow?.name ?? "");
  }, [selectedWorkflow?.id, selectedWorkflow?.name]);

  const enqueueSave = useCallback((nextWorkflow: ProjectWorkflow) => {
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    setSaveState("saving");

    const job = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await persistWorkflow(nextWorkflow.id, nextWorkflow);

        if (isMountedRef.current && revision === saveRevisionRef.current) {
          setSaveState("saved");
          setDirty(false);
        }
      })
      .catch(() => {
        if (isMountedRef.current && revision === saveRevisionRef.current) {
          setSaveState("error");
        }
      });

    saveQueueRef.current = job;
  }, []);

  const replaceWorkflow = useCallback((nextWorkflow: ProjectWorkflow) => {
    const previous = workflowsRef.current.find(
      (workflow) => workflow.id === nextWorkflow.id
    );
    const nextWorkflows = workflowsRef.current.map((workflow) =>
      workflow.id === nextWorkflow.id ? nextWorkflow : workflow
    );

    workflowsRef.current = nextWorkflows;
    setWorkflows(nextWorkflows);

    // Auto-save is off: flag the edit as unsaved instead of persisting. Skip a
    // viewport-only pan/zoom so navigating the board never looks like an edit.
    if (!previous || !sameWorkflowContent(previous, nextWorkflow)) {
      setDirty(true);
    }
  }, []);

  const commitWorkflowName = useCallback(() => {
    if (!selectedWorkflow) {
      return;
    }

    const nextName = nameDraft.trim();
    if (!nextName) {
      setNameDraft(selectedWorkflow.name);
      return;
    }

    if (nextName !== selectedWorkflow.name) {
      replaceWorkflow({
        ...selectedWorkflow,
        name: nextName,
        updatedAt: new Date().toISOString()
      });
    }
  }, [nameDraft, replaceWorkflow, selectedWorkflow]);

  const hasNameDraft = Boolean(
    selectedWorkflow &&
      nameDraft.trim() &&
      nameDraft.trim() !== selectedWorkflow.name
  );
  const hasUnsavedWork = dirty || hasNameDraft;

  // Manual save: fold any typed-but-uncommitted name in, then persist the board.
  const saveNow = useCallback(() => {
    if (!selectedWorkflowId || mutating || saveState === "saving") {
      return;
    }
    commitWorkflowName();
    const workflow = workflowsRef.current.find(
      (item) => item.id === selectedWorkflowId
    );
    if (workflow) {
      enqueueSave(workflow);
    }
  }, [commitWorkflowName, enqueueSave, mutating, saveState, selectedWorkflowId]);

  // Throw away in-memory edits by reloading the persisted boards, then continue.
  const discardThen = useCallback(async (after: () => void) => {
    const fresh = await listWorkflows();
    if (!isMountedRef.current) {
      return;
    }
    workflowsRef.current = fresh;
    setWorkflows(fresh);
    setDirty(false);
    setSaveState("idle");
    after();
  }, []);

  // Run `proceed`, but if there are unsaved edits, confirm leaving first.
  const guardLeave = useCallback(
    (proceed: () => void) => {
      if (!hasUnsavedWork) {
        proceed();
        return;
      }
      pendingNavigationRef.current = () => {
        void discardThen(proceed);
      };
      setLeaveConfirmOpen(true);
    },
    [discardThen, hasUnsavedWork]
  );

  useEffect(() => {
    if (!hasUnsavedWork) {
      return;
    }

    // Browsers require their own native prompt for refresh/tab-close and do not
    // allow an application-styled dialog in the beforeunload lifecycle.
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedWork]);

  const createNewWorkflow = async () => {
    if (mutating) {
      return;
    }

    commitWorkflowName();
    setMutating(true);
    setNotice("");

    try {
      await saveQueueRef.current.catch(() => undefined);
      const index = workflowsRef.current.length + 1;
      const name = t("workflowDefaultName").replace("{index}", String(index));
      const created = await createWorkflow({ name });
      const nextWorkflows = [...workflowsRef.current, created];

      workflowsRef.current = nextWorkflows;
      setWorkflows(nextWorkflows);
      setSelectedWorkflowId(created.id);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setMutating(false);
    }
  };

  const removeSelectedWorkflow = async () => {
    if (!pendingDeleteWorkflow || mutating) {
      return;
    }

    const workflowToDelete = pendingDeleteWorkflow;
    setMutating(true);
    setNotice("");

    try {
      await saveQueueRef.current.catch(() => undefined);
      await deleteWorkflow(workflowToDelete.id);
      const nextWorkflows = workflowsRef.current.filter(
        (workflow) => workflow.id !== workflowToDelete.id
      );

      workflowsRef.current = nextWorkflows;
      setWorkflows(nextWorkflows);
      setSelectedWorkflowId((currentId) =>
        currentId === workflowToDelete.id ? "" : currentId
      );
      setPendingDeleteWorkflow(null);
      setSaveState("idle");
      setDirty(false);
    } catch {
      setSaveState("error");
    } finally {
      setMutating(false);
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
      workflowCanvas: t("workflowTitle"),
      zoomIn: t("workflowZoomIn"),
      zoomOut: t("workflowZoomOut")
    }),
    [t]
  );

  const saveIndicator =
    saveState === "saving"
      ? { icon: Save, label: t("workflowSaving"), tone: "cloud" as const }
      : saveState === "error"
        ? {
            icon: AlertTriangle,
            label: t("workflowSaveFailed"),
            tone: "coral" as const
          }
        : hasUnsavedWork
          ? {
              icon: AlertTriangle,
              label: t("workflowUnsaved"),
              tone: "aqua" as const
            }
          : {
              icon: Check,
              label: t("workflowSaved"),
              tone: "lime" as const
            };
  const SaveIndicatorIcon = saveIndicator.icon;

  const beforeNavigate = (proceed: () => void) => {
    if (!hasUnsavedWork) {
      return true;
    }

    if (!pendingNavigationRef.current) {
      pendingNavigationRef.current = proceed;
    }
    setLeaveConfirmOpen(true);
    return false;
  };

  return (
    <AppShell beforeNavigate={beforeNavigate}>
      <div className="studio-scroll flex-1 overflow-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!workflows ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <Card tone="dark" className="relative overflow-hidden p-5 sm:p-7">
              <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-aqua/35 blur-3xl" />
              <div className="relative flex min-w-0 flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0 max-w-3xl">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-limepop text-ink">
                      <WorkflowIcon size={21} strokeWidth={2.35} />
                    </span>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-white/60">
                      {t("workflowEyebrow")}
                    </p>
                  </div>
                  <h1 className="mt-5 break-words text-4xl font-black leading-none [overflow-wrap:anywhere] sm:text-6xl">
                    {t("workflowTitle")}
                  </h1>
                  <p className="mt-4 max-w-2xl break-words text-sm font-semibold leading-7 text-white/68 [overflow-wrap:anywhere] sm:text-base">
                    {t("workflowBody")}
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={mutating}
                  onClick={() => guardLeave(() => void createNewWorkflow())}
                >
                  <Plus size={19} strokeWidth={2.4} />
                  {t("workflowNewBoard")}
                </Button>
              </div>
            </Card>

            {workflows.length ? (
              <>
                <section className="mt-4 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {workflows.map((workflow) => {
                    const selected = workflow.id === selectedWorkflow?.id;

                    return (
                      <button
                        key={workflow.id}
                        type="button"
                        disabled={mutating}
                        onClick={() => {
                          const target =
                            workflow.id === selectedWorkflow?.id
                              ? ""
                              : workflow.id;
                          guardLeave(() => {
                            setSelectedWorkflowId(target);
                            setNotice("");
                          });
                        }}
                        className={`min-w-0 rounded-studio-lg p-5 text-left shadow-soft ring-1 transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral disabled:opacity-60 ${
                          selected
                            ? "bg-limepop text-ink ring-ink/10"
                            : "bg-white/[0.76] text-ink ring-black/[0.04] hover:-translate-y-1 hover:bg-white hover:shadow-lift"
                        }`}
                        aria-pressed={selected}
                        aria-expanded={selected}
                        aria-controls={selected ? "workflow-editor" : undefined}
                      >
                        <span
                          className={`grid size-11 place-items-center rounded-full ${
                            selected ? "bg-ink text-white" : "bg-aqua text-ink"
                          }`}
                        >
                          <WorkflowIcon size={20} strokeWidth={2.35} />
                        </span>
                        <p className="mt-5 text-xs font-black uppercase tracking-[0.12em] text-current/58">
                          {t("workflowBoardLabel")}
                        </p>
                        <h2 className="mt-2 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere]">
                          {workflow.name}
                        </h2>
                      </button>
                    );
                  })}
                </section>

                {selectedWorkflow ? (
                  <section id="workflow-editor" className="mt-4 min-w-0">
                    <Card tone="glass" className="min-w-0 overflow-hidden p-3 sm:p-4">
                    <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor="workflow-board-name"
                          className="text-xs font-black uppercase tracking-[0.1em] text-muted"
                        >
                          {t("workflowBoardName")}
                        </label>
                        <input
                          id="workflow-board-name"
                          value={nameDraft}
                          maxLength={200}
                          onChange={(event) => setNameDraft(event.target.value)}
                          onBlur={commitWorkflowName}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                          aria-label={t("workflowRenameBoard")}
                          className="mt-2 h-12 w-full max-w-xl rounded-full border border-black/[0.06] bg-white px-5 text-base font-black text-ink outline-none transition focus:border-coral focus:ring-4 focus:ring-coral/10"
                        />
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Pill tone={saveIndicator.tone} className="min-h-10 px-4">
                          <SaveIndicatorIcon size={15} strokeWidth={2.5} />
                          {saveIndicator.label}
                        </Pill>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={
                            mutating || saveState === "saving" || !hasUnsavedWork
                          }
                          onClick={() => saveNow()}
                        >
                          <Save size={16} strokeWidth={2.3} />
                          {t("workflowSaveBoard")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={mutating}
                          onClick={() => setPendingDeleteWorkflow(selectedWorkflow)}
                        >
                          <Trash2 size={16} strokeWidth={2.3} />
                          {t("workflowDeleteBoard")}
                        </Button>
                      </div>
                    </div>

                    <WorkflowCanvas
                      key={selectedWorkflow.id}
                      mode={mutating ? "readonly" : "edit"}
                      workflow={selectedWorkflow}
                      labels={canvasLabels}
                      onChange={replaceWorkflow}
                      onShare={(workflow) => {
                        downloadWorkflowShareHtml(workflow, buildReportChromeLabels(t));
                        setNotice(t("workflowShareSuccess"));
                        window.setTimeout(() => setNotice(""), 2200);
                      }}
                      className="h-[min(72dvh,780px)] min-h-[34rem] max-[560px]:min-h-[28rem]"
                    />

                      {notice ? (
                        <p className="mt-3 rounded-full bg-ink px-4 py-3 text-center text-sm font-black text-limepop shadow-soft">
                          {notice}
                        </p>
                      ) : null}
                    </Card>
                  </section>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteWorkflow)}
        busy={mutating}
        title={t("workflowDeleteBoard")}
        description={`${t("workflowDeleteBoardConfirm")}${
          pendingDeleteWorkflow ? ` ${pendingDeleteWorkflow.name}` : ""
        }`}
        warning={t("deleteIrreversibleWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setPendingDeleteWorkflow(null)}
        onConfirm={() => {
          void removeSelectedWorkflow();
        }}
      />
      <ActionConfirmDialog
        open={leaveConfirmOpen}
        title={t("unsavedChangesTitle")}
        description={t("workflowUnsavedConfirm")}
        warning={t("unsavedChangesWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("leaveWithoutSaving")}
        onCancel={() => {
          pendingNavigationRef.current = null;
          setLeaveConfirmOpen(false);
        }}
        onConfirm={() => {
          const proceed = pendingNavigationRef.current;
          pendingNavigationRef.current = null;
          setLeaveConfirmOpen(false);
          proceed?.();
        }}
      />
    </AppShell>
  );
}
