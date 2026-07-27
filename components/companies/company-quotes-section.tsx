"use client";

import { useMemo, useState } from "react";
import { CopyPlus, FileDown, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { QuoteEditorModal } from "@/components/companies/quote-editor-modal";
import { QuoteExportModal } from "@/components/companies/quote-export-modal";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Pill } from "@/components/ui/pill";
import { SectionHeader } from "@/components/ui/section-header";
import { quotesApi } from "@/lib/api";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import { formatDemoEntityName, projectNameKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import type { Company, PricingTemplate, Project, Quote, QuoteStatus } from "@/lib/types";
import { formatNumber } from "@/lib/utils/money";
import { calculateProjectBudget } from "@/lib/utils/project-budget";
import { calculateQuoteMargin, calculateQuoteTotals } from "@/lib/utils/pricing-templates";
import { quoteStatusLabelKeys } from "@/lib/utils/quote-share";

const statusTone: Record<QuoteStatus, "aqua" | "lime" | "coral" | "dark" | "cloud"> = {
  draft: "cloud",
  sent: "aqua",
  accepted: "lime",
  declined: "dark",
  expired: "coral"
};

type CompanyQuotesSectionProps = {
  company: Company;
  quotes: Quote[];
  projects: Project[];
  pricingTemplates: PricingTemplate[];
  onChanged: () => Promise<void> | void;
};

export function CompanyQuotesSection({
  company,
  quotes,
  projects,
  pricingTemplates,
  onChanged
}: CompanyQuotesSectionProps) {
  const { language, t } = useI18n();
  const { exchangeRateSnapshot } = useCostDisplayCurrency();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [exportingQuote, setExportingQuote] = useState<Quote | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const pendingDelete = useMemo(
    () => quotes.find((quote) => quote.id === pendingDeleteId),
    [pendingDeleteId, quotes]
  );

  const openCreate = () => {
    setEditingQuote(null);
    setEditorOpen(true);
  };

  const openEdit = (quote: Quote) => {
    setEditingQuote(quote);
    setEditorOpen(true);
  };

  const exportQuote = (quote: Quote) => {
    setExportingQuote(quote);
  };

  const reviseQuote = async (quote: Quote) => {
    if (revisingId) {
      return;
    }

    setRevisingId(quote.id);

    try {
      await quotesApi.reviseQuote(quote.id);
      await onChanged();
    } finally {
      setRevisingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) {
      return;
    }

    await quotesApi.deleteQuote(pendingDeleteId);
    setPendingDeleteId(null);
    await onChanged();
  };

  const projectLabel = (projectId?: string) => {
    const project = projectId ? projectById.get(projectId) : undefined;

    if (!project) {
      return null;
    }

    return formatDemoEntityName(
      translateDomainLabel(project.name, projectNameKeys, t),
      project.id,
      "project",
      t,
      project.isExample
    );
  };

  return (
    <section className="mt-6">
      <SectionHeader
        eyebrow={t("quotesSectionBody")}
        title={t("quotesSection")}
        action={
          <Button size="md" onClick={openCreate}>
            <Plus size={18} />
            {t("newQuote")}
          </Button>
        }
      />

      {quotes.length === 0 ? (
        <Card tone="white" className="mt-4 p-6">
          <p className="inline-flex items-start gap-3 text-sm font-bold leading-6 text-muted">
            <FileText size={18} className="mt-0.5 shrink-0" />
            {t("quoteEmpty")}
          </p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {quotes.map((quote) => {
            const totals = calculateQuoteTotals(quote);
            const linkedProject = quote.projectId ? projectById.get(quote.projectId) : undefined;
            const margin = linkedProject?.budget
              ? calculateQuoteMargin(
                  quote,
                  calculateProjectBudget(linkedProject, {
                    currency: quote.currency,
                    snapshot: exchangeRateSnapshot
                  }).total,
                  quote.currency,
                  exchangeRateSnapshot
                )
              : null;
            const linkedProjectName = projectLabel(quote.projectId);

            return (
              <Card key={quote.id} tone="white" className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-muted">
                      {quote.code} · v{quote.version}
                    </p>
                    <h3 className="mt-1.5 break-words text-xl font-black leading-tight [overflow-wrap:anywhere]">
                      {quote.title}
                    </h3>
                  </div>
                  <Pill tone={statusTone[quote.status]} className="min-h-8 shrink-0 px-3 text-xs">
                    {t(quoteStatusLabelKeys[quote.status])}
                  </Pill>
                </div>

                <p className="mt-2 text-sm font-bold text-muted">
                  {formatLocalizedDate(quote.issuedOn, language)}
                  {quote.validUntil ? ` → ${formatLocalizedDate(quote.validUntil, language)}` : ""}
                  {quote.clientContact ? ` · ${quote.clientContact}` : ""}
                </p>
                {linkedProjectName ? (
                  <p className="mt-1 text-xs font-black text-ink/55">
                    {t("quoteLinkedProject")}: {linkedProjectName}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-muted">{t("quoteTotal")}</p>
                    <p className="mt-1 whitespace-nowrap text-2xl font-black tabular-nums">
                      {quote.currency} {formatNumber(totals.total)}
                    </p>
                    {margin ? (
                      <p className="mt-1 whitespace-nowrap text-xs font-black tabular-nums text-ink/55">
                        {t("quoteMarginProfit")}: {quote.currency} {formatNumber(margin.profit)}
                        {margin.marginPercent === null ? "" : ` · ${margin.marginPercent}%`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(quote)}
                      aria-label={`${t("editQuote")} ${quote.code}`}
                      className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-limepop hover:text-ink"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => exportQuote(quote)}
                      aria-label={`${t("quoteExport")} ${quote.code}`}
                      className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-aqua hover:text-ink"
                    >
                      <FileDown size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={revisingId !== null}
                      aria-busy={revisingId === quote.id}
                      onClick={() => {
                        void reviseQuote(quote);
                      }}
                      aria-label={`${t("quoteRevise")} ${quote.code}`}
                      className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-50"
                    >
                      <CopyPlus size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(quote.id)}
                      aria-label={`${t("delete")} ${quote.code}`}
                      className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-coral hover:text-white"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <QuoteExportModal
        open={Boolean(exportingQuote)}
        quote={exportingQuote}
        company={company}
        language={language}
        t={t}
        onClose={() => setExportingQuote(null)}
      />
      <QuoteEditorModal
        open={editorOpen}
        companyId={company.id}
        quote={editingQuote}
        projects={projects}
        pricingTemplates={pricingTemplates}
        t={t}
        onClose={() => setEditorOpen(false)}
        onSaved={onChanged}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteId)}
        title={t("deleteQuoteTitle")}
        description={`${t("deleteQuoteDescription")}${pendingDelete ? ` ${pendingDelete.code} · ${pendingDelete.title}` : ""}`}
        warning={t("deleteIrreversibleWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}
