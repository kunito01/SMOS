"use client";

import { useMemo } from "react";
import { ReportExportModal } from "@/components/share/report-export-modal";
import type { Language, TranslationKey } from "@/lib/i18n/translations";
import type { Company, Quote } from "@/lib/types";
import { buildQuoteReportData, createQuoteReportHtml } from "@/lib/utils/quote-share";
import { sanitizeReportFileName } from "@/lib/utils/report-share-common";

type QuoteExportModalProps = {
  open: boolean;
  quote: Quote | null;
  company: Company;
  language: Language;
  t: (key: TranslationKey) => string;
  onClose: () => void;
};

export function QuoteExportModal({ open, quote, company, language, t, onClose }: QuoteExportModalProps) {
  const html = useMemo(
    () => (quote ? createQuoteReportHtml(buildQuoteReportData({ quote, company, language, t })) : ""),
    [company, language, quote, t]
  );

  return (
    <ReportExportModal
      open={open && Boolean(quote)}
      eyebrow={quote ? `${quote.code} · v${quote.version}` : undefined}
      html={html}
      fileName={quote ? sanitizeReportFileName(`${quote.code} ${quote.title}`, "Quote") : ""}
      t={t}
      onClose={onClose}
    />
  );
}
