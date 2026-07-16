import type { Tool, ToolSubscription } from "@/lib/types";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

type CalendarDate = {
  day: number;
  month: number;
  year: number;
};

export type SubscriptionPaymentReminder = {
  accountEmail: string;
  amount: number;
  billingCycle: ToolSubscription["billingCycle"];
  currency: ToolSubscription["currency"];
  daysUntilDue: number;
  dueDate: string;
  toolId: string;
  toolName: string;
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const parseDateKey = (value: string): CalendarDate | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { day, month, year };
};

const calendarDateFromLocalDate = (value: Date): CalendarDate | null =>
  Number.isNaN(value.getTime())
    ? null
    : {
        day: value.getDate(),
        month: value.getMonth() + 1,
        year: value.getFullYear()
      };

const toDayNumber = ({ day, month, year }: CalendarDate) =>
  Date.UTC(year, month - 1, day) / millisecondsPerDay;

const compareCalendarDates = (left: CalendarDate, right: CalendarDate) =>
  toDayNumber(left) - toDayNumber(right);

const formatDateKey = ({ day, month, year }: CalendarDate) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const dateAtMonthlyCycle = (anchor: CalendarDate, monthsAfterAnchor: number): CalendarDate => {
  const absoluteMonth = anchor.year * 12 + (anchor.month - 1) + monthsAfterAnchor;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;

  return {
    day: Math.min(anchor.day, daysInMonth(year, month)),
    month,
    year
  };
};

const dateAtYearlyCycle = (anchor: CalendarDate, yearsAfterAnchor: number): CalendarDate => {
  const year = anchor.year + yearsAfterAnchor;

  return {
    day: Math.min(anchor.day, daysInMonth(year, anchor.month)),
    month: anchor.month,
    year
  };
};

export const getNextSubscriptionPaymentDate = (
  billingAnchorDate: string,
  billingCycle: ToolSubscription["billingCycle"],
  today: Date = new Date()
) => {
  const anchor = parseDateKey(billingAnchorDate);
  const currentDate = calendarDateFromLocalDate(today);

  if (
    !anchor ||
    !currentDate ||
    (billingCycle !== "monthly" && billingCycle !== "yearly")
  ) {
    return null;
  }

  if (compareCalendarDates(anchor, currentDate) >= 0) {
    return formatDateKey(anchor);
  }

  if (billingCycle === "monthly") {
    const elapsedMonths =
      (currentDate.year - anchor.year) * 12 + currentDate.month - anchor.month;
    let candidate = dateAtMonthlyCycle(anchor, Math.max(0, elapsedMonths));

    if (compareCalendarDates(candidate, currentDate) < 0) {
      candidate = dateAtMonthlyCycle(anchor, Math.max(0, elapsedMonths) + 1);
    }

    return formatDateKey(candidate);
  }

  const elapsedYears = currentDate.year - anchor.year;
  let candidate = dateAtYearlyCycle(anchor, Math.max(0, elapsedYears));

  if (compareCalendarDates(candidate, currentDate) < 0) {
    candidate = dateAtYearlyCycle(anchor, Math.max(0, elapsedYears) + 1);
  }

  return formatDateKey(candidate);
};

export const getNextActiveSubscriptionPaymentDate = (
  subscription: ToolSubscription,
  today: Date = new Date()
) => {
  const dueDate = getNextSubscriptionPaymentDate(
    subscription.nextPaymentAt ?? "",
    subscription.billingCycle,
    today
  );
  const parsedDueDate = dueDate ? parseDateKey(dueDate) : null;
  const expiresAt = parseDateKey(subscription.expiresAt);

  if (!dueDate || !parsedDueDate) {
    return null;
  }

  if (expiresAt && compareCalendarDates(parsedDueDate, expiresAt) > 0) {
    return null;
  }

  return dueDate;
};

export const getSubscriptionPaymentReminder = (
  tool: Tool,
  today: Date = new Date(),
  reminderLeadDays = 3
): SubscriptionPaymentReminder | null => {
  const subscription = tool.subscription;
  const currentDate = calendarDateFromLocalDate(today);

  if (
    !subscription ||
    !Number.isFinite(subscription.amount) ||
    subscription.amount <= 0 ||
    !currentDate ||
    !Number.isFinite(reminderLeadDays) ||
    reminderLeadDays < 0
  ) {
    return null;
  }

  const dueDate = getNextActiveSubscriptionPaymentDate(subscription, today);
  const parsedDueDate = dueDate ? parseDateKey(dueDate) : null;

  if (!dueDate || !parsedDueDate) {
    return null;
  }

  const daysUntilDue = toDayNumber(parsedDueDate) - toDayNumber(currentDate);

  if (daysUntilDue < 0 || daysUntilDue > reminderLeadDays) {
    return null;
  }

  return {
    accountEmail: subscription.accountEmail,
    amount: subscription.amount,
    billingCycle: subscription.billingCycle,
    currency: subscription.currency,
    daysUntilDue,
    dueDate,
    toolId: tool.id,
    toolName: tool.name
  };
};

export const listSubscriptionPaymentReminders = (
  tools: readonly Tool[],
  today: Date = new Date(),
  reminderLeadDays = 3
) =>
  tools
    .map((tool) => getSubscriptionPaymentReminder(tool, today, reminderLeadDays))
    .filter((item): item is SubscriptionPaymentReminder => Boolean(item))
    .sort(
      (left, right) =>
        left.dueDate.localeCompare(right.dueDate) || left.toolName.localeCompare(right.toolName)
    );
