import { isDateKey } from "@/lib/utils/testflight";

/** Length of one usage cycle; the start day counts as day one. */
export const USAGE_CYCLE_DAYS = 7;
/** Countdown turns red once this few days remain. */
export const USAGE_WARNING_DAYS = 2;

const dayNumber = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/**
 * Days left in the current 7-day cycle, cycling forever from startDate: the
 * start day shows 7, the seventh day shows 1, and the next day starts over.
 * A start date in the future shows a full cycle until it arrives.
 */
export const getUsageDaysLeft = (startDate: string, today: string) => {
  if (!isDateKey(startDate) || !isDateKey(today)) {
    return null;
  }
  const elapsed = dayNumber(today) - dayNumber(startDate);
  if (elapsed < 0) {
    return USAGE_CYCLE_DAYS;
  }
  return USAGE_CYCLE_DAYS - (elapsed % USAGE_CYCLE_DAYS);
};
