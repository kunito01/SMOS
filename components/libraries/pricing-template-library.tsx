"use client";

import { useMemo, useState } from "react";
import { BadgePercent, Pencil, Plus, Ruler, Save, Timer, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Pill } from "@/components/ui/pill";
import { SectionHeader } from "@/components/ui/section-header";
import { librariesApi } from "@/lib/api";
import type { PricingTemplateInput } from "@/lib/api/libraries";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PricingAreaMode, PricingTemplate, PricingTemplateKind } from "@/lib/types";
import { formatNumber, type MoneyCurrency } from "@/lib/utils/money";
import {
  createPricingId,
  evaluatePricingTemplate,
  pricingAreaModes,
  pricingTemplateKinds
} from "@/lib/utils/pricing-templates";

export const pricingKindLabelKeys: Record<PricingTemplateKind, TranslationKey> = {
  "area-tier": "pricingKindArea",
  "style-minute": "pricingKindStyle",
  "cost-markup": "pricingKindCost"
};

const areaModeLabelKeys: Record<PricingAreaMode, TranslationKey> = {
  "unit-price": "pricingAreaModeUnit",
  progressive: "pricingAreaModeProgressive",
  flat: "pricingAreaModeFlat"
};

const kindTone: Record<PricingTemplateKind, "aqua" | "lime" | "coral"> = {
  "area-tier": "aqua",
  "style-minute": "coral",
  "cost-markup": "lime"
};

const kindIcon: Record<PricingTemplateKind, typeof Ruler> = {
  "area-tier": Ruler,
  "style-minute": Timer,
  "cost-markup": BadgePercent
};

const currencyOptions: MoneyCurrency[] = ["CNY", "USD", "JPY", "EUR"];

type TierRow = { id: string; minArea: string; maxArea: string; price: string };
type LevelRow = { id: string; name: string; minuteRate: string };

type PricingForm = {
  name: string;
  kind: PricingTemplateKind;
  currency: MoneyCurrency;
  minimumFee: string;
  areaMode: PricingAreaMode;
  tiers: TierRow[];
  levels: LevelRow[];
  overheadPercent: string;
  markupPercent: string;
};

type PreviewInputs = {
  area: string;
  minutes: string;
  styleLevelId: string;
  costBasis: string;
};

const emptyPreview: PreviewInputs = { area: "", minutes: "", styleLevelId: "", costBasis: "" };

const createDefaultForm = (): PricingForm => ({
  name: "",
  kind: "area-tier",
  currency: "CNY",
  minimumFee: "",
  areaMode: "unit-price",
  tiers: [
    { id: createPricingId("tier"), minArea: "0", maxArea: "100", price: "" },
    { id: createPricingId("tier"), minArea: "100", maxArea: "", price: "" }
  ],
  levels: [
    { id: createPricingId("level"), name: "", minuteRate: "" },
    { id: createPricingId("level"), name: "", minuteRate: "" }
  ],
  overheadPercent: "10",
  markupPercent: "30"
});

const templateToForm = (template: PricingTemplate): PricingForm => ({
  name: template.name,
  kind: template.kind,
  currency: template.currency,
  minimumFee: template.minimumFee ? String(template.minimumFee) : "",
  areaMode: template.area?.mode ?? "unit-price",
  tiers: template.area?.tiers.map((tier) => ({
    id: tier.id,
    minArea: String(tier.minArea),
    maxArea: tier.maxArea === undefined ? "" : String(tier.maxArea),
    price: String(tier.price)
  })) ?? createDefaultForm().tiers,
  levels: template.style?.levels.map((level) => ({
    id: level.id,
    name: level.name,
    minuteRate: String(level.minuteRate)
  })) ?? createDefaultForm().levels,
  overheadPercent: template.cost ? String(template.cost.overheadPercent) : "10",
  markupPercent: template.cost ? String(template.cost.markupPercent) : "30"
});

const parseNonNegative = (value: string) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const formToPayload = (form: PricingForm): PricingTemplateInput | null => {
  if (!form.name.trim()) {
    return null;
  }

  const minimumFee = parseNonNegative(form.minimumFee);
  const base = {
    name: form.name.trim(),
    kind: form.kind,
    currency: form.currency,
    minimumFee: minimumFee > 0 ? minimumFee : undefined
  };

  if (form.kind === "area-tier") {
    const tiers = form.tiers
      .filter((tier) => tier.price.trim() !== "")
      .map((tier) => ({
        id: tier.id,
        minArea: parseNonNegative(tier.minArea),
        maxArea: tier.maxArea.trim() === "" ? undefined : parseNonNegative(tier.maxArea),
        price: parseNonNegative(tier.price)
      }))
      .filter((tier) => tier.maxArea === undefined || tier.maxArea > tier.minArea);

    return tiers.length ? { ...base, area: { mode: form.areaMode, tiers } } : null;
  }

  if (form.kind === "style-minute") {
    const levels = form.levels
      .filter((level) => level.name.trim() && level.minuteRate.trim() !== "")
      .map((level) => ({
        id: level.id,
        name: level.name.trim(),
        minuteRate: parseNonNegative(level.minuteRate)
      }));

    return levels.length ? { ...base, style: { levels } } : null;
  }

  return {
    ...base,
    cost: {
      overheadPercent: parseNonNegative(form.overheadPercent),
      markupPercent: parseNonNegative(form.markupPercent)
    }
  };
};

