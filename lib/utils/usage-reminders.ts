import type { UsageCycle } from "@/lib/types";
import { isDateKey } from "@/lib/utils/testflight";

/** Length of one weekly cycle; the start day counts as day one. */
export const USAGE_CYCLE_DAYS = 7;
/** Countdown turns red once this few days remain. */
export const USAGE_WARNING_DAYS = 2;

export const usageCycles: UsageCycle[] = ["weekly", "monthly"];

const dayNumber = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** The start day-of-month pushed forward by `months`, clamped to months that are shorter. */
const monthlyBoundary = (startDate: string, months: number) => {
  const [year, month, day] = startDate.split("-").map(Number);
  const monthIndex = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Date.UTC(year, monthIndex, Math.min(day, lastDay)) / 86_400_000;
};

/**
 * Days left in the current cycle, repeating forever from startDate.
 * Weekly: the start day shows 7, the seventh day shows 1, then it starts over.
 * Monthly: the cycle ends the day before the same day-of-month next month, so
 * the count follows real month lengths (31, 30, 28/29). A start date in the
 * future shows a full cycle until it arrives.
 */
export const getUsageDaysLeft = (startDate: string, today: string, cycle: UsageCycle = "weekly") => {
  if (!isDateKey(startDate) || !isDateKey(today)) {
    return null;
  }
  const todayNumber = dayNumber(today);
  const startNumber = dayNumber(startDate);

  if (cycle === "monthly") {
    if (todayNumber < startNumber) {
      return monthlyBoundary(startDate, 1) - startNumber;
    }
    // Walk month by month to the first boundary after today; cycles are short, so this stays tiny.
    for (let months = 1; months <= 1_200; months += 1) {
      const boundary = monthlyBoundary(startDate, months);
      if (boundary > todayNumber) {
        return boundary - todayNumber;
      }
    }
    return null;
  }

  const elapsed = todayNumber - startNumber;
  if (elapsed < 0) {
    return USAGE_CYCLE_DAYS;
  }
  return USAGE_CYCLE_DAYS - (elapsed % USAGE_CYCLE_DAYS);
};
