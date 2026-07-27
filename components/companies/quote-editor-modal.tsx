"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link2, PackagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { pricingKindLabelKeys } from "@/components/libraries/pricing-template-library";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Select } from "@/components/ui/select";
import { quotesApi } from "@/lib/api";
import { formatDemoEntityName, translateDomainLabel, projectNameKeys } from "@/lib/i18n/domain-labels";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PricingTemplate, Project, Quote, QuoteLine, QuoteStatus } from "@/lib/types";
import { formatNumber, roundMoneyAmount, type MoneyCurrency } from "@/lib/utils/money";
import { calculateProjectBudget } from "@/lib/utils/project-budget";
import {
  calculateQuoteMargin,
  calculateQuoteTotals,
  createPricingId,
  createQuoteLineFromTemplate,
  evaluatePricingTemplate,
  quoteStatuses
} from "@/lib/utils/pricing-templates";
import { quoteStatusLabelKeys } from "@/lib/utils/quote-share";

const currencyOptions: MoneyCurrency[] = ["CNY", "USD", "JPY", "EUR"];

const inputClass =
  "min-h-11 w-full min-w-0 rounded-2xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-coral focus:ring-4 focus:ring-coral/10";
const fieldLabelClass = "text-xs font-black uppercase text-muted";

type ScopeItemDraft = { id: string; text: string };
type ScopeColumnDraft = { id: string; title: string; items: ScopeItemDraft[] };
type DeliverableDraft = { id: string; name: string; quantity: string; format: string };
type TimelineDraft = { id: string; stage: string; weeks: string };
type PaymentScheduleDraft = { id: string; stage: string; percent: string };

type QuoteForm = {
  title: string;
  clientContact: string;
  projectId: string;
  currency: MoneyCurrency;
  issuedOn: string;
  validUntil: string;
  status: QuoteStatus;
  discountPercent: string;
  taxPercent: string;
  overview: string;
  scope: ScopeColumnDraft[];
  deliverables: DeliverableDraft[];
  timeline: TimelineDraft[];
  paymentSchedule: PaymentScheduleDraft[];
  policyRevisions: string;
  policyTrips: string;
  policyRevisionFee: string;
  policyTripFee: string;
  signature: string;
  notes: string;
  lines: QuoteLine[];
};

const createScopeColumn = (): ScopeColumnDraft => ({
  id: createPricingId("scope"),
  title: "",
  items: [{ id: createPricingId("scope-item"), text: "" }]
});

/** The proposal layout always shows four Scope-of-Work groups. */
const padScopeColumns = (columns: ScopeColumnDraft[]): ScopeColumnDraft[] => {
  const padded = [...columns];
  while (padded.length < 4) {
    padded.push(createScopeColumn());
  }
  return padded.slice(0, 4);
};

const scopeColumnPlaceholders = ["A. Strategy", "B. Design", "C. Production", "D. Consulting"];

type TemplateDraft = {
  templateId: string;
  name: string;
  quantity: string;
  area: string;
  minutes: string;
  styleLevelId: string;
  costBasis: string;
};

