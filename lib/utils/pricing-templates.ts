import type {
  PricingAreaConfig,
  PricingAreaMode,
  PricingAreaTier,
  PricingCostConfig,
  PricingStyleConfig,
  PricingStyleLevel,
  PricingTemplate,
  PricingTemplateKind,
  Quote,
  QuoteDeliverableRow,
  QuoteLine,
  QuoteLinePricing,
  QuotePaymentScheduleRow,
  QuoteRevisionPolicy,
  QuoteScopeColumn,
  QuoteStatus,
  QuoteTimelineRow
} from "@/lib/types";
import {
  bundledExchangeRateSnapshot,
  convertCurrency,
  isMoneyCurrency,
  roundMoneyAmount,
  type ExchangeRateSnapshot,
  type MoneyCurrency
} from "@/lib/utils/money";

export const pricingTemplateKinds: PricingTemplateKind[] = [
  "area-tier",
  "style-minute",
  "cost-markup"
];

export const pricingAreaModes: PricingAreaMode[] = ["unit-price", "progressive", "flat"];

export const quoteStatuses: QuoteStatus[] = ["draft", "sent", "accepted", "declined", "expired"];

export const maxPricingTemplateCount = 300;
export const maxPricingTierCount = 20;
export const maxQuoteCount = 2_000;
export const maxQuoteLineCount = 120;

const maxNameLength = 200;
const maxNotesLength = 4_000;
const maxAreaSquareMeters = 10_000_000;
const maxMinutes = 100_000;
const maxAmount = 1_000_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const invalidPricing = (message: string): never => {
  throw new Error(`Invalid pricing data: ${message}`);
};

const parseId = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > 160) {
    return invalidPricing(`${fieldName} is invalid`);
  }

  return value;
};

const parseText = (value: unknown, fieldName: string, maxLength = maxNameLength) => {
  if (typeof value !== "string" || value.length > maxLength) {
    return invalidPricing(`${fieldName} is invalid`);
  }

  return value;
};

const parseOptionalText = (value: unknown, fieldName: string, maxLength = maxNotesLength) =>
  value === undefined || value === "" ? undefined : parseText(value, fieldName, maxLength);

const parseAmount = (value: unknown, fieldName: string, max = maxAmount) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    return invalidPricing(`${fieldName} must be a finite amount between 0 and ${max}`);
  }

  return value;
};

const parseCurrency = (value: unknown, fieldName: string) => {
  if (!isMoneyCurrency(value)) {
    return invalidPricing(`${fieldName} is not a supported currency`);
  }

  return value;
};

const parseIsoDate = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return invalidPricing(`${fieldName} must use YYYY-MM-DD`);
  }

  return value;
};

const parseTimestamp = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return invalidPricing(`${fieldName} must be an ISO timestamp`);
  }

  return value;
};

export const createPricingId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export const createDefaultAreaConfig = (): PricingAreaConfig => ({
  mode: "unit-price",
  tiers: [
    { id: createPricingId("tier"), minArea: 0, maxArea: 100, price: 260 },
    { id: createPricingId("tier"), minArea: 100, maxArea: 300, price: 210 },
    { id: createPricingId("tier"), minArea: 300, price: 170 }
  ]
});

export const createDefaultStyleConfig = (): PricingStyleConfig => ({
  levels: [
    { id: createPricingId("level"), name: "Standard", minuteRate: 4_000 },
    { id: createPricingId("level"), name: "Detailed", minuteRate: 7_200 },
    { id: createPricingId("level"), name: "Signature", minuteRate: 12_000 }
  ]
});

export const createDefaultCostConfig = (): PricingCostConfig => ({
  overheadPercent: 12,
  markupPercent: 35
});

/** Sorted, gap-free reading order; the editor may hand over rows in any order. */
const sortTiers = (tiers: PricingAreaTier[]) =>
  [...tiers].sort((left, right) => left.minArea - right.minArea);

const normalizeAreaTier = (value: unknown, index: number): PricingAreaTier => {
  if (!isRecord(value)) {
    return invalidPricing(`area tier ${index + 1} is invalid`);
  }

  const minArea = parseAmount(value.minArea, `area tier ${index + 1} lower bound`, maxAreaSquareMeters);
  const maxArea =
    value.maxArea === undefined || value.maxArea === null
      ? undefined
      : parseAmount(value.maxArea, `area tier ${index + 1} upper bound`, maxAreaSquareMeters);

  if (maxArea !== undefined && maxArea <= minArea) {
    return invalidPricing(`area tier ${index + 1} upper bound must exceed its lower bound`);
  }

  return {
    id: parseId(value.id, `area tier ${index + 1} id`),
    minArea,
    maxArea,
    price: parseAmount(value.price, `area tier ${index + 1} price`)
  };
};

