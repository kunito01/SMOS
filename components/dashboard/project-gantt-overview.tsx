"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { formatDemoEntityName, projectNameKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import { languageLocales } from "@/lib/i18n/translations";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

/** One bar color per project, cycling through the studio palette. */
const barPalette: Array<{ fill: string; text: string }> = [
  { fill: "#F94622", text: "#FFFFFF" },
  { fill: "#03B5AA", text: "#FFFFFF" },
  { fill: "#FFC700", text: "#1C2328" },
  { fill: "#3078A4", text: "#FFFFFF" },
  { fill: "#FD0079", text: "#FFFFFF" },
  { fill: "#8EDBE8", text: "#1C2328" },
  { fill: "#A33E43", text: "#FFFFFF" },
  { fill: "#E3F596", text: "#1C2328" },
  { fill: "#1C2328", text: "#FFFFFF" },
  { fill: "#D4A1DF", text: "#1C2328" }
];

const monthWidthPx = 76;
const labelWidthPx = 148;
const rowHeightPx = 30;

const parseDay = (value: string) => {
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);

  return Number.isFinite(parsed) ? new Date(parsed) : null;
};

const monthKey = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

const daysInMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** Continuous position in month units relative to the first rendered month. */
const monthPosition = (date: Date, firstMonth: number) =>
  monthKey(date) - firstMonth + (date.getUTCDate() - 1) / daysInMonth(date.getUTCFullYear(), date.getUTCMonth());

type GanttRow = {
  id: string;
  name: string;
  leftPct: number;
  widthPct: number;
  fill: string;
  text: string;
  range: string;
};

type ProjectGanttOverviewProps = {
  projects: Project[];
  className?: string;
};

export function ProjectGanttOverview({ projects, className }: ProjectGanttOverviewProps) {
  const { language, t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startScroll: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Mouse-only drag-to-pan; touch keeps the native scroll behaviour.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || !scrollRef.current) {
      return;
    }

    dragRef.current = { startX: event.clientX, startScroll: scrollRef.current.scrollLeft };
    scrollRef.current.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !scrollRef.current) {
      return;
    }

    scrollRef.current.scrollLeft = dragRef.current.startScroll - (event.clientX - dragRef.current.startX);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);
    scrollRef.current?.releasePointerCapture(event.pointerId);
  };

  const chart = useMemo(() => {
    const dated = projects
      .map((project) => {
        const start = parseDay(project.startDate);
        const end = parseDay(project.endDate);

        return start && end && end >= start ? { project, start, end } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => left.start.getTime() - right.start.getTime());

    if (!dated.length) {
      return null;
    }

    const firstMonth = Math.min(...dated.map(({ start }) => monthKey(start)));
    const lastMonth = Math.max(...dated.map(({ end }) => monthKey(end)));
    const totalMonths = lastMonth - firstMonth + 1;

    const monthFormatter = new Intl.DateTimeFormat(languageLocales[language], {
      year: "2-digit",
      month: "short"
    });
    const months = Array.from({ length: totalMonths }, (_, index) => {
      const absolute = firstMonth + index;

      return monthFormatter.format(new Date(Date.UTC(Math.floor(absolute / 12), absolute % 12, 1)));
    });

    const rows: GanttRow[] = dated.map(({ project, start, end }, index) => {
      const startPos = monthPosition(start, firstMonth);
      // The bar covers the end date itself, so extend by one day's fraction.
      const endPos =
        monthPosition(end, firstMonth) +
        1 / daysInMonth(end.getUTCFullYear(), end.getUTCMonth());
      const palette = barPalette[index % barPalette.length];

      return {
        id: project.id,
        name: formatDemoEntityName(
          translateDomainLabel(project.name, projectNameKeys, t),
          project.id,
          "project",
          t,
          project.isExample
        ),
        leftPct: (startPos / totalMonths) * 100,
        widthPct: Math.max(((endPos - startPos) / totalMonths) * 100, 0.75),
        fill: palette.fill,
        text: palette.text,
        range: `${project.startDate} → ${project.endDate}`
      };
    });

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const todayMonth = monthKey(todayUtc);
    const todayPct =
      todayMonth >= firstMonth && todayMonth <= lastMonth
        ? (monthPosition(todayUtc, firstMonth) / totalMonths) * 100
        : null;

    return { months, rows, todayPct };
  }, [language, projects, t]);

  if (!chart) {
    return null;
  }

  const timelineMinWidth = chart.months.length * monthWidthPx;

  return (
    <div className={cn("min-w-0 rounded-studio bg-[#FAFCD9] p-4 text-ink shadow-soft ring-1 ring-white/[0.38]", className)}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-limepop">
          <CalendarRange size={18} />
        </span>
        <p className="text-sm font-black uppercase">{t("ganttSectionTitle")}</p>
      </div>

      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "studio-scroll select-none overflow-x-auto pb-1",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        <div className="flex" style={{ minWidth: labelWidthPx + timelineMinWidth }}>
          <div
            className="sticky left-0 z-20 shrink-0 bg-[#FAFCD9] shadow-[10px_0_18px_rgba(28,35,40,0.06)]"
            style={{ width: labelWidthPx }}
          >
            {/* Matches the today-badge lane plus the month header. */}
            <div className="h-11" />
            {chart.rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center pr-3"
                style={{ height: rowHeightPx }}
              >
                <span className="truncate text-xs font-black" title={row.name}>
                  {row.name}
                </span>
              </div>
            ))}
          </div>

          <div className="relative flex-1" style={{ minWidth: timelineMinWidth }}>
            {/* Reserved lane so the today badge never overlaps the month labels. */}
            <div className="h-4" aria-hidden="true" />

            {/* Month columns with four week ticks each. */}
            <div className="absolute inset-x-0 bottom-0 top-4 flex" aria-hidden="true">
              {chart.months.map((label, index) => (
                <div
                  key={`${label}-${index}`}
                  className="h-full flex-1 border-l border-ink/15"
                  style={{
                    backgroundImage: "linear-gradient(to right, rgba(28,35,40,0.07) 1px, transparent 1px)",
                    backgroundSize: "25% 100%"
                  }}
                />
              ))}
            </div>

            <div className="relative flex h-7 items-center" aria-hidden="true">
              {chart.months.map((label, index) => (
                <span
                  key={`${label}-head-${index}`}
                  className="flex-1 truncate px-1.5 text-[10px] font-black uppercase text-ink/55"
                >
                  {label}
                </span>
              ))}
            </div>

            {chart.rows.map((row) => (
              <div key={row.id} className="relative" style={{ height: rowHeightPx }}>
                <div
                  className="absolute top-1/2 h-5 -translate-y-1/2 rounded-full shadow-sm"
                  style={{
                    left: `${row.leftPct}%`,
                    width: `${row.widthPct}%`,
                    backgroundColor: row.fill
                  }}
                  title={`${row.name} · ${row.range}`}
                />
              </div>
            ))}

            {chart.todayPct !== null ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-10"
                style={{ left: `${chart.todayPct}%` }}
              >
                <div className="mt-4 h-[calc(100%-1rem)] border-l-2 border-dashed border-coral" />
                <span
                  className="absolute top-0 whitespace-nowrap rounded-full bg-coral px-2 py-0.5 text-[9px] font-black leading-none text-white"
                  style={chart.todayPct > 88 ? { right: "calc(100% + 5px)" } : { left: 5 }}
                >
                  {t("ganttToday")}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
