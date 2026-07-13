"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { KeyRound, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  formatWorkspaceCode,
  isValidWorkspaceCode,
  sanitizeWorkspaceCodeInput
} from "@/lib/security/workspace-crypto";

type WorkspaceKeyDialogProps = {
  busy?: boolean;
  confirmLabel?: string;
  description?: string;
  error?: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (workspaceCode: string) => void | Promise<void>;
  title?: string;
};

export function WorkspaceKeyDialog({
  busy = false,
  confirmLabel,
  description,
  error,
  open,
  onCancel,
  onConfirm,
  title
}: WorkspaceKeyDialogProps) {
  const { t } = useI18n();
  const [workspaceCode, setWorkspaceCode] = useState("");
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) {
      setWorkspaceCode("");
      return;
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busy) {
          event.preventDefault();
          onCancel();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );

      if (!focusableElements?.length) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) {
    return null;
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isValidWorkspaceCode(workspaceCode) && !busy) {
      void onConfirm(workspaceCode);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[150] grid place-items-center bg-ink/52 px-4 py-6 backdrop-blur-md">
        <form
          ref={dialogRef}
          onSubmit={submit}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
          aria-busy={busy}
          className="w-full max-w-lg overflow-hidden rounded-studio-lg bg-[#1c2328] text-white shadow-[0_32px_100px_rgba(12,20,24,0.42)] ring-1 ring-white/10"
        >
          <div className="flex items-start justify-between gap-4 bg-coral px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/18">
                <ShieldCheck size={22} />
              </span>
              <div>
                <h2 id={titleId} className="text-2xl font-black">
                  {title ?? t("workspaceUnlockTitle")}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              aria-label={t("close")}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/16 transition hover:bg-white/24 disabled:opacity-45"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 sm:p-6">
            <p id={descriptionId} className="text-sm font-bold leading-6 text-white/62">
              {description ?? t("workspaceUnlockBody")}
            </p>
            <label className="mt-5 block">
              <span className="flex items-center gap-2 text-sm font-black text-white/68">
                <KeyRound size={17} />
                {t("workspaceKeyLabel")}
              </span>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={formatWorkspaceCode(workspaceCode)}
                onChange={(event) => setWorkspaceCode(sanitizeWorkspaceCodeInput(event.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="mt-3 h-16 w-full rounded-studio bg-white/[0.08] px-3 text-center font-mono text-[clamp(1rem,5vw,1.5rem)] font-black tracking-[0.08em] text-limepop outline-none ring-1 ring-white/12 transition focus:ring-2 focus:ring-limepop"
              />
            </label>

            {error ? (
              <p id={errorId} role="alert" className="mt-4 rounded-studio bg-coral/18 p-4 text-sm font-black leading-6 text-[#ffb7a8]">
                {error}
              </p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={busy} className="w-full bg-white/10 text-white hover:bg-white/18">
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                disabled={busy || !isValidWorkspaceCode(workspaceCode)}
                className="w-full"
              >
                <KeyRound size={18} />
                {busy ? t("loading") : confirmLabel ?? t("workspaceUnlockAction")}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