const normalizeAreaConfig = (value: unknown): PricingAreaConfig => {
  if (!isRecord(value)) {
    return invalidPricing("area configuration is missing");
  }

  if (!pricingAreaModes.includes(value.mode as PricingAreaMode)) {
    return invalidPricing("area mode is invalid");
  }

  if (!Array.isArray(value.tiers) || value.tiers.length === 0 || value.tiers.length > maxPricingTierCount) {
    return invalidPricing("area tiers are invalid");
  }

  return {
    mode: value.mode as PricingAreaMode,
    tiers: sortTiers(value.tiers.map(normalizeAreaTier))
  };
};

const normalizeStyleLevel = (value: unknown, index: number): PricingStyleLevel => {
  if (!isRecord(value)) {
    return invalidPricing(`style level ${index + 1} is invalid`);
  }

  return {
    id: parseId(value.id, `style level ${index + 1} id`),
    name: parseText(value.name, `style level ${index + 1} name`),
    minuteRate: parseAmount(value.minuteRate, `style level ${index + 1} rate`)
  };
};

const normalizeStyleConfig = (value: unknown): PricingStyleConfig => {
  if (!isRecord(value) || !Array.isArray(value.levels) || value.levels.length === 0 || value.levels.length > maxPricingTierCount) {
    return invalidPricing("style levels are invalid");
  }

  return { levels: value.levels.map(normalizeStyleLevel) };
};

const normalizeCostConfig = (value: unknown): PricingCostConfig => {
  if (!isRecord(value)) {
    return invalidPricing("cost configuration is missing");
  }

  return {
    overheadPercent: parseAmount(value.overheadPercent, "overhead percent", 1_000),
    markupPercent: parseAmount(value.markupPercent, "markup percent", 1_000)
  };
};

export const normalizePricingTemplate = (value: unknown): PricingTemplate => {
  if (!isRecord(value)) {
    return invalidPricing("template is not an object");
  }

  if (!pricingTemplateKinds.includes(value.kind as PricingTemplateKind)) {
    return invalidPricing("template kind is invalid");
  }

  const kind = value.kind as PricingTemplateKind;

  return {
    id: parseId(value.id, "template id"),
    name: parseText(value.name, "template name"),
    kind,
    currency: parseCurrency(value.currency, "template currency"),
    notes: parseOptionalText(value.notes, "template notes"),
    minimumFee: value.minimumFee === undefined ? undefined : parseAmount(value.minimumFee, "minimum fee"),
    createdAt: parseTimestamp(value.createdAt, "template creation time"),
    ...(kind === "area-tier" ? { area: normalizeAreaConfig(value.area) } : {}),
    ...(kind === "style-minute" ? { style: normalizeStyleConfig(value.style) } : {}),
    ...(kind === "cost-markup" ? { cost: normalizeCostConfig(value.cost) } : {})
  };
};

export const normalizePricingTemplateLibrary = (value: unknown): PricingTemplate[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxPricingTemplateCount) {
    return invalidPricing("pricing template collection is invalid");
  }

  const templates = value.map(normalizePricingTemplate);

  if (new Set(templates.map((template) => template.id)).size !== templates.length) {
    return invalidPricing("pricing templates contain duplicate ids");
  }

  return templates;
};

export const isPricingTemplateLibrary = (value: unknown): value is PricingTemplate[] => {
  try {
    normalizePricingTemplateLibrary(value);
    return true;
  } catch {
    return false;
  }
};

const normalizeQuoteLinePricing = (value: unknown): QuoteLinePricing | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value) || !isRecord(value.inputs)) {
    return invalidPricing("quote line pricing is invalid");
  }

  const snapshot = normalizePricingTemplate(value.snapshot);
  const inputs = value.inputs;

  return {
    templateId: value.templateId === undefined ? undefined : parseId(value.templateId, "quote line template id"),
    templateName: parseText(value.templateName, "quote line template name"),
    kind: snapshot.kind,
    snapshot,
    inputs: {
      area: inputs.area === undefined ? undefined : parseAmount(inputs.area, "quote line area", maxAreaSquareMeters),
      minutes: inputs.minutes === undefined ? undefined : parseAmount(inputs.minutes, "quote line minutes", maxMinutes),
      styleLevelId:
        inputs.styleLevelId === undefined ? undefined : parseId(inputs.styleLevelId, "quote line style level"),
      costBasis: inputs.costBasis === undefined ? undefined : parseAmount(inputs.costBasis, "quote line cost basis")
    },
    sourceAmount: parseAmount(value.sourceAmount, "quote line source amount"),
    sourceCurrency: parseCurrency(value.sourceCurrency, "quote line source currency")
  };
};

