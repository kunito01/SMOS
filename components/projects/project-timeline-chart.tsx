"use client";

import { Fragment, useRef } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { CalendarRange, Check, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SectionHeader } from "@/components/ui/section-header";
import {
  phaseNameKeys,
  taskTitleKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

type ProjectTimelineChartProps = {
  project: Project;
  t: (key: TranslationKey) => string;
  onEdit?: () => void;
  onTaskToggle?: (taskId: string, completed: boolean) => void;
  footerAction?: ReactNode;
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

export function ProjectTimelineChart({ project, t, onEdit, onTaskToggle, footerAction }: ProjectTimelineChartProps) {
  const { language } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    suppressClick: false,
    startScrollLeft: 0,
    startX: 0
  });
  const phases = project.phases;
  const columnCount = Math.max(phases.length, 1);
  const gridTemplateColumns = `var(--timeline-label-width) repeat(${columnCount}, minmax(var(--timeline-phase-min-width), 1fr))`;
  const minimumTimelineWidth = `max(var(--timeline-board-min-width), calc(var(--timeline-label-width) + ${Array.from(
    { length: columnCount },
    () => "var(--timeline-phase-min-width) + var(--timeline-grid-gap)"
  ).join(" + ")}))`;
  const timelineTitle =
    project.timelineTitle && project.timelineTitle !== "Timeline board"
      ? project.timelineTitle
      : t("timelineBoard");
  const timelineStart = phases.length ? Math.min(...phases.map((phase) => parseDate(phase.startDate))) : Date.now();
  const timelineEnd = phases.length ? Math.max(...phases.map((phase) => parseDate(phase.endDate, true))) : Date.now();
  const now = Date.now();
  const isCurrentInRange = phases.length > 0 && now >= timelineStart && now <= timelineEnd && timelineEnd > timelineStart;
  const currentRatio = isCurrentInRange ? (now - timelineStart) / (timelineEnd - timelineStart) : 0;
  const currentLabel = formatLocalizedDate(new Date(now), language, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const toolsById = new Map(project.tools.map((tool) => [tool.id, tool]));

  const renderLabelCell = (label: string, variant: "default" | "tasks" = "default") => (
    <div
      data-timeline-label
      className="sticky left-0 z-40 grid min-h-16 cursor-default place-items-center rounded-studio px-3 text-center text-sm font-black text-white shadow-[12px_0_28px_rgba(17,31,38,0.08)] backdrop-blur-xl max-[560px]:min-h-14 max-[560px]:px-2 max-[560px]:text-xs max-[420px]:min-h-11 max-[420px]:rounded-xl max-[420px]:px-1 max-[420px]:text-[9px] max-[420px]:leading-tight"
      style={{ backgroundColor: variant === "tasks" ? "#2379af" : "#1e577b" }}
    >
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
    const shouldSuppressClick = dragRef.current.moved;

    dragRef.current.active = false;
    dragRef.current.moved = false;
    dragRef.current.pointerId = -1;
    dragRef.current.suppressClick = shouldSuppressClick;

    if (shouldSuppressClick) {
      window.setTimeout(() => {
        dragRef.current.suppressClick = false;
      }, 0);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Mouse only: touch must use the browser's native scrolling (with
    // momentum); driving scrollLeft from touch pointer events feels dead.
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("button,a,input,select,textarea,[role='button'],[data-timeline-label]")) {
      return;
    }

    const container = scrollRef.current;

    if (!container) {
      return;
    }

    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      suppressClick: false,
      startScrollLeft: container.scrollLeft,
      startX: event.clientX
    };
    container.setPointerCapture(event.pointerId);
    container.classList.add("is-dragging");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || event.pointerId !== dragRef.current.pointerId || !scrollRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startX;

    if (Math.abs(deltaX) > 4) {
      dragRef.current.moved = true;
    }

    scrollRef.current.scrollLeft = dragRef.current.startScrollLeft - deltaX;
    event.preventDefault();
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragRef.current.suppressClick = false;
  };

  const cellStyle = (phaseIndex: number, alpha: number) => ({
    backgroundColor: hexToRgba(phases[phaseIndex]?.color ?? fallbackPhaseColors[phaseIndex % fallbackPhaseColors.length], alpha)
  });

  return (
    <Card tone="white" className="mt-6 overflow-hidden p-5 max-[560px]:p-4 max-[420px]:mt-4 max-[420px]:p-2.5 sm:p-6">
      <SectionHeader
        eyebrow={t("projectContent")}
        title={timelineTitle}
        className="max-[560px]:gap-2"
        eyebrowClassName="max-[560px]:mb-1 max-[560px]:text-xs max-[420px]:text-[9px]"
        titleClassName="max-[560px]:text-xl max-[420px]:text-base"
        action={
          <button
            type="button"
            onClick={onEdit}
            className="grid size-12 place-items-center rounded-full bg-limepop text-ink shadow-soft transition hover:-translate-y-0.5 max-[560px]:size-10 max-[420px]:size-8"
            aria-label={t("editTimeline")}
          >
            {onEdit ? (
              <SlidersHorizontal className="size-[21px] max-[560px]:size-[18px] max-[420px]:size-4" />
            ) : (
              <CalendarRange className="size-[21px] max-[560px]:size-[18px] max-[420px]:size-4" />
            )}
          </button>
        }
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-studio bg-[#ffc700] px-4 py-3 text-xs font-black text-ink/64 max-[560px]:gap-2 max-[560px]:px-3 max-[560px]:py-2.5 max-[560px]:text-[11px] max-[420px]:mt-3 max-[420px]:rounded-xl max-[420px]:px-2 max-[420px]:py-1.5 max-[420px]:text-[9px] max-[420px]:leading-tight">
        <span className="inline-flex min-w-0 items-center gap-2 max-[420px]:gap-1">
          <CalendarRange className="size-[15px] shrink-0 max-[560px]:size-3.5 max-[420px]:size-3" />
          {t("timelineDragHint")}
        </span>
        <span className="whitespace-nowrap">
          {formatLocalizedDate(project.startDate, language)} - {formatLocalizedDate(project.endDate, language)}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="studio-scroll timeline-drag-surface mt-4 overflow-x-auto overscroll-x-contain pb-1 max-[420px]:mt-3"
        onClickCapture={handleClickCapture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onPointerLeave={stopDrag}
      >
        <div
          className="relative [--timeline-board-min-width:64rem] [--timeline-grid-gap:0.5rem] [--timeline-label-width:8.5rem] [--timeline-phase-min-width:13rem] max-[560px]:[--timeline-board-min-width:40rem] max-[560px]:[--timeline-label-width:4.25rem] max-[560px]:[--timeline-phase-min-width:9.5rem] max-[420px]:[--timeline-board-min-width:34rem] max-[420px]:[--timeline-grid-gap:0.25rem] max-[420px]:[--timeline-label-width:3.75rem] max-[420px]:[--timeline-phase-min-width:8rem] max-[360px]:[--timeline-board-min-width:30rem] max-[360px]:[--timeline-label-width:3.5rem] max-[360px]:[--timeline-phase-min-width:7.5rem]"
          style={{ minWidth: minimumTimelineWidth }}
        >
          {isCurrentInRange ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-30"
              style={{
                left: "calc(var(--timeline-label-width) + var(--timeline-grid-gap))",
                right: 0
              }}
            >
              <div className="timeline-now-line" style={{ left: `${currentRatio * 100}%` }}>
                <span className="max-[560px]:!px-2 max-[560px]:!py-1 max-[560px]:!text-[9px] max-[420px]:!px-1.5 max-[420px]:!py-0.5 max-[420px]:!text-[8px]">
                  {t("currentTime")} · {currentLabel}
                </span>
              </div>
            </div>
          ) : null}
          <div className="grid" style={{ gap: "var(--timeline-grid-gap)", gridTemplateColumns }}>
            {renderLabelCell(t("stage"))}
            {phases.map((phase, index) => {
              const color = phase.color ?? fallbackPhaseColors[index % fallbackPhaseColors.length];

              return (
                <div
                  key={`${phase.id}-stage`}
                  className={cn(
                    "grid min-h-16 place-items-center rounded-studio px-4 text-center text-base font-black max-[560px]:min-h-14 max-[560px]:px-3 max-[560px]:text-sm max-[420px]:min-h-11 max-[420px]:rounded-xl max-[420px]:px-1.5 max-[420px]:text-[10px] max-[420px]:leading-tight",
                    readableTextClass(color)
                  )}
                  style={cellStyle(index, rowAlpha.stage)}
                >
                  {translateDomainLabel(phase.name, phaseNameKeys, t) || t("untitledStage")}
                </div>
              );
            })}

            {renderLabelCell(t("period"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-period`}
                className="grid min-h-16 place-items-center rounded-studio px-4 text-center text-sm font-black text-ink max-[560px]:min-h-14 max-[560px]:px-3 max-[560px]:text-xs max-[420px]:min-h-11 max-[420px]:rounded-xl max-[420px]:px-1.5 max-[420px]:text-[9px] max-[420px]:leading-tight"
                style={cellStyle(index, rowAlpha.period)}
              >
                {formatLocalizedDate(phase.startDate, language)} - {formatLocalizedDate(phase.endDate, language)}
              </div>
            ))}

            {renderLabelCell(t("target"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-target`}
                className="min-h-28 rounded-studio p-4 text-sm font-bold leading-6 text-ink/78 max-[560px]:min-h-24 max-[560px]:p-3 max-[560px]:text-xs max-[560px]:leading-5 max-[420px]:min-h-20 max-[420px]:rounded-xl max-[420px]:p-2 max-[420px]:text-[9px] max-[420px]:leading-snug"
                style={cellStyle(index, rowAlpha.target)}
              >
                {phase.description || t("phaseObjective")}
              </div>
            ))}

            {renderLabelCell(t("tasks"), "tasks")}
            {phases.map((phase, index) => {
              const tasks = phase.deliverables.flatMap((deliverable) => deliverable.tasks);

              return (
                <div
                  key={`${phase.id}-tasks`}
                  className="grid min-h-36 content-start gap-2 rounded-studio p-3 max-[560px]:min-h-32 max-[560px]:gap-1.5 max-[560px]:p-2 max-[420px]:min-h-28 max-[420px]:gap-1 max-[420px]:rounded-xl max-[420px]:p-1.5"
                  style={cellStyle(index, rowAlpha.tasks)}
                >
                  {tasks.map((task) => {
                    const person = peopleById.get(task.assigneeId);

                    return (
                      <label
                        key={task.id}
                        className="flex cursor-pointer items-start gap-2 rounded-2xl bg-white/70 p-2.5 text-left transition hover:bg-white/85 max-[560px]:gap-1.5 max-[560px]:p-2 max-[420px]:gap-1 max-[420px]:rounded-xl max-[420px]:p-1.5"
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(event) => onTaskToggle?.(task.id, event.target.checked)}
                          disabled={!onTaskToggle}
                          className="sr-only"
                        />
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-xl border-2 max-[560px]:size-7 max-[420px]:size-6 max-[420px]:rounded-lg max-[420px]:border",
                            task.completed ? "border-coral bg-coral text-white" : "border-ink/25 text-transparent"
                          )}
                        >
                          <Check className="size-[17px] max-[560px]:size-4 max-[420px]:size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block max-w-full whitespace-normal break-words text-sm font-light leading-snug max-[560px]:text-xs max-[420px]:text-[9px] max-[420px]:leading-tight",
                              task.completed ? "text-muted line-through decoration-ink/35" : "text-ink"
                            )}
                          >
                            {translateDomainLabel(task.title, taskTitleKeys, t) || t("untitledTask")}
                          </span>
                          <span className="mt-1 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] font-light leading-snug text-muted max-[560px]:gap-x-1.5 max-[560px]:text-[0.62rem] max-[420px]:mt-0.5 max-[420px]:gap-x-1 max-[420px]:gap-y-0.5 max-[420px]:text-[8px] max-[420px]:leading-tight">
                            <span className="whitespace-normal break-words">
                              {formatLocalizedDate(task.dueDate ?? phase.endDate, language)}
                            </span>
                            <span className="max-w-full whitespace-normal break-words rounded-full bg-white/65 px-2 py-0.5 max-[420px]:px-1.5">
                              {person?.name ?? t("owner")}
                            </span>
                          </span>
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
                className="flex min-h-16 flex-wrap content-center gap-2 rounded-studio p-3 max-[560px]:min-h-14 max-[560px]:gap-1.5 max-[560px]:p-2 max-[420px]:min-h-11 max-[420px]:gap-1 max-[420px]:rounded-xl max-[420px]:p-1.5"
                style={cellStyle(index, rowAlpha.people)}
              >
                {(phase.personIds?.length ? phase.personIds : phase.assigneeId ? [phase.assigneeId] : [])
                  .map((personId) => peopleById.get(personId))
                  .filter((person): person is Project["people"][number] => Boolean(person))
                  .map((person) => (
                    <Pill key={person.id} tone="cloud" className="max-[560px]:min-h-7 max-[560px]:px-3 max-[560px]:text-xs max-[420px]:min-h-6 max-[420px]:px-2 max-[420px]:text-[9px]">
                      {person.name}
                    </Pill>
                  ))}
              </div>
            ))}

            {renderLabelCell(t("stageTools"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-tools`}
                className="flex min-h-16 flex-wrap content-center gap-2 rounded-studio p-3 max-[560px]:min-h-14 max-[560px]:gap-1.5 max-[560px]:p-2 max-[420px]:min-h-11 max-[420px]:gap-1 max-[420px]:rounded-xl max-[420px]:p-1.5"
                style={cellStyle(index, rowAlpha.tools)}
              >
                {(phase.toolIds?.length ? phase.toolIds : project.tools.slice(0, 2).map((tool) => tool.id))
                  .map((toolId) => toolsById.get(toolId))
                  .filter((tool): tool is Project["tools"][number] => Boolean(tool))
                  .map((tool) => (
                    <Pill key={tool.id} tone="cloud" className="max-[560px]:min-h-7 max-[560px]:px-3 max-[560px]:text-xs max-[420px]:min-h-6 max-[420px]:px-2 max-[420px]:text-[9px]">
                      {tool.name}
                    </Pill>
                  ))}
              </div>
            ))}

            {renderLabelCell(t("notes"))}
            {phases.map((phase, index) => (
              <div
                key={`${phase.id}-notes`}
                className="min-h-20 rounded-studio p-4 text-sm font-bold leading-6 text-ink/70 max-[560px]:min-h-16 max-[560px]:p-3 max-[560px]:text-xs max-[560px]:leading-5 max-[420px]:min-h-14 max-[420px]:rounded-xl max-[420px]:p-2 max-[420px]:text-[9px] max-[420px]:leading-snug"
                style={cellStyle(index, rowAlpha.notes)}
              >
                {phase.notes || t("noNotes")}
              </div>
            ))}

            {(project.timelineRows ?? []).map((row) => (
              <Fragment key={row.id}>
                {renderLabelCell(row.label || t("customRowLabel"))}
                {phases.map((phase, index) => (
                  <div
                    key={`${row.id}-${phase.id}`}
                    className="min-h-16 rounded-studio p-4 text-sm font-bold leading-6 text-ink/70 max-[560px]:min-h-14 max-[560px]:p-3 max-[560px]:text-xs max-[560px]:leading-5 max-[420px]:min-h-11 max-[420px]:rounded-xl max-[420px]:p-2 max-[420px]:text-[9px] max-[420px]:leading-snug"
                    style={cellStyle(index, rowAlpha.custom)}
                  >
                    {row.values[phase.id] || t("emptyCell")}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      {footerAction ? <div className="mt-5 max-[420px]:mt-3">{footerAction}</div> : null}
    </Card>
  );
}