const emptyTemplateDraft: TemplateDraft = {
  templateId: "",
  name: "",
  quantity: "1",
  area: "",
  minutes: "",
  styleLevelId: "",
  costBasis: ""
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const quoteToForm = (quote: Quote): QuoteForm => ({
  title: quote.title,
  clientContact: quote.clientContact ?? "",
  projectId: quote.projectId ?? "",
  currency: quote.currency,
  issuedOn: quote.issuedOn,
  validUntil: quote.validUntil ?? "",
  status: quote.status,
  discountPercent: quote.discountPercent ? String(quote.discountPercent) : "",
  taxPercent: quote.taxPercent ? String(quote.taxPercent) : "",
  overview: quote.overview ?? "",
  scope: padScopeColumns(
    (quote.scope ?? []).map((column) => ({
      id: column.id,
      title: column.title,
      items: column.items.length
        ? column.items.map((text) => ({ id: createPricingId("scope-item"), text }))
        : [{ id: createPricingId("scope-item"), text: "" }]
    }))
  ),
  deliverables: (quote.deliverables ?? []).map((row) => ({ ...row })),
  timeline: (quote.timeline ?? []).map((row) => ({
    id: row.id,
    stage: row.stage,
    weeks: String(row.weeks)
  })),
  paymentSchedule: (quote.paymentSchedule ?? []).map((row) => ({
    id: row.id,
    stage: row.stage,
    percent: String(row.percent)
  })),
  policyRevisions: quote.revisionPolicy ? String(quote.revisionPolicy.includedRevisions) : "2",
  policyTrips: quote.revisionPolicy ? String(quote.revisionPolicy.includedTrips) : "1",
  policyRevisionFee: quote.revisionPolicy?.extraRevisionFee ?? "",
  policyTripFee: quote.revisionPolicy?.extraTripFee ?? "",
  signature: quote.signature ?? "",
  notes: quote.notes ?? "",
  lines: structuredClone(quote.lines)
});

const createEmptyForm = (): QuoteForm => ({
  title: "",
  clientContact: "",
  projectId: "",
  currency: "CNY",
  issuedOn: todayIso(),
  validUntil: "",
  status: "draft",
  discountPercent: "",
  taxPercent: "",
  overview: "",
  scope: padScopeColumns([]),
  deliverables: [],
  timeline: [],
  paymentSchedule: [],
  policyRevisions: "2",
  policyTrips: "1",
  policyRevisionFee: "",
  policyTripFee: "",
  signature: "",
  notes: "",
  lines: []
});

const parsePercent = (value: string) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0;
};

const parseNonNegative = (value: string) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

