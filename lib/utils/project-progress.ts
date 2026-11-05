import type { Phase } from "@/lib/types";

type ProgressProject = {
  phases?: readonly Phase[] | null;
};

const titledTasks = (phase: Phase) => {
  const deliverables = Array.isArray(phase.deliverables) ? phase.deliverables : [];

  return deliverables.flatMap((deliverable) => {
    const tasks = Array.isArray(deliverable?.tasks) ? deliverable.tasks : [];

    return tasks.filter((task) => typeof task?.title === "string" && task.title.trim().length > 0);
  });
};

const parseLocalDay = (value: string, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day);

  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

/** How far the calendar has moved through this phase. Null when the dates cannot be read. */
const scheduleFraction = (phase: Phase, now: number) => {
  const start = parseLocalDay(phase.startDate);
  const end = parseLocalDay(phase.endDate, true);

  if (start === null || end === null || end <= start) {
    return null;
  }

  if (now <= start) {
    return 0;
  }

  if (now >= end) {
    return 1;
  }

  return (now - start) / (end - start);
};

const phaseWeight = (phase: Phase) => {
  const start = parseLocalDay(phase.startDate);
  const end = parseLocalDay(phase.endDate, true);

  if (start === null || end === null || end <= start) {
    return 1;
  }

  return end - start;
};

/** Share of a phase that has no named tasks. Completed wins; otherwise the dates do. */
const phaseFraction = (phase: Phase, now: number) => {
  if (phase.status === "completed") {
    return 1;
  }

  const scheduled = scheduleFraction(phase, now);

  if (scheduled !== null) {
    return scheduled;
  }

  return phase.status === "active" ? 0.5 : 0;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/**
 * Task-only percent, or null when the project has no named tasks.
 * Status changes stay on this number so a calendar-only bar cannot flip
 * a manually chosen project status.
 */
export const calculateTaskCompletionProgress = (project: ProgressProject) => {
  const tasks = (project.phases ?? []).flatMap((phase) => titledTasks(phase));

  if (tasks.length === 0) {
    return null;
  }

  return clampPercent((tasks.filter((task) => task.completed).length / tasks.length) * 100);
};

/**
 * Percent of the project that should fill the card bar.
 * Named tasks keep the existing checklist ratio, so a phase that is almost
 * done on its tasks still fills that share. With no named tasks, each phase
 * is weighted by its length: a completed phase counts in full, and a phase
 * that is simply nearing its end date counts for how far that window has run.
 */
export const calculateProjectProgress = (project: ProgressProject, now = Date.now()) => {
  const taskProgress = calculateTaskCompletionProgress(project);

  if (taskProgress !== null) {
    return taskProgress;
  }

  const phases = project.phases ?? [];

  if (phases.length === 0) {
    return 0;
  }

  let weighted = 0;
  let weightSum = 0;

  for (const phase of phases) {
    const weight = phaseWeight(phase);
    weighted += phaseFraction(phase, now) * weight;
    weightSum += weight;
  }

  if (weightSum <= 0) {
    return 0;
  }

  return clampPercent((weighted / weightSum) * 100);
};
