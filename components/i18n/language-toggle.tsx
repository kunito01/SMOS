"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const labels: Record<Language, { compact: string; full: string }> = {
    en: { compact: "EN", full: "English" },
    zh: { compact: "中", full: "中文" },
    ja: { compact: "日", full: "日本語" },
    es: { compact: "ES", full: "Español" },
    pt: { compact: "PT", full: "Português" },
    de: { compact: "DE", full: "Deutsch" },
    fr: { compact: "FR", full: "Français" },
    ko: { compact: "KO", full: "한국어" },
    th: { compact: "TH", full: "ไทย" }
  };

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdownOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [dropdownOpen]);

  if (variant === "dropdown") {
    const openAndFocusOption = (index: number) => {
      setDropdownOpen(true);
      window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
    };

    const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openAndFocusOption(event.key === "ArrowDown" ? 0 : languages.length - 1);
      }
    };

    const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (index + direction + languages.length) % languages.length;
        optionRefs.current[nextIndex]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        optionRefs.current[event.key === "Home" ? 0 : languages.length - 1]?.focus();
      } else if (event.key === "Tab") {
        setDropdownOpen(false);
      }
    };

    return (
      <div
        ref={dropdownRef}
        className={cn(
          "relative z-30 inline-flex size-12 shrink-0 max-[482px]:size-10 max-[400px]:size-9 max-[370px]:size-[30px]",
          className
        )}
      >
        <button
          ref={triggerRef}
          type="button"
          title={labels[language].full}
          aria-label={t("languageSwitch")}
          aria-haspopup="menu"
          aria-expanded={dropdownOpen}
          onClick={() => setDropdownOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            "grid size-12 place-items-center rounded-full text-ink shadow-soft ring-1 ring-black/[0.04] outline-none transition hover:bg-aqua focus-visible:ring-2 focus-visible:ring-coral/50 max-[482px]:size-10 max-[400px]:size-9 max-[370px]:size-[30px]",
            dropdownOpen ? "bg-aqua" : "bg-white/[0.82]"
          )}
        >
          <span className="flex items-center gap-0.5 text-[11px] font-black leading-none max-[370px]:text-[9px]">
            {labels[language].compact}
            <ChevronDown
              className={cn("size-[10px] transition-transform max-[370px]:size-2", dropdownOpen && "rotate-180")}
              size={10}
              strokeWidth={2}
            />
          </span>
        </button>

        {dropdownOpen ? (
          <div
            role="menu"
            aria-label={t("languageSwitch")}
            className="studio-scroll absolute right-0 top-[calc(100%+0.5rem)] z-[130] grid max-h-[min(28rem,calc(100dvh-9rem))] w-20 gap-1 overflow-y-auto rounded-[1.4rem] bg-[#e9e5df]/95 p-1.5 shadow-[0_18px_45px_rgba(28,35,40,0.2)] ring-1 ring-white/70 backdrop-blur-xl"
          >
            {languages.map((item, index) => (
              <button
                key={item}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={language === item}
                aria-label={labels[item].full}
                onClick={() => {
                  setLanguage(item);
                  setDropdownOpen(false);
                  triggerRef.current?.focus();
                }}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                className={cn(
                  "grid h-10 w-full place-items-center rounded-full text-sm font-black leading-none text-ink outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-coral/50",
                  language === item && "bg-[#ffc700]"
                )}
              >
                {labels[item].compact}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      aria-label={t("languageSwitch")}
      className={cn("studio-scroll inline-flex max-w-full overflow-x-auto rounded-full bg-white/80 p-1 shadow-soft ring-1 ring-black/[0.04]", className)}
    >
      {languages.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          className={cn(
            "h-10 shrink-0 rounded-full px-4 text-sm font-black transition",
            language === item ? "bg-limepop text-ink" : "text-muted hover:bg-cloud"
          )}
        >
          {compact ? labels[item].compact : labels[item].full}
        </button>
      ))}
    </div>
  );
}
