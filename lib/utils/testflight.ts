import type { ReleasePlatform } from "@/lib/types";

export const TESTFLIGHT_VALIDITY_DAYS = 90;
/** Countdown turns red once this few days remain. */
export const TESTFLIGHT_WARNING_DAYS = 7;

export const releasePlatforms: ReleasePlatform[] = ["mac", "win", "linux", "android", "ios", "steam"];

export const releasePlatformLabels: Record<ReleasePlatform, string> = {
  mac: "Mac",
  win: "Win",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  steam: "Steam"
};

export const isDateKey = (value: string | undefined): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");

export const todayDateKey = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const dayNumber = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** Days until the 90-day TestFlight window closes; negative once it has expired. */
export const getTestflightDaysLeft = (releasedAt: string, today: string = todayDateKey()) =>
  isDateKey(releasedAt) ? TESTFLIGHT_VALIDITY_DAYS - (dayNumber(today) - dayNumber(releasedAt)) : null;
