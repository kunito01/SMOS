"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { FileDown, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import type { Language, TranslationKey } from "@/lib/i18n/translations";
import type { Company, Quote } from "@/lib/types";
import { buildQuoteReportData, createQuoteReportHtml } from "@/lib/utils/quote-share";
import { downloadReportHtmlFile, sanitizeReportFileName } from "@/lib/utils/report-share-common";

type QuoteExportModalProps = {
  open: boolean;
  quote: Quote | null;
  company: Company;
  language: Language;
  t: (key: TranslationKey) => string;
  onClose: () => void;
};

export function QuoteExportModal({ open, quote, company, language, t, onClose }: QuoteExportModalProps) {
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  const html = useMemo(
    () => (quote ? createQuoteReportHtml(buildQuoteReportData({ quote, company, language, t })) : ""),
    [company, language, quote, t]
  );

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open || !quote) {
    return null;
  }

  const downloadHtml = () => {
    downloadReportHtmlFile(html, sanitizeReportFileName(`${quote.code} ${quote.title}`, "Quote"));
  };

  const printPdf = () => {
    const frameWindow = previewFrameRef.current?.contentWindow;

    if (!frameWindow) {
      return;
    }

    // Printing the iframe keeps the export's own @media print styles, so the
    // saved PDF matches the HTML download exactly.
    frameWindow.focus();
    frameWindow.print();
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[95] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="mx-auto flex h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-studio-lg bg-[#f8fbf2] shadow-lift ring-1 ring-black/[0.08] sm:h-[calc(100dvh-3rem)]">
          <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-4 sm:p-6">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase text-muted">
                {quote.code} · v{quote.version}
              </p>
              <h2 id={titleId} className="mt-1 text-3xl font-black leading-none">{t("quoteExportPreview")}</h2>
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

          <div className="min-h-0 flex-1 p-4 sm:p-6 sm:pt-4">
            <iframe
              ref={previewFrameRef}
              srcDoc={html}
              title={t("quoteExportPreview")}
              className="size-full rounded-studio bg-white shadow-soft ring-1 ring-black/[0.06]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] p-4 sm:p-6">
            <p className="min-w-0 max-w-md text-xs font-bold leading-5 text-muted">
              {t("quoteExportPdfHint")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                <X size={17} />
                {t("cancel")}
              </Button>
              <Button type="button" variant="secondary" size="md" onClick={printPdf}>
                <Printer size={17} />
                {t("quoteExportPdf")}
              </Button>
              <Button type="button" size="md" onClick={downloadHtml}>
                <FileDown size={17} />
                {t("quoteExportHtml")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
