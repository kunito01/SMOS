export type MoneyCurrency = "USD" | "JPY" | "CNY" | "EUR";

const cnyRates: Record<MoneyCurrency, number> = {
  CNY: 1,
  USD: 7.2,
  EUR: 7.8,
  JPY: 0.05
};

export const toCny = (amount: number, currency: MoneyCurrency) => amount * cnyRates[currency];

export const formatCurrency = (value: number, currency: MoneyCurrency = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
