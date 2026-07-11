"use client";

import { useRef } from "react";
import type { PointerEvent } from "react";
import { useI18n } from "@/components/providers/app-providers";
import {
  phaseNameKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Phase, Project } from "@/lib/types";

type ProjectSummaryTimelineProps = {
  project: Project;
  t: (key: TranslationKey) => string;
};

type TimelineBar = {
  id: string;
  label: string;
  color: string;
  left: number;
  top: number;
  width: number;
  textColor: string;
};

const fallbackPhaseColors = ["#e3f596", "#f4e9d8", "#8edbe8", "#f94a22", "#1c2328", "#d4a1df"];

const parseDate = (value: string, endOfDay = false) =>
  new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const readableTextColor = (hex: string) => {
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
    return "#1c2328";
  }

  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.58 ? "#1c2328" : "#ffffff";
};

const phaseProgress = (phase: Phase, timelineStart: number, timelineEnd: number) => {
  const duration = Math.max(timelineEnd - timelineStart, 1);
  const start = parseDate(phase.startDate);
  const end = parseDate(phase.endDate, true);

  return {
    left: clamp(((start - timelineStart) / duration) * 100, 0, 100),
    width: clamp(((end - start) / duration) * 100, 6, 100)
  };
};

export function ProjectSummaryTimeline({ project, t }: ProjectSummaryTimelineProps) {
  const { language } = useI18n();
  const phases = project.phases;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startScrollLeft: 0,
    startX: 0
  });

  if (!phases.length) {
    return null;
  }

  const timelineStart = Math.min(...phases.map((phase) => parseDate(phase.startDate)));
  const timelineEnd = Math.max(...phases.map((phase) => parseDate(phase.endDate, true)));
  const duration = Math.max(timelineEnd - timelineStart, 1);
  const now = Date.now();
  const currentRatio = clamp(((now - timelineStart) / duration) * 100, 0, 100);
  const currentInRange = now >= timelineStart && now <= timelineEnd;
  const timelineStartDate = phases.reduce(
    (earliest, phase) => (phase.startDate < earliest ? phase.startDate : earliest),
    phases[0].startDate
  );
  const timelineEndDate = phases.reduce(
    (latest, phase) => (phase.endDate > latest ? phase.endDate : latest),
    phases[0].endDate
  );
  const bars = phases.map<TimelineBar>((phase, phaseIndex) => {
    const color = phase.color ?? fallbackPhaseColors[phaseIndex % fallbackPhaseColors.length];
    const phaseBar = phaseProgress(phase, timelineStart, timelineEnd);

    return {
      id: `${phase.id}-phase`,
      label: translateDomainLabel(phase.name, phaseNameKeys, t) || t("untitledStage"),
      color,
      left: phaseBar.left,
      top: 42 + phaseIndex * 36,
      width: phaseBar.width,
      textColor: readableTextColor(color)
    };
  });

  const stopDrag = () => {
    const container = scrollRef.current;

    if (container && dragRef.current.pointerId >= 0) {
      try {
        container.releasePointerCapture(dragRef.current.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }

    container?.classList.remove("is-dragging");
    dragRef.current.active = false;
    dragRef.current.pointerId = -1;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !scrollRef.current) {
      return;
    }

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startScrollLeft: scrollRef.current.scrollLeft,
      startX: event.clientX
    };
    scrollRef.current.setPointerCapture(event.pointerId);
    scrollRef.current.classList.add("is-dragging");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || event.pointerId !== dragRef.current.pointerId || !scrollRef.current) {
      return;
    }

    scrollRef.current.scrollLeft = dragRef.current.startScrollLeft - (event.clientX - dragRef.current.startX);
    event.preventDefault();
  };

  return (
    <div className="mt-5 overflow-hidden rounded-studio bg-[#4f666a] p-3 ring-1 ring-white/30 max-[560px]:mt-4 max-[560px]:p-2.5 max-[420px]:rounded-xl max-[420px]:p-2">
      <div className="mb-3 flex items-center justify-between gap-3 max-[560px]:mb-2 max-[560px]:gap-2 max-[420px]:flex-col max-[420px]:items-start max-[420px]:gap-1.5">
        <p className="text-xs font-black uppercase text-white max-[560px]:text-[10px] max-[420px]:text-[9px]">{t("summaryTimeline")}</p>
        <span className="max-w-full rounded-full bg-white/22 px-3 py-1 text-xs font-black text-white max-[560px]:px-2.5 max-[560px]:text-[10px] max-[420px]:px-2 max-[420px]:py-0.5 max-[420px]:text-[9px]">
          {formatLocalizedDate(timelineStartDate, language)} - {formatLocalizedDate(timelineEndDate, language)}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="studio-scroll timeline-drag-surface overflow-x-auto pb-1 max-[420px]:pb-0.5"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onPointerLeave={stopDrag}
      >
        <div
          className="relative rounded-[1.4rem] bg-transparent shadow-inner [--summary-bar-height:2.125rem] [--summary-chart-height:15.25rem] [--summary-chart-width:48.75rem] [--summary-grid-gap:4.5rem] max-[560px]:rounded-[1.15rem] max-[560px]:[--summary-bar-height:1.875rem] max-[560px]:[--summary-chart-width:36rem] max-[560px]:[--summary-grid-gap:3.5rem] max-[420px]:rounded-xl max-[420px]:[--summary-bar-height:1.625rem] max-[420px]:[--summary-chart-height:13.5rem] max-[420px]:[--summary-chart-width:29rem] max-[420px]:[--summary-grid-gap:3rem] max-[360px]:[--summary-chart-width:26rem]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(28,35,40,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(28,35,40,0.08) 1px, transparent 1px)",
            backgroundSize: "var(--summary-grid-gap) var(--summary-grid-gap)",
            height: "var(--summary-chart-height)",
            minWidth: "var(--summary-chart-width)"
          }}
        >
          {currentInRange ? (
            <div
              className="absolute top-4 z-20 h-[calc(100%-1rem)] border-l border-dashed border-[#ff0099] max-[560px]:top-3 max-[560px]:h-[calc(100%-0.75rem)] max-[420px]:top-2.5"
              style={{ left: `${currentRatio}%` }}
            >
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#ff0099] px-3 py-1 text-xs font-bold text-white shadow-soft max-[560px]:px-2 max-[560px]:py-0.5 max-[560px]:text-[10px] max-[420px]:px-1.5 max-[420px]:text-[8px]">
                {formatLocalizedDate(new Date(now), language, {
                  day: "numeric",
                  month: "short",
                  year: "numeric"
                })}
              </span>
            </div>
          ) : null}

          {bars.map((bar) => (
            <div
              key={bar.id}
              className="absolute z-10 flex min-w-[11rem] items-center justify-center overflow-hidden rounded-xl px-3 text-center text-sm font-black shadow-[0_10px_24px_rgba(17,31,38,0.12)] max-[560px]:min-w-[9rem] max-[560px]:px-2.5 max-[560px]:text-[11px] max-[420px]:min-w-[7.5rem] max-[420px]:rounded-lg max-[420px]:px-2 max-[420px]:text-[9px]"
              style={{
                backgroundColor: bar.color,
                color: bar.textColor,
                height: "var(--summary-bar-height)",
                left: `${bar.left}%`,
                top: bar.top,
                width: `${bar.width}%`
              }}
            >
              <span className="truncate">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