const normalizeQuoteLine = (value: unknown, index: number): QuoteLine => {
  if (!isRecord(value)) {
    return invalidPricing(`quote line ${index + 1} is invalid`);
  }

  return {
    id: parseId(value.id, `quote line ${index + 1} id`),
    name: parseText(value.name, `quote line ${index + 1} name`),
    description: parseOptionalText(value.description, `quote line ${index + 1} description`),
    quantity: parseAmount(value.quantity, `quote line ${index + 1} quantity`, 100_000),
    unitPrice: parseAmount(value.unitPrice, `quote line ${index + 1} unit price`),
    pricing: normalizeQuoteLinePricing(value.pricing)
  };
};

const maxProposalRows = 60;
const maxScopeColumns = 8;
const maxScopeItems = 40;

const normalizeScopeColumns = (value: unknown): QuoteScopeColumn[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > maxScopeColumns) {
    return invalidPricing("quote scope groups are invalid");
  }

  return value.map((column, index) => {
    if (!isRecord(column) || !Array.isArray(column.items) || column.items.length > maxScopeItems) {
      return invalidPricing(`quote scope group ${index + 1} is invalid`);
    }

    return {
      id: parseId(column.id, `quote scope group ${index + 1} id`),
      title: parseText(column.title, `quote scope group ${index + 1} title`),
      items: column.items.map((item, itemIndex) =>
        parseText(item, `quote scope group ${index + 1} item ${itemIndex + 1}`)
      )
    };
  });
};

const normalizeDeliverableRows = (value: unknown): QuoteDeliverableRow[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > maxProposalRows) {
    return invalidPricing("quote deliverable rows are invalid");
  }

  return value.map((row, index) => {
    if (!isRecord(row)) {
      return invalidPricing(`quote deliverable row ${index + 1} is invalid`);
    }

    return {
      id: parseId(row.id, `quote deliverable row ${index + 1} id`),
      name: parseText(row.name, `quote deliverable row ${index + 1} name`),
      quantity: parseText(row.quantity, `quote deliverable row ${index + 1} quantity`),
      format: parseText(row.format, `quote deliverable row ${index + 1} format`)
    };
  });
};

const normalizeTimelineRows = (value: unknown): QuoteTimelineRow[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > maxProposalRows) {
    return invalidPricing("quote timeline rows are invalid");
  }

  return value.map((row, index) => {
    if (!isRecord(row)) {
      return invalidPricing(`quote timeline row ${index + 1} is invalid`);
    }

    return {
      id: parseId(row.id, `quote timeline row ${index + 1} id`),
      stage: parseText(row.stage, `quote timeline row ${index + 1} stage`),
      weeks: parseAmount(row.weeks, `quote timeline row ${index + 1} weeks`, 1_000)
    };
  });
};

const normalizePaymentScheduleRows = (value: unknown): QuotePaymentScheduleRow[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > maxProposalRows) {
    return invalidPricing("quote payment schedule rows are invalid");
  }

  return value.map((row, index) => {
    if (!isRecord(row)) {
      return invalidPricing(`quote payment schedule row ${index + 1} is invalid`);
    }

    return {
      id: parseId(row.id, `quote payment schedule row ${index + 1} id`),
      stage: parseText(row.stage, `quote payment schedule row ${index + 1} stage`),
      percent: parseAmount(row.percent, `quote payment schedule row ${index + 1} percent`, 100)
    };
  });
};

const normalizeRevisionPolicy = (value: unknown): QuoteRevisionPolicy | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return invalidPricing("quote revision policy is invalid");
  }

  return {
    includedRevisions: Math.round(parseAmount(value.includedRevisions, "included revisions", 1_000)),
    includedTrips: Math.round(parseAmount(value.includedTrips, "included trips", 1_000)),
    extraRevisionFee: parseText(value.extraRevisionFee, "extra revision fee"),
    extraTripFee: parseText(value.extraTripFee, "extra trip fee")
  };
};

