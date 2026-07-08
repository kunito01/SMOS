"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CircleDollarSign, Plus, ReceiptText, Save, Trash2, TrendingUp } from "lucide-react";
import { projectsApi } from "@/lib/api";
import type { ProjectPaymentInput } from "@/lib/api/projects";
import { getProjectSubscriptionCost } from "@/lib/mock";
import type { CostItem, PaymentItem, Project } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatCurrency, toCny } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils/cn";

type ProjectPaymentSettingsProps = {
  project: Project;
  t: (key: TranslationKey) => string;
  onSaved: (project: Project) => void;
};

type PaymentDraft = ProjectPaymentInput & {
  localId: string;
};

const inputClass =
  "min-h-11 w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-coral focus:ring-4 focus:ring-coral/10";
const labelClass = "text-xs font-black uppercase text-muted";
const currencies: CostItem["currency"][] = ["CNY", "USD", "JPY", "EUR"];

const draftId = () => `payment-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const paymentToDraft = (payment: PaymentItem): PaymentDraft => ({
  id: payment.id,
  localId: payment.id,
  title: payment.title,
  type: payment.type,
  amount: payment.amount,
  currency: payment.currency,
  dueDate: payment.dueDate,
  receivedDate: payment.receivedDate,
  notes: payment.notes
});

const createPaymentDraft = (project: Project, type: PaymentItem["type"]): PaymentDraft => ({
  localId: draftId(),
  title: type === "planned" ? "Planned receivable" : "Payment received",
  type,
  amount: 0,
  currency: "CNY",
  dueDate: project.endDate,
  receivedDate: type === "received" ? project.endDate : undefined,
  notes: ""
});

const sumPayments = (payments: ProjectPaymentInput[], type: PaymentItem["type"]) =>
  payments
    .filter((payment) => payment.type === type)
    .reduce((sum, payment) => sum + toCny(payment.amount || 0, payment.currency), 0);

const sumCosts = (project: Project, isActual: boolean) =>
  project.costs
    .filter((cost) => cost.isActual === isActual)
    .reduce((sum, cost) => sum + toCny(cost.amount, cost.currency), 0);

const getActualProjectCost = (project: Project) => sumCosts(project, true) + getProjectSubscriptionCost(project);

const formatProfitRate = (profit: number, revenueBase: number) => {
  if (revenueBase <= 0) {
    return "0%";
  }

  const percent = Math.round((profit / revenueBase) * 100);

  return `${percent}%`;
};

export function ProjectPaymentSettings({ project, t, onSaved }: ProjectPaymentSettingsProps) {
  const [payments, setPayments] = useState<PaymentDraft[]>(() => (project.payments ?? []).map(paymentToDraft));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPayments((project.payments ?? []).map(paymentToDraft));
  }, [project]);

  const summary = useMemo(() => {
    const plannedReceivable = sumPayments(payments, "planned");
    const receivedRevenue = sumPayments(payments, "received");
    const actualCost = getActualProjectCost(project);
    const futureCost = sumCosts(project, false);
    const actualProfit = receivedRevenue - actualCost;
    const projectedProfit = plannedReceivable - actualCost - futureCost;
    const actualProfitRate = formatProfitRate(actualProfit, receivedRevenue);
    const projectedProfitRate = formatProfitRate(projectedProfit, plannedReceivable);
    const collectionProgress = plannedReceivable > 0 ? Math.min(100, Math.round((receivedRevenue / plannedReceivable) * 100)) : 0;

    return {
      actualCost,
      actualProfit,
      actualProfitRate,
      collectionProgress,
      futureCost,
      plannedReceivable,
      projectedProfit,
      projectedProfitRate,
      receivedRevenue
    };
  }, [payments, project]);

  const updatePayment = (localId: string, patch: Partial<PaymentDraft>) => {
    setPayments((current) =>
      current.map((payment) =>
        payment.localId === localId
          ? {
              ...payment,
              ...patch,
              receivedDate:
                (patch.type ?? payment.type) === "received"
                  ? patch.receivedDate ?? payment.receivedDate ?? patch.dueDate ?? payment.dueDate
                  : undefined
            }
          : payment
      )
    );
  };

  const addPayment = (type: PaymentItem["type"]) => {
    setPayments((current) => [...current, createPaymentDraft(project, type)]);
  };

  const removePayment = (localId: string) => {
    setPayments((current) => current.filter((payment) => payment.localId !== localId));
  };

  const save = async () => {
    setSaving(true);
    const nextProject = await projectsApi.updateProjectPayments(
      project.id,
      payments.map((payment) => ({
        id: payment.id,
        title: payment.title,
        type: payment.type,
        amount: payment.amount,
        currency: payment.currency,
        dueDate: payment.dueDate,
        receivedDate: payment.receivedDate,
        notes: payment.notes
      }))
    );
    setSaving(false);
    onSaved(nextProject);
  };

  const profitTone = summary.actualProfit >= 0 ? "text-ink" : "text-coral";
  const projectedTone = summary.projectedProfit >= 0 ? "text-ink" : "text-coral";

  return (
    <section className="mt-6">
      <Card tone="white" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeader eyebrow={t("projectSettings")} title={t("paymentStatus")} />
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => addPayment("planned")}>
              <Plus size={16} />
              {t("addPlannedReceivable")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => addPayment("received")}>
              <Plus size={16} />
              {t("addReceivedPayment")}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: t("plannedReceivable"), value: formatCurrency(summary.plannedReceivable), icon: ReceiptText, tone: "bg-limepop" },
            { label: t("receivedPayment"), value: formatCurrency(summary.receivedRevenue), icon: Banknote, tone: "bg-aqua" },
            { label: t("actualCostSoFar"), value: formatCurrency(summary.actualCost), icon: CircleDollarSign, tone: "bg-cloud" },
            {
              label: t("currentProfit"),
              value: formatCurrency(summary.actualProfit),
              icon: TrendingUp,
              tone: "bg-white",
              valueClass: profitTone,
              percent: summary.actualProfitRate,
              percentClass: summary.actualProfit < 0 ? "text-coral" : "text-ink"
            },
            {
              label: t("projectedProfit"),
              value: formatCurrency(summary.projectedProfit),
              icon: TrendingUp,
              tone: "bg-white",
              valueClass: projectedTone,
              percent: summary.projectedProfitRate,
              percentClass: summary.projectedProfit < 0 ? "text-coral" : "text-ink"
            }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="rounded-studio bg-cloud/60 p-4 ring-1 ring-black/[0.04]">
                <div className="flex items-center gap-2">
                  <span className={cn("grid size-9 place-items-center rounded-full text-ink", item.tone)}>
                    <Icon size={17} />
                  </span>
                  <span className="text-xs font-black uppercase text-muted">{item.label}</span>
                </div>
                <div className="mt-4 flex min-h-8 items-end justify-between gap-3">
                  <p className={cn("min-w-0 text-2xl font-black leading-none", item.valueClass)}>{item.value}</p>
                  {item.percent ? (
                    <span className={cn("shrink-0 text-right text-base font-light leading-none", item.percentClass)}>
                      {item.percent}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-studio bg-limepop/40 p-4">
          <div className="mb-2 flex items-center justify-between text-sm font-black">
            <span>{t("collectionProgress")}</span>
            <span>{summary.collectionProgress}%</span>
          </div>
          <ProgressBar value={summary.collectionProgress} className="bg-white/80" barClassName="bg-ink" />
          <p className="mt-3 text-sm font-bold leading-6 text-ink/65">
            {t("paymentStatusBody")}
          </p>
        </div>

        <div className="mt-5 grid gap-3">
          {payments.length ? (
            payments.map((payment) => (
              <div key={payment.localId} className="grid gap-3 rounded-studio bg-cloud/60 p-4 xl:grid-cols-[1.1fr_0.7fr_0.72fr_0.72fr_1fr_auto]">
                <label className="grid gap-1">
                  <span className={labelClass}>{t("paymentTitle")}</span>
                  <input
                    value={payment.title}
                    onChange={(event) => updatePayment(payment.localId, { title: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={labelClass}>{t("type")}</span>
                  <select
                    value={payment.type}
                    onChange={(event) => updatePayment(payment.localId, { type: event.target.value as PaymentItem["type"] })}
                    className={inputClass}
                  >
                    <option value="planned">{t("plannedReceivable")}</option>
                    <option value="received">{t("receivedPayment")}</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className={labelClass}>{t("amount")}</span>
                  <input
                    type="number"
                    min={0}
                    value={payment.amount || ""}
                    onChange={(event) => updatePayment(payment.localId, { amount: Number(event.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={labelClass}>{t("currency")}</span>
                  <select
                    value={payment.currency}
                    onChange={(event) => updatePayment(payment.localId, { currency: event.target.value as CostItem["currency"] })}
                    className={inputClass}
                  >
                    {currencies.map((currency) => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="grid gap-1">
                    <span className={labelClass}>{t("paymentDueDate")}</span>
                    <input
                      type="date"
                      value={payment.dueDate}
                      onChange={(event) => updatePayment(payment.localId, { dueDate: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                  {payment.type === "received" ? (
                    <label className="grid gap-1">
                      <span className={labelClass}>{t("paymentReceivedDate")}</span>
                      <input
                        type="date"
                        value={payment.receivedDate ?? payment.dueDate}
                        onChange={(event) => updatePayment(payment.localId, { receivedDate: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removePayment(payment.localId)}
                  aria-label={`${t("delete")} ${payment.title}`}
                  className="grid size-11 self-end place-items-center rounded-full bg-white text-muted transition hover:bg-coral hover:text-white"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-studio bg-cloud/60 p-5 text-sm font-bold text-muted">{t("noPayments")}</div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="primary" size="md" onClick={save} disabled={saving}>
            <Save size={18} />
            {saving ? t("loading") : t("savePaymentStatus")}
          </Button>
        </div>
      </Card>
    </section>
  );
}
