"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { ModalPortal } from "@/components/ui/modal-portal";
import { groupsApi } from "@/lib/api";
import { getProjectGroupDisplayName } from "@/lib/i18n/domain-labels";
import type { ProjectGroupSummary } from "@/lib/types";

export type ProjectGroupManagerMode = "create" | "edit" | "delete";

type ProjectGroupManagerModalProps = {
  groupSummaries: ProjectGroupSummary[];
  initialGroupId?: string;
  mode: ProjectGroupManagerMode;
  onChanged: () => Promise<void>;
  onClose: () => void;
  open: boolean;
};

type GroupForm = {
  description: string;
  name: string;
};

export function ProjectGroupManagerModal({
  groupSummaries,
  initialGroupId,
  mode,
  onChanged,
  onClose,
  open
}: ProjectGroupManagerModalProps) {
  const { language, t } = useI18n();
  const [form, setForm] = useState<GroupForm>({ description: "", name: "" });
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectGroupSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    const initialSummary =
      groupSummaries.find((summary) => summary.group.id === initialGroupId) ?? groupSummaries[0] ?? null;

    setForm(
      mode === "edit" && initialSummary
        ? {
            description: initialSummary.group.description,
            name: getProjectGroupDisplayName(initialSummary.group, language, t)
          }
        : { description: "", name: "" }
    );
    setSelectedGroupId(initialSummary?.group.id ?? "");
    setPendingDelete(null);
    setSubmitting(false);
    setError("");
  }, [groupSummaries, initialGroupId, language, mode, open, t]);

  const selectedSummary = useMemo(
    () => groupSummaries.find((summary) => summary.group.id === selectedGroupId) ?? null,
    [groupSummaries, selectedGroupId]
  );

  if (!open) {
    return null;
  }

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim()) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      if (mode === "edit") {
        if (!selectedSummary) {
          return;
        }

        await groupsApi.updateGroup(selectedSummary.group.id, { ...form, language });
      } else {
        await groupsApi.createGroup({ ...form, language });
      }
      await onChanged();
      onClose();
    } catch {
      setError(t(mode === "edit" ? "groupTypeUpdateError" : "groupTypeCreateError"));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await groupsApi.deleteGroup(pendingDelete.group.id);
      await onChanged();
      setPendingDelete(null);
      onClose();
    } catch {
      setError(t("groupTypeDeleteError"));
      setPendingDelete(null);
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "create" ? t("createGroupType") : mode === "edit" ? t("editGroupType") : t("deleteGroupType");
  const body =
    mode === "create"
      ? t("createGroupTypeBody")
      : mode === "edit"
        ? t("editGroupTypeBody")
        : t("deleteGroupTypeBody");
  const Icon = mode === "create" ? FolderPlus : mode === "edit" ? Pencil : Trash2;

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-[120] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-studio-lg bg-white p-5 text-ink shadow-lift sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="grid size-11 place-items-center rounded-full bg-limepop text-ink">
                  <Icon size={20} />
                </span>
                <h2 className="mt-4 text-3xl font-black leading-none">{title}</h2>
                <p className="mt-3 text-sm font-bold leading-6 text-muted">{body}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-cloud text-muted transition hover:bg-ink hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {mode !== "delete" ? (
              <form onSubmit={submitForm} className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-black">{t("groupTypeName")}</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("groupTypeNamePlaceholder")}
                    className="h-12 rounded-full border-0 bg-cloud px-4 text-sm font-bold outline-none ring-1 ring-black/[0.04] focus:bg-white focus:ring-2 focus:ring-coral"
                    required
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-black">{t("groupTypeDescription")}</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder={t("groupTypeDescriptionPlaceholder")}
                    rows={4}
                    className="resize-none rounded-[1.5rem] border-0 bg-cloud px-4 py-3 text-sm font-bold outline-none ring-1 ring-black/[0.04] focus:bg-white focus:ring-2 focus:ring-coral"
                  />
                </label>
                {error ? <p className="rounded-studio bg-coral/10 p-3 text-sm font-black text-coral">{error}</p> : null}
                <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="ghost" size="lg" onClick={onClose}>{t("cancel")}</Button>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting || !form.name.trim() || (mode === "edit" && !selectedSummary)}
                  >
                    {mode === "edit" ? <Pencil size={18} /> : <FolderPlus size={18} />}
                    {mode === "edit" ? t("saveGroupType") : t("createGroupType")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-black">{t("projectGroupsCount")}</span>
                  <select
                    value={selectedGroupId}
                    onChange={(event) => {
                      setSelectedGroupId(event.target.value);
                      setError("");
                    }}
                    className="h-12 rounded-full border-0 bg-cloud px-4 text-sm font-bold outline-none ring-1 ring-black/[0.04] focus:bg-white focus:ring-2 focus:ring-coral"
                  >
                    {groupSummaries.map((summary) => (
                      <option key={summary.group.id} value={summary.group.id}>
                        {getProjectGroupDisplayName(summary.group, language, t)}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedSummary ? (
                  <div className="rounded-studio bg-cloud p-4">
                    <p className="text-xl font-black">
                      {getProjectGroupDisplayName(selectedSummary.group, language, t)}
                    </p>
                    <p className="mt-2 text-sm font-bold text-muted">
                      {selectedSummary.totalProjectCount} {t("projectsCount")}
                    </p>
                  </div>
                ) : null}

                {error ? <p className="rounded-studio bg-coral/10 p-3 text-sm font-black text-coral">{error}</p> : null}

                <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="ghost" size="lg" onClick={onClose}>{t("cancel")}</Button>
                  <Button
                    type="button"
                    size="lg"
                    disabled={!selectedSummary || submitting}
                    onClick={() => setPendingDelete(selectedSummary)}
                  >
                    <Trash2 size={18} />
                    {t("deleteGroupType")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalPortal>

      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("deleteGroupType")}
        description={`${t("deleteGroupTypeConfirmBody")} ${
          pendingDelete ? getProjectGroupDisplayName(pendingDelete.group, language, t) : ""
        }`}
        warning={t("deleteGroupTypeWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
