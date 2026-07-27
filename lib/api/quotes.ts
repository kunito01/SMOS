import { mockApi } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import type {
  QuoteDeliverableRow,
  QuoteLine,
  QuotePaymentScheduleRow,
  QuoteRevisionPolicy,
  QuoteScopeColumn,
  QuoteStatus,
  QuoteTimelineRow
} from "@/lib/types";
import { createPricingId, normalizeQuote } from "@/lib/utils/pricing-templates";
import type { MoneyCurrency } from "@/lib/utils/money";

export type QuoteDraftInput = {
  companyId: string;
  projectId?: string;
  title: string;
  clientContact?: string;
  currency: MoneyCurrency;
  issuedOn: string;
  validUntil?: string;
  lines: QuoteLine[];
  discountPercent: number;
  taxPercent: number;
  overview?: string;
  scope?: QuoteScopeColumn[];
  deliverables?: QuoteDeliverableRow[];
  timeline?: QuoteTimelineRow[];
  paymentSchedule?: QuotePaymentScheduleRow[];
  revisionPolicy?: QuoteRevisionPolicy;
  signature?: string;
  notes?: string;
};

export type QuoteUpdateInput = Partial<Omit<QuoteDraftInput, "companyId">> & {
  status?: QuoteStatus;
};

/** QT-2607-003 style codes: month-scoped, gap-tolerant, stable after deletes. */
const nextQuoteCode = (issuedOn: string) => {
  const compactMonth = issuedOn.slice(2, 7).replace("-", "");
  const prefix = `QT-${compactMonth}-`;
  const highestSequence = mockDatabase.quotes.reduce((highest, quote) => {
    if (!quote.code.startsWith(prefix)) {
      return highest;
    }

    const sequence = Number.parseInt(quote.code.slice(prefix.length), 10);

    return Number.isFinite(sequence) && sequence > highest ? sequence : highest;
  }, 0);

  return `${prefix}${String(highestSequence + 1).padStart(3, "0")}`;
};

export async function listCompanyQuotes(companyId: string) {
  await hydrateMockDatabase();
  return mockApi(
    mockDatabase.quotes
      .filter((quote) => quote.companyId === companyId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  );
}

export async function getQuote(quoteId: string) {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.quotes.find((quote) => quote.id === quoteId));
}

export async function createQuote(input: QuoteDraftInput) {
  await hydrateMockDatabase();
  const now = new Date().toISOString();
  const quote = normalizeQuote({
    ...input,
    id: createPricingId("quote"),
    code: nextQuoteCode(input.issuedOn),
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now
  } satisfies Record<string, unknown>);

  mockDatabase.quotes.unshift(quote);
  await persistMockDatabase();

  return mockApi(quote);
}

export async function updateQuote(quoteId: string, input: QuoteUpdateInput) {
  await hydrateMockDatabase();
  const quote = mockDatabase.quotes.find((item) => item.id === quoteId);

  if (!quote) {
    return mockApi(undefined);
  }

  const next = normalizeQuote({
    ...quote,
    ...input,
    // Optional fields cleared by the editor must not resurrect stale values.
    projectId: "projectId" in input ? input.projectId : quote.projectId,
    validUntil: "validUntil" in input ? input.validUntil : quote.validUntil,
    id: quote.id,
    companyId: quote.companyId,
    code: quote.code,
    createdAt: quote.createdAt,
    updatedAt: new Date().toISOString()
  } satisfies Record<string, unknown>);

  Object.assign(quote, next);
  quote.projectId = next.projectId;
  quote.validUntil = next.validUntil;
  await persistMockDatabase();

  return mockApi(quote);
}

/** Clones a quote as a new draft with a bumped version and a fresh code. */
export async function reviseQuote(quoteId: string) {
  await hydrateMockDatabase();
  const source = mockDatabase.quotes.find((item) => item.id === quoteId);

  if (!source) {
    return mockApi(undefined);
  }

  const now = new Date().toISOString();
  const revision = normalizeQuote({
    ...structuredClone(source),
    id: createPricingId("quote"),
    code: nextQuoteCode(now.slice(0, 10)),
    status: "draft",
    version: source.version + 1,
    issuedOn: now.slice(0, 10),
    lines: structuredClone(source.lines).map((line) => ({ ...line, id: createPricingId("quote-line") })),
    createdAt: now,
    updatedAt: now
  } satisfies Record<string, unknown>);

  mockDatabase.quotes.unshift(revision);
  await persistMockDatabase();

  return mockApi(revision);
}

export async function deleteQuote(quoteId: string) {
  await hydrateMockDatabase();
  mockDatabase.quotes = mockDatabase.quotes.filter((quote) => quote.id !== quoteId);
  await persistMockDatabase();

  return mockApi({ id: quoteId });
}
