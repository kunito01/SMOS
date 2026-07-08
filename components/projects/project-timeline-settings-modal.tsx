"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, Plus, Save, Trash2, X } from "lucide-react";
import { projectsApi } from "@/lib/api";
import type { UpdateProjectTimelineInput } from "@/lib/api/projects";
import type { Project, Task, TimelineCustomRow } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils/cn";

type TimelineSettingsModalProps = {
  open: boolean;
  project: Project;
  t: (key: TranslationKey) => string;
  onClose: () => void;
  onSaved: (project: Project) => void;
};

type TaskDraft = {
  id?: string;
  title: string;
  completed: boolean;
  assigneeId: string;
  dueDate: string;
  priority: Task["priority"];
};

type PhaseDraft = {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  color: string;
  personIds: string[];
  toolIds: string[];
  notes: string;
  tasks: TaskDraft[];
};

type RowDraft = TimelineCustomRow;

const inputClass =
  "min-h-11 w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-coral focus:ring-4 focus:ring-coral/10";
const fieldLabelClass = "text-xs font-black uppercase text-muted";
const phaseColors = ["#e3f596", "#f4e9d8", "#8edbe8", "#f94a22", "#1c2328", "#d4a1df"];

const makeDraftId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createTaskDraft = (phase: Pick<PhaseDraft, "id" | "endDate" | "personIds">): TaskDraft => ({
  id: makeDraftId(`${phase.id}-task`),
  title: "",
  completed: false,
  assigneeId: phase.personIds[0] ?? "",
  dueDate: phase.endDate,
  priority: "medium"
});

const projectToDrafts = (project: Project): { phases: PhaseDraft[]; rows: RowDraft[]; title: string } => ({
  title: project.timelineTitle ?? "Timeline board",
  phases: project.phases.map((phase, index) => {
    const personIds = phase.personIds?.length
      ? phase.personIds
      : phase.assigneeId
        ? [phase.assigneeId]
        : project.people.slice(0, 1).map((person) => person.id);

    return {
      id: phase.id,
      name: phase.name,
      description: phase.description,
      startDate: phase.startDate,
      endDate: phase.endDate,
      color: phase.color ?? phaseColors[index % phaseColors.length],
      personIds,
      toolIds: phase.toolIds?.length ? phase.toolIds : project.tools.slice(0, 2).map((tool) => tool.id),
      notes: phase.notes ?? "",
      tasks: phase.deliverables.flatMap((deliverable) =>
        deliverable.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          completed: task.completed,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate ?? phase.endDate,
          priority: task.priority
        }))
      )
    };
  }),
  rows: (project.timelineRows ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    values: { ...row.values }
  }))
});