type QuoteEditorModalProps = {
  open: boolean;
  companyId: string;
  quote: Quote | null;
  projects: Project[];
  pricingTemplates: PricingTemplate[];
  t: (key: TranslationKey) => string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

export function QuoteEditorModal({
  open,
  companyId,
  quote,
  projects,
  pricingTemplates,
  t,
  onClose,
  onSaved
}: QuoteEditorModalProps) {
  const { exchangeRateSnapshot } = useCostDisplayCurrency();
  const [form, setForm] = useState<QuoteForm>(createEmptyForm);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplateDraft);
  const [saving, setSaving] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(quote ? quoteToForm(quote) : createEmptyForm());
    setTemplateDraft(emptyTemplateDraft);
    setSaving(false);
  }, [open, quote]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // ModalPortal mounts its children one commit later, so retry until the
    // close button exists before handing it the initial focus. setTimeout
    // (not rAF) so the retry also fires in hidden/backgrounded documents.
    let focusTimer = 0;
    const focusClose = () => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
        return;
      }
      focusTimer = window.setTimeout(focusClose, 16);
    };
    focusClose();

    return () => {
      window.clearTimeout(focusTimer);
      previouslyFocused?.focus();
    };
  }, [open]);

  const selectedTemplate = useMemo(
    () => pricingTemplates.find((template) => template.id === templateDraft.templateId),
    [pricingTemplates, templateDraft.templateId]
  );

  const draftInputs = useMemo(
    () => ({
      area: templateDraft.area.trim() === "" ? undefined : parseNonNegative(templateDraft.area),
      minutes: templateDraft.minutes.trim() === "" ? undefined : parseNonNegative(templateDraft.minutes),
      styleLevelId: templateDraft.styleLevelId || selectedTemplate?.style?.levels[0]?.id,
      costBasis: templateDraft.costBasis.trim() === "" ? undefined : parseNonNegative(templateDraft.costBasis)
    }),
    [selectedTemplate, templateDraft]
  );

  const draftEvaluation = useMemo(() => {
    if (!selectedTemplate) {
      return null;
    }

    const hasInput =
      selectedTemplate.kind === "area-tier"
        ? draftInputs.area !== undefined
        : selectedTemplate.kind === "style-minute"
          ? draftInputs.minutes !== undefined
          : draftInputs.costBasis !== undefined;

    return hasInput ? evaluatePricingTemplate(selectedTemplate, draftInputs) : null;
  }, [draftInputs, selectedTemplate]);

  const previewQuote: Quote = useMemo(
    () => ({
      id: quote?.id ?? "quote-preview",
      companyId,
      projectId: form.projectId || undefined,
      code: quote?.code ?? "—",
      title: form.title,
      status: form.status,
      currency: form.currency,
      issuedOn: form.issuedOn || todayIso(),
      version: quote?.version ?? 1,
      lines: form.lines,
      discountPercent: parsePercent(form.discountPercent),
      taxPercent: parsePercent(form.taxPercent),
      createdAt: quote?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }),
    [companyId, form, quote]
  );

  const totals = useMemo(() => calculateQuoteTotals(previewQuote), [previewQuote]);

  const linkedProject = useMemo(
    () => projects.find((project) => project.id === form.projectId),
    [form.projectId, projects]
  );

  const margin = useMemo(() => {
    if (!linkedProject?.budget) {
      return null;
    }

    const budget = calculateProjectBudget(linkedProject, {
      currency: form.currency,
      snapshot: exchangeRateSnapshot
    });

    return calculateQuoteMargin(previewQuote, budget.total, form.currency, exchangeRateSnapshot);
  }, [exchangeRateSnapshot, form.currency, linkedProject, previewQuote]);

  if (!open) {
    return null;
  }

  const formatMoney = (value: number) => `${form.currency} ${formatNumber(value)}`;

  const updateLine = (lineId: string, patch: Partial<QuoteLine>) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    }));
  };

  const addManualLine = () => {
    setForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        { id: createPricingId("quote-line"), name: "", quantity: 1, unitPrice: 0 }
      ]
    }));
  };

  const addTemplateLine = () => {
    if (!selectedTemplate || !draftEvaluation || draftEvaluation.error) {
      return;
    }

    const line = createQuoteLineFromTemplate({
      template: selectedTemplate,
      inputs: draftInputs,
      quantity: Math.max(1, Math.round(parseNonNegative(templateDraft.quantity) || 1)),
      quoteCurrency: form.currency,
      name: templateDraft.name,
      snapshot: exchangeRateSnapshot
    });

    setForm((current) => ({ ...current, lines: [...current.lines, line] }));
    setTemplateDraft(emptyTemplateDraft);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim() || saving) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        projectId: form.projectId || undefined,
        title: form.title.trim(),
        clientContact: form.clientContact.trim() || undefined,
        currency: form.currency,
        issuedOn: form.issuedOn || todayIso(),
        validUntil: form.validUntil || undefined,
        lines: form.lines.filter((line) => line.name.trim()),
        discountPercent: parsePercent(form.discountPercent),
        taxPercent: parsePercent(form.taxPercent),
        overview: form.overview.trim() || undefined,
        scope: form.scope
          .map((column) => ({
            id: column.id,
            title: column.title.trim(),
            items: column.items.map((item) => item.text.trim()).filter(Boolean)
          }))
          .filter((column) => column.title || column.items.length),
        deliverables: form.deliverables
          .map((row) => ({
            id: row.id,
            name: row.name.trim(),
            quantity: row.quantity.trim(),
            format: row.format.trim()
          }))
          .filter((row) => row.name),
        timeline: form.timeline
          .map((row) => ({
            id: row.id,
            stage: row.stage.trim(),
            weeks: parseNonNegative(row.weeks)
          }))
          .filter((row) => row.stage),
        paymentSchedule: form.paymentSchedule
          .map((row) => ({
            id: row.id,
            stage: row.stage.trim(),
            percent: parsePercent(row.percent)
          }))
          .filter((row) => row.stage),
        revisionPolicy: {
          includedRevisions: Math.round(parseNonNegative(form.policyRevisions)),
          includedTrips: Math.round(parseNonNegative(form.policyTrips)),
          extraRevisionFee: form.policyRevisionFee.trim(),
          extraTripFee: form.policyTripFee.trim()
        },
        signature: form.signature.trim() || undefined,
        notes: form.notes.trim() || undefined
      };

      if (quote) {
        await quotesApi.updateQuote(quote.id, { ...payload, status: form.status });
      } else {
        await quotesApi.createQuote({ ...payload, companyId });
      }

      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[90] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <form
          onSubmit={save}
          className="mx-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-studio-lg bg-[#f8fbf2] shadow-lift ring-1 ring-black/[0.08] sm:max-h-[calc(100dvh-3rem)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-4 sm:p-6">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase text-muted">
                {quote ? `${quote.code} · v${quote.version}` : t("quotesSection")}
              </p>
              <h2 id={titleId} className="mt-1 text-3xl font-black leading-none">
                {quote ? t("editQuote") : t("newQuote")}
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-soft"
              aria-label={t("close")}
            >
              <X size={20} />
            </button>
          </div>

          <div className="studio-scroll flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2">
                <span className={fieldLabelClass}>{t("quoteTitleLabel")}</span>
                <input
                  className={inputClass}
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={t("quoteTitlePlaceholder")}
                />
              </label>
              <label className="grid gap-2">
                <span className={fieldLabelClass}>{t("quoteClient")}</span>
                <input
                  className={inputClass}
                  value={form.clientContact}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, clientContact: event.target.value }))
                  }
                  placeholder={t("quoteClientPlaceholder")}
                />
              </label>
              <label className="grid gap-2">
                <span className={fieldLabelClass}>{t("quoteLinkedProject")}</span>
                <Select
                  value={form.projectId}
                  onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">{t("quoteNoLinkedProject")}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {formatDemoEntityName(
                        translateDomainLabel(project.name, projectNameKeys, t),
                        project.id,
                        "project",
                        t,
                        project.isExample
                      )}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quoteIssuedOn")}</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.issuedOn}
                    onChange={(event) => setForm((current) => ({ ...current, issuedOn: event.target.value }))}
                  />
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quoteValidUntil")}</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.validUntil}
                    onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-2">
                <span className={fieldLabelClass}>{t("currency")}</span>
                <Select
                  value={form.currency}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currency: event.target.value as MoneyCurrency }))
                  }
                  className={inputClass}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </Select>
              </label>
              {quote ? (
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quoteStatusLabel")}</span>
                  <Select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, status: event.target.value as QuoteStatus }))
                    }
                    className={inputClass}
                  >
                    {quoteStatuses.map((status) => (
                      <option key={status} value={status}>{t(quoteStatusLabelKeys[status])}</option>
                    ))}
                  </Select>
                </label>
              ) : null}
            </div>

            <div className="mt-6">
              <p className="text-sm font-black uppercase text-muted">{t("quoteOverviewSection")}</p>
              <textarea
                className={`${inputClass} mt-3 min-h-24 resize-none rounded-studio p-4 leading-6`}
                value={form.overview}
                onChange={(event) => setForm((current) => ({ ...current, overview: event.target.value }))}
                placeholder={t("quoteOverviewPlaceholder")}
              />
            </div>

            <div className="mt-6">
              <p className="text-sm font-black uppercase text-muted">{t("quoteScopeSection")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {form.scope.map((column, columnIndex) => (
                  <div key={column.id} className="grid content-start gap-2 rounded-studio bg-white p-3 shadow-soft ring-1 ring-black/[0.04]">
                    <input
                      className={inputClass}
                      value={column.title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          scope: current.scope.map((item) =>
                            item.id === column.id ? { ...item, title: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={scopeColumnPlaceholders[columnIndex] ?? t("quoteScopeColumnTitlePlaceholder")}
                      aria-label={t("quoteScopeColumnTitlePlaceholder")}
                    />
                    {column.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-1.5">
                        <input
                          className={inputClass}
                          value={item.text}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              scope: current.scope.map((scopeColumn) =>
                                scopeColumn.id === column.id
                                  ? {
                                      ...scopeColumn,
                                      items: scopeColumn.items.map((scopeItem) =>
                                        scopeItem.id === item.id
                                          ? { ...scopeItem, text: event.target.value }
                                          : scopeItem
                                      )
                                    }
                                  : scopeColumn
                              )
                            }))
                          }
                          placeholder={t("quoteScopeItemPlaceholder")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0"
                          disabled={column.items.length <= 1}
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              scope: current.scope.map((scopeColumn) =>
                                scopeColumn.id === column.id
                                  ? {
                                      ...scopeColumn,
                                      items: scopeColumn.items.filter((scopeItem) => scopeItem.id !== item.id)
                                    }
                                  : scopeColumn
                              )
                            }))
                          }
                          aria-label={`${t("delete")} ${item.text || t("quoteScopeItemPlaceholder")}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-self-start"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          scope: current.scope.map((scopeColumn) =>
                            scopeColumn.id === column.id
                              ? {
                                  ...scopeColumn,
                                  items: [...scopeColumn.items, { id: createPricingId("scope-item"), text: "" }]
                                }
                              : scopeColumn
                          )
                        }))
                      }
                    >
                      <Plus size={14} />
                      {t("quoteScopeAddItem")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-black uppercase text-muted">{t("quoteDeliverablesSection")}</p>
              <div className="mt-3 grid gap-2">
                {form.deliverables.map((row) => (
                  <div key={row.id} className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] sm:items-center">
                    <input
                      className={inputClass}
                      value={row.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deliverables: current.deliverables.map((item) =>
                            item.id === row.id ? { ...item, name: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={t("quoteDeliverableName")}
                      aria-label={t("quoteDeliverableName")}
                    />
                    <input
                      className={inputClass}
                      value={row.quantity}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deliverables: current.deliverables.map((item) =>
                            item.id === row.id ? { ...item, quantity: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={t("quoteDeliverableQty")}
                      aria-label={t("quoteDeliverableQty")}
                    />
                    <input
                      className={inputClass}
                      value={row.format}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deliverables: current.deliverables.map((item) =>
                            item.id === row.id ? { ...item, format: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={t("quoteDeliverableFormat")}
                      aria-label={t("quoteDeliverableFormat")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 justify-self-end"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          deliverables: current.deliverables.filter((item) => item.id !== row.id)
                        }))
                      }
                      aria-label={`${t("delete")} ${row.name || t("quoteDeliverableName")}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    deliverables: [
                      ...current.deliverables,
                      { id: createPricingId("deliverable"), name: "", quantity: "", format: "" }
                    ]
                  }))
                }
              >
                <Plus size={16} />
                {t("quoteAddRow")}
              </Button>
            </div>

            <div className="mt-6">
              <p className="text-sm font-black uppercase text-muted">{t("quoteTimelineSection")}</p>
              <div className="mt-3 grid gap-2">
                {form.timeline.map((row) => (
                  <div key={row.id} className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_auto] sm:items-center">
                    <input
                      className={inputClass}
                      value={row.stage}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          timeline: current.timeline.map((item) =>
                            item.id === row.id ? { ...item, stage: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={t("quoteTimelineStage")}
                      aria-label={t("quoteTimelineStage")}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className={inputClass}
                      value={row.weeks}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          timeline: current.timeline.map((item) =>
                            item.id === row.id ? { ...item, weeks: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={t("quoteTimelineWeeks")}
                      aria-label={t("quoteTimelineWeeks")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 justify-self-end"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          timeline: current.timeline.filter((item) => item.id !== row.id)
                        }))
                      }
                      aria-label={`${t("delete")} ${row.stage || t("quoteTimelineStage")}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      timeline: [...current.timeline, { id: createPricingId("timeline"), stage: "", weeks: "" }]
                    }))
                  }
                >
                  <Plus size={16} />
                  {t("quoteAddRow")}
                </Button>
                <p className="text-sm font-black tabular-nums">
                  {t("quoteTotalLabel")} {form.timeline.reduce((sum, row) => sum + parseNonNegative(row.weeks), 0)} {t("quoteWeeksUnit")}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-black uppercase text-muted">{t("quoteFeeSection")}</p>

              <div className="mt-3 grid gap-3">
                {form.lines.map((line) => (
                  <div
                    key={line.id}
                    className="grid gap-2 rounded-studio bg-white p-3 shadow-soft ring-1 ring-black/[0.04]"
                  >
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] sm:items-center">
                      <input
                        className={inputClass}
                        value={line.name}
                        onChange={(event) => updateLine(line.id, { name: event.target.value })}
                        placeholder={t("quoteLineNamePlaceholder")}
                        aria-label={t("quoteLineName")}
                      />
                      <input
                        type="number"
                        min="0"
                        className={inputClass}
                        value={line.quantity || ""}
                        onChange={(event) =>
                          updateLine(line.id, { quantity: parseNonNegative(event.target.value) })
                        }
                        placeholder={t("quoteLineQty")}
                        aria-label={t("quoteLineQty")}
                      />
                      <input
                        type="number"
                        min="0"
                        className={inputClass}
                        value={line.unitPrice || ""}
                        onChange={(event) =>
                          updateLine(line.id, { unitPrice: parseNonNegative(event.target.value) })
                        }
                        placeholder={t("quoteLineUnitPrice")}
                        aria-label={t("quoteLineUnitPrice")}
                      />
                      <p className="whitespace-nowrap text-right text-sm font-black tabular-nums">
                        {formatMoney(roundMoneyAmount(line.unitPrice * line.quantity))}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 justify-self-end"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            lines: current.lines.filter((item) => item.id !== line.id)
                          }))
                        }
                        aria-label={`${t("delete")} ${line.name}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    {line.pricing ? (
                      <p className="inline-flex items-start gap-2 rounded-2xl bg-aqua/25 px-3 py-2 text-xs font-black leading-5 text-ink/62">
                        <Link2 size={14} className="mt-0.5 shrink-0" />
                        {line.pricing.templateName} · {t(pricingKindLabelKeys[line.pricing.kind])} · {t("quoteTemplateFrozen")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={addManualLine}>
                  <Plus size={16} />
                  {t("quoteAddManualLine")}
                </Button>
              </div>

              <div className="mt-4 grid gap-3 rounded-studio bg-cloud/70 p-4">
                <p className="inline-flex items-center gap-2 text-xs font-black text-ink/62">
                  <PackagePlus size={14} />
                  {t("quoteAddTemplateLine")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Select
                    value={templateDraft.templateId}
                    onChange={(event) =>
                      setTemplateDraft({ ...emptyTemplateDraft, templateId: event.target.value })
                    }
                    className={inputClass}
                    aria-label={t("quoteAddTemplateLine")}
                  >
                    <option value="">{t("pricingTemplateLibrary")}</option>
                    {pricingTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {t(pricingKindLabelKeys[template.kind])}
                      </option>
                    ))}
                  </Select>
                  {selectedTemplate ? (
                    <input
                      className={inputClass}
                      value={templateDraft.name}
                      onChange={(event) =>
                        setTemplateDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder={`${t("quoteLineName")} (${selectedTemplate.name})`}
                    />
                  ) : null}
                  {selectedTemplate?.kind === "area-tier" ? (
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={templateDraft.area}
                      onChange={(event) =>
                        setTemplateDraft((current) => ({ ...current, area: event.target.value }))
                      }
                      placeholder={t("pricingPreviewArea")}
                    />
                  ) : null}
                  {selectedTemplate?.kind === "style-minute" ? (
                    <>
                      <Select
                        value={draftInputs.styleLevelId ?? ""}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({ ...current, styleLevelId: event.target.value }))
                        }
                        className={inputClass}
                        aria-label={t("pricingSelectLevel")}
                      >
                        {(selectedTemplate.style?.levels ?? []).map((level) => (
                          <option key={level.id} value={level.id}>
                            {level.name} · {selectedTemplate.currency} {formatNumber(level.minuteRate)}/min
                          </option>
                        ))}
                      </Select>
                      <input
                        type="number"
                        min="0"
                        className={inputClass}
                        value={templateDraft.minutes}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({ ...current, minutes: event.target.value }))
                        }
                        placeholder={t("pricingPreviewMinutes")}
                      />
                    </>
                  ) : null}
                  {selectedTemplate?.kind === "cost-markup" ? (
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={templateDraft.costBasis}
                      onChange={(event) =>
                        setTemplateDraft((current) => ({ ...current, costBasis: event.target.value }))
                      }
                      placeholder={t("pricingPreviewCostBasis")}
                    />
                  ) : null}
                  {selectedTemplate ? (
                    <input
                      type="number"
                      min="1"
                      className={inputClass}
                      value={templateDraft.quantity}
                      onChange={(event) =>
                        setTemplateDraft((current) => ({ ...current, quantity: event.target.value }))
                      }
                      placeholder={t("quoteLineQty")}
                    />
                  ) : null}
                </div>
                {selectedTemplate ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-black">
                      {draftEvaluation
                        ? draftEvaluation.error
                          ? t("pricingNoTierMatched")
                          : `${t("pricingPreviewResult")}: ${selectedTemplate.currency} ${formatNumber(Math.round(draftEvaluation.amount))}${
                              draftEvaluation.minimumApplied ? ` · ${t("pricingMinimumApplied")}` : ""
                            }`
                        : t("pricingPreview")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!draftEvaluation || Boolean(draftEvaluation.error)}
                      onClick={addTemplateLine}
                    >
                      <Plus size={16} />
                      {t("quoteAddTemplateLine")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-black uppercase text-muted">{t("quotePaymentSection")}</p>
              <div className="mt-3 grid gap-2">
                {form.paymentSchedule.map((row) => (
                  <div key={row.id} className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_auto] sm:items-center">
                    <input
                      className={inputClass}
                      value={row.stage}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          paymentSchedule: current.paymentSchedule.map((item) =>
                            item.id === row.id ? { ...item, stage: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={t("quotePaymentStage")}
                      aria-label={t("quotePaymentStage")}
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className={inputClass}
                      value={row.percent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          paymentSchedule: current.paymentSchedule.map((item) =>
                            item.id === row.id ? { ...item, percent: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={t("quotePaymentPercent")}
                      aria-label={t("quotePaymentPercent")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 justify-self-end"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          paymentSchedule: current.paymentSchedule.filter((item) => item.id !== row.id)
                        }))
                      }
                      aria-label={`${t("delete")} ${row.stage || t("quotePaymentStage")}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      paymentSchedule: [
                        ...current.paymentSchedule,
                        { id: createPricingId("payment-stage"), stage: "", percent: "" }
                      ]
                    }))
                  }
                >
                  <Plus size={16} />
                  {t("quoteAddRow")}
                </Button>
                <p
                  className={`text-sm font-black tabular-nums ${
                    form.paymentSchedule.length &&
                    Math.round(form.paymentSchedule.reduce((sum, row) => sum + parseNonNegative(row.percent), 0)) !== 100
                      ? "text-coral"
                      : ""
                  }`}
                >
                  {t("quoteTotalLabel")} {form.paymentSchedule.reduce((sum, row) => sum + parseNonNegative(row.percent), 0)}%
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-black uppercase text-muted">{t("quotePolicySection")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quotePolicyIncludedRevisions")}</span>
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={form.policyRevisions}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, policyRevisions: event.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quotePolicyIncludedTrips")}</span>
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={form.policyTrips}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, policyTrips: event.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quotePolicyExtraRevisionFee")}</span>
                  <input
                    className={inputClass}
                    value={form.policyRevisionFee}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, policyRevisionFee: event.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quotePolicyExtraTripFee")}</span>
                  <input
                    className={inputClass}
                    value={form.policyTripFee}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, policyTripFee: event.target.value }))
                    }
                  />
                </label>
              </div>
              <p className="mt-3 inline-flex items-start gap-2 rounded-2xl bg-aqua/25 px-3 py-2 text-xs font-black leading-5 text-ink/62">
                <Link2 size={14} className="mt-0.5 shrink-0" />
                {t("quotePolicyFixedTermsHint")}
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)]">
              <div className="grid content-start gap-4">
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quoteSignature")}</span>
                  <input
                    className={inputClass}
                    value={form.signature}
                    onChange={(event) => setForm((current) => ({ ...current, signature: event.target.value }))}
                    placeholder={t("quoteSignature")}
                  />
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("quoteNotes")}</span>
                  <textarea
                    className={`${inputClass} min-h-24 resize-none rounded-studio p-4 leading-6`}
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
              </div>

              <div className="grid content-start gap-3 rounded-studio bg-white p-4 shadow-soft">
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-2">
                    <span className={fieldLabelClass}>{t("quoteDiscountPercent")}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className={inputClass}
                      value={form.discountPercent}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, discountPercent: event.target.value }))
                      }
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={fieldLabelClass}>{t("quoteTaxPercent")}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className={inputClass}
                      value={form.taxPercent}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, taxPercent: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="grid gap-1.5 text-sm font-bold">
                  <p className="flex items-center justify-between gap-3 text-muted">
                    <span>{t("quoteSubtotal")}</span>
                    <span className="tabular-nums text-ink">{formatMoney(totals.subtotal)}</span>
                  </p>
                  {totals.discount > 0 ? (
                    <p className="flex items-center justify-between gap-3 text-muted">
                      <span>{t("quoteDiscountPercent")}</span>
                      <span className="tabular-nums text-ink">−{formatMoney(totals.discount)}</span>
                    </p>
                  ) : null}
                  {totals.tax > 0 ? (
                    <p className="flex items-center justify-between gap-3 text-muted">
                      <span>{t("quoteTaxPercent")}</span>
                      <span className="tabular-nums text-ink">{formatMoney(totals.tax)}</span>
                    </p>
                  ) : null}
                  <p className="mt-1 flex items-center justify-between gap-3 rounded-full bg-limepop px-4 py-2.5 text-base font-black">
                    <span>{t("quoteTotal")}</span>
                    <span className="tabular-nums">{formatMoney(totals.total)}</span>
                  </p>
                </div>

                <div className="rounded-studio bg-ink p-4 text-white">
                  <p className="text-xs font-black uppercase text-white/60">{t("quoteMargin")}</p>
                  {margin ? (
                    <div className="mt-2 grid gap-1.5 text-sm font-bold">
                      <p className="flex items-center justify-between gap-3 text-white/70">
                        <span>{t("quoteMarginCost")}</span>
                        <span className="tabular-nums text-white">{formatMoney(margin.cost)}</span>
                      </p>
                      <p className="flex items-center justify-between gap-3 text-white/70">
                        <span>{t("quoteMarginProfit")}</span>
                        <span className={`tabular-nums ${margin.profit >= 0 ? "text-limepop" : "text-coral"}`}>
                          {formatMoney(margin.profit)}
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-3 text-white/70">
                        <span>{t("quoteMarginRate")}</span>
                        <span className="tabular-nums text-white">
                          {margin.marginPercent === null ? "—" : `${margin.marginPercent}%`}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-bold leading-5 text-white/60">
                      {t("quoteMarginNeedsProject")}
                    </p>
                  )}
                  <p className="mt-3 text-[11px] font-bold leading-4 text-white/45">
                    {t("quoteMarginInternalOnly")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.06] p-4 sm:p-6">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              <X size={17} />
              {t("cancel")}
            </Button>
            <Button type="submit" size="md" disabled={saving || !form.title.trim()}>
              <Save size={17} />
              {saving ? t("saving") : t("saveProjectFile")}
            </Button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