export const normalizeQuote = (value: unknown): Quote => {
  if (!isRecord(value)) {
    return invalidPricing("quote is not an object");
  }

  if (!quoteStatuses.includes(value.status as QuoteStatus)) {
    return invalidPricing("quote status is invalid");
  }

  if (!Array.isArray(value.lines) || value.lines.length > maxQuoteLineCount) {
    return invalidPricing("quote lines are invalid");
  }

  const version = parseAmount(value.version, "quote version", 10_000);

  return {
    id: parseId(value.id, "quote id"),
    companyId: parseId(value.companyId, "quote brand id"),
    projectId:
      value.projectId === undefined || value.projectId === ""
        ? undefined
        : parseId(value.projectId, "quote project id"),
    code: parseText(value.code, "quote code"),
    title: parseText(value.title, "quote title"),
    clientContact: parseOptionalText(value.clientContact, "quote client contact", maxNameLength),
    status: value.status as QuoteStatus,
    currency: parseCurrency(value.currency, "quote currency"),
    issuedOn: parseIsoDate(value.issuedOn, "quote issue date"),
    validUntil: value.validUntil === undefined || value.validUntil === ""
      ? undefined
      : parseIsoDate(value.validUntil, "quote expiry date"),
    version: Math.max(1, Math.round(version)),
    lines: value.lines.map(normalizeQuoteLine),
    discountPercent: parseAmount(value.discountPercent, "quote discount percent", 100),
    taxPercent: parseAmount(value.taxPercent, "quote tax percent", 100),
    overview: parseOptionalText(value.overview, "quote overview"),
    scope: normalizeScopeColumns(value.scope),
    deliverables: normalizeDeliverableRows(value.deliverables),
    timeline: normalizeTimelineRows(value.timeline),
    paymentSchedule: normalizePaymentScheduleRows(value.paymentSchedule),
    revisionPolicy: normalizeRevisionPolicy(value.revisionPolicy),
    signature: parseOptionalText(value.signature, "quote signature"),
    notes: parseOptionalText(value.notes, "quote notes"),
    terms: parseOptionalText(value.terms, "quote terms"),
    createdAt: parseTimestamp(value.createdAt, "quote creation time"),
    updatedAt: parseTimestamp(value.updatedAt, "quote update time")
  };
};

export const normalizeQuoteLibrary = (value: unknown): Quote[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxQuoteCount) {
    return invalidPricing("quote collection is invalid");
  }

  const quotes = value.map(normalizeQuote);

  if (new Set(quotes.map((quote) => quote.id)).size !== quotes.length) {
    return invalidPricing("quotes contain duplicate ids");
  }

  return quotes;
};

export const isQuoteLibrary = (value: unknown): value is Quote[] => {
  try {
    normalizeQuoteLibrary(value);
    return true;
  } catch {
    return false;
  }
};

export type PricingTemplateInputs = {
  area?: number;
  minutes?: number;
  styleLevelId?: string;
  costBasis?: number;
};

export type PricingTemplateEvaluation = {
  /** Amount in the template currency, before the quote line quantity. */
  amount: number;
  /** True when the minimum fee, not the formula, decided the amount. */
  minimumApplied: boolean;
  /** Set when the inputs cannot produce a price yet. */
  error?: "no-matching-tier" | "no-style-level" | "missing-input";
};

const findAreaTier = (tiers: PricingAreaTier[], area: number) =>
  sortTiers(tiers).find(
    (tier) => area >= tier.minArea && (tier.maxArea === undefined || area <= tier.maxArea)
  );

const evaluateAreaTemplate = (config: PricingAreaConfig, area: number): PricingTemplateEvaluation => {
  if (config.mode === "progressive") {
    const amount = sortTiers(config.tiers).reduce((total, tier) => {
      const upperBound = tier.maxArea ?? Number.POSITIVE_INFINITY;
      const span = Math.max(0, Math.min(area, upperBound) - tier.minArea);

      return total + span * tier.price;
    }, 0);

    return { amount, minimumApplied: false };
  }

  const tier = findAreaTier(config.tiers, area);

  if (!tier) {
    return { amount: 0, minimumApplied: false, error: "no-matching-tier" };
  }

  return {
    amount: config.mode === "flat" ? tier.price : tier.price * area,
    minimumApplied: false
  };
};

/**
 * Runs one template against a set of client-facing inputs. The result is always
 * expressed in the template currency so callers decide when to convert.
 */
