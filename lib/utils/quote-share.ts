import { formatLocalizedDate } from "@/lib/i18n/formatters";
import { formatDemoEntityName } from "@/lib/i18n/domain-labels";
import type { Language, TranslationKey } from "@/lib/i18n/translations";
import type { Company, Quote, QuoteStatus } from "@/lib/types";
import { formatNumber } from "@/lib/utils/money";
import { calculateQuoteTotals } from "@/lib/utils/pricing-templates";
import {
  downloadReportHtmlFile,
  escapeReportHtml,
  sanitizeReportFileName
} from "@/lib/utils/report-share-common";

export const quoteStatusLabelKeys: Record<QuoteStatus, TranslationKey> = {
  draft: "quoteStatusDraft",
  sent: "quoteStatusSent",
  accepted: "quoteStatusAccepted",
  declined: "quoteStatusDeclined",
  expired: "quoteStatusExpired"
};

/** User-supplied "Business -Proposal" wordmark (1088x320 PNG, transparent). */
const businessProposalWordmark = "data:image/png;base64,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";

/** Replaces {name} slots in a translated sentence template. */
const fillTemplate = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

type QuoteReportLabels = {
  amount: string;
  client: string;
  deliverable: string;
  deliverableFormat: string;
  deliverableQty: string;
  discount: string;
  issuedOn: string;
  item: string;
  notes: string;
  paymentPercent: string;
  paymentStage: string;
  quantity: string;
  signature: string;
  subtotal: string;
  tax: string;
  timelineStage: string;
  timelineWeeks: string;
  total: string;
  totalLabel: string;
  unitPrice: string;
  validUntil: string;
  weeksUnit: string;
};

export type QuoteReportData = {
  brandName: string;
  /** Signer line at the bottom; quote.signature or the brand name. */
  signatureName: string;
  /** Uploaded brand logo as a data URL; remote URLs are excluded by the CSP. */
  logoUrl?: string;
  code: string;
  title: string;
  clientContact?: string;
  issuedOn: string;
  validUntil?: string;
  currency: string;
  language: Language;
  labels: QuoteReportLabels;
  overview?: string;
  scope: Array<{ title: string; items: string[] }>;
  deliverables: Array<{ name: string; quantity: string; format: string }>;
  timeline: Array<{ stage: string; weeks: number }>;
  totalWeeks: number;
  paymentSchedule: Array<{ stage: string; percent: number }>;
  totalPercent: number;
  policySentences: string[];
  termsClauses: Array<{ title: string; body: string }>;
  lines: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  subtotal: number;
  discountPercent: number;
  discount: number;
  taxPercent: number;
  tax: number;
  total: number;
  notes?: string;
};

export type BuildQuoteReportInput = {
  quote: Quote;
  company: Company;
  language: Language;
  t: (key: TranslationKey) => string;
};

const termsClauseKeys: Array<[TranslationKey, TranslationKey]> = [
  ["quoteTermsC1Title", "quoteTermsC1Body"],
  ["quoteTermsC2Title", "quoteTermsC2Body"],
  ["quoteTermsC3Title", "quoteTermsC3Body"],
  ["quoteTermsC4Title", "quoteTermsC4Body"],
  ["quoteTermsC5Title", "quoteTermsC5Body"],
  ["quoteTermsC6Title", "quoteTermsC6Body"],
  ["quoteTermsC7Title", "quoteTermsC7Body"],
  ["quoteTermsC8Title", "quoteTermsC8Body"],
  ["quoteTermsC9Title", "quoteTermsC9Body"],
  ["quoteTermsC10Title", "quoteTermsC10Body"],
  ["quoteTermsC11Title", "quoteTermsC11Body"],
  ["quoteTermsC12Title", "quoteTermsC12Body"],
  ["quoteTermsC13Title", "quoteTermsC13Body"]
];

/**
 * Client-facing proposal view only: internal margins, budget costs, and
 * template snapshots stay out of the exported document by construction.
 * Section 08 always renders from the fixed universal terms template.
 */
