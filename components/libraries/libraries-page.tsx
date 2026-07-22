"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  CreditCard,
  Link2,
  Mail,
  PackagePlus,
  Pencil,
  Repeat,
  Save,
  Trash2,
  UserPlus,
  Wrench,
  X
} from "lucide-react";
import { PixelDesertScene } from "@/components/libraries/pixel-desert-scene";
import { useCostDisplayCurrency } from "@/components/costs/use-cost-display-currency";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Select } from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";
import { librariesApi } from "@/lib/api";
import { getToolMonthlySubscriptionCost } from "@/lib/mock";
import {
  billingTypeKeys,
  costCategoryKeys,
  formatDemoEntityName,
  getProjectGroupDisplayName,
  personTypeKeys,
  projectNameKeys,
  statusKeys,
  translateDomainLabel,
  toolCategoryKeys
} from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import type { CostItem, CostLibraryItem, Person, PersonProjectParticipation, ProjectStatus, Tool } from "@/lib/types";
import { projectPath } from "@/lib/utils/app-routes";
import { peopleTemplateDailyRate } from "@/lib/utils/cost-template-links";
import { formatNumber, type MoneyCurrency } from "@/lib/utils/money";
import { getNextActiveSubscriptionPaymentDate } from "@/lib/utils/subscription-reminders";

const billingTypeLabelKeys = {
  "one-time": "billingTypeOneTime",
  hourly: "billingTypeHourly",
  daily: "billingTypeDaily",
  monthly: "billingTypeMonthly",
  yearly: "billingTypeYearly"
} as const;

type LibrariesData = {
  people: Person[];
  tools: Tool[];
  costTemplates: CostLibraryItem[];
  personProjects: PersonProjectParticipation[];
  subscriptionSummary: {
    activeSubscriptionCount: number;
    currency: MoneyCurrency;
    monthlyTotal: number;
  };
};

type PersonForm = Pick<Person, "name" | "role" | "type"> & {
  costTemplateId: string;
  dailyCost: string;
  dailyCostCurrency: NonNullable<Person["dailyCostCurrency"]>;
};

type ToolForm = Pick<Tool, "name" | "category"> & {
  costTemplateId: string;
  subscriptionAmount: string;
  subscriptionCurrency: CostItem["currency"];
  subscriptionBillingCycle: NonNullable<Tool["subscription"]>["billingCycle"];
  subscriptionExpiresAt: string;
  subscriptionNextPaymentAt: string;
  subscriptionAccountEmail: string;
};

type PendingLibraryDelete =
  | { type: "person"; id: string; label: string }
  | { type: "tool"; id: string; label: string }
  | { type: "costTemplate"; id: string; label: string };

const currencyOptions: CostItem["currency"][] = ["CNY", "USD", "JPY", "EUR"];

const personTypeTone: Record<Person["type"], "aqua" | "lime" | "coral" | "dark"> = {
  internal: "lime",
  external: "aqua",
  vendor: "coral",
  "ai-tool": "dark"
};

const toolCategoryTone: Record<Tool["category"], "aqua" | "lime" | "coral" | "dark"> = {
  ai: "lime",
  design: "aqua",
  dev: "dark",
  game: "coral",
  video: "aqua",
  other: "dark"
};

const projectStatusTone: Record<ProjectStatus, "aqua" | "lime" | "coral" | "dark" | "cloud"> = {
  planning: "cloud",
  active: "coral",
  paused: "dark",
  terminated: "cloud",
  completed: "lime"
};

const defaultPerson: PersonForm = {
  name: "",
  role: "",
  type: "internal",
  costTemplateId: "",
  dailyCost: "",
  dailyCostCurrency: "CNY"
};

const defaultTool: ToolForm = {
  name: "",
  category: "ai",
  costTemplateId: "",
  subscriptionAmount: "",
  subscriptionCurrency: "CNY",
  subscriptionBillingCycle: "monthly",
  subscriptionExpiresAt: "2026-12-31",
  subscriptionNextPaymentAt: "",
  subscriptionAccountEmail: ""
};

const defaultCost: Omit<CostLibraryItem, "id"> = {
  name: "",
  category: "software",
  amount: 0,
  currency: "CNY",
  billingType: "monthly",
  isActual: false
};

