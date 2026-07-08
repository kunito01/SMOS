"use client";

import { Fragment, useRef } from "react";
import { CalendarRange, Check, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SectionHeader } from "@/components/ui/section-header";
import {
  phaseNameKeys,
  taskTitleKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

type ProjectTimelineChartProps = {
  project: Project;
  t: (key: TranslationKey) => string;
  onEdit?: () => void;
  onTaskToggle?: (taskId: string, completed: boolean) => void;
};

const fallbackPhaseColors = ["#e3f596", "#f4e9d8", "#8edbe8", "#f94a22", "#1c2328", "#d4a1df"];
const rowAlpha = {
  stage: 1,
  period: 0.15,
  target: 0.7,
  tasks: 0.4,
  people: 0.7,
  tools: 0.7,
  notes: 0.15,
  custom: 0.15
} as const;

const parseDate = (value: string, endOfDay = false) =>
  new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime();

const formatDate = (value: string) => value.replaceAll("-", ".");

const hexToRgba = (hex: string, alpha: number) => {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : value;
  const parsed = Number.parseInt(normalized, 16);

  if (Number.isNaN(parsed)) {
    return `rgba(227, 245, 150, ${alpha})`;
  }

  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const readableTextClass = (hex: string) => {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : value;
  const parsed = Number.parseInt(normalized, 16);

  if (Number.isNaN(parsed)) {
    return "text-ink";
  }

  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.58 ? "text-ink" : "text-white";
};

export function ProjectTimelineChart({ project, t, onEdit, onTaskToggle }: ProjectTimelineChartProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startScrollLeft: 0,
    startX: 0
  });
  const phases = project.phases;
  const columnCount = Math.max(phases.length, 1);
  const gridTemplateColumns = `8.5rem repeat(${columnCount}, minmax(13rem, 1fr))`;
  const timelineTitle =
    project.timelineTitle && project.timelineTitle !== "Timeline board"
      ? project.timelineTitle
      : t("timelineBoard");
  const timelineStart = phases.length ? Math.min(...phases.map((phase) => parseDate(phase.startDate))) : Date.now();
  const timelineEnd = phases.length ? Math.max(...phases.map((phase) => parseDate(phase.endDate, true))) : Date.now();
  const now = Date.now();
  const isCurrentInRange = phases.length > 0 && now >= timelineStart && now <= timelineEnd && timelineEnd > timelineStart;
  const currentRatio = isCurrentInRange ? (now - timelineStart) / (timelineEnd - timelineStart) : 0;
  const currentLabel = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(now));
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const toolsById = new Map(project.tools.map((tool) => [tool.id, tool]));

  const renderLabelCell = (label: string) => (
    <div className="grid min-h-16 place-items-center rounded-studio bg-cloud px-3 text-center text-sm font-black text-muted">
      {label}
    </div>
  );

  const stopDrag = () => {
    const container = scrollRef.current;

    if (container && dragRef.current.pointerId >= 0) {
      try {
        container.releasePointerCapture(dragRef.current.pointerId);
      } catch {
        // The capture can already be gone if the browser cancelled the pointer.
      }
    }

    container?.classList.remove("is-dragging");
    dragRef.current.active = false;
    dragRef.current.pointerId = -1;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("button,a,input,select,textarea,label")) {
      return;
    }

    const container = scrollRef.current;

    if (!container) {
      return;
    }

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startScrollLeft: container.scrollLeft,
      startX: event.clientX
    };
    container.setPointerCapture(event.pointerId);
    container.classList.add("is-dragging");
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || event.pointerId !== dragRef.current.pointerId || !scrollRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startX;
    scrollRef.current.scrollLeft = dragRef.current.startScrollLeft - deltaX;
    event.preventDefault();
  };

  const cellStyle = (phaseIndex: number, alpha: number) => ({
    backgroundColor: hexToRgba(phases[phaseIndex]?.color ?? fallbackPhaseColors[phaseIndex % fallbackPhaseColors.length], alpha)
  });

  return (
    <Card tone="white" className="mt-6 overflow-hidden p-5 sm:p-6">
      <SectionHeader
        eyebrow={t("timeline")}
        title={timelineTitle}
        action={
          <button
            type="button"
            onClick={onEdit}
            className="grid size-12 place-items-center rounded-full bg-limepop text-ink shadow-soft transition hover:-translate-y-0.5"
            aria-label={t("editTimeline")}
          >
            {onEdit ? <SlidersHorizontal size={21} /> : <CalendarRange size={21} />}
          </button>
        }
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-studio bg-cloud/65 px-4 py-3 text-xs font-black text-ink/64">
        <span className="inline-flex items-center gap-2">
          <CalendarRange size={15} />
          {t("timelineDragHint")}
        </span>
        <span>{formatDate(project.startDate)} - {formatDate(project.endDate)}</span>
      </div>
      <div
        ref={scrollRef}
        className="studio-scroll timeline-drag-surface mt-4 overflow-x-auto pb-2"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onPointerLeave={stopDrag}
      >
        <div className="relative min-w-[64rem]">
          {isCurrentInRange ? (
            <div
              className="timeline-now-line"
              style={{ left: `calc(8.5rem + (100% - 8.5rem) * ${currentRatio})` }}
            >
              <span>{t("currentTime")} · {currentLabel}</span>
            </div>
          ) : null}
          <div className="grid gap-2" style={{ gridTemplateColumns }}>
            {renderLabelCell(t("stage"))}
            {phases.map((phase, index) => {
              const color = phase.color ?? fallbackPhaseColors[index % fallbackPhaseColors.length];

              return (
                <div
                  key={`${phase.id}-stage`}
                  className={cn(
                    "grid min-h-16 place-items-center rounded-studio px-4 text-center text-base font-black",
                    readableTextClass(color)
                  )}
                  style={cellStyle(index, rowAlpha.stage)}
                >
                  {translateDomainLabel(phase.name, phaseNameKeys, t)}
                </div>
              );
            })}

            {renderLabelCell(t("period"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-period`}
                className="grid min-h-16 place-items-center rounded-studio px-4 text-center text-sm font-black text-ink"
                style={cellStyle(index, rowAlpha.period)}
              >
                {formatDate(phase.startDate)} - {formatDate(phase.endDate)}
              </div>
            ))}

            {renderLabelCell(t("target"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-target`}
                className="min-h-28 rounded-studio p-4 text-sm font-bold leading-6 text-ink/78"
                style={cellStyle(index, rowAlpha.target)}
              >
                {phase.description || t("phaseObjective")}
              </div>
            ))}

            {renderLabelCell(t("tasks"))}
            {phases.map((phase, index) => {
              const tasks = phase.deliverables.flatMap((deliverable) => deliverable.tasks);

              return (
                <div
                  key={`${phase.id}-tasks`}
                  className="grid min-h-36 content-start gap-2 rounded-studio p-3"
                  style={cellStyle(index, rowAlpha.tasks)}
                >
                  {tasks.map((task) => {
                    const person = peopleById.get(task.assigneeId);

                    return (
                      <label key={task.id} className="flex cursor-pointer items-center gap-2 rounded-2xl bg-white/70 p-2">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(event) => onTaskToggle?.(task.id, event.target.checked)}
                          disabled={!onTaskToggle}
                          className="sr-only"
                        />
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-xl border-2",
                            task.completed ? "border-coral bg-coral text-white" : "border-ink/25 text-transparent"
                          )}
                        >
                          <Check size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-sm font-black",
                              task.completed ? "text-muted line-through" : "text-ink"
                            )}
                          >
                            {translateDomainLabel(task.title, taskTitleKeys, t)}
                          </span>
                          <span className="mt-1 block truncate text-xs font-bold text-muted">
                            {formatDate(task.dueDate ?? phase.endDate)}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-muted">
                          {person?.name.slice(0, 2) ?? t("owner")}
                        </span>
                      </label>
                    );
                  })}
                </div>
              );
            })}

            {renderLabelCell(t("stagePeople"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-people`}
                className="flex min-h-16 flex-wrap content-center gap-2 rounded-studio p-3"
                style={cellStyle(index, rowAlpha.people)}
              >
                {(phase.personIds?.length ? phase.personIds : phase.assigneeId ? [phase.assigneeId] : [])
                  .map((personId) => peopleById.get(personId))
                  .filter((person): person is Project["people"][number] => Boolean(person))
                  .map((person) => (
                    <Pill key={person.id} tone="cloud">
                      {person.name}
                    </Pill>
                  ))}
              </div>
            ))}

            {renderLabelCell(t("stageTools"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-tools`}
                className="flex min-h-16 flex-wrap content-center gap-2 rounded-studio p-3"
                style={cellStyle(index, rowAlpha.tools)}
              >
                {(phase.toolIds?.length ? phase.toolIds : project.tools.slice(0, 2).map((tool) => tool.id))
                  .map((toolId) => toolsById.get(toolId))
                  .filter((tool): tool is Project["tools"][number] => Boolean(tool))
                  .map((tool) => (
                    <Pill key={tool.id} tone="cloud">
                      {tool.name}
                    </Pill>
                  ))}
              </div>
            ))}

            {renderLabelCell(t("notes"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-notes`}
                className="min-h-20 rounded-studio p-4 text-sm font-bold leading-6 text-ink/70"
                style={cellStyle(index, rowAlpha.notes)}
              >
                {phase.notes || t("noNotes")}
              </div>
            ))}

            {(project.timelineRows ?? []).map((row) => (
              <Fragment key={row.id}>
                {renderLabelCell(row.label)}
                {phases.map((phase, index) => (
                  <div
                    key={`${row.id}-${phase.id}`}
                    className="min-h-16 rounded-studio p-4 text-sm font-bold leading-6 text-ink/70"
                    style={cellStyle(index, rowAlpha.custom)}
                  >
                    {row.values[phase.id] || t("emptyCell")}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns }} aria-hidden="true">
            <div className="h-4 rounded-full bg-cloud" />
            {phases.map((phase, index) => {
              const color = phase.color ?? fallbackPhaseColors[index % fallbackPhaseColors.length];

              return (
                <div
                  key={`${phase.id}-scroll-rail`}
                  className="h-4 rounded-full shadow-soft"
                  style={{
                    backgroundColor: hexToRgba(color, phase.status === "active" ? 1 : 0.55)
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