export const buildQuoteReportData = ({ quote, company, language, t }: BuildQuoteReportInput): QuoteReportData => {
  const totals = calculateQuoteTotals(quote);
  const scope = (quote.scope ?? [])
    .map((column) => ({
      title: column.title.trim(),
      items: column.items.map((item) => item.trim()).filter(Boolean)
    }))
    .filter((column) => column.title || column.items.length);
  const timeline = (quote.timeline ?? []).filter((row) => row.stage.trim());
  const paymentSchedule = (quote.paymentSchedule ?? []).filter((row) => row.stage.trim());
  const policy = quote.revisionPolicy;

  const brandName = formatDemoEntityName(company.name, company.id, "company", t);

  return {
    brandName,
    signatureName: quote.signature?.trim() || brandName,
    logoUrl: company.logoImage?.startsWith("data:") ? company.logoImage : undefined,
    code: quote.code,
    title: quote.title,
    clientContact: quote.clientContact,
    issuedOn: formatLocalizedDate(quote.issuedOn, language),
    validUntil: quote.validUntil ? formatLocalizedDate(quote.validUntil, language) : undefined,
    currency: quote.currency,
    language,
    labels: {
      amount: t("quoteLineAmount"),
      client: t("quoteClient"),
      deliverable: t("quoteDeliverableName"),
      deliverableFormat: t("quoteDeliverableFormat"),
      deliverableQty: t("quoteDeliverableQty"),
      discount: t("quoteDiscountPercent"),
      issuedOn: t("quoteIssuedOn"),
      item: t("quoteLineName"),
      notes: t("quoteNotes"),
      paymentPercent: t("quotePaymentPercent"),
      paymentStage: t("quotePaymentStage"),
      quantity: t("quoteLineQty"),
      signature: t("quoteSignature"),
      subtotal: t("quoteSubtotal"),
      tax: t("quoteTaxPercent"),
      timelineStage: t("quoteTimelineStage"),
      timelineWeeks: t("quoteTimelineWeeks"),
      total: t("quoteTotal"),
      totalLabel: t("quoteTotalLabel"),
      unitPrice: t("quoteLineUnitPrice"),
      validUntil: t("quoteValidUntil"),
      weeksUnit: t("quoteWeeksUnit")
    },
    overview: quote.overview?.trim() || undefined,
    scope,
    deliverables: (quote.deliverables ?? []).filter((row) => row.name.trim()),
    timeline,
    totalWeeks: timeline.reduce((sum, row) => sum + row.weeks, 0),
    paymentSchedule,
    totalPercent: paymentSchedule.reduce((sum, row) => sum + row.percent, 0),
    policySentences: policy
      ? [
          fillTemplate(t("quotePolicyIncludedTpl"), {
            revisions: String(policy.includedRevisions),
            trips: String(policy.includedTrips)
          }),
          ...(policy.extraRevisionFee.trim() || policy.extraTripFee.trim()
            ? [
                fillTemplate(t("quotePolicyExtraTpl"), {
                  revisionFee: policy.extraRevisionFee.trim() || "—",
                  tripFee: policy.extraTripFee.trim() || "—"
                })
              ]
            : [])
        ]
      : [],
    termsClauses: termsClauseKeys.map(([titleKey, bodyKey]) => ({
      title: t(titleKey),
      body: t(bodyKey)
    })),
    lines: quote.lines.map((line) => ({
      name: line.name,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.unitPrice * line.quantity
    })),
    subtotal: totals.subtotal,
    discountPercent: quote.discountPercent,
    discount: totals.discount,
    taxPercent: quote.taxPercent,
    tax: totals.tax,
    total: totals.total,
    notes: quote.notes?.trim() || undefined
  };
};

const money = (data: QuoteReportData, value: number) =>
  `${escapeReportHtml(data.currency)} ${escapeReportHtml(formatNumber(value))}`;

const trimTrailingZero = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);

const sectionHead = (title: string) => `<h2 class="sec-title">${escapeReportHtml(title)}</h2>`;

