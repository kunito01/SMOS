import { languageLocales, type Language } from "@/lib/i18n/translations";

const parseDateValue = (value: Date | string) => {
  if (value instanceof Date) {
    return value;
  }

  const localDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (localDate) {
    return new Date(Number(localDate[1]), Number(localDate[2]) - 1, Number(localDate[3]));
  }

  return new Date(value);
};

export function formatLocalizedDate(
  value: Date | string,
  language: Language,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }
) {
  const date = parseDateValue(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  return new Intl.DateTimeFormat(languageLocales[language], {
    calendar: "gregory",
    ...options
  }).format(date);
}
