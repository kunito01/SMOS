"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type DayOfMonthPickerProps = {
  /** "" for unset, otherwise "1".."31". */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Shown on the trigger and in the panel footer when nothing is selected. */
  placeholder: string;
  /** Formats a chosen day for the trigger, e.g. "Day 15 monthly". */
  formatDay: (day: number) => string;
  /** Styling for the trigger button so it matches the surrounding form. */
  className?: string;
};

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/**
 * A calendar-style day-of-month picker: the trigger opens a 1–31 grid (like a
 * month calendar) instead of a long native dropdown. Selects a recurring day,
 * not a full date.
 */
export function DayOfMonthPicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
  formatDay,
  className
}: DayOfMonthPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = value ? Number(value) : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const pick = (day: number | null) => {
    onChange(day === null ? "" : String(day));
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className={cn("flex items-center justify-between gap-2 text-left", className)}
      >
        <span className={cn("min-w-0 truncate", selected === null && "text-muted")}>
          {selected === null ? placeholder : formatDay(selected)}
        </span>
        <CalendarDays size={16} strokeWidth={2.3} className="shrink-0 opacity-70" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className="smos-dropdown-panel smos-dropdown-enter absolute left-0 top-[calc(100%+0.5rem)] z-[130] w-[min(19rem,calc(100vw-2rem))] p-2"
        >
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={selected === day}
                onClick={() => pick(day)}
                className={cn(
                  "grid h-9 place-items-center rounded-full text-sm font-black text-ink outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-coral/50",
                  selected === day && "bg-[#ffc700]"
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-2 grid h-9 w-full place-items-center rounded-full text-xs font-black text-muted outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-coral/50"
          >
            {placeholder}
          </button>
        </div>
      ) : null}
    </div>
  );
}