const renderScope = (data: QuoteReportData) =>
  data.scope.length
    ? `<section class="doc-section">
        ${sectionHead("02. Scope of Work")}
        <div class="scope-grid">
          ${data.scope
            .map(
              (column) => `<div class="scope-col">
                <p class="scope-col__title">${escapeReportHtml(column.title || "—")}</p>
                <ul class="scope-col__items">${column.items.map((item) => `<li>${escapeReportHtml(item)}</li>`).join("")}</ul>
              </div>`
            )
            .join("")}
        </div>
      </section>`
    : "";

/** 03 and 04 share one beige panel, exactly like the reference layout. */
const renderDeliverablesAndTimeline = (data: QuoteReportData) => {
  if (!data.deliverables.length && !data.timeline.length) {
    return "";
  }

  const deliverablesBlock = data.deliverables.length
    ? `${sectionHead("03. Deliverables")}
      <table class="grid-table grid-table--deliverables">
        <thead><tr><th>${escapeReportHtml(data.labels.deliverable)}</th><th>${escapeReportHtml(data.labels.deliverableQty)}</th><th>${escapeReportHtml(data.labels.deliverableFormat)}</th></tr></thead>
        <tbody>${data.deliverables
          .map(
            (row) => `<tr><td>${escapeReportHtml(row.name)}</td><td>${escapeReportHtml(row.quantity || "—")}</td><td>${escapeReportHtml(row.format || "—")}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : "";

  const timelineBlock = data.timeline.length
    ? `<div class="${data.deliverables.length ? "panel-sub" : ""}">
        ${sectionHead("04. Timeline")}
        <table class="grid-table grid-table--half">
          <thead><tr><th>${escapeReportHtml(data.labels.timelineStage)}</th><th class="right">${escapeReportHtml(data.labels.timelineWeeks)}</th></tr></thead>
          <tbody>${data.timeline
            .map(
              (row) => `<tr><td>${escapeReportHtml(row.stage)}</td><td class="right">${escapeReportHtml(trimTrailingZero(row.weeks))} ${escapeReportHtml(data.labels.weeksUnit)}</td></tr>`
            )
            .join("")}</tbody>
          <tfoot><tr><td></td><td class="right strong">${escapeReportHtml(data.labels.totalLabel)} ${escapeReportHtml(trimTrailingZero(data.totalWeeks))} ${escapeReportHtml(data.labels.weeksUnit)}</td></tr></tfoot>
        </table>
      </div>`
    : "";

  return `<section class="doc-section">
    <div class="panel panel--beige">${deliverablesBlock}${timelineBlock}</div>
  </section>`;
};

const renderFee = (data: QuoteReportData) => {
  const totalRows = [
    { label: data.labels.subtotal, value: money(data, data.subtotal) },
    ...(data.discount > 0
      ? [{ label: `${data.labels.discount.replace("%", "").trim()} ${data.discountPercent}%`, value: `−${money(data, data.discount)}` }]
      : []),
    ...(data.tax > 0
      ? [{ label: `${data.labels.tax.replace("%", "").trim()} ${data.taxPercent}%`, value: money(data, data.tax) }]
      : [])
  ];

  return `<section class="doc-section">
    ${sectionHead("05. Fee")}
    ${
      data.lines.length
        ? `<table class="grid-table">
            <thead><tr><th>${escapeReportHtml(data.labels.item)}</th><th class="right">${escapeReportHtml(data.labels.quantity)}</th><th class="right">${escapeReportHtml(data.labels.unitPrice)}</th><th class="right">${escapeReportHtml(data.labels.amount)}</th></tr></thead>
            <tbody>${data.lines
              .map(
                (line) => `<tr><td>${escapeReportHtml(line.name)}${line.description ? `<span class="cell-note">${escapeReportHtml(line.description)}</span>` : ""}</td><td class="right">${escapeReportHtml(formatNumber(line.quantity))}</td><td class="right">${money(data, line.unitPrice)}</td><td class="right">${money(data, line.amount)}</td></tr>`
              )
              .join("")}</tbody>
          </table>`
        : ""
    }
    <div class="fee-totals">
      ${totalRows
        .map((row) => `<div class="fee-totals__row"><span>${escapeReportHtml(row.label)}</span><span class="num">${row.value}</span></div>`)
        .join("")}
      <div class="fee-totals__row fee-totals__row--grand"><span>${escapeReportHtml(data.labels.total)}</span><span class="num">${money(data, data.total)}</span></div>
    </div>
  </section>`;
};

