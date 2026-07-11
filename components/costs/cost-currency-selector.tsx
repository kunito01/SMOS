"use client";

import { useI18n } from "@/components/providers/app-providers";
import type { ExchangeRateBasis } from "@/components/costs/use-cost-display-currency";
import { Select } from "@/components/ui/select";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import {
  isMoneyCurrency,
  supportedCurrencies,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

type CostCurrencySelectorProps = {
  className?: string;
  currency: MoneyCurrency;
  exchangeRateBasis: ExchangeRateBasis;
  exchangeRateSnapshot: ExchangeRateSnapshot;
  isRateUpdating: boolean;
  onCurrencyChange: (currency: MoneyCurrency) => void;
};

export function CostCurrencySelector({
  className,
  currency,
  exchangeRateBasis,
  exchangeRateSnapshot,
  isRateUpdating,
  onCurrencyChange
}: CostCurrencySelectorProps) {
  const { language, t } = useI18n();
  const rateDetails: string[] = [];

  if (isRateUpdating) {
    rateDetails.push(t("exchangeRatesUpdating"));
  } else if (exchangeRateBasis === "cached") {
    rateDetails.push(t("exchangeRatesCached"));
  } else if (exchangeRateBasis === "fallback") {
    rateDetails.push(t("exchangeRatesFallback"));
  }

  if (exchangeRateBasis !== "fallback" && exchangeRateSnapshot.asOf && exchangeRateSnapshot.asOf !== "bundled") {
    rateDetails.push(`${t("exchangeRateAsOf")}: ${formatLocalizedDate(exchangeRateSnapshot.asOf, language)}`);
  }

  if (exchangeRateBasis !== "fallback" && exchangeRateSnapshot.source) {
    rateDetails.push(`${t("exchangeRateSource")}: ${exchangeRateSnapshot.source}`);
  }

  return (
    <div
      className={cn(
        "w-full rounded-studio bg-white/12 p-3 text-white shadow-soft ring-1 ring-white/18 backdrop-blur-xl min-[520px]:w-72",
        className
      )}
    >
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-wide text-white/70">
          {t("finalDisplayCurrency")}
        </span>
        <Select
          value={currency}
          onChange={(event) => {
            if (isMoneyCurrency(event.target.value)) {
              onCurrencyChange(event.target.value);
            }
          }}
          className="h-11 w-full appearance-none rounded-full border-0 bg-white px-4 pr-10 text-sm font-black text-ink outline-none ring-1 ring-white/30 transition focus:ring-2 focus:ring-aqua"
        >
          {supportedCurrencies.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </label>
      <p aria-live="polite" className="mt-2 text-[11px] font-bold leading-4 text-white/65">
        {rateDetails.join(" · ")}
      </p>
    </div>
  );
}
