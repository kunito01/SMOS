import { NextResponse } from "next/server";
import {
  isMoneyCurrency,
  supportedCurrencies,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

export const runtime = "nodejs";

const cacheSeconds = 6 * 60 * 60;
const requestTimeoutMs = 5_000;
const frankfurterUrl =
  "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD%2CJPY%2CEUR&providers=ECB";
const ecbUrl =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.USD+JPY+CNY.EUR.SP00.A?lastNObservations=1&format=csvdata";

type FrankfurterRate = {
  base: string;
  date: string;
  quote: string;
  rate: number;
};

let lastKnownSnapshot: ExchangeRateSnapshot | null = null;

const validateRates = (rates: Partial<Record<MoneyCurrency, number>>) => {
  if (
    !supportedCurrencies.every((currency) => {
      const rate = rates[currency];
      return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
    })
  ) {
    throw new Error("Exchange-rate response is incomplete");
  }

  return rates as Record<MoneyCurrency, number>;
};

const fetchFrankfurterRates = async (): Promise<ExchangeRateSnapshot> => {
  const response = await fetch(frankfurterUrl, {
    next: { revalidate: cacheSeconds },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Frankfurter returned ${response.status}`);
  }

  const rows = (await response.json()) as FrankfurterRate[];
  const rates: Partial<Record<MoneyCurrency, number>> = { CNY: 1 };
  const observationDates = new Set<string>();

  rows.forEach((row) => {
    if (row.base === "CNY" && isMoneyCurrency(row.quote) && Number.isFinite(row.rate) && row.rate > 0) {
      rates[row.quote] = row.rate;
      observationDates.add(row.date);
    }
  });

  if (observationDates.size !== 1) {
    throw new Error("Frankfurter response mixes exchange-rate dates");
  }

  return {
    base: "CNY",
    rates: validateRates(rates),
    asOf: [...observationDates][0] ?? "",
    fetchedAt: new Date().toISOString(),
    source: "ECB via Frankfurter"
  };
};

const fetchEcbRates = async (): Promise<ExchangeRateSnapshot> => {
  const response = await fetch(ecbUrl, {
    next: { revalidate: cacheSeconds },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`ECB returned ${response.status}`);
  }

  const csv = await response.text();
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0]?.split(",") ?? [];
  const currencyIndex = headers.indexOf("CURRENCY");
  const dateIndex = headers.indexOf("TIME_PERIOD");
  const rateIndex = headers.indexOf("OBS_VALUE");

  if (currencyIndex < 0 || dateIndex < 0 || rateIndex < 0) {
    throw new Error("ECB response columns are incomplete");
  }

  const euroRates: Partial<Record<MoneyCurrency, number>> = { EUR: 1 };
  const observationDates = new Set<string>();

  lines
    .slice(1)
    .forEach((line) => {
      const cells = line.split(",");
      const currency = cells[currencyIndex];
      const date = cells[dateIndex];
      const rate = Number(cells[rateIndex]);

      if (isMoneyCurrency(currency) && Number.isFinite(rate) && rate > 0) {
        euroRates[currency] = rate;
        observationDates.add(date);
      }
    });

  const cnyPerEuro = euroRates.CNY;

  if (!cnyPerEuro) {
    throw new Error("ECB response is missing CNY");
  }

  if (observationDates.size !== 1) {
    throw new Error("ECB response mixes exchange-rate dates");
  }

  const rates = validateRates({
    CNY: 1,
    USD: (euroRates.USD ?? 0) / cnyPerEuro,
    JPY: (euroRates.JPY ?? 0) / cnyPerEuro,
    EUR: 1 / cnyPerEuro
  });

  return {
    base: "CNY",
    rates,
    asOf: [...observationDates][0] ?? "",
    fetchedAt: new Date().toISOString(),
    source: "European Central Bank"
  };
};

export async function GET() {
  try {
    const snapshot = await fetchFrankfurterRates().catch(() => fetchEcbRates());
    lastKnownSnapshot = snapshot;

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`
      }
    });
  } catch {
    if (lastKnownSnapshot) {
      return NextResponse.json({ ...lastKnownSnapshot, stale: true });
    }

    return NextResponse.json({ message: "Exchange rates are temporarily unavailable" }, { status: 503 });
  }
}