const renderPaymentSchedule = (data: QuoteReportData) =>
  data.paymentSchedule.length
    ? `<div class="panel panel--blue">
        ${sectionHead("06. Payment Schedule")}
        <table class="grid-table grid-table--onblue">
          <thead><tr><th>${escapeReportHtml(data.labels.paymentStage)}</th><th class="right">${escapeReportHtml(data.labels.paymentPercent)}</th></tr></thead>
          <tbody>${data.paymentSchedule
            .map(
              (row) => `<tr><td>${escapeReportHtml(row.stage)}</td><td class="right">${escapeReportHtml(trimTrailingZero(row.percent))}%</td></tr>`
            )
            .join("")}</tbody>
          <tfoot><tr><td></td><td class="right strong">${escapeReportHtml(data.labels.totalLabel)} ${escapeReportHtml(trimTrailingZero(data.totalPercent))}%</td></tr></tfoot>
        </table>
      </div>`
    : "";

const renderPolicy = (data: QuoteReportData) =>
  data.policySentences.length
    ? `<div class="policy">
        ${sectionHead("07. Revision & Trip Policy")}
        <ul class="policy__list">${data.policySentences.map((sentence) => `<li>${escapeReportHtml(sentence)}</li>`).join("")}</ul>
      </div>`
    : "";

const renderTerms = (data: QuoteReportData) => `<section class="doc-section">
  ${sectionHead("08. Terms & Conditions")}
  <div class="terms-grid">
    ${data.termsClauses
      .map(
        (clause, index) => `<div class="terms-clause">
          <p class="terms-clause__title">${index + 1}. ${escapeReportHtml(clause.title)}</p>
          <p class="terms-clause__body">${escapeReportHtml(clause.body)}</p>
        </div>`
      )
      .join("")}
  </div>
</section>`;