export const evaluatePricingTemplate = (
  template: PricingTemplate,
  inputs: PricingTemplateInputs
): PricingTemplateEvaluation => {
  const applyMinimum = (evaluation: PricingTemplateEvaluation): PricingTemplateEvaluation => {
    if (evaluation.error) {
      return evaluation;
    }

    const minimumFee = template.minimumFee ?? 0;

    return minimumFee > evaluation.amount
      ? { amount: minimumFee, minimumApplied: true }
      : { ...evaluation, amount: evaluation.amount };
  };

  if (template.kind === "area-tier") {
    const config = template.area;

    if (!config) {
      return { amount: 0, minimumApplied: false, error: "missing-input" };
    }

    const area = inputs.area ?? 0;

    return applyMinimum(evaluateAreaTemplate(config, area));
  }

  if (template.kind === "style-minute") {
    const level = template.style?.levels.find((item) => item.id === inputs.styleLevelId);

    if (!level) {
      return { amount: 0, minimumApplied: false, error: "no-style-level" };
    }

    return applyMinimum({ amount: level.minuteRate * (inputs.minutes ?? 0), minimumApplied: false });
  }

  const config = template.cost;

  if (!config) {
    return { amount: 0, minimumApplied: false, error: "missing-input" };
  }

  const basis = inputs.costBasis ?? 0;
  const withOverhead = basis * (1 + config.overheadPercent / 100);

  return applyMinimum({
    amount: withOverhead * (1 + config.markupPercent / 100),
    minimumApplied: false
  });
};

export type QuoteTotals = {
  currency: MoneyCurrency;
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
};

export const calculateQuoteTotals = (quote: Quote): QuoteTotals => {
  const subtotal = roundMoneyAmount(
    quote.lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0)
  );
  const discount = roundMoneyAmount((subtotal * quote.discountPercent) / 100);
  const taxable = subtotal - discount;
  const tax = roundMoneyAmount((taxable * quote.taxPercent) / 100);

  return {
    currency: quote.currency,
    subtotal,
    discount,
    taxable,
    tax,
    total: taxable + tax
  };
};

export type QuoteMargin = {
  currency: MoneyCurrency;
  revenue: number;
  cost: number;
  profit: number;
  /** Null when there is nothing to divide by, so the UI can show a dash. */
  marginPercent: number | null;
};

export const calculateQuoteMargin = (
  quote: Quote,
  budgetCost: number,
  budgetCurrency: MoneyCurrency,
  snapshot: ExchangeRateSnapshot = bundledExchangeRateSnapshot
): QuoteMargin => {
  const revenue = calculateQuoteTotals(quote).total;
  const cost = roundMoneyAmount(convertCurrency(budgetCost, budgetCurrency, quote.currency, snapshot));
  const profit = revenue - cost;

  return {
    currency: quote.currency,
    revenue,
    cost,
    profit,
    marginPercent: revenue > 0 ? Math.round((profit / revenue) * 100) : null
  };
};

/**
 * Freezes a template into a quote line. Later edits to the library template
 * never rewrite an existing line, which is what keeps a sent quote honest.
 */
export const createQuoteLineFromTemplate = ({
  template,
  inputs,
  quantity,
  quoteCurrency,
  name,
  description,
  snapshot = bundledExchangeRateSnapshot
}: {
  template: PricingTemplate;
  inputs: PricingTemplateInputs;
  quantity: number;
  quoteCurrency: MoneyCurrency;
  name?: string;
  description?: string;
  snapshot?: ExchangeRateSnapshot;
}): QuoteLine => {
  const evaluation = evaluatePricingTemplate(template, inputs);
  const unitPrice = roundMoneyAmount(
    convertCurrency(evaluation.amount, template.currency, quoteCurrency, snapshot)
  );

  return {
    id: createPricingId("quote-line"),
    name: name?.trim() || template.name,
    description: description?.trim() || undefined,
    quantity,
    unitPrice,
    pricing: {
      templateId: template.id,
      templateName: template.name,
      kind: template.kind,
      snapshot: structuredClone(template),
      inputs,
      sourceAmount: roundMoneyAmount(evaluation.amount),
      sourceCurrency: template.currency
    }
  };
};

export const describePricingInputs = (
  pricing: QuoteLinePricing,
  labels: { area: string; minutes: string; costBasis: string }
) => {
  if (pricing.kind === "area-tier") {
    return `${labels.area}: ${pricing.inputs.area ?? 0}`;
  }

  if (pricing.kind === "style-minute") {
    const level = pricing.snapshot.style?.levels.find((item) => item.id === pricing.inputs.styleLevelId);

    return `${level?.name ?? "—"} · ${labels.minutes}: ${pricing.inputs.minutes ?? 0}`;
  }

  return `${labels.costBasis}: ${pricing.inputs.costBasis ?? 0}`;
};
