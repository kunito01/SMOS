"use client";

import { useId, useState } from "react";
import { Download, FileJson, FileText, Paperclip, Trash2 } from "lucide-react";
import type { ProjectWorkflowAttachment } from "@/lib/types";
import {
  downloadWorkflowAttachment,
  readWorkflowAttachmentFile,
  WorkflowAttachmentReadError
} from "@/lib/utils/workflow-share";
import { cn } from "@/lib/utils/cn";

export type WorkflowAttachmentLabels = {
  attachment: string;
  attachmentTooLarge: string;
  downloadAttachment: string;
  invalidJson: string;
  invalidUtf8: string;
  removeAttachment: string;
  replaceAttachment: string;
  unsupportedAttachment: string;
  uploadAttachment: string;
};

const defaultLabels: WorkflowAttachmentLabels = {
  attachment: "Attachment",
  attachmentTooLarge: "The file must be 1 MiB or smaller.",
  downloadAttachment: "Download attachment",
  invalidJson: "Select a valid JSON file.",
  invalidUtf8: "The file must contain valid UTF-8 text.",
  removeAttachment: "Remove attachment",
  replaceAttachment: "Replace attachment",
  unsupportedAttachment: "Only .json and .md files are supported.",
  uploadAttachment: "Upload JSON or MD"
};

type WorkflowAttachmentControlProps = {
  attachment?: ProjectWorkflowAttachment;
  className?: string;
  labels?: Partial<WorkflowAttachmentLabels>;
  mode: "edit" | "readonly";
  onChange?: (attachment?: ProjectWorkflowAttachment) => void;
};

export function WorkflowAttachmentControl({
  attachment,
  className,
  labels: labelOverrides,
  mode,
  onChange
}: WorkflowAttachmentControlProps) {
  const inputId = useId();
  const labels = { ...defaultLabels, ...labelOverrides };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const AttachmentIcon = attachment?.kind === "json" ? FileJson : FileText;

  const selectFile = async (file: File) => {
    setBusy(true);
    setError("");

    try {
      onChange?.(await readWorkflowAttachmentFile(file));
    } catch (cause) {
      if (cause instanceof WorkflowAttachmentReadError) {
        setError(
          cause.code === "too-large"
            ? labels.attachmentTooLarge
            : cause.code === "invalid-json"
              ? labels.invalidJson
              : cause.code === "invalid-utf8"
                ? labels.invalidUtf8
                : labels.unsupportedAttachment
        );
      } else {
        setError(labels.unsupportedAttachment);
      }
    } finally {
      setBusy(false);
    }
  };

  if (mode === "readonly" && !attachment) {
    return null;
  }

  return (
    <div
      className={cn("nodrag nopan nowheel min-w-0", className)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {attachment ? (
        <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-ink/92 p-1 text-white shadow-soft">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/12" aria-hidden="true">
            <AttachmentIcon size={14} strokeWidth={2.2} />
          </span>
          <button
            type="button"
            onClick={() => downloadWorkflowAttachment(attachment)}
            className="min-w-0 flex-1 truncate px-1 text-left text-[11px] font-bold leading-none text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-limepop"
            title={`${labels.downloadAttachment}: ${attachment.fileName}`}
            aria-label={`${labels.downloadAttachment}: ${attachment.fileName}`}
          >
            {attachment.fileName}
          </button>
          <button
            type="button"
            onClick={() => downloadWorkflowAttachment(attachment)}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-white/12 transition hover:bg-limepop hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-limepop"
            aria-label={`${labels.downloadAttachment}: ${attachment.fileName}`}
          >
            <Download size={13} strokeWidth={2.3} />
          </button>
          {mode === "edit" ? (
            <>
              <label
                htmlFor={inputId}
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full bg-white/12 transition hover:bg-aqua hover:text-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-aqua"
                title={labels.replaceAttachment}
              >
                <Paperclip size={13} strokeWidth={2.3} />
                <span className="sr-only">{labels.replaceAttachment}</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  onChange?.(undefined);
                }}
                className="grid size-7 shrink-0 place-items-center rounded-full bg-white/12 transition hover:bg-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-coral"
                aria-label={labels.removeAttachment}
              >
                <Trash2 size={13} strokeWidth={2.3} />
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="inline-flex min-h-8 max-w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-ink px-3 text-[11px] font-bold text-white shadow-soft transition hover:bg-coral focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-coral"
        >
          <Paperclip size={13} strokeWidth={2.3} />
          <span className="truncate">{busy ? `${labels.attachment}…` : labels.uploadAttachment}</span>
        </label>
      )}

      {mode === "edit" ? (
        <input
          id={inputId}
          type="file"
          accept=".json,.md,application/json,text/markdown,text/plain"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";

            if (file) {
              void selectFile(file);
            }
          }}
        />
      ) : null}

      {error ? (
        <p className="mt-1.5 rounded-xl bg-coral px-2 py-1.5 text-[10px] font-bold leading-tight text-white" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
