"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, ChevronDown, ChevronUp, CircleDollarSign, Plus, ReceiptText, Save, Trash2, TrendingUp } from "lucide-react";
import { projectsApi } from "@/lib/api";
import { useI18n } from "@/components/providers/app-providers";
import type { ProjectPaymentInput } from "@/lib/api/projects";
import { getProjectSubscriptionCost } from "@/lib/mock";
import type { CostItem, PaymentItem, Project } from "@/lib/types";
import { languageLocales, type TranslationKey } from "@/lib/i18n/translations";
import { formatCurrency, toCny } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
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
  "min-h-11 min-w-0 w-full max-w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-coral focus:ring-4 focus:ring-coral/10 max-[560px]:min-h-10 max-[560px]:rounded-xl max-[560px]:px-2.5 max-[560px]:py-1.5 max-[560px]:text-xs max-[360px]:min-h-9 max-[360px]:px-2";
const labelClass = "text-xs font-black uppercase text-white max-[420px]:text-[10px] max-[360px]:text-[9px]";
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

const createPaymentDraft = (project: Project, type: PaymentItem["type"], title: string): PaymentDraft => ({
  localId: draftId(),
  title,
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
  const { language } = useI18n();
  const [payments, setPayments] = useState<PaymentDraft[]>(() => (project.payments ?? []).map(paymentToDraft));
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PaymentDraft | null>(null);

  useEffect(() => {
    setPayments((project.payments ?? []).map(paymentToDraft));
    setPaymentDetailsOpen(false);
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
    setPayments((current) => [
      ...current,
      createPaymentDraft(project, type, t(type === "planned" ? "plannedReceivable" : "receivedPayment"))
    ]);
    setPaymentDetailsOpen(true);
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
  const formatCny = (value: number) => formatCurrency(value, "CNY", languageLocales[language]);

  return (
    <section className="mt-6">
      <Card tone="white" className="bg-[#e9e5df] p-5 max-[560px]:p-4 max-[360px]:p-3 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 max-[560px]:gap-3">
          <SectionHeader
            eyebrow={t("projectSettings")}
            title={t("paymentStatus")}
            className="min-w-0 max-[560px]:w-full"
            eyebrowClassName="max-[480px]:mb-1 max-[480px]:text-xs max-[360px]:text-[10px]"
            titleClassName="max-[480px]:text-xl max-[360px]:text-lg"
          />
          <div className="flex flex-wrap gap-2 max-[560px]:grid max-[560px]:w-full max-[560px]:grid-cols-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addPayment("planned")}
              className="max-[560px]:w-full max-[480px]:h-9 max-[480px]:px-3 max-[480px]:text-xs max-[360px]:h-8 max-[360px]:px-2"
            >
              <Plus size={16} />
              {t("addPlannedReceivable")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addPayment("received")}
              className="max-[560px]:w-full max-[480px]:h-9 max-[480px]:px-3 max-[480px]:text-xs max-[360px]:h-8 max-[360px]:px-2"
            >
              <Plus size={16} />
              {t("addReceivedPayment")}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid min-w-0 gap-3 max-[560px]:mt-4 max-[560px]:gap-2 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: t("plannedReceivable"), value: formatCny(summary.plannedReceivable), icon: ReceiptText, tone: "bg-limepop" },
            { label: t("receivedPayment"), value: formatCny(summary.receivedRevenue), icon: Banknote, tone: "bg-aqua" },
            { label: t("actualCostSoFar"), value: formatCny(summary.actualCost), icon: CircleDollarSign, tone: "bg-cloud" },
            {
              label: t("currentProfit"),
              helper: t("currentProfitFormula"),
              value: formatCny(summary.actualProfit),
              icon: TrendingUp,
              tone: "bg-white",
              valueClass: profitTone,
              percent: summary.actualProfitRate,
              percentClass: summary.actualProfit < 0 ? "text-coral" : "text-ink"
            },
            {
              label: t("projectedProfit"),
              helper: t("projectedProfitFormula"),
              value: formatCny(summary.projectedProfit),
              icon: TrendingUp,
              tone: "bg-white",
              valueClass: projectedTone,
              percent: summary.projectedProfitRate,
              percentClass: summary.projectedProfit < 0 ? "text-coral" : "text-ink"
            }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="min-w-0 rounded-studio bg-white p-4 ring-1 ring-black/[0.04] max-[560px]:p-3 max-[360px]:p-2.5">
                <div className="flex min-w-0 items-center gap-2 max-[360px]:gap-1.5">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-ink max-[560px]:size-8 max-[360px]:size-7", item.tone)}>
                    <Icon className="max-[560px]:size-4 max-[360px]:size-3.5" size={17} />
                  </span>
                  <span className="min-w-0 text-xs font-black uppercase text-muted [overflow-wrap:anywhere] max-[480px]:text-[11px] max-[360px]:text-[10px]">{item.label}</span>
                </div>
                <div className="mt-4 flex min-h-8 min-w-0 items-end justify-between gap-3 max-[560px]:mt-3 max-[420px]:flex-col max-[420px]:items-start max-[420px]:gap-1">
                  <p className={cn("min-w-0 max-w-full text-2xl font-black leading-none tabular-nums [overflow-wrap:anywhere] max-[560px]:text-xl max-[360px]:text-lg", item.valueClass)}>{item.value}</p>
                  {item.percent ? (
                    <span className={cn("shrink-0 text-right text-sm font-black leading-none max-[560px]:text-xs max-[420px]:text-left max-[360px]:text-[10px]", item.percentClass)}>
                      {t("profitRate")} {item.percent}
                    </span>
                  ) : null}
                </div>
                {item.helper ? (
                  <p className="mt-2 text-xs font-bold leading-4 text-muted [overflow-wrap:anywhere] max-[360px]:text-[10px] max-[360px]:leading-4">{item.helper}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 min-w-0 rounded-studio bg-[#ffc700] p-4 max-[560px]:mt-4 max-[560px]:p-3 max-[360px]:p-2.5">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-sm font-black max-[480px]:text-xs max-[360px]:text-[10px]">
            <span>{t("collectionProgress")}</span>
            <span className="shrink-0">{summary.collectionProgress}%</span>
          </div>
          <ProgressBar value={summary.collectionProgress} className="bg-white/80" barClassName="bg-ink" />
          <p className="mt-3 text-sm font-bold leading-6 text-ink/65 [overflow-wrap:anywhere] max-[560px]:text-xs max-[560px]:leading-5 max-[360px]:mt-2 max-[360px]:text-[10px] max-[360px]:leading-4">
            {t("paymentStatusBody")}
          </p>
        </div>

        <button
          type="button"
          aria-expanded={paymentDetailsOpen}
          aria-label={t(paymentDetailsOpen ? "collapsePaymentItems" : "expandPaymentItems")}
          onClick={() => setPaymentDetailsOpen((current) => !current)}
          className="mt-5 flex w-full min-w-0 items-center justify-between gap-4 rounded-studio bg-[#e2fafa] px-4 py-4 text-left shadow-soft ring-1 ring-black/[0.04] transition hover:-translate-y-0.5 max-[560px]:mt-4 max-[560px]:gap-3 max-[560px]:px-3 max-[560px]:py-3 max-[360px]:gap-2 max-[360px]:px-2.5 max-[360px]:py-2.5"
        >
          <span className="min-w-0">
            <span className="block text-xs font-black uppercase text-muted [overflow-wrap:anywhere] max-[360px]:text-[10px]">{t("paymentItems")}</span>
            <span className="mt-1 block text-2xl font-black text-ink max-[480px]:text-xl max-[360px]:text-lg">{payments.length}</span>
          </span>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-cloud text-ink max-[560px]:size-9 max-[360px]:size-8">
            {paymentDetailsOpen ? <ChevronUp className="max-[560px]:size-[18px] max-[360px]:size-4" size={20} /> : <ChevronDown className="max-[560px]:size-[18px] max-[360px]:size-4" size={20} />}
          </span>
        </button>

        {paymentDetailsOpen ? (
          <>
            <div className="mt-3 grid gap-3">
              {payments.length ? (
                payments.map((payment) => (
                  <div key={payment.localId} className="grid min-w-0 gap-3 rounded-studio bg-[#0fb9db] p-4 max-[560px]:gap-2 max-[560px]:p-3 max-[360px]:p-2.5 xl:grid-cols-[1.1fr_0.7fr_0.72fr_0.72fr_1fr_auto]">
                    <label className="grid min-w-0 gap-1">
                      <span className={labelClass}>{t("paymentTitle")}</span>
                      <input
                        value={payment.title}
                        onChange={(event) => updatePayment(payment.localId, { title: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="grid min-w-0 gap-1">
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
                    <label className="grid min-w-0 gap-1">
                      <span className={labelClass}>{t("amount")}</span>
                      <input
                        type="number"
                        min={0}
                        value={payment.amount || ""}
                        onChange={(event) => updatePayment(payment.localId, { amount: Number(event.target.value) })}
                        className={inputClass}
                      />
                    </label>
                    <label className="grid min-w-0 gap-1">
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
                    <div className="grid min-w-0 gap-3 max-[560px]:gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <label className="grid min-w-0 gap-1">
                        <span className={labelClass}>{t("paymentDueDate")}</span>
                        <input
                          type="date"
                          value={payment.dueDate}
                          onChange={(event) => updatePayment(payment.localId, { dueDate: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                      {payment.type === "received" ? (
                        <label className="grid min-w-0 gap-1">
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
                      onClick={() => setPendingDelete(payment)}
                      aria-label={`${t("delete")} ${payment.title}`}
                      className="grid size-11 self-end place-items-center rounded-full bg-white text-muted transition hover:bg-coral hover:text-white max-[560px]:size-10 max-[560px]:justify-self-end max-[360px]:size-9"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-studio bg-cloud/60 p-5 text-sm font-bold text-muted [overflow-wrap:anywhere] max-[560px]:p-4 max-[480px]:text-xs max-[360px]:p-3">{t("noPayments")}</div>
              )}
            </div>

            <div className="mt-5 flex justify-end max-[560px]:mt-4">
              <Button
                variant="primary"
                size="md"
                onClick={save}
                disabled={saving}
                className="max-[560px]:w-full max-[480px]:h-10 max-[480px]:px-3 max-[480px]:text-xs max-[360px]:h-9 max-[360px]:px-2"
              >
                <Save size={18} />
                {saving ? t("loading") : t("savePaymentStatus")}
              </Button>
            </div>
          </>
        ) : null}
      </Card>
      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("deleteItemTitle")}
        description={t("deleteItemDescription")}
        warning={t("deleteIrreversibleWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            removePayment(pendingDelete.localId);
          }

          setPendingDelete(null);
        }}
      />
    </section>
  );
}
