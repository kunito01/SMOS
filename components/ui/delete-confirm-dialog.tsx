"use client";

import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";

type DeleteConfirmDialogProps = {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  warning: string;
};

export function DeleteConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  title,
  warning
}: DeleteConfirmDialogProps) {
  const { t } = useI18n();

  if (!open) {
    return null;
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
        className="w-full max-w-lg rounded-studio-lg bg-white p-6 text-ink shadow-lift"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-coral text-white">
            <AlertTriangle size={23} />
          </span>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("close")}
            className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-ink hover:text-white"
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="delete-confirm-title" className="mt-4 text-3xl font-black leading-none">
          {title}
        </h2>
        <p id="delete-confirm-description" className="mt-3 text-sm font-bold leading-6 text-muted">
          {description}
        </p>
        <div className="mt-5 rounded-studio bg-coral/12 p-4 text-sm font-black text-coral">
          {warning}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button variant="ghost" size="lg" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" size="lg" onClick={onConfirm} className="bg-coral text-white">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
