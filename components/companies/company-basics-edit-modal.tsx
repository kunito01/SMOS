"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Save, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { companiesApi } from "@/lib/api";
import type { CompanyBasicsInput } from "@/lib/api/companies";
import { formatDemoEntityName } from "@/lib/i18n/domain-labels";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Company } from "@/lib/types";
import { MAX_UPLOAD_IMAGE_BYTES } from "@/lib/utils/image-upload";

type CompanyBasicsEditModalProps = {
  company: Company;
  open: boolean;
  t: (key: TranslationKey) => string;
  onClose: () => void;
  onSaved: (company: Company) => void;
};

const maxCoverBytes = MAX_UPLOAD_IMAGE_BYTES;
const allowedCoverTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const inputClass =
  "min-h-11 w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-coral focus:ring-4 focus:ring-coral/10";
const fieldLabelClass = "text-xs font-black uppercase text-muted";

export function CompanyBasicsEditModal({
  company,
  open,
  t,
  onClose,
  onSaved
}: CompanyBasicsEditModalProps) {
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description);
  const [coverImage, setCoverImage] = useState(company.coverImage);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(company.name);
    setDescription(company.description);
    setCoverImage(company.coverImage);
    setError("");
    setSaving(false);
  }, [company, open]);

  if (!open) {
    return null;
  }

  const handleCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!allowedCoverTypes.has(file.type)) {
      setError(t("companyCoverUnsupported"));
      event.target.value = "";
      return;
    }

    if (file.size > maxCoverBytes) {
      setError(t("companyCoverTooLarge"));
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCoverImage(reader.result);
        setError("");
      }
    };
    reader.onerror = () => setError(t("companyCoverUnsupported"));
    reader.readAsDataURL(file);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim() || !description.trim()) {
      return;
    }

    setSaving(true);
    const payload: CompanyBasicsInput = {
      coverImage,
      description,
      name
    };
    const nextCompany = await companiesApi.updateCompanyBasics(company.id, payload);
    setSaving(false);
    onSaved(nextCompany);
    onClose();
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[90] flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm sm:p-6"
        role="dialog"
        aria-modal="true"
      >
        <form
          onSubmit={save}
          className="mx-auto flex max-h-[calc(100dvh-1.5rem)] max-w-4xl flex-col overflow-hidden rounded-studio-lg bg-[#f8fbf2] shadow-lift ring-1 ring-black/[0.08] sm:max-h-[calc(100dvh-3rem)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-4 sm:p-6">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase text-muted">{t("editCompanyBasics")}</p>
              <h2 className="mt-1 text-3xl font-black leading-none">{t("companyOverview")}</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">
                {t("editCompanyBasicsBody")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-soft"
              aria-label={t("cancel")}
            >
              <X size={20} />
            </button>
          </div>

          <div className="studio-scroll flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.62fr)_minmax(280px,0.38fr)]">
              <div className="grid content-start gap-4">
                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("brandName")}</span>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("brandNamePlaceholder")}
                  />
                </label>

                <label className="grid gap-2">
                  <span className={fieldLabelClass}>{t("brandIntro")}</span>
                  <textarea
                    className={`${inputClass} min-h-36 resize-none rounded-studio p-4 leading-6`}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("brandIntroPlaceholder")}
                  />
                </label>

                <div className="grid gap-2">
                  <span className={fieldLabelClass}>{t("brandCoverImage")}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCoverChange}
                    className="hidden"
                    id="company-cover-upload"
                  />
                  <label
                    htmlFor="company-cover-upload"
                    className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white shadow-soft transition hover:-translate-y-0.5"
                  >
                    <Upload size={18} />
                    {t("uploadCompanyCover")}
                  </label>
                  <p className="text-xs font-bold leading-5 text-muted">{t("companyCoverUploadHint")}</p>
                  {error ? <p className="text-sm font-black text-coral">{error}</p> : null}
                </div>
              </div>

              <div className="rounded-studio bg-white p-3 shadow-soft">
                <p className="mb-3 text-xs font-black uppercase text-muted">{t("companyCoverPreview")}</p>
                <div
                  className="flex min-h-72 flex-col justify-end overflow-hidden rounded-studio bg-cover bg-center p-4 text-white"
                  style={{ backgroundImage: `linear-gradient(180deg, transparent 38%, rgba(0,0,0,0.58)), url(${coverImage})` }}
                >
                  <span className="mb-auto grid size-11 place-items-center rounded-full bg-white/20 text-white backdrop-blur">
                    <ImagePlus size={20} />
                  </span>
                  <p className="text-sm font-bold text-white/80">{t("companyCoverPreview")}</p>
                  <h3 className="mt-1 text-2xl font-black leading-none">
                    {name ? formatDemoEntityName(name, company.id, "company", t) : t("brandName")}
                  </h3>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.06] p-4 sm:p-6">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              <X size={17} />
              {t("cancel")}
            </Button>
            <Button type="submit" size="md" disabled={saving || !name.trim() || !description.trim()}>
              <Save size={17} />
              {saving ? t("loading") : t("saveCompanyBasics")}
            </Button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