export function ProjectTimelineSettingsModal({
  open,
  project,
  t,
  onClose,
  onSaved
}: TimelineSettingsModalProps) {
  const initialDraft = useMemo(() => projectToDrafts(project), [project]);
  const [title, setTitle] = useState(initialDraft.title);
  const [phases, setPhases] = useState<PhaseDraft[]>(initialDraft.phases);
  const [rows, setRows] = useState<RowDraft[]>(initialDraft.rows);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextDraft = projectToDrafts(project);
    setTitle(nextDraft.title);
    setPhases(nextDraft.phases);
    setRows(nextDraft.rows);
  }, [open, project]);

  if (!open) {
    return null;
  }

  const updatePhase = (phaseId: string, patch: Partial<PhaseDraft>) => {
    setPhases((current) =>
      current.map((phase) => (phase.id === phaseId ? { ...phase, ...patch } : phase))
    );
  };

  const togglePhasePerson = (phase: PhaseDraft, personId: string) => {
    const nextIds = phase.personIds.includes(personId)
      ? phase.personIds.filter((id) => id !== personId)
      : [...phase.personIds, personId];

    updatePhase(phase.id, { personIds: nextIds });
  };

  const togglePhaseTool = (phase: PhaseDraft, toolId: string) => {
    const nextIds = phase.toolIds.includes(toolId)
      ? phase.toolIds.filter((id) => id !== toolId)
      : [...phase.toolIds, toolId];

    updatePhase(phase.id, { toolIds: nextIds });
  };

  const updateTask = (phaseId: string, taskId: string | undefined, patch: Partial<TaskDraft>) => {
    setPhases((current) =>
      current.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              tasks: phase.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
            }
          : phase
      )
    );
  };

  const addPhase = () => {
    const previous = phases.at(-1);
    const phaseId = makeDraftId(`${project.id}-phase`);
    const nextPhase: PhaseDraft = {
      id: phaseId,
      name: "",
      description: "",
      startDate: previous?.endDate ?? project.startDate,
      endDate: previous?.endDate ?? project.endDate,
      color: phaseColors[phases.length % phaseColors.length],
      personIds: project.people.slice(0, 1).map((person) => person.id),
      toolIds: project.tools.slice(0, 1).map((tool) => tool.id),
      notes: "",
      tasks: []
    };

    nextPhase.tasks = [createTaskDraft(nextPhase)];
    setPhases((current) => [...current, nextPhase]);
    setRows((current) =>
      current.map((row) => ({
        ...row,
        values: { ...row.values, [phaseId]: "" }
      }))
    );
  };

  const removePhase = (phaseId: string) => {
    if (phases.length <= 1) {
      return;
    }

    setPhases((current) => current.filter((phase) => phase.id !== phaseId));
    setRows((current) =>
      current.map((row) => {
        const nextValues = { ...row.values };
        delete nextValues[phaseId];
        return { ...row, values: nextValues };
      })
    );
  };

  const addTask = (phase: PhaseDraft) => {
    updatePhase(phase.id, { tasks: [...phase.tasks, createTaskDraft(phase)] });
  };

  const removeTask = (phaseId: string, taskId: string | undefined) => {
    setPhases((current) =>
      current.map((phase) =>
        phase.id === phaseId
          ? { ...phase, tasks: phase.tasks.filter((task) => task.id !== taskId) }
          : phase
      )
    );
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        id: makeDraftId(`${project.id}-timeline-row`),
        label: "",
        values: Object.fromEntries(phases.map((phase) => [phase.id, ""]))
      }
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
  };

  const updateRowValue = (rowId: string, phaseId: string, value: string) => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [phaseId]: value } }
          : row
      )
    );
  };

  const save = async () => {
    setSaving(true);
    const payload: UpdateProjectTimelineInput = {
      title,
      phases: phases.map((phase) => ({
        ...phase,
        tasks: phase.tasks.map((task) => ({
          ...task,
          title: task.title.trim() || t("untitledTask")
        }))
      })),
      rows
    };
    const nextProject = await projectsApi.updateProjectTimeline(project.id, payload);
    setSaving(false);
    onSaved(nextProject);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-ink/45 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] max-w-6xl flex-col overflow-hidden rounded-studio-lg bg-[#f8fbf2] shadow-lift ring-1 ring-black/[0.08] sm:max-h-[calc(100vh-3rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-4 sm:p-6">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase text-muted">{t("editTimeline")}</p>
            <h2 className="mt-1 text-3xl font-black leading-none">{t("timelineSettingsTitle")}</h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-muted">
              {t("timelineSettingsBody")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-soft"
            aria-label={t("cancel")}
          >
            <X size={20} />
          </button>
        </div>

        <div className="studio-scroll flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-3 rounded-studio bg-white p-4 shadow-soft">
            <label className="grid gap-2">
              <span className={fieldLabelClass}>{t("timelineTitleLabel")}</span>
              <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <h3 className="text-2xl font-black">{t("projectStages")}</h3>
            <button
              type="button"
              onClick={addPhase}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-limepop px-4 text-sm font-black text-ink shadow-soft"
            >
              <Plus size={17} />
              {t("addStage")}
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            {phases.map((phase, phaseIndex) => (
              <section key={phase.id} className="rounded-studio-lg bg-white p-4 shadow-soft ring-1 ring-black/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-11 place-items-center rounded-full text-sm font-black text-ink ring-1 ring-black/[0.06]"
                      style={{ backgroundColor: phase.color }}
                    >
                      {String(phaseIndex + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm font-black uppercase text-muted">{t("stage")}</p>
                      <h4 className="text-xl font-black">{phase.name || t("untitledStage")}</h4>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhase(phase.id)}
                    disabled={phases.length <= 1}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-cloud px-4 text-sm font-black text-ink disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                    {t("removeStage")}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <label className="grid gap-2">
                    <span className={fieldLabelClass}>{t("stageName")}</span>
                    <input
                      className={inputClass}
                      value={phase.name}
                      onChange={(event) => updatePhase(phase.id, { name: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={fieldLabelClass}>{t("stageColor")}</span>
                    <div className="flex gap-2">
                      <input
                        className={cn(inputClass, "flex-1")}
                        value={phase.color}
                        onChange={(event) => updatePhase(phase.id, { color: event.target.value })}
                      />
                      <input
                        type="color"
                        value={phase.color}
                        onChange={(event) => updatePhase(phase.id, { color: event.target.value })}
                        className="h-11 w-14 rounded-2xl border border-black/[0.08] bg-white p-1"
                        aria-label={t("stageColor")}
                      />
                    </div>
                  </label>
                  <label className="grid gap-2">
                    <span className={fieldLabelClass}>{t("startDate")}</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={phase.startDate}
                      onChange={(event) => updatePhase(phase.id, { startDate: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={fieldLabelClass}>{t("endDate")}</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={phase.endDate}
                      onChange={(event) => updatePhase(phase.id, { endDate: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-2 lg:col-span-2">
                    <span className={fieldLabelClass}>{t("stageGoal")}</span>
                    <textarea
                      className={cn(inputClass, "min-h-24 resize-y")}
                      value={phase.description}
                      onChange={(event) => updatePhase(phase.id, { description: event.target.value })}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-studio bg-cloud/40 p-3">
                    <p className={fieldLabelClass}>{t("stagePeople")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {project.people.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => togglePhasePerson(phase, person.id)}
                          className={cn(
                            "inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-black transition",
                            phase.personIds.includes(person.id) ? "bg-ink text-white" : "bg-white text-muted"
                          )}
                        >
                          {phase.personIds.includes(person.id) ? <Check size={15} /> : null}
                          {person.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-studio bg-cloud/40 p-3">
                    <p className={fieldLabelClass}>{t("stageTools")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {project.tools.map((tool) => (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => togglePhaseTool(phase, tool.id)}
                          className={cn(
                            "inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-black transition",
                            phase.toolIds.includes(tool.id) ? "bg-limepop text-ink" : "bg-white text-muted"
                          )}
                        >
                          {phase.toolIds.includes(tool.id) ? <Check size={15} /> : null}
                          {tool.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-studio bg-cloud/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className={fieldLabelClass}>{t("stageTasks")}</p>
                    <button
                      type="button"
                      onClick={() => addTask(phase)}
                      className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-3 text-xs font-black"
                    >
                      <Plus size={15} />
                      {t("addTask")}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {phase.tasks.map((task) => (
                      <div key={task.id} className="grid gap-2 rounded-studio bg-white p-3 xl:grid-cols-[auto_minmax(12rem,1fr)_10rem_10rem_auto]">
                        <label className="flex items-center gap-2 text-sm font-black">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={(event) => updateTask(phase.id, task.id, { completed: event.target.checked })}
                            className="size-5 accent-coral"
                          />
                          {t("markDone")}
                        </label>
                        <input
                          className={inputClass}
                          value={task.title}
                          placeholder={t("taskTitle")}
                          onChange={(event) => updateTask(phase.id, task.id, { title: event.target.value })}
                        />
                        <input
                          type="date"
                          className={inputClass}
                          value={task.dueDate}
                          onChange={(event) => updateTask(phase.id, task.id, { dueDate: event.target.value })}
                        />
                        <select
                          className={inputClass}
                          value={task.assigneeId}
                          onChange={(event) => updateTask(phase.id, task.id, { assigneeId: event.target.value })}
                        >
                          {project.people.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeTask(phase.id, task.id)}
                          className="grid size-11 place-items-center rounded-full bg-cloud text-muted"
                          aria-label={t("delete")}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="mt-4 grid gap-2">
                  <span className={fieldLabelClass}>{t("stageNotes")}</span>
                  <textarea
                    className={cn(inputClass, "min-h-20 resize-y")}
                    value={phase.notes}
                    onChange={(event) => updatePhase(phase.id, { notes: event.target.value })}
                  />
                </label>
              </section>
            ))}
          </div>

          <div className="mt-6 rounded-studio-lg bg-white p-4 shadow-soft ring-1 ring-black/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase text-muted">{t("customRows")}</p>
                <h3 className="text-2xl font-black">{t("customRowsTitle")}</h3>
              </div>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-limepop px-4 text-sm font-black text-ink shadow-soft"
              >
                <Plus size={17} />
                {t("addCustomRow")}
              </button>
            </div>

            {rows.length ? (
              <div className="studio-scroll mt-4 overflow-x-auto">
                <div
                  className="grid min-w-[52rem] gap-2"
                  style={{ gridTemplateColumns: `12rem repeat(${phases.length}, minmax(12rem, 1fr)) auto` }}
                >
                  <div className="rounded-2xl bg-cloud px-3 py-2 text-xs font-black uppercase text-muted">
                    {t("customRowLabel")}
                  </div>
                  {phases.map((phase) => (
                    <div key={phase.id} className="rounded-2xl bg-cloud px-3 py-2 text-xs font-black uppercase text-muted">
                      {phase.name || t("untitledStage")}
                    </div>
                  ))}
                  <div />
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <input
                        className={inputClass}
                        value={row.label}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id ? { ...item, label: event.target.value } : item
                            )
                          )
                        }
                      />
                      {phases.map((phase) => (
                        <input
                          key={`${row.id}-${phase.id}`}
                          className={inputClass}
                          value={row.values[phase.id] ?? ""}
                          onChange={(event) => updateRowValue(row.id, phase.id, event.target.value)}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="grid size-11 place-items-center rounded-full bg-cloud text-muted"
                        aria-label={t("delete")}
                      >
                        <Trash2 size={17} />
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-studio bg-cloud/60 p-4 text-sm font-semibold text-muted">
                {t("customRowsEmpty")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.06] p-4 sm:p-6">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-full bg-white px-5 text-sm font-black text-ink shadow-soft"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || phases.length === 0}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-coral px-5 text-sm font-black text-white shadow-soft disabled:opacity-50"
          >
            <Save size={17} />
            {saving ? t("loading") : t("saveTimeline")}
          </button>
        </div>
      </div>
    </div>
  );
}