type PricingTemplateLibraryProps = {
  templates: PricingTemplate[];
  onChanged: () => Promise<void>;
};

export function PricingTemplateLibrary({ templates, onChanged }: PricingTemplateLibraryProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<PricingForm>(createDefaultForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, PreviewInputs>>({});

  const pendingDelete = useMemo(
    () => templates.find((template) => template.id === pendingDeleteId),
    [pendingDeleteId, templates]
  );

  const formatMoney = (currency: MoneyCurrency, amount: number) =>
    `${currency} ${formatNumber(amount)}`;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = formToPayload(form);

    if (!payload) {
      return;
    }

    if (editingId) {
      await librariesApi.updatePricingTemplate(editingId, payload);
    } else {
      await librariesApi.addPricingTemplate(payload);
    }

    setForm(createDefaultForm());
    setFormOpen(false);
    setEditingId(null);
    await onChanged();
  };

  const startEditing = (template: PricingTemplate) => {
    setEditingId(template.id);
    setForm(templateToForm(template));
    setFormOpen(true);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setForm(createDefaultForm());
    setFormOpen(false);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) {
      return;
    }

    await librariesApi.deletePricingTemplate(pendingDeleteId);
    if (editingId === pendingDeleteId) {
      cancelEditing();
    }
    setPendingDeleteId(null);
    await onChanged();
  };

  const setPreview = (templateId: string, patch: Partial<PreviewInputs>) => {
    setPreviews((current) => ({
      ...current,
      [templateId]: { ...emptyPreview, ...current[templateId], ...patch }
    }));
  };

  const inputClass =
    "h-11 min-w-0 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]";
  const selectClass = `${inputClass} appearance-none`;

  const renderPreview = (template: PricingTemplate) => {
    const preview = previews[template.id] ?? emptyPreview;
    const inputs = {
      area: preview.area.trim() === "" ? undefined : parseNonNegative(preview.area),
      minutes: preview.minutes.trim() === "" ? undefined : parseNonNegative(preview.minutes),
      styleLevelId: preview.styleLevelId || template.style?.levels[0]?.id,
      costBasis: preview.costBasis.trim() === "" ? undefined : parseNonNegative(preview.costBasis)
    };
    const hasInput =
      template.kind === "area-tier"
        ? inputs.area !== undefined
        : template.kind === "style-minute"
          ? inputs.minutes !== undefined
          : inputs.costBasis !== undefined;
    const evaluation = hasInput ? evaluatePricingTemplate(template, inputs) : null;

    return (
      <div className="mt-3 grid gap-2 rounded-studio bg-cloud/70 p-3">
        <p className="text-xs font-black uppercase text-ink/55">{t("pricingPreview")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {template.kind === "area-tier" ? (
            <input
              type="number"
              min="0"
              value={preview.area}
              onChange={(event) => setPreview(template.id, { area: event.target.value })}
              placeholder={t("pricingPreviewArea")}
              className={inputClass}
            />
          ) : null}
          {template.kind === "style-minute" ? (
            <>
              <select
                value={inputs.styleLevelId ?? ""}
                onChange={(event) => setPreview(template.id, { styleLevelId: event.target.value })}
                aria-label={t("pricingSelectLevel")}
                className={selectClass}
              >
                {(template.style?.levels ?? []).map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name} · {formatMoney(template.currency, level.minuteRate)}/min
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={preview.minutes}
                onChange={(event) => setPreview(template.id, { minutes: event.target.value })}
                placeholder={t("pricingPreviewMinutes")}
                className={inputClass}
              />
            </>
          ) : null}
          {template.kind === "cost-markup" ? (
            <input
              type="number"
              min="0"
              value={preview.costBasis}
              onChange={(event) => setPreview(template.id, { costBasis: event.target.value })}
              placeholder={t("pricingPreviewCostBasis")}
              className={inputClass}
            />
          ) : null}
        </div>
        {evaluation ? (
          <p className="text-sm font-black">
            {evaluation.error === "no-matching-tier"
              ? t("pricingNoTierMatched")
              : `${t("pricingPreviewResult")}: ${formatMoney(template.currency, Math.round(evaluation.amount))}${
                  evaluation.minimumApplied ? ` · ${t("pricingMinimumApplied")}` : ""
                }`}
          </p>
        ) : null}
      </div>
    );
  };

  const renderTemplateDetails = (template: PricingTemplate) => {
    if (template.kind === "area-tier" && template.area) {
      return (
        <div className="mt-3 grid gap-1.5">
          <p className="text-xs font-black text-ink/55">{t(areaModeLabelKeys[template.area.mode])}</p>
          {template.area.tiers.map((tier) => (
            <p key={tier.id} className="flex items-center justify-between gap-3 text-sm font-bold">
              <span className="text-muted">
                {tier.maxArea === undefined
                  ? `${formatNumber(tier.minArea)} ㎡ ${t("pricingTierOpenEnded")}`
                  : `${formatNumber(tier.minArea)}–${formatNumber(tier.maxArea)} ㎡`}
              </span>
              <span className="tabular-nums">{formatMoney(template.currency, tier.price)}</span>
            </p>
          ))}
        </div>
      );
    }

    if (template.kind === "style-minute" && template.style) {
      return (
        <div className="mt-3 grid gap-1.5">
          {template.style.levels.map((level) => (
            <p key={level.id} className="flex items-center justify-between gap-3 text-sm font-bold">
              <span className="text-muted">{level.name}</span>
              <span className="tabular-nums">{formatMoney(template.currency, level.minuteRate)}/min</span>
            </p>
          ))}
        </div>
      );
    }

    if (template.kind === "cost-markup" && template.cost) {
      return (
        <div className="mt-3 grid gap-1.5 text-sm font-bold">
          <p className="flex items-center justify-between gap-3">
            <span className="text-muted">{t("pricingOverheadPercent")}</span>
            <span className="tabular-nums">{template.cost.overheadPercent}%</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span className="text-muted">{t("pricingMarkupPercent")}</span>
            <span className="tabular-nums">{template.cost.markupPercent}%</span>
          </p>
        </div>
      );
    }

    return null;
  };

  return (
    <section className="mt-6">
      <Card tone="white" className="p-5 sm:p-6">
        <SectionHeader
          eyebrow={t("templateReusable")}
          title={t("pricingTemplateLibrary")}
          action={
            formOpen ? null : (
              <Button size="md" onClick={() => setFormOpen(true)}>
                <Plus size={18} />
                {t("addPricingTemplate")}
              </Button>
            )
          }
        />
        <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-muted">
          {t("pricingTemplateLibraryBody")}
        </p>

        {formOpen ? (
          <form onSubmit={submit} className="mt-5 grid gap-3 rounded-studio bg-cloud/70 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(7rem,0.5fr)_minmax(0,0.8fr)]">
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={t("pricingTemplateName")}
                className={inputClass}
              />
              <select
                value={form.kind}
                onChange={(event) =>
                  setForm((current) => ({ ...current, kind: event.target.value as PricingTemplateKind }))
                }
                disabled={Boolean(editingId)}
                aria-label={t("pricingTemplateLibrary")}
                className={`${selectClass} disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55`}
              >
                {pricingTemplateKinds.map((kind) => (
                  <option key={kind} value={kind}>{t(pricingKindLabelKeys[kind])}</option>
                ))}
              </select>
              <select
                value={form.currency}
                onChange={(event) =>
                  setForm((current) => ({ ...current, currency: event.target.value as MoneyCurrency }))
                }
                aria-label={t("currency")}
                className={selectClass}
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={form.minimumFee}
                onChange={(event) => setForm((current) => ({ ...current, minimumFee: event.target.value }))}
                placeholder={t("pricingMinimumFee")}
                className={inputClass}
              />
            </div>

            {form.kind === "area-tier" ? (
              <div className="grid gap-3">
                <select
                  value={form.areaMode}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, areaMode: event.target.value as PricingAreaMode }))
                  }
                  aria-label={t("pricingAreaMode")}
                  className={`${selectClass} md:max-w-xs`}
                >
                  {pricingAreaModes.map((mode) => (
                    <option key={mode} value={mode}>{t(areaModeLabelKeys[mode])}</option>
                  ))}
                </select>
                {form.tiers.map((tier, index) => (
                  <div key={tier.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <input
                      type="number"
                      min="0"
                      value={tier.minArea}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          tiers: current.tiers.map((row) =>
                            row.id === tier.id ? { ...row, minArea: event.target.value } : row
                          )
                        }))
                      }
                      placeholder={t("pricingTierFrom")}
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min="0"
                      value={tier.maxArea}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          tiers: current.tiers.map((row) =>
                            row.id === tier.id ? { ...row, maxArea: event.target.value } : row
                          )
                        }))
                      }
                      placeholder={`${t("pricingTierTo")} (${t("pricingTierOpenEnded")})`}
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min="0"
                      value={tier.price}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          tiers: current.tiers.map((row) =>
                            row.id === tier.id ? { ...row, price: event.target.value } : row
                          )
                        }))
                      }
                      placeholder={t("pricingTierPrice")}
                      className={inputClass}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={form.tiers.length <= 1}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          tiers: current.tiers.filter((row) => row.id !== tier.id)
                        }))
                      }
                      aria-label={`${t("delete")} ${index + 1}`}
                    >
                      <Trash2 size={16} />
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
                      tiers: [
                        ...current.tiers,
                        {
                          id: createPricingId("tier"),
                          minArea: current.tiers.at(-1)?.maxArea ?? "",
                          maxArea: "",
                          price: ""
                        }
                      ]
                    }))
                  }
                >
                  <Plus size={16} />
                  {t("pricingAddTier")}
                </Button>
              </div>
            ) : null}

            {form.kind === "style-minute" ? (
              <div className="grid gap-3">
                <p className="px-1 text-xs font-black text-ink/62">{t("pricingStyleLevels")}</p>
                {form.levels.map((level, index) => (
                  <div key={level.id} className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                    <input
                      value={level.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          levels: current.levels.map((row) =>
                            row.id === level.id ? { ...row, name: event.target.value } : row
                          )
                        }))
                      }
                      placeholder={t("pricingStyleLevelName")}
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min="0"
                      value={level.minuteRate}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          levels: current.levels.map((row) =>
                            row.id === level.id ? { ...row, minuteRate: event.target.value } : row
                          )
                        }))
                      }
                      placeholder={t("pricingMinuteRate")}
                      className={inputClass}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={form.levels.length <= 1}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          levels: current.levels.filter((row) => row.id !== level.id)
                        }))
                      }
                      aria-label={`${t("delete")} ${index + 1}`}
                    >
                      <Trash2 size={16} />
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
                      levels: [...current.levels, { id: createPricingId("level"), name: "", minuteRate: "" }]
                    }))
                  }
                >
                  <Plus size={16} />
                  {t("pricingAddLevel")}
                </Button>
              </div>
            ) : null}

            {form.kind === "cost-markup" ? (
              <div className="grid gap-3 sm:grid-cols-2 md:max-w-xl">
                <label className="grid gap-1.5">
                  <span className="px-1 text-xs font-black text-ink/62">{t("pricingOverheadPercent")}</span>
                  <input
                    type="number"
                    min="0"
                    value={form.overheadPercent}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, overheadPercent: event.target.value }))
                    }
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="px-1 text-xs font-black text-ink/62">{t("pricingMarkupPercent")}</span>
                  <input
                    type="number"
                    min="0"
                    value={form.markupPercent}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, markupPercent: event.target.value }))
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="md">
                <Save size={17} />
                {editingId ? t("saveProjectFile") : t("addPricingTemplate")}
              </Button>
              <Button type="button" variant="ghost" size="md" onClick={cancelEditing}>
                <X size={17} />
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const Icon = kindIcon[template.kind];

            return (
              <div key={template.id} className="min-w-0 rounded-studio bg-white/80 p-4 shadow-soft ring-1 ring-black/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Pill tone={kindTone[template.kind]} className="min-h-8 px-3 text-xs">
                      <Icon size={14} className="mr-1.5" />
                      {t(pricingKindLabelKeys[template.kind])}
                    </Pill>
                    <h3 className="mt-2.5 break-words text-lg font-black leading-tight [overflow-wrap:anywhere]">
                      {template.name}
                    </h3>
                    {template.minimumFee ? (
                      <p className="mt-1 text-xs font-black text-ink/55">
                        {t("pricingMinimumFee")}: {formatMoney(template.currency, template.minimumFee)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(template)}
                      aria-label={`${t("editCostTemplate")} ${template.name}`}
                      className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-limepop hover:text-ink"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(template.id)}
                      aria-label={`${t("delete")} ${template.name}`}
                      className="grid size-10 place-items-center rounded-full bg-cloud text-muted transition hover:bg-coral hover:text-white"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {renderTemplateDetails(template)}
                {renderPreview(template)}
              </div>
            );
          })}
        </div>
      </Card>
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteId)}
        title={t("deleteItemTitle")}
        description={`${t("deleteItemDescription")}${pendingDelete ? `: ${pendingDelete.name}` : ""}`}
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
