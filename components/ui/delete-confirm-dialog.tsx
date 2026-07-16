"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";

type DeleteConfirmDialogProps = {
  acknowledgementLabel?: string;
  busy?: boolean;
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
  acknowledgementLabel,
  busy = false,
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
  const titleId = useId();
  const descriptionId = useId();
  const acknowledgementId = useId();
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setAcknowledged(false);
  }, [acknowledgementLabel, confirmLabel, description, open, title, warning]);

  const cancelDialog = () => {
    setAcknowledged(false);
    onCancel();
  };

  if (!open) {
    return null;
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-studio-lg bg-white p-6 text-ink shadow-lift"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-coral text-white">
            <AlertTriangle size={23} />
          </span>
          <button
            type="button"
            onClick={cancelDialog}
            disabled={busy}
            aria-label={t("close")}
            className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X size={19} />
          </button>
        </div>
        <h2 id={titleId} className="mt-4 text-3xl font-black leading-none">
          {title}
        </h2>
        <p id={descriptionId} className="mt-3 text-sm font-bold leading-6 text-muted">
          {description}
        </p>
        <div className="mt-5 rounded-studio bg-coral/12 p-4 text-sm font-black text-coral">
          {warning}
        </div>
        <label
          htmlFor={acknowledgementId}
          className="mt-4 flex cursor-pointer items-start gap-3 rounded-studio bg-cloud p-4 text-sm font-black leading-6"
        >
          <input
            id={acknowledgementId}
            type="checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-coral disabled:cursor-not-allowed"
          />
          <span>{acknowledgementLabel ?? t("deleteAcknowledgement")}</span>
        </label>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            variant="ghost"
            size="lg"
            onClick={cancelDialog}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              if (!acknowledged || busy) {
                return;
              }

              setAcknowledged(false);
              onConfirm();
            }}
            disabled={busy || !acknowledged}
            className="bg-coral text-white"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
