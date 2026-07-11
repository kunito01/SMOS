export const supportedCurrencies = ["CNY", "USD", "JPY", "EUR"] as const;

export type MoneyCurrency = (typeof supportedCurrencies)[number];

export type ExchangeRateSnapshot = {
  base: "CNY";
  rates: Record<MoneyCurrency, number>;
  asOf: string;
  fetchedAt: string;
  source: string;
  stale?: boolean;
};

export const bundledExchangeRateSnapshot: ExchangeRateSnapshot = {
  base: "CNY",
  rates: {
    CNY: 1,
    USD: 1 / 7.2,
    EUR: 1 / 7.8,
    JPY: 1 / 0.05
  },
  asOf: "bundled",
  fetchedAt: "",
  source: "Bundled fallback",
  stale: true
};

export const isMoneyCurrency = (value: unknown): value is MoneyCurrency =>
  typeof value === "string" && supportedCurrencies.includes(value as MoneyCurrency);

export const isExchangeRateSnapshot = (value: unknown): value is ExchangeRateSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ExchangeRateSnapshot>;
  const hasValidAsOf =
    candidate.asOf === "bundled" ||
    (typeof candidate.asOf === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(candidate.asOf) &&
      !Number.isNaN(Date.parse(`${candidate.asOf}T00:00:00Z`)));
  const hasValidFetchedAt =
    candidate.asOf === "bundled"
      ? candidate.fetchedAt === ""
      : typeof candidate.fetchedAt === "string" && !Number.isNaN(Date.parse(candidate.fetchedAt));

  return (
    candidate.base === "CNY" &&
    hasValidAsOf &&
    hasValidFetchedAt &&
    typeof candidate.source === "string" &&
    candidate.source.trim().length > 0 &&
    (candidate.stale === undefined || typeof candidate.stale === "boolean") &&
    Boolean(candidate.rates) &&
    candidate.rates?.CNY === 1 &&
    supportedCurrencies.every((currency) => {
      const rate = candidate.rates?.[currency];
      return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
    })
  );
};

export const isExchangeRateSnapshotRecent = (snapshot: ExchangeRateSnapshot, maxAgeDays = 7) => {
  if (snapshot.asOf === "bundled") {
    return false;
  }

  const asOf = Date.parse(`${snapshot.asOf}T23:59:59Z`);
  const ageMs = Date.now() - asOf;

  return Number.isFinite(ageMs) && ageMs >= -24 * 60 * 60 * 1000 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
};

export const convertCurrency = (
  amount: number,
  from: MoneyCurrency,
  to: MoneyCurrency,
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) => {
  if (!Number.isFinite(amount)) {
    throw new Error("Money amount must be finite");
  }

  if (from === to) {
    return amount;
  }

  const fromRate = snapshot.rates[from];
  const toRate = snapshot.rates[to];

  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    throw new Error(`Exchange rate is unavailable for ${from}/${to}`);
  }

  return (amount / fromRate) * toRate;
};

export const sumMoney = (
  items: ReadonlyArray<{ amount: number; currency: MoneyCurrency }>,
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) => items.reduce((sum, item) => sum + convertCurrency(item.amount, item.currency, currency, snapshot), 0);

export const toCny = (
  amount: number,
  currency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
) => convertCurrency(amount, currency, "CNY", snapshot);

export const formatCurrency = (
  value: number,
  currency: MoneyCurrency = "CNY",
  locale = "zh-CN"
) =>
  new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
