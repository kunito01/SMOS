"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { shareApi } from "@/lib/api";
import {
  bundledExchangeRateSnapshot,
  formatCurrency,
  isExchangeRateSnapshot,
  isExchangeRateSnapshotRecent,
  isMoneyCurrency,
  supportedCurrencies,
  sumMoney,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

export type ExchangeRateBasis = "live" | "cached" | "fallback";

type CostDisplayCurrencyContextValue = {
  displayCurrency: MoneyCurrency;
  exchangeRateBasis: ExchangeRateBasis;
  exchangeRateSnapshot: ExchangeRateSnapshot;
  formatAmount: (value: number, currency?: MoneyCurrency) => string;
  isRateUpdating: boolean;
  isReady: boolean;
  setDisplayCurrency: (currency: MoneyCurrency) => void;
  sumInDisplayCurrency: (items: ReadonlyArray<{ amount: number; currency: MoneyCurrency }>) => number;
};

const displayCurrencyStorageKey = "studio-map-os.display-currency";
const exchangeRateSnapshotStorageKey = "studio-map-os.exchange-rate-snapshot";
const exchangeRateRequestTimeoutMs = 5_000;
const frankfurterUrl =
  "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD%2CJPY%2CEUR&providers=ECB";

type FrankfurterRate = {
  base: string;
  date: string;
  quote: string;
  rate: number;
};

let exchangeRateRequest: Promise<ExchangeRateSnapshot> | null = null;
const CostDisplayCurrencyContext = createContext<CostDisplayCurrencyContextValue | null>(null);

const fetchExchangeRates = async (): Promise<ExchangeRateSnapshot> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), exchangeRateRequestTimeoutMs);

  try {
    const response = await fetch(frankfurterUrl, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Frankfurter returned ${response.status}`);
    }

    const payload: unknown = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error("Exchange-rate response is invalid");
    }

    const rates: Partial<Record<MoneyCurrency, number>> = { CNY: 1 };
    const observationDates = new Set<string>();

    payload.forEach((value: unknown) => {
      const row = value as Partial<FrankfurterRate>;

      if (
        row.base === "CNY" &&
        typeof row.quote === "string" &&
        isMoneyCurrency(row.quote) &&
        typeof row.rate === "number" &&
        Number.isFinite(row.rate) &&
        row.rate > 0 &&
        typeof row.date === "string"
      ) {
        rates[row.quote] = row.rate;
        observationDates.add(row.date);
      }
    });

    if (
      observationDates.size !== 1 ||
      !supportedCurrencies.every((currency) => {
        const rate = rates[currency];
        return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
      })
    ) {
      throw new Error("Exchange-rate response is incomplete");
    }

    return {
      base: "CNY",
      rates: rates as Record<MoneyCurrency, number>,
      asOf: [...observationDates][0] ?? "",
      fetchedAt: new Date().toISOString(),
      source: "ECB via Frankfurter"
    };
  } finally {
    window.clearTimeout(timeout);
  }
};

const requestExchangeRates = () => {
  if (!exchangeRateRequest) {
    exchangeRateRequest = fetchExchangeRates()
      .finally(() => {
        exchangeRateRequest = null;
      });
  }

  return exchangeRateRequest;
};

const readStoredCurrency = (): MoneyCurrency => {
  try {
    const storedCurrency = window.localStorage.getItem(displayCurrencyStorageKey);
    return isMoneyCurrency(storedCurrency) ? storedCurrency : "CNY";
  } catch {
    return "CNY";
  }
};

const readStoredSnapshot = (): ExchangeRateSnapshot | null => {
  try {
    const rawSnapshot = window.localStorage.getItem(exchangeRateSnapshotStorageKey);

    if (!rawSnapshot) {
      return null;
    }

    const parsedSnapshot: unknown = JSON.parse(rawSnapshot);
    return isExchangeRateSnapshot(parsedSnapshot) && isExchangeRateSnapshotRecent(parsedSnapshot)
      ? parsedSnapshot
      : null;
  } catch {
    return null;
  }
};

const storeCurrency = (currency: MoneyCurrency) => {
  try {
    window.localStorage.setItem(displayCurrencyStorageKey, currency);
  } catch {
    // The in-memory preference remains usable when browser storage is unavailable.
  }
};

const storeSnapshot = (snapshot: ExchangeRateSnapshot) => {
  try {
    window.localStorage.setItem(exchangeRateSnapshotStorageKey, JSON.stringify(snapshot));
  } catch {
    // The live snapshot remains usable for the current page session.
  }
};

export function CostDisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [displayCurrency, setDisplayCurrencyState] = useState<MoneyCurrency>("CNY");
  const [exchangeRateSnapshot, setExchangeRateSnapshot] = useState<ExchangeRateSnapshot>(
    bundledExchangeRateSnapshot
  );
  const [exchangeRateBasis, setExchangeRateBasis] = useState<ExchangeRateBasis>("fallback");
  const [isReady, setIsReady] = useState(false);
  const [isRateUpdating, setIsRateUpdating] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const storedCurrency = readStoredCurrency();
    const storedSnapshot = readStoredSnapshot();

    setDisplayCurrencyState(storedCurrency);

    if (storedSnapshot) {
      setExchangeRateSnapshot(storedSnapshot);
      setExchangeRateBasis(storedSnapshot.asOf === "bundled" ? "fallback" : "cached");
    } else {
      setExchangeRateSnapshot(bundledExchangeRateSnapshot);
      setExchangeRateBasis("fallback");
    }

    setIsReady(true);

    if (!window.navigator.onLine) {
      setIsRateUpdating(false);
      return () => {
        isMounted = false;
      };
    }

    setIsRateUpdating(true);

    requestExchangeRates()
      .then((nextSnapshot) => {
        if (!isMounted) {
          return;
        }

        setExchangeRateSnapshot(nextSnapshot);
        setExchangeRateBasis(nextSnapshot.stale ? "cached" : "live");
        storeSnapshot(nextSnapshot);
      })
      .catch(() => {
        // Keep the last-known snapshot, or the explicit bundled fallback when none exists.
      })
      .finally(() => {
        if (isMounted) {
          setIsRateUpdating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const setDisplayCurrency = useCallback((currency: MoneyCurrency) => {
    setDisplayCurrencyState(currency);
    storeCurrency(currency);
    void shareApi.updateShareDisplayCurrency(currency).catch(() => {
      // Keep the local preference usable if public-link persistence is unavailable.
    });
  }, []);

  const formatAmount = useCallback(
    (value: number, currency: MoneyCurrency = displayCurrency) => formatCurrency(value, currency),
    [displayCurrency]
  );

  const sumInDisplayCurrency = useCallback(
    (items: ReadonlyArray<{ amount: number; currency: MoneyCurrency }>) =>
      sumMoney(items, displayCurrency, exchangeRateSnapshot),
    [displayCurrency, exchangeRateSnapshot]
  );

  const value = useMemo<CostDisplayCurrencyContextValue>(
    () => ({
      displayCurrency,
      exchangeRateBasis,
      exchangeRateSnapshot,
      formatAmount,
      isRateUpdating,
      isReady,
      setDisplayCurrency,
      sumInDisplayCurrency
    }),
    [
      displayCurrency,
      exchangeRateBasis,
      exchangeRateSnapshot,
      formatAmount,
      isRateUpdating,
      isReady,
      setDisplayCurrency,
      sumInDisplayCurrency
    ]
  );

  return createElement(CostDisplayCurrencyContext.Provider, { value }, children);
}

export function useCostDisplayCurrency() {
  const context = useContext(CostDisplayCurrencyContext);

  if (!context) {
    throw new Error("useCostDisplayCurrency must be used inside CostDisplayCurrencyProvider");
  }

  return context;
}
