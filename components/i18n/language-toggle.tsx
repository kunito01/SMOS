"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useI18n } from "@/components/providers/app-providers";
import { Language, languages } from "@/lib/i18n/translations";

type LanguageToggleProps = {
  compact?: boolean;
  className?: string;
  variant?: "segmented" | "dropdown";
};

export function LanguageToggle({ compact = false, className, variant = "segmented" }: LanguageToggleProps) {
  const { language, setLanguage, t } = useI18n();
  const labels: Record<Language, { compact: string; full: string }> = {
    en: { compact: "EN", full: "English" },
    zh: { compact: "中", full: "中文" },
    ja: { compact: "日", full: "日本語" }
  };

  if (variant === "dropdown") {
    return (
      <label className={cn("relative inline-flex h-12 shrink-0 items-center", className)}>
        <span className="sr-only">{t("languageSwitch")}</span>
        <select
          aria-label={t("languageSwitch")}
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
          className="h-12 appearance-none rounded-full bg-white/[0.82] px-5 pr-11 text-sm font-black text-ink shadow-soft ring-1 ring-black/[0.04] outline-none transition focus:ring-2 focus:ring-coral/50"
        >
          {languages.map((item) => (
            <option key={item} value={item}>
              {compact ? labels[item].compact : labels[item].full}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 text-muted" size={17} />
      </label>
    );
  }

  return (
    <div
      aria-label={t("languageSwitch")}
      className={cn("inline-flex rounded-full bg-white/80 p-1 shadow-soft ring-1 ring-black/[0.04]", className)}
    >
      {languages.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          className={cn(
            "h-10 rounded-full px-4 text-sm font-black transition",
            language === item ? "bg-limepop text-ink" : "text-muted hover:bg-cloud"
          )}
        >
          {compact ? labels[item].compact : labels[item].full}
        </button>
      ))}
    </div>
  );
}