export const createQuoteReportHtml = (data: QuoteReportData) => {
  const reportFontFamily = `Inter,"SF Pro Rounded","SF Pro Display","PingFang SC","Hiragino Sans GB","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

  return `<!doctype html>
<html lang="${escapeReportHtml(data.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeReportHtml(`${data.code} · ${data.title}`)}</title>
  <style>
    :root{color-scheme:light;--ink:#2b2f36;--muted:#6a7076;--navy:#333e52;--beige:#eae6dc;--blue:#7fa9c9;--line:rgba(43,47,54,.16)}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html{background:#edf9f7}
    body{margin:0;color:var(--ink);font-family:${reportFontFamily};background:radial-gradient(circle at 8% 8%,rgba(142,219,232,.58),transparent 28rem),radial-gradient(circle at 92% 36%,rgba(227,245,150,.75),transparent 31rem),linear-gradient(150deg,#f9fffd,#f6f2e9);font-weight:600;line-height:1.55}
    h1,h2,p,ul{margin:0}
    .doc{width:min(100%,53rem);margin:0 auto;padding:clamp(.8rem,2.4vw,2.2rem)}
    .sheet{border-radius:1.5rem;background:#fff;padding:clamp(1.1rem,3vw,2.4rem);box-shadow:0 24px 70px rgba(28,35,40,.10)}
    .masthead{display:flex;align-items:flex-start;justify-content:space-between;gap:1.2rem;margin-bottom:2rem}
    .masthead__logo{display:block;height:clamp(5rem,17vw,8.5rem);width:auto;max-width:45%;object-fit:contain;object-position:left top}
    .masthead__word{display:block;margin-left:auto;padding-top:.35rem;width:min(26rem,58%);height:auto}
    /* Bleeds outward like the panels so every colored block shares the same
       outer edges while inner text stays on the document text grid. */
    .head-card{border-radius:1.65rem;background:var(--navy);color:#fff;padding:clamp(1.1rem,3vw,1.7rem) var(--panel-pad);margin-inline:calc(var(--panel-pad) * -1)}
    .head-card__row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;margin-bottom:.85rem;font-size:clamp(1rem,2.6vw,1.35rem);font-weight:800;letter-spacing:-.01em}
    .head-card__value{min-width:12rem;flex:1;border-bottom:1px solid rgba(255,255,255,.85);padding:0 .4rem .28rem;color:#fff;overflow-wrap:anywhere}
    .head-card__pills{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:1.1rem}
    .head-card__pills span{display:inline-flex;min-height:2rem;align-items:center;border-radius:999px;background:#fff;color:var(--navy);padding:.3rem .95rem;font-size:.74rem;font-weight:800}
    .doc-section{margin-top:clamp(1.5rem,3.4vw,2.3rem)}
    .sec-title{display:inline-block;border-bottom:2px solid var(--ink);padding-bottom:.3rem;font-size:1.02rem;font-weight:800;letter-spacing:.01em}
    .doc-section > p.body-text{margin-top:.8rem;font-size:.86rem;line-height:1.8;white-space:pre-wrap}
    .scope-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;margin-top:1rem}
    .scope-col__title{font-size:.86rem;font-weight:800}
    .scope-col__items{margin-top:.55rem;padding-left:1rem;display:grid;gap:.3rem;font-size:.78rem;font-weight:600;color:var(--ink)}
    :root{--panel-pad:clamp(1rem,2.6vw,1.5rem)}
    /* Panels bleed outward by their own padding so inner text stays on the
       same left/right edges as the copy outside the panels. */
    .panel{border-radius:1.65rem;padding:var(--panel-pad);margin-inline:calc(var(--panel-pad) * -1)}
    .panel--beige{background:var(--beige)}
    .panel--blue{background:var(--blue)}
    .split .panel--blue{margin-right:0}
    .panel .sec-title{border-color:currentColor}
    .panel-sub{margin-top:1.7rem}
    .grid-table{width:100%;border-collapse:collapse;margin-top:.9rem;font-size:.82rem}
    .grid-table th{padding:.5rem .4rem;text-align:left;font-size:.74rem;font-weight:800;border-bottom:1.5px solid var(--line)}
    .grid-table td{padding:.55rem .4rem;border-bottom:1px solid var(--line);font-weight:600;vertical-align:top}
    .grid-table th:first-child,.grid-table td:first-child{padding-left:0}
    .grid-table th:last-child,.grid-table td:last-child{padding-right:0}
    .grid-table tfoot td{border-bottom:0;padding-top:.65rem}
    .grid-table .right,.grid-table th.right{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .grid-table .strong{font-weight:800}
    .grid-table--half{max-width:26rem}
    .grid-table--deliverables{table-layout:fixed}
    .grid-table--deliverables th:nth-child(1){width:48%}
    .grid-table--deliverables th:nth-child(2){width:28%}
    .grid-table--deliverables th:nth-child(3){width:24%}
    .grid-table--onblue{color:#fff}
    .grid-table--onblue th{border-color:rgba(255,255,255,.55)}
    .grid-table--onblue td{border-color:rgba(255,255,255,.35)}
    .cell-note{display:block;margin-top:.2rem;font-size:.72rem;font-weight:600;color:var(--muted)}
    .fee-totals{display:grid;gap:.35rem;margin-top:1rem;margin-left:auto;max-width:22rem}
    .fee-totals__row{display:flex;align-items:center;justify-content:space-between;gap:1.2rem;font-size:.82rem;font-weight:700;color:var(--muted)}
    .fee-totals__row .num{font-variant-numeric:tabular-nums;color:var(--ink)}
    .fee-totals__row--grand{margin-top:.4rem;border-radius:.7rem;background:var(--navy);padding:.65rem .9rem;color:#fff;font-size:.92rem;font-weight:800}
    .fee-totals__row--grand .num{color:#fff;font-size:1.02rem}
    .split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.4rem;align-items:start}
    /* The blue panel's padding pushes its title down; give the policy column
       the same top inset so the 06 and 07 titles sit on one line. */
    .split .policy{padding-top:var(--panel-pad)}
    .policy__list{margin-top:.9rem;padding-left:1.1rem;display:grid;gap:.6rem;font-size:.82rem;font-weight:600;line-height:1.7}
    .terms-grid{margin-top:1rem;columns:2;column-gap:1.8rem}
    .terms-clause{break-inside:avoid;margin-bottom:1.15rem}
    .terms-clause__title{font-size:.76rem;font-weight:800}
    .terms-clause__body{margin-top:.2rem;font-size:.72rem;font-weight:600;line-height:1.65;color:var(--muted)}
    .signature{margin-top:clamp(1.8rem,4vw,2.6rem)}
    .signature__space{height:6.5rem}
    .notes-block{margin-top:1.2rem;border-radius:1.65rem;background:var(--beige);padding:var(--panel-pad);margin-inline:calc(var(--panel-pad) * -1)}
    .notes-block__label{font-size:.74rem;font-weight:800}
    .notes-block__body{margin-top:.35rem;font-size:.78rem;font-weight:600;line-height:1.7;white-space:pre-wrap;color:var(--muted)}
    @media(max-width:640px){.scope-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.split{grid-template-columns:1fr}.terms-grid{columns:1}.masthead__logo{height:2.6rem}}
    @page{size:A4;margin:0}
    @media print{
      .doc{width:100%;padding:9mm}
      .sheet{box-shadow:none}
      .head-card,.panel{border-radius:1.2rem}
      tr,.terms-clause,.scope-col,.fee-totals,.policy__list li{break-inside:avoid}
      thead{display:table-header-group}
      .doc-section{break-inside:auto}
      .head-card,.notes-block,.signature{break-inside:avoid}
    }
  </style>
</head>
<body>
  <main class="doc">
    <div class="sheet">
    <header class="masthead">
      ${data.logoUrl ? `<img class="masthead__logo" src="${escapeReportHtml(data.logoUrl)}" alt="${escapeReportHtml(data.brandName)}">` : `<span></span>`}
      <img class="masthead__word" src="${businessProposalWordmark}" alt="Business Proposal">
    </header>

    <section class="head-card">
      <div class="head-card__row"><span>Project Name:</span><span class="head-card__value">${escapeReportHtml(data.title)}</span></div>
      <div class="head-card__row"><span>Client:</span><span class="head-card__value">${escapeReportHtml(data.clientContact ?? "")}</span></div>
      <div class="head-card__pills">
        <span>${escapeReportHtml(data.code)}</span>
        <span>${escapeReportHtml(data.labels.issuedOn)} ${escapeReportHtml(data.issuedOn)}</span>
        ${data.validUntil ? `<span>${escapeReportHtml(data.labels.validUntil)} ${escapeReportHtml(data.validUntil)}</span>` : ""}
      </div>
    </section>

    ${
      data.overview
        ? `<section class="doc-section">${sectionHead("01. Project Overview")}<p class="body-text">${escapeReportHtml(data.overview)}</p></section>`
        : ""
    }
    ${renderScope(data)}
    ${renderDeliverablesAndTimeline(data)}
    ${renderFee(data)}
    ${
      data.paymentSchedule.length || data.policySentences.length
        ? `<div class="doc-section split">${renderPaymentSchedule(data)}${renderPolicy(data)}</div>`
        : ""
    }
    ${renderTerms(data)}

    <section class="signature">
      <h2 class="sec-title">${escapeReportHtml(data.signatureName)}</h2>
      <div class="signature__space"></div>
      ${
        data.notes
          ? `<div class="notes-block"><p class="notes-block__label">${escapeReportHtml(data.labels.notes)}:</p><p class="notes-block__body">${escapeReportHtml(data.notes)}</p></div>`
          : ""
      }
    </section>
    </div>
  </main>
</body>
</html>`;
};

export const downloadQuoteReportHtml = (data: QuoteReportData) => {
  downloadReportHtmlFile(createQuoteReportHtml(data), sanitizeReportFileName(`${data.code} ${data.title}`, "Quote"));
};
