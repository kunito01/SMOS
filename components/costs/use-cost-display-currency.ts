"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/providers/app-providers";
import { languageLocales } from "@/lib/i18n/translations";
import {
  bundledExchangeRateSnapshot,
  convertCurrency,
  formatCurrency,
  isExchangeRateSnapshot,
  isExchangeRateSnapshotRecent,
  isMoneyCurrency,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

export type ExchangeRateBasis = "live" | "cached" | "fallback";

const displayCurrencyStorageKey = "studio-map-os.display-currency";
const exchangeRateSnapshotStorageKey = "studio-map-os.exchange-rate-snapshot";

let exchangeRateRequest: Promise<ExchangeRateSnapshot> | null = null;

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

export function useCostDisplayCurrency() {
  const { language } = useI18n();
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
  }, []);

  const locale = languageLocales[language];

  const formatAmount = useCallback(
    (value: number, currency: MoneyCurrency = displayCurrency) => formatCurrency(value, currency, locale),
    [displayCurrency, locale]
  );

  const convertToDisplayCurrency = useCallback(
    (amount: number, sourceCurrency: MoneyCurrency) =>
      convertCurrency(amount, sourceCurrency, displayCurrency, exchangeRateSnapshot),
    [displayCurrency, exchangeRateSnapshot]
  );

  const formatInDisplayCurrency = useCallback(
    (amount: number, sourceCurrency: MoneyCurrency) =>
      formatCurrency(
        convertCurrency(amount, sourceCurrency, displayCurrency, exchangeRateSnapshot),
        displayCurrency,
        locale
      ),
    [displayCurrency, exchangeRateSnapshot, locale]
  );

  return {
    convertToDisplayCurrency,
    displayCurrency,
    exchangeRateBasis,
    exchangeRateSnapshot,
    formatAmount,
    formatInDisplayCurrency,
    isRateUpdating,
    isReady,
    setDisplayCurrency
  };
}
