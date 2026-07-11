"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { shareApi } from "@/lib/api";
import {
  bundledExchangeRateSnapshot,
  formatCurrency,
  isExchangeRateSnapshot,
  isExchangeRateSnapshotRecent,
  isMoneyCurrency,
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

let exchangeRateRequest: Promise<ExchangeRateSnapshot> | null = null;
const CostDisplayCurrencyContext = createContext<CostDisplayCurrencyContextValue | null>(null);

const requestExchangeRates = () => {
  if (!exchangeRateRequest) {
    exchangeRateRequest = fetch("/api/exchange-rates", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Exchange-rate request failed: ${response.status}`);
        }

        const payload: unknown = await response.json();

        if (!isExchangeRateSnapshot(payload)) {
          throw new Error("Exchange-rate response is invalid");
        }

        return payload;
      })
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