export function LibrariesPage() {
  const { language, t } = useI18n();
  const {
    displayCurrency,
    exchangeRateSnapshot,
    formatAmount,
    isReady: isCurrencyReady
  } = useCostDisplayCurrency();
  const [data, setData] = useState<LibrariesData | null>(null);
  const [personForm, setPersonForm] = useState(defaultPerson);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPersonForm, setEditingPersonForm] = useState(defaultPerson);
  const [toolForm, setToolForm] = useState(defaultTool);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editingToolForm, setEditingToolForm] = useState(defaultTool);
  const [costForm, setCostForm] = useState(defaultCost);
  const [editingCostTemplateId, setEditingCostTemplateId] = useState<string | null>(null);
  const [editingCostForm, setEditingCostForm] = useState(defaultCost);
  const [pendingDelete, setPendingDelete] = useState<PendingLibraryDelete | null>(null);
  const [expandedPersonProjectsId, setExpandedPersonProjectsId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [people, tools, costTemplates, personProjects, subscriptionSummary] = await Promise.all([
      librariesApi.listPeople(),
      librariesApi.listTools(),
      librariesApi.listCostTemplates(),
      librariesApi.listPersonProjectParticipation(displayCurrency, exchangeRateSnapshot),
      librariesApi.getToolSubscriptionSummary(displayCurrency, exchangeRateSnapshot)
    ]);
    setData({ people, tools, costTemplates, personProjects, subscriptionSummary });
  }, [displayCurrency, exchangeRateSnapshot]);

  useEffect(() => {
    if (isCurrencyReady) {
      void load();
    }
  }, [isCurrencyReady, load]);

  const totals = useMemo(
    () => ({
      people: data?.people.length ?? 0,
      tools: data?.tools.length ?? 0,
      costs: data?.costTemplates.length ?? 0,
      subscriptions: data?.subscriptionSummary.activeSubscriptionCount ?? 0
    }),
    [data]
  );
  const costTemplateById = useMemo(
    () => new Map((data?.costTemplates ?? []).map((template) => [template.id, template])),
    [data?.costTemplates]
  );
  const compatiblePersonTemplates = useMemo(
    () =>
      (data?.costTemplates ?? []).filter(
        (template) =>
          template.category === "people" && template.billingType !== "one-time"
      ),
    [data?.costTemplates]
  );
  const compatibleToolTemplates = useMemo(
    () =>
      (data?.costTemplates ?? []).filter(
        (template) =>
          template.category === "software" &&
          (template.billingType === "monthly" || template.billingType === "yearly")
      ),
    [data?.costTemplates]
  );
  const linkedPeopleByTemplate = useMemo(() => {
    const counts = new Map<string, number>();

    (data?.people ?? []).forEach((person) => {
      if (person.costTemplateId) {
        counts.set(person.costTemplateId, (counts.get(person.costTemplateId) ?? 0) + 1);
      }
    });

    return counts;
  }, [data?.people]);
  const linkedToolsByTemplate = useMemo(() => {
    const counts = new Map<string, number>();

    (data?.tools ?? []).forEach((tool) => {
      if (tool.costTemplateId) {
        counts.set(tool.costTemplateId, (counts.get(tool.costTemplateId) ?? 0) + 1);
      }
    });

    return counts;
  }, [data?.tools]);
  const personProjectsById = useMemo(
    () => new Map((data?.personProjects ?? []).map((summary) => [summary.personId, summary])),
    [data?.personProjects]
  );

  const formatCurrencyAmount = (currency: CostItem["currency"], amount: number) =>
    `${currency}\u00a0${formatNumber(amount)}`;
  const formatMoney = (currency?: CostItem["currency"], amount?: number) =>
    amount && currency ? formatCurrencyAmount(currency, amount) : t("noDailyCost");
  const formatTotal = (value: number, currency: MoneyCurrency = displayCurrency) =>
    formatAmount(value, currency);

  const personToForm = (person: Person): PersonForm => ({
    name: person.name,
    role: person.role,
    type: person.type,
    costTemplateId: person.costTemplateId ?? "",
    dailyCost: person.dailyCost ? String(person.dailyCost) : "",
    dailyCostCurrency: person.dailyCostCurrency ?? "CNY"
  });

  const personPayload = (form: PersonForm) => {
    const dailyCost = Number(form.dailyCost);

    return {
      name: form.name.trim(),
      role: form.role.trim(),
      type: form.type,
      costTemplateId: form.costTemplateId || undefined,
      dailyCost: dailyCost > 0 ? dailyCost : undefined,
      dailyCostCurrency: dailyCost > 0 ? form.dailyCostCurrency : undefined
    };
  };

  const toolToForm = (tool: Tool): ToolForm => ({
    name: tool.name,
    category: tool.category,
    costTemplateId: tool.costTemplateId ?? "",
    subscriptionAmount: tool.subscription?.amount ? String(tool.subscription.amount) : "",
    subscriptionCurrency: tool.subscription?.currency ?? "CNY",
    subscriptionBillingCycle: tool.subscription?.billingCycle ?? "monthly",
    subscriptionExpiresAt: tool.subscription?.expiresAt ?? "2026-12-31",
    subscriptionNextPaymentAt: tool.subscription?.nextPaymentAt ?? "",
    subscriptionAccountEmail: tool.subscription?.accountEmail ?? ""
  });

  const toolPayload = (form: ToolForm) => {
    const amount = Number(form.subscriptionAmount);

    return {
      name: form.name.trim(),
      category: form.category,
      costTemplateId: form.costTemplateId || undefined,
      subscription:
        amount > 0
          ? {
              amount,
              currency: form.subscriptionCurrency,
              billingCycle: form.subscriptionBillingCycle,
              expiresAt: form.subscriptionExpiresAt,
              nextPaymentAt: form.subscriptionNextPaymentAt || undefined,
              accountEmail: form.subscriptionAccountEmail.trim()
            }
          : undefined
    };
  };

  const getToolMonthlyCost = (tool: Tool) => {
    return getToolMonthlySubscriptionCost(tool, displayCurrency, exchangeRateSnapshot);
  };

  const applyPersonTemplate = (
    setForm: React.Dispatch<React.SetStateAction<PersonForm>>,
    costTemplateId: string
  ) => {
    setForm((current) => {
      if (!costTemplateId) {
        return { ...current, costTemplateId: "" };
      }

      const template = costTemplateById.get(costTemplateId);
      if (!template || template.category !== "people" || template.billingType === "one-time") {
        return current;
      }

      return {
        ...current,
        costTemplateId,
        role: template.name,
        dailyCost: String(peopleTemplateDailyRate(template)),
        dailyCostCurrency: template.currency
      };
    });
  };

  const applyToolTemplate = (
    setForm: React.Dispatch<React.SetStateAction<ToolForm>>,
    costTemplateId: string
  ) => {
    setForm((current) => {
      if (!costTemplateId) {
        return { ...current, costTemplateId: "" };
      }

      const template = costTemplateById.get(costTemplateId);
      if (
        !template ||
        template.category !== "software" ||
        (template.billingType !== "monthly" && template.billingType !== "yearly")
      ) {
        return current;
      }

      return {
        ...current,
        costTemplateId,
        name: template.name,
        subscriptionAmount: String(template.amount),
        subscriptionCurrency: template.currency,
        subscriptionBillingCycle: template.billingType
      };
    });
  };

  const submitPerson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!personForm.name.trim() || !personForm.role.trim()) {
      return;
    }
    await librariesApi.addPerson(personPayload(personForm));
    setPersonForm(defaultPerson);
    setExpandedPersonProjectsId(null);
    await load();
  };

  const submitTool = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!toolForm.name.trim()) {
      return;
    }
    await librariesApi.addTool(toolPayload(toolForm));
    setToolForm(defaultTool);
    await load();
  };

  const submitCost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!costForm.name.trim() || costForm.amount <= 0) {
      return;
    }
    await librariesApi.addCostTemplate(costForm);
    setCostForm(defaultCost);
    await load();
  };

  const startEditingCostTemplate = (template: CostLibraryItem) => {
    setEditingCostTemplateId(template.id);
    setEditingCostForm({
      name: template.name,
      category: template.category,
      amount: template.amount,
      currency: template.currency,
      billingType: template.billingType,
      isActual: template.isActual
    });
  };

  const updateCostTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCostTemplateId || !editingCostForm.name.trim() || editingCostForm.amount <= 0) {
      return;
    }

    await librariesApi.updateCostTemplate(editingCostTemplateId, editingCostForm);
    setEditingCostTemplateId(null);
    setEditingCostForm(defaultCost);
    await load();
  };

  const removePerson = async (personId: string) => {
    await librariesApi.deletePerson(personId);
    setExpandedPersonProjectsId((current) => (current === personId ? null : current));
    await load();
  };

  const startEditingPerson = (person: Person) => {
    setExpandedPersonProjectsId(null);
    setEditingPersonId(person.id);
    setEditingPersonForm(personToForm(person));
  };

  const updatePerson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPersonId || !editingPersonForm.name.trim() || !editingPersonForm.role.trim()) {
      return;
    }

    await librariesApi.updatePerson(editingPersonId, personPayload(editingPersonForm));
    setEditingPersonId(null);
    setEditingPersonForm(defaultPerson);
    setExpandedPersonProjectsId(null);
    await load();
  };

  const removeTool = async (toolId: string) => {
    await librariesApi.deleteTool(toolId);
    await load();
  };

  const startEditingTool = (tool: Tool) => {
    setEditingToolId(tool.id);
    setEditingToolForm(toolToForm(tool));
  };

  const updateTool = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingToolId || !editingToolForm.name.trim()) {
      return;
    }

    await librariesApi.updateTool(editingToolId, toolPayload(editingToolForm));
    setEditingToolId(null);
    setEditingToolForm(defaultTool);
    await load();
  };

  const removeCostTemplate = async (costTemplateId: string) => {
    await librariesApi.deleteCostTemplate(costTemplateId);
    if (editingCostTemplateId === costTemplateId) {
      setEditingCostTemplateId(null);
      setEditingCostForm(defaultCost);
    }
    await load();
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    if (pendingDelete.type === "person") {
      await removePerson(pendingDelete.id);
    }

    if (pendingDelete.type === "tool") {
      await removeTool(pendingDelete.id);
    }

    if (pendingDelete.type === "costTemplate") {
      await removeCostTemplate(pendingDelete.id);
    }

    setPendingDelete(null);
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section>
              <Card tone="aqua" className="relative min-h-[30rem] overflow-hidden bg-[#73c6d5] p-6 sm:p-8">
                <PixelDesertScene />
                <div className="libraries-desert-copy-wash" />
                <div className="relative z-10 flex min-h-[26rem] flex-col justify-between gap-8">
                  <div className="max-w-4xl">
                    <p className="text-sm font-black uppercase text-ink/68 drop-shadow-[0_1px_0_rgba(255,232,154,0.42)]">{t("navLibraries")}</p>
                    <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] drop-shadow-[0_3px_0_rgba(255,232,154,0.4)] sm:text-6xl">
                      {t("librariesTitle")}
                    </h1>
                    <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/78 drop-shadow-[0_1px_0_rgba(255,232,154,0.3)]">
                      {t("librariesBody")}
                    </p>
                  </div>

                  <div className="grid grid-cols-4 gap-[clamp(3px,1.2vw,12px)]">
                    {[
                      { label: t("peopleLibrary"), value: totals.people, icon: UserPlus },
                      { label: t("softwareLibrary"), value: totals.tools, icon: Wrench },
                      {
                        label: t("monthlySubscriptionCost"),
                        value: formatTotal(data.subscriptionSummary.monthlyTotal, data.subscriptionSummary.currency),
                        icon: CreditCard
                      },
                      { label: t("costTemplateLibrary"), value: totals.costs, icon: CircleDollarSign }
                    ].map((item) => {
                      const Icon = item.icon;

                      return (
                        <div
                          key={item.label}
                          className="companies-hero-metric-glass min-h-[clamp(84px,22vw,128px)] min-w-0 rounded-studio bg-white/[0.38] p-[clamp(3px,1.4vw,14px)] text-ink shadow-soft ring-1 ring-white/[0.56] backdrop-blur-xl"
                        >
                          <div className="flex h-full min-w-0 flex-col justify-between gap-[clamp(4px,1.6vw,16px)]">
                            <span className="grid size-[clamp(20px,6vw,40px)] shrink-0 place-items-center rounded-full bg-white/58 text-ink shadow-sm ring-1 ring-white/50">
                              <Icon className="size-[clamp(10px,3vw,18px)]" />
                            </span>
                            <div className="grid min-w-0 gap-[clamp(2px,0.8vw,8px)]">
                              <p className="max-w-full whitespace-nowrap text-[clamp(0.6rem,3.1vw,2.25rem)] font-black leading-none tracking-[-0.04em] tabular-nums">{item.value}</p>
                              <p className="min-h-[3em] max-w-full break-words text-[clamp(7px,1.1vw,12px)] font-black leading-[1.05] tracking-[-0.02em] text-current/70">{item.label}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_minmax(0,0.88fr)_minmax(0,0.88fr)]">
              <Card tone="white" className="bg-[#fd0079] p-5 sm:p-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="mb-2 text-sm font-bold text-white">{t("templateReusable")}</p>
                    <h2 className="text-2xl font-black leading-none text-white sm:text-3xl">{t("peopleLibrary")}</h2>
                  </div>
                </div>
                <form
                  onSubmit={submitPerson}
                  onFocusCapture={() => setExpandedPersonProjectsId(null)}
                  className="mt-5 grid gap-3 rounded-studio bg-cloud/70 p-4"
                >
                  <input
                    value={personForm.name}
                    onChange={(event) => setPersonForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("personName")}
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  />
                  <div className="grid gap-2">
                    <p className="inline-flex items-center gap-2 px-1 text-xs font-black text-ink/62">
                      <Link2 size={14} />
                      {t("linkPersonTemplate")}
                    </p>
                    <Select
                      value={personForm.costTemplateId}
                      onChange={(event) => applyPersonTemplate(setPersonForm, event.target.value)}
                      aria-label={t("linkPersonTemplate")}
                      className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      <option value="">{t("noCostTemplate")}</option>
                      {compatiblePersonTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} · {formatCurrencyAmount(template.currency, template.amount)} · {t(billingTypeLabelKeys[template.billingType])} → {formatCurrencyAmount(template.currency, peopleTemplateDailyRate(template))}/{t("budgetPerDay")}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <input
                    value={personForm.role}
                    onChange={(event) => setPersonForm((current) => ({ ...current, role: event.target.value }))}
                    placeholder={t("role")}
                    disabled={Boolean(personForm.costTemplateId)}
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55"
                  />
                  <Select
                    value={personForm.type}
                    onChange={(event) =>
                      setPersonForm((current) => ({ ...current, type: event.target.value as Person["type"] }))
                    }
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  >
                    {(["internal", "external", "vendor", "ai-tool"] as Person["type"][]).map((type) => (
                      <option key={type} value={type}>{t(personTypeKeys[type])}</option>
                    ))}
                  </Select>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)]">
                    <input
                      type="number"
                      min="0"
                      value={personForm.dailyCost}
                      onChange={(event) => setPersonForm((current) => ({ ...current, dailyCost: event.target.value }))}
                      placeholder={t("dailyCost")}
                      disabled={Boolean(personForm.costTemplateId)}
                      className="h-11 min-w-0 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55"
                    />
                    <Select
                      value={personForm.dailyCostCurrency}
                      onChange={(event) =>
                        setPersonForm((current) => ({
                          ...current,
                          dailyCostCurrency: event.target.value as NonNullable<Person["dailyCostCurrency"]>
                        }))
                      }
                      disabled={Boolean(personForm.costTemplateId)}
                      className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55"
                    >
                      {currencyOptions.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </Select>
                  </div>
                  {personForm.costTemplateId ? (
                    <p className="inline-flex items-start gap-2 rounded-2xl bg-white/55 px-3 py-2 text-xs font-black leading-5 text-ink/62">
                      <Link2 size={14} className="mt-0.5 shrink-0" />
                      {t("templateManagedFields")}
                    </p>
                  ) : null}
                  <Button type="submit" size="md">
                    <UserPlus size={18} />
                    {t("addPerson")}
                  </Button>
                </form>

                <div className="mt-5 grid gap-3">
                  {data.people.map((person) => {
                    const linkedTemplate = person.costTemplateId
                      ? costTemplateById.get(person.costTemplateId)
                      : undefined;
                    const participation = personProjectsById.get(person.id);
                    const projectRows = participation?.projects ?? [];
                    const isProjectsExpanded = expandedPersonProjectsId === person.id;
                    const ProjectChevron = isProjectsExpanded ? ChevronUp : ChevronDown;

                    return editingPersonId === person.id ? (
                      <form
                        key={person.id}
                        onSubmit={updatePerson}
                        className="grid gap-3 rounded-studio bg-white p-4 shadow-soft ring-2 ring-limepop/70"
                      >
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                          <input
                            value={editingPersonForm.name}
                            onChange={(event) =>
                              setEditingPersonForm((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder={t("personName")}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          />
                          <input
                            value={editingPersonForm.role}
                            onChange={(event) =>
                              setEditingPersonForm((current) => ({ ...current, role: event.target.value }))
                            }
                            placeholder={t("role")}
                            disabled={Boolean(editingPersonForm.costTemplateId)}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          />
                        </div>
                        <Select
                          value={editingPersonForm.type}
                          onChange={(event) =>
                            setEditingPersonForm((current) => ({ ...current, type: event.target.value as Person["type"] }))
                          }
                          className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        >
                          {(["internal", "external", "vendor", "ai-tool"] as Person["type"][]).map((type) => (
                            <option key={type} value={type}>{t(personTypeKeys[type])}</option>
                          ))}
                        </Select>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)]">
                          <input
                            type="number"
                            min="0"
                            value={editingPersonForm.dailyCost}
                            onChange={(event) =>
                              setEditingPersonForm((current) => ({ ...current, dailyCost: event.target.value }))
                            }
                            placeholder={t("dailyCost")}
                            disabled={Boolean(editingPersonForm.costTemplateId)}
                            className="h-11 min-w-0 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          />
                          <Select
                            value={editingPersonForm.dailyCostCurrency}
                            onChange={(event) =>
                              setEditingPersonForm((current) => ({
                                ...current,
                                dailyCostCurrency: event.target.value as NonNullable<Person["dailyCostCurrency"]>
                              }))
                            }
                            disabled={Boolean(editingPersonForm.costTemplateId)}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          >
                            {currencyOptions.map((currency) => (
                              <option key={currency} value={currency}>{currency}</option>
                            ))}
                          </Select>
                        </div>
                        <Select
                          value={editingPersonForm.costTemplateId}
                          onChange={(event) => applyPersonTemplate(setEditingPersonForm, event.target.value)}
                          aria-label={t("linkPersonTemplate")}
                          className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        >
                          <option value="">{t("noCostTemplate")}</option>
                          {compatiblePersonTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} · {formatCurrencyAmount(template.currency, template.amount)} · {t(billingTypeLabelKeys[template.billingType])} → {formatCurrencyAmount(template.currency, peopleTemplateDailyRate(template))}/{t("budgetPerDay")}
                            </option>
                          ))}
                        </Select>
                        {editingPersonForm.costTemplateId ? (
                          <p className="inline-flex items-start gap-2 rounded-2xl bg-limepop/20 px-3 py-2 text-xs font-black leading-5 text-ink/62">
                            <Link2 size={14} className="mt-0.5 shrink-0" />
                            {t("templateManagedFields")}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm" className="min-w-28">
                            <Save size={16} />
                            {t("savePerson")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPersonId(null);
                              setEditingPersonForm(defaultPerson);
                              setExpandedPersonProjectsId(null);
                            }}
                          >
                            <X size={16} />
                            {t("cancel")}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div key={person.id} className="rounded-studio bg-cloud/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-black">{person.name}</h3>
                            <p className="mt-1 text-sm font-bold text-muted">{person.role}</p>
                            <div className="mt-3 grid gap-1.5 text-xs font-black text-ink/62">
                              <span>{t("dailyCost")}: {formatMoney(person.dailyCostCurrency, person.dailyCost)}</span>
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <Link2 size={13} className="shrink-0" />
                                <span className="truncate">
                                  {t("linkedTemplate")}: {linkedTemplate?.name ?? t("noCostTemplate")}
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Pill tone={personTypeTone[person.type]} className="min-h-8 px-3 text-xs">
                              {t(personTypeKeys[person.type])}
                            </Pill>
                            <button
                              type="button"
                              onClick={() => startEditingPerson(person)}
                              aria-label={`${t("editPerson")} ${person.name}`}
                              className="grid size-10 place-items-center rounded-full bg-white text-muted shadow-soft ring-1 ring-black/[0.04] transition hover:bg-limepop hover:text-ink"
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({ type: "person", id: person.id, label: person.name })
                              }
                              aria-label={`${t("delete")} ${person.name}`}
                              className="grid size-10 place-items-center rounded-full bg-white text-muted shadow-soft ring-1 ring-black/[0.04] transition hover:bg-coral hover:text-white"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white/70">
                            <p className="text-2xl font-black leading-none">
                              {participation?.totalProjectCount ?? 0}
                            </p>
                            <p className="mt-1 text-[0.68rem] font-black uppercase text-ink/52">
                              {t("projectsCount")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white/70">
                            <p className="text-2xl font-black leading-none">
                              {participation?.averageProgress ?? 0}%
                            </p>
                            <p className="mt-1 text-[0.68rem] font-black uppercase text-ink/52">
                              {t("averageCompletion")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white/70 sm:col-span-2">
                            <p className="text-2xl font-black leading-none">
                              {formatTotal(
                                participation?.actualCostTotal ?? 0,
                                participation?.currency ?? displayCurrency
                              )}
                            </p>
                            <p className="mt-1 text-[0.68rem] font-black uppercase text-ink/52">
                              {t("actualCostSoFar")}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl bg-white/55 p-3 ring-1 ring-white/65">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPersonProjectsId((current) => (current === person.id ? null : person.id))
                            }
                            aria-expanded={isProjectsExpanded}
                            aria-controls={`person-projects-${person.id}`}
                            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/60 px-3 py-2 text-left transition hover:bg-white/85"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-black uppercase text-ink/58">
                                {t("personProjectParticipation")}
                              </span>
                              <span className="mt-1 block whitespace-nowrap text-xs font-bold text-ink/42 tabular-nums">
                                {`${projectRows.length}\u00a0${t("projectsCount")}`}
                              </span>
                            </span>
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cloud text-muted">
                              <ProjectChevron size={18} />
                            </span>
                          </button>

                          {isProjectsExpanded ? (
                            <div id={`person-projects-${person.id}`} className="mt-3 grid gap-2">
                              {projectRows.length ? (
                                projectRows.map((project) => (
                                  <Link
                                    key={project.projectId}
                                    href={projectPath(project.projectId)}
                                    prefetch={false}
                                    className="rounded-2xl bg-white/75 p-3 text-ink shadow-sm ring-1 ring-black/[0.04] transition hover:-translate-y-0.5 hover:bg-white"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <h4 className="truncate text-sm font-black">
                                          {formatDemoEntityName(
                                            translateDomainLabel(project.projectName, projectNameKeys, t),
                                            project.projectId,
                                            "project",
                                            t,
                                            project.isExample
                                          )}
                                        </h4>
                                        <p className="mt-1 truncate text-xs font-bold text-muted">
                                          {project.groupId
                                            ? getProjectGroupDisplayName(
                                                {
                                                  name: project.groupName,
                                                  nameI18n: project.groupNameI18n
                                                },
                                                language,
                                                t
                                              )
                                            : "—"}
                                        </p>
                                      </div>
                                      <Pill
                                        tone={projectStatusTone[project.status]}
                                        className="min-h-7 shrink-0 px-2.5 text-[0.68rem]"
                                      >
                                        {t(statusKeys[project.status])}
                                      </Pill>
                                    </div>
                                    <div className="mt-3 grid gap-2">
                                      <div className="flex items-center justify-between gap-3 text-xs font-black">
                                        <span>{t("averageCompletion")}</span>
                                        <span>{project.progress}%</span>
                                      </div>
                                      <ProgressBar
                                        value={project.progress}
                                        className="h-2 bg-ink/10"
                                        barClassName="bg-limepop"
                                      />
                                      <div className="flex items-center justify-between gap-3 text-xs font-black text-ink/58">
                                        <span>{t("actualCostSoFar")}</span>
                                        <span>
                                          {formatTotal(
                                            project.actualCostSoFar,
                                            participation?.currency ?? displayCurrency
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </Link>
                                ))
                              ) : (
                                <p className="rounded-2xl bg-white/70 p-3 text-sm font-bold text-muted">
                                  {t("noPersonProjects")}
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card tone="dark" className="p-5 sm:p-6">
                <SectionHeader
                  eyebrow={t("subscriptionManagement")}
                  title={t("softwareLibrary")}
                  eyebrowClassName="text-white"
                />
                <form onSubmit={submitTool} className="mt-5 grid gap-3 rounded-studio bg-white/10 p-4">
                  <Select
                    value={toolForm.costTemplateId}
                    onChange={(event) => applyToolTemplate(setToolForm, event.target.value)}
                    aria-label={t("linkSoftwareTemplate")}
                    className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                  >
                    <option value="">{t("noCostTemplate")}</option>
                    {compatibleToolTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {formatCurrencyAmount(template.currency, template.amount)} · {t(billingTypeKeys[template.billingType])}
                      </option>
                    ))}
                  </Select>
                  <input
                    value={toolForm.name}
                    onChange={(event) => setToolForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("softwareName")}
                    disabled={Boolean(toolForm.costTemplateId)}
                    className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55"
                  />
                  <Select
                    value={toolForm.category}
                    onChange={(event) =>
                      setToolForm((current) => ({ ...current, category: event.target.value as Tool["category"] }))
                    }
                    className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                  >
                    {(["ai", "design", "dev", "game", "video", "other"] as Tool["category"][]).map((category) => (
                      <option key={category} value={category}>{t(toolCategoryKeys[category])}</option>
                    ))}
                  </Select>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <input
                      type="number"
                      min="0"
                      value={toolForm.subscriptionAmount}
                      onChange={(event) =>
                        setToolForm((current) => ({ ...current, subscriptionAmount: event.target.value }))
                      }
                      placeholder={t("subscriptionFee")}
                      disabled={Boolean(toolForm.costTemplateId)}
                      className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55"
                    />
                    <Select
                      value={toolForm.subscriptionCurrency}
                      onChange={(event) =>
                        setToolForm((current) => ({
                          ...current,
                          subscriptionCurrency: event.target.value as CostItem["currency"]
                        }))
                      }
                      disabled={Boolean(toolForm.costTemplateId)}
                      className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55"
                    >
                      {currencyOptions.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </Select>
                    <Select
                      value={toolForm.subscriptionBillingCycle}
                      onChange={(event) =>
                        setToolForm((current) => ({
                          ...current,
                          subscriptionBillingCycle: event.target.value as NonNullable<Tool["subscription"]>["billingCycle"]
                        }))
                      }
                      disabled={Boolean(toolForm.costTemplateId)}
                      className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none disabled:cursor-not-allowed disabled:bg-white/55 disabled:text-ink/55"
                    >
                      <option value="monthly">{t("billingTypeMonthly")}</option>
                      <option value="yearly">{t("billingTypeYearly")}</option>
                    </Select>
                    <label className="grid min-w-0 gap-1.5 text-xs font-black text-white/70">
                      <span className="break-words [overflow-wrap:anywhere]">{t("subscriptionExpiresAt")}</span>
                      <input
                        type="date"
                        value={toolForm.subscriptionExpiresAt}
                        onChange={(event) =>
                          setToolForm((current) => ({ ...current, subscriptionExpiresAt: event.target.value }))
                        }
                        className="h-11 min-w-0 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                      />
                    </label>
                    <label className="grid min-w-0 gap-1.5 text-xs font-black text-white/70">
                      <span className="break-words [overflow-wrap:anywhere]">{t("subscriptionPaymentAnchorAt")}</span>
                      <input
                        type="date"
                        value={toolForm.subscriptionNextPaymentAt}
                        onChange={(event) =>
                          setToolForm((current) => ({ ...current, subscriptionNextPaymentAt: event.target.value }))
                        }
                        required={Number(toolForm.subscriptionAmount) > 0}
                        max={toolForm.subscriptionExpiresAt || undefined}
                        className="h-11 min-w-0 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                      />
                    </label>
                  </div>
                  <input
                    type="email"
                    value={toolForm.subscriptionAccountEmail}
                    onChange={(event) =>
                      setToolForm((current) => ({ ...current, subscriptionAccountEmail: event.target.value }))
                    }
                    placeholder={t("subscriptionAccountEmail")}
                    className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                  />
                  {toolForm.costTemplateId ? (
                    <p className="inline-flex items-start gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-black leading-5 text-white/70">
                      <Link2 size={14} className="mt-0.5 shrink-0" />
                      {t("templateManagedFields")}
                    </p>
                  ) : null}
                  <Button type="submit" variant="secondary" size="md">
                    <Wrench size={18} />
                    {t("addSoftware")}
                  </Button>
                </form>

                <div className="mt-4 rounded-studio bg-limepop/95 p-4 text-ink">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black">{t("monthlySubscriptionCost")}</span>
                    <span className="text-2xl font-black leading-none">
                      {formatTotal(data.subscriptionSummary.monthlyTotal, data.subscriptionSummary.currency)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-ink/62">{t("subscriptionCostRule")}</p>
                </div>

                <div className="mt-5 grid gap-3">
                  {data.tools.map((tool) => {
                    const monthlyCost = getToolMonthlyCost(tool);
                    const nextPaymentDate = tool.subscription
                      ? getNextActiveSubscriptionPaymentDate(tool.subscription)
                      : null;
                    const linkedTemplate = tool.costTemplateId
                      ? costTemplateById.get(tool.costTemplateId)
                      : undefined;

                    return editingToolId === tool.id ? (
                      <form
                        key={tool.id}
                        onSubmit={updateTool}
                        className="grid gap-3 rounded-studio bg-white p-4 text-ink shadow-soft ring-2 ring-limepop/70"
                      >
                        <Select
                          value={editingToolForm.costTemplateId}
                          onChange={(event) => applyToolTemplate(setEditingToolForm, event.target.value)}
                          aria-label={t("linkSoftwareTemplate")}
                          className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        >
                          <option value="">{t("noCostTemplate")}</option>
                          {compatibleToolTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} · {formatCurrencyAmount(template.currency, template.amount)} · {t(billingTypeKeys[template.billingType])}
                            </option>
                          ))}
                        </Select>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                          <input
                            value={editingToolForm.name}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder={t("softwareName")}
                            disabled={Boolean(editingToolForm.costTemplateId)}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          />
                          <Select
                            value={editingToolForm.category}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({
                                ...current,
                                category: event.target.value as Tool["category"]
                              }))
                            }
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          >
                            {(["ai", "design", "dev", "game", "video", "other"] as Tool["category"][]).map((category) => (
                              <option key={category} value={category}>{t(toolCategoryKeys[category])}</option>
                            ))}
                          </Select>
                          <input
                            type="number"
                            min="0"
                            value={editingToolForm.subscriptionAmount}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({ ...current, subscriptionAmount: event.target.value }))
                            }
                            placeholder={t("subscriptionFee")}
                            disabled={Boolean(editingToolForm.costTemplateId)}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          />
                          <Select
                            value={editingToolForm.subscriptionCurrency}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({
                                ...current,
                                subscriptionCurrency: event.target.value as CostItem["currency"]
                              }))
                            }
                            disabled={Boolean(editingToolForm.costTemplateId)}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          >
                            {currencyOptions.map((currency) => (
                              <option key={currency} value={currency}>{currency}</option>
                            ))}
                          </Select>
                          <Select
                            value={editingToolForm.subscriptionBillingCycle}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({
                                ...current,
                                subscriptionBillingCycle: event.target.value as NonNullable<Tool["subscription"]>["billingCycle"]
                              }))
                            }
                            disabled={Boolean(editingToolForm.costTemplateId)}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          >
                            <option value="monthly">{t("billingTypeMonthly")}</option>
                            <option value="yearly">{t("billingTypeYearly")}</option>
                          </Select>
                          <label className="grid min-w-0 gap-1.5 text-xs font-black text-ink/58">
                            <span className="break-words [overflow-wrap:anywhere]">{t("subscriptionExpiresAt")}</span>
                            <input
                              type="date"
                              value={editingToolForm.subscriptionExpiresAt}
                              onChange={(event) =>
                                setEditingToolForm((current) => ({ ...current, subscriptionExpiresAt: event.target.value }))
                              }
                              className="h-11 min-w-0 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                            />
                          </label>
                          <label className="grid min-w-0 gap-1.5 text-xs font-black text-ink/58">
                            <span className="break-words [overflow-wrap:anywhere]">{t("subscriptionPaymentAnchorAt")}</span>
                            <input
                              type="date"
                              value={editingToolForm.subscriptionNextPaymentAt}
                              onChange={(event) =>
                                setEditingToolForm((current) => ({ ...current, subscriptionNextPaymentAt: event.target.value }))
                              }
                              required={Number(editingToolForm.subscriptionAmount) > 0}
                              max={editingToolForm.subscriptionExpiresAt || undefined}
                              className="h-11 min-w-0 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                            />
                          </label>
                        </div>
                        <input
                          type="email"
                          value={editingToolForm.subscriptionAccountEmail}
                          onChange={(event) =>
                            setEditingToolForm((current) => ({
                              ...current,
                              subscriptionAccountEmail: event.target.value
                            }))
                          }
                          placeholder={t("subscriptionAccountEmail")}
                          className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        />
                        {editingToolForm.costTemplateId ? (
                          <p className="inline-flex items-start gap-2 rounded-2xl bg-limepop/20 px-3 py-2 text-xs font-black leading-5 text-ink/62">
                            <Link2 size={14} className="mt-0.5 shrink-0" />
                            {t("templateManagedFields")}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm" className="min-w-28">
                            <Save size={16} />
                            {t("saveSoftware")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingToolId(null);
                              setEditingToolForm(defaultTool);
                            }}
                          >
                            <X size={16} />
                            {t("cancel")}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div key={tool.id} className="rounded-studio bg-white/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black">{tool.name}</h3>
                              <Pill tone={toolCategoryTone[tool.category]} className="min-h-8 px-3 text-xs">
                                {t(toolCategoryKeys[tool.category])}
                              </Pill>
                            </div>
                            <div className="mt-4 grid gap-2 text-xs font-black text-white/70">
                              {linkedTemplate ? (
                                <span className="inline-flex min-w-0 items-center gap-2 text-limepop">
                                  <Link2 size={14} className="shrink-0" />
                                  <span className="truncate">
                                    {t("linkedTemplate")}: {linkedTemplate.name}
                                  </span>
                                </span>
                              ) : null}
                              {tool.subscription ? (
                                <>
                                  <span className="inline-flex items-center gap-2">
                                    <CreditCard size={14} />
                                    {formatCurrencyAmount(tool.subscription.currency, tool.subscription.amount)} ·{" "}
                                    {tool.subscription.billingCycle === "monthly"
                                      ? t("billingTypeMonthly")
                                      : t("billingTypeYearly")}
                                  </span>
                                  <span className="inline-flex items-center gap-2">
                                    <Repeat size={14} />
                                    {t("monthlyEquivalent")}: {formatTotal(monthlyCost)}
                                  </span>
                                  <span className="inline-flex items-center gap-2">
                                    <CalendarClock size={14} />
                                    {t("subscriptionExpiresAt")}: {formatLocalizedDate(tool.subscription.expiresAt, language)}
                                  </span>
                                  {nextPaymentDate ? (
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                      <Repeat size={14} className="shrink-0" />
                                      <span className="break-words [overflow-wrap:anywhere]">
                                        {t("subscriptionNextPaymentAt")}: {formatLocalizedDate(nextPaymentDate, language)}
                                      </span>
                                    </span>
                                  ) : !tool.subscription.nextPaymentAt ? (
                                    <span className="break-words text-coral [overflow-wrap:anywhere]">
                                      {t("subscriptionPaymentSetupRequired")}
                                    </span>
                                  ) : null}
                                  {tool.subscription.accountEmail ? (
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                      <Mail size={14} className="shrink-0" />
                                      <span className="truncate">
                                        {t("subscriptionAccountEmail")}: {tool.subscription.accountEmail}
                                      </span>
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span>{t("noSubscription")}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditingTool(tool)}
                              aria-label={`${t("editSoftware")} ${tool.name}`}
                              className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-limepop hover:text-ink"
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({ type: "tool", id: tool.id, label: tool.name })
                              }
                              aria-label={`${t("delete")} ${tool.name}`}
                              className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-coral hover:text-white"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card tone="lime" className="bg-[#ffc700] p-5 sm:p-6">
                <SectionHeader
                  eyebrow={t("templateReusable")}
                  title={t("costTemplateLibrary")}
                  eyebrowClassName="break-words text-white [overflow-wrap:anywhere]"
                  titleClassName="break-words [overflow-wrap:anywhere]"
                />
                <form onSubmit={submitCost} className="mt-5 grid gap-3 rounded-studio bg-white/55 p-4">
                  <input
                    value={costForm.name}
                    onChange={(event) => setCostForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("costTemplateName")}
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <Select
                      value={costForm.category}
                      onChange={(event) => {
                        const category = event.target.value as CostItem["category"];
                        setCostForm((current) => ({
                          ...current,
                          category,
                          billingType:
                            category === "people"
                              ? "daily"
                              : category === "software"
                                ? "monthly"
                                : current.category === "people" || current.category === "software"
                                  ? "one-time"
                                  : current.billingType
                        }));
                      }}
                      className="h-11 min-w-0 max-w-full rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      {(["software", "people", "outsourcing", "asset", "server", "other"] as CostItem["category"][]).map((category) => (
                        <option key={category} value={category}>{t(costCategoryKeys[category])}</option>
                      ))}
                    </Select>
                    <input
                      type="number"
                      min="0"
                      value={costForm.amount || ""}
                      onChange={(event) =>
                        setCostForm((current) => ({ ...current, amount: Number(event.target.value) }))
                      }
                      placeholder={t("amount")}
                      className="h-11 min-w-0 max-w-full rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    />
                    <Select
                      value={costForm.currency}
                      onChange={(event) =>
                        setCostForm((current) => ({ ...current, currency: event.target.value as CostItem["currency"] }))
                      }
                      className="h-11 min-w-0 max-w-full rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      {(["CNY", "USD", "JPY", "EUR"] as CostItem["currency"][]).map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </Select>
                    <Select
                      value={costForm.billingType}
                      onChange={(event) =>
                        setCostForm((current) => ({ ...current, billingType: event.target.value as CostItem["billingType"] }))
                      }
                      className="h-11 min-w-0 max-w-full rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      {(["one-time", "monthly", "yearly", "hourly", "daily"] as CostItem["billingType"][]).map((billingType) => (
                        <option key={billingType} value={billingType}>{t(billingTypeKeys[billingType])}</option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" size="md">
                    <PackagePlus size={18} />
                    {t("addCostTemplate")}
                  </Button>
                </form>

                <div className="mt-5 grid gap-3">
                  {data.costTemplates.map((cost) => {
                    const linkedPeopleCount = linkedPeopleByTemplate.get(cost.id) ?? 0;
                    const linkedToolsCount = linkedToolsByTemplate.get(cost.id) ?? 0;
                    const hasLinkedItems = linkedPeopleCount + linkedToolsCount > 0;
                    const allowedBillingTypes: CostItem["billingType"][] = linkedPeopleCount
                      ? ["daily"]
                      : linkedToolsCount
                        ? ["monthly", "yearly"]
                        : ["one-time", "monthly", "yearly", "hourly", "daily"];

                    return editingCostTemplateId === cost.id ? (
                      <form
                        key={cost.id}
                        onSubmit={updateCostTemplate}
                        className="grid min-w-0 gap-3 overflow-hidden rounded-studio bg-white p-4 shadow-soft ring-2 ring-ink/15"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <p className="min-w-0 break-words text-sm font-black [overflow-wrap:anywhere]">
                            {t("editCostTemplate")}
                          </p>
                          <p className="max-w-full break-words text-xs font-black text-ink/52 [overflow-wrap:anywhere]">
                            {t("linkedPeople")}: {linkedPeopleCount} · {t("softwareLibrary")}: {linkedToolsCount}
                          </p>
                        </div>
                        <input
                          value={editingCostForm.name}
                          onChange={(event) =>
                            setEditingCostForm((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder={t("costTemplateName")}
                          className="h-11 min-w-0 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        />
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                          <Select
                            value={editingCostForm.category}
                            onChange={(event) =>
                              setEditingCostForm((current) => ({
                                ...current,
                                category: event.target.value as CostItem["category"]
                              }))
                            }
                            disabled={hasLinkedItems}
                            className="h-11 min-w-0 max-w-full rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          >
                            {(["software", "people", "outsourcing", "asset", "server", "other"] as CostItem["category"][]).map((category) => (
                              <option key={category} value={category}>{t(costCategoryKeys[category])}</option>
                            ))}
                          </Select>
                          <input
                            type="number"
                            min="0"
                            value={editingCostForm.amount || ""}
                            onChange={(event) =>
                              setEditingCostForm((current) => ({
                                ...current,
                                amount: Number(event.target.value)
                              }))
                            }
                            placeholder={t("amount")}
                            className="h-11 min-w-0 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          />
                          <Select
                            value={editingCostForm.currency}
                            onChange={(event) =>
                              setEditingCostForm((current) => ({
                                ...current,
                                currency: event.target.value as CostItem["currency"]
                              }))
                            }
                            className="h-11 min-w-0 max-w-full rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          >
                            {currencyOptions.map((currency) => (
                              <option key={currency} value={currency}>{currency}</option>
                            ))}
                          </Select>
                          <Select
                            value={editingCostForm.billingType}
                            onChange={(event) =>
                              setEditingCostForm((current) => ({
                                ...current,
                                billingType: event.target.value as CostItem["billingType"]
                              }))
                            }
                            disabled={linkedPeopleCount > 0}
                            className="h-11 min-w-0 max-w-full rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06] disabled:cursor-not-allowed disabled:bg-cloud/45 disabled:text-ink/55"
                          >
                            {allowedBillingTypes.map((billingType) => (
                              <option key={billingType} value={billingType}>{t(billingTypeKeys[billingType])}</option>
                            ))}
                          </Select>
                        </div>
                        {hasLinkedItems ? (
                          <p className="inline-flex items-start gap-2 rounded-2xl bg-limepop/20 px-3 py-2 text-xs font-black leading-5 text-ink/62">
                            <Link2 size={14} className="mt-0.5 shrink-0" />
                            {t("templateManagedFields")}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm" className="min-w-28">
                            <Save size={16} />
                            {t("updateCostTemplate")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingCostTemplateId(null);
                              setEditingCostForm(defaultCost);
                            }}
                          >
                            <X size={16} />
                            {t("cancel")}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div key={cost.id} className="min-w-0 overflow-hidden rounded-studio bg-white/65 p-4">
                        <div className="grid min-w-0 gap-3">
                          <div className="min-w-0">
                            <h3 className="break-words font-black [overflow-wrap:anywhere]">{cost.name}</h3>
                            <p className="mt-1 break-words text-sm font-bold text-muted [overflow-wrap:anywhere]">
                              {t(costCategoryKeys[cost.category])} · {t(billingTypeKeys[cost.billingType])}
                            </p>
                            <p className="mt-2 break-words text-xs font-black text-ink/58 [overflow-wrap:anywhere]">
                              {t("linkedPeople")}: {linkedPeopleCount} · {t("softwareLibrary")}: {linkedToolsCount}
                            </p>
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                            <p className="max-w-full whitespace-nowrap text-right text-[clamp(0.78rem,4vw,1.125rem)] font-black tabular-nums">
                              {formatCurrencyAmount(cost.currency, cost.amount)}
                            </p>
                            <button
                              type="button"
                              onClick={() => startEditingCostTemplate(cost)}
                              aria-label={`${t("editCostTemplate")} ${cost.name}`}
                              className="grid size-10 place-items-center rounded-full bg-white text-muted shadow-soft ring-1 ring-black/[0.04] transition hover:bg-limepop hover:text-ink"
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({ type: "costTemplate", id: cost.id, label: cost.name })
                              }
                              aria-label={`${t("delete")} ${cost.name}`}
                              className="grid size-10 place-items-center rounded-full bg-white text-muted shadow-soft ring-1 ring-black/[0.04] transition hover:bg-coral hover:text-white"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </section>
          </>
        )}
      </div>
      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("deleteItemTitle")}
        description={`${t("deleteItemDescription")}${pendingDelete?.label ? `: ${pendingDelete.label}` : ""}`}
        warning={t("deleteIrreversibleWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
      />
    </AppShell>
  );
}
