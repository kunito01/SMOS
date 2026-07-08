"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
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
import { MetricTile } from "@/components/domain/metric-tile";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { SectionHeader } from "@/components/ui/section-header";
import { librariesApi } from "@/lib/api";
import {
  billingTypeKeys,
  costCategoryKeys,
  personTypeKeys,
  toolCategoryKeys
} from "@/lib/i18n/domain-labels";
import type { CostItem, CostLibraryItem, Person, Tool } from "@/lib/types";
import { formatCurrency, toCny } from "@/lib/utils/money";

type LibrariesData = {
  people: Person[];
  tools: Tool[];
  costTemplates: CostLibraryItem[];
  subscriptionSummary: {
    activeSubscriptionCount: number;
    monthlyTotal: number;
  };
};

type PersonForm = Pick<Person, "name" | "role" | "type"> & {
  costTemplateId: string;
  dailyCost: string;
  dailyCostCurrency: NonNullable<Person["dailyCostCurrency"]>;
};

type ToolForm = Pick<Tool, "name" | "category"> & {
  subscriptionAmount: string;
  subscriptionCurrency: CostItem["currency"];
  subscriptionBillingCycle: NonNullable<Tool["subscription"]>["billingCycle"];
  subscriptionExpiresAt: string;
  subscriptionAccountEmail: string;
};

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
  subscriptionAmount: "",
  subscriptionCurrency: "CNY",
  subscriptionBillingCycle: "monthly",
  subscriptionExpiresAt: "2026-12-31",
  subscriptionAccountEmail: ""
};

const defaultCost: Omit<CostLibraryItem, "id"> = {
  name: "",
  category: "software",
  amount: 0,
  currency: "CNY",
  billingType: "one-time",
  isActual: false
};

export function LibrariesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<LibrariesData | null>(null);
  const [personForm, setPersonForm] = useState(defaultPerson);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPersonForm, setEditingPersonForm] = useState(defaultPerson);
  const [toolForm, setToolForm] = useState(defaultTool);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editingToolForm, setEditingToolForm] = useState(defaultTool);
  const [costForm, setCostForm] = useState(defaultCost);

  const load = async () => {
    const [people, tools, costTemplates, subscriptionSummary] = await Promise.all([
      librariesApi.listPeople(),
      librariesApi.listTools(),
      librariesApi.listCostTemplates(),
      librariesApi.getToolSubscriptionSummary()
    ]);
    setData({ people, tools, costTemplates, subscriptionSummary });
  };

  useEffect(() => {
    load();
  }, []);

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
  const linkedPeopleByTemplate = useMemo(() => {
    const counts = new Map<string, number>();

    (data?.people ?? []).forEach((person) => {
      if (person.costTemplateId) {
        counts.set(person.costTemplateId, (counts.get(person.costTemplateId) ?? 0) + 1);
      }
    });

    return counts;
  }, [data?.people]);

  const formatMoney = (currency?: CostItem["currency"], amount?: number) =>
    amount && currency ? `${currency} ${amount.toLocaleString()}` : t("noDailyCost");

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
    subscriptionAmount: tool.subscription?.amount ? String(tool.subscription.amount) : "",
    subscriptionCurrency: tool.subscription?.currency ?? "CNY",
    subscriptionBillingCycle: tool.subscription?.billingCycle ?? "monthly",
    subscriptionExpiresAt: tool.subscription?.expiresAt ?? "2026-12-31",
    subscriptionAccountEmail: tool.subscription?.accountEmail ?? ""
  });

  const toolPayload = (form: ToolForm) => {
    const amount = Number(form.subscriptionAmount);

    return {
      name: form.name.trim(),
      category: form.category,
      subscription:
        amount > 0 && form.subscriptionAccountEmail.trim()
          ? {
              amount,
              currency: form.subscriptionCurrency,
              billingCycle: form.subscriptionBillingCycle,
              expiresAt: form.subscriptionExpiresAt,
              accountEmail: form.subscriptionAccountEmail.trim()
            }
          : undefined
    };
  };

  const getToolMonthlyCost = (tool: Tool) => {
    if (!tool.subscription?.amount) {
      return 0;
    }

    const monthlyAmount =
      tool.subscription.billingCycle === "yearly"
        ? tool.subscription.amount / 12
        : tool.subscription.amount;

    return toCny(monthlyAmount, tool.subscription.currency);
  };

  const submitPerson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!personForm.name.trim() || !personForm.role.trim()) {
      return;
    }
    await librariesApi.addPerson(personPayload(personForm));
    setPersonForm(defaultPerson);
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

  const removePerson = async (personId: string) => {
    await librariesApi.deletePerson(personId);
    await load();
  };

  const startEditingPerson = (person: Person) => {
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
    await load();
  };

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        {!data ? (
          <LoadingState label={t("loading")} />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
              <Card tone="aqua" className="relative overflow-hidden p-6 sm:p-8">
                <p className="text-sm font-black uppercase text-ink/60">{t("navLibraries")}</p>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.96] sm:text-6xl">
                  {t("librariesTitle")}
                </h1>
                <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-ink/65">
                  {t("librariesBody")}
                </p>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricTile label={t("peopleLibrary")} value={totals.people} icon={UserPlus} tone="lime" />
                <MetricTile label={t("softwareLibrary")} value={totals.tools} icon={Wrench} tone="dark" />
                <MetricTile
                  label={t("monthlySubscriptionCost")}
                  value={formatCurrency(data.subscriptionSummary.monthlyTotal)}
                  icon={CreditCard}
                  tone="aqua"
                />
                <MetricTile label={t("costTemplateLibrary")} value={totals.costs} icon={CircleDollarSign} tone="coral" />
              </div>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-3">
              <Card tone="white" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("templateReusable")} title={t("peopleLibrary")} />
                <form onSubmit={submitPerson} className="mt-5 grid gap-3 rounded-studio bg-cloud/70 p-4">
                  <input
                    value={personForm.name}
                    onChange={(event) => setPersonForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("personName")}
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  />
                  <input
                    value={personForm.role}
                    onChange={(event) => setPersonForm((current) => ({ ...current, role: event.target.value }))}
                    placeholder={t("role")}
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  />
                  <select
                    value={personForm.type}
                    onChange={(event) =>
                      setPersonForm((current) => ({ ...current, type: event.target.value as Person["type"] }))
                    }
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  >
                    {(["internal", "external", "vendor", "ai-tool"] as Person["type"][]).map((type) => (
                      <option key={type} value={type}>{t(personTypeKeys[type])}</option>
                    ))}
                  </select>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)]">
                    <input
                      type="number"
                      min="0"
                      value={personForm.dailyCost}
                      onChange={(event) => setPersonForm((current) => ({ ...current, dailyCost: event.target.value }))}
                      placeholder={t("dailyCost")}
                      className="h-11 min-w-0 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    />
                    <select
                      value={personForm.dailyCostCurrency}
                      onChange={(event) =>
                        setPersonForm((current) => ({
                          ...current,
                          dailyCostCurrency: event.target.value as NonNullable<Person["dailyCostCurrency"]>
                        }))
                      }
                      className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      {currencyOptions.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={personForm.costTemplateId}
                    onChange={(event) => setPersonForm((current) => ({ ...current, costTemplateId: event.target.value }))}
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  >
                    <option value="">{t("noCostTemplate")}</option>
                    {data.costTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.currency} {template.amount}
                      </option>
                    ))}
                  </select>
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
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          />
                        </div>
                        <select
                          value={editingPersonForm.type}
                          onChange={(event) =>
                            setEditingPersonForm((current) => ({ ...current, type: event.target.value as Person["type"] }))
                          }
                          className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        >
                          {(["internal", "external", "vendor", "ai-tool"] as Person["type"][]).map((type) => (
                            <option key={type} value={type}>{t(personTypeKeys[type])}</option>
                          ))}
                        </select>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(7rem,0.45fr)]">
                          <input
                            type="number"
                            min="0"
                            value={editingPersonForm.dailyCost}
                            onChange={(event) =>
                              setEditingPersonForm((current) => ({ ...current, dailyCost: event.target.value }))
                            }
                            placeholder={t("dailyCost")}
                            className="h-11 min-w-0 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          />
                          <select
                            value={editingPersonForm.dailyCostCurrency}
                            onChange={(event) =>
                              setEditingPersonForm((current) => ({
                                ...current,
                                dailyCostCurrency: event.target.value as NonNullable<Person["dailyCostCurrency"]>
                              }))
                            }
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          >
                            {currencyOptions.map((currency) => (
                              <option key={currency} value={currency}>{currency}</option>
                            ))}
                          </select>
                        </div>
                        <select
                          value={editingPersonForm.costTemplateId}
                          onChange={(event) =>
                            setEditingPersonForm((current) => ({ ...current, costTemplateId: event.target.value }))
                          }
                          className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                        >
                          <option value="">{t("noCostTemplate")}</option>
                          {data.costTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} · {template.currency} {template.amount}
                            </option>
                          ))}
                        </select>
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
                              onClick={() => removePerson(person.id)}
                              aria-label={`${t("delete")} ${person.name}`}
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

              <Card tone="dark" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("subscriptionManagement")} title={t("softwareLibrary")} />
                <form onSubmit={submitTool} className="mt-5 grid gap-3 rounded-studio bg-white/10 p-4">
                  <input
                    value={toolForm.name}
                    onChange={(event) => setToolForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("softwareName")}
                    className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                  />
                  <select
                    value={toolForm.category}
                    onChange={(event) =>
                      setToolForm((current) => ({ ...current, category: event.target.value as Tool["category"] }))
                    }
                    className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                  >
                    {(["ai", "design", "dev", "game", "video", "other"] as Tool["category"][]).map((category) => (
                      <option key={category} value={category}>{t(toolCategoryKeys[category])}</option>
                    ))}
                  </select>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <input
                      type="number"
                      min="0"
                      value={toolForm.subscriptionAmount}
                      onChange={(event) =>
                        setToolForm((current) => ({ ...current, subscriptionAmount: event.target.value }))
                      }
                      placeholder={t("subscriptionFee")}
                      className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                    />
                    <select
                      value={toolForm.subscriptionCurrency}
                      onChange={(event) =>
                        setToolForm((current) => ({
                          ...current,
                          subscriptionCurrency: event.target.value as CostItem["currency"]
                        }))
                      }
                      className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                    >
                      {currencyOptions.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                    <select
                      value={toolForm.subscriptionBillingCycle}
                      onChange={(event) =>
                        setToolForm((current) => ({
                          ...current,
                          subscriptionBillingCycle: event.target.value as NonNullable<Tool["subscription"]>["billingCycle"]
                        }))
                      }
                      className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                    >
                      <option value="monthly">{t("billingTypeMonthly")}</option>
                      <option value="yearly">{t("billingTypeYearly")}</option>
                    </select>
                    <input
                      type="date"
                      value={toolForm.subscriptionExpiresAt}
                      onChange={(event) =>
                        setToolForm((current) => ({ ...current, subscriptionExpiresAt: event.target.value }))
                      }
                      className="h-11 rounded-full border-0 bg-white/90 px-4 text-sm font-bold text-ink outline-none"
                    />
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
                  <Button type="submit" variant="secondary" size="md">
                    <Wrench size={18} />
                    {t("addSoftware")}
                  </Button>
                </form>

                <div className="mt-4 rounded-studio bg-limepop/95 p-4 text-ink">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black">{t("monthlySubscriptionCost")}</span>
                    <span className="text-2xl font-black leading-none">
                      {formatCurrency(data.subscriptionSummary.monthlyTotal)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-ink/62">{t("subscriptionCostRule")}</p>
                </div>

                <div className="mt-5 grid gap-3">
                  {data.tools.map((tool) => {
                    const monthlyCost = getToolMonthlyCost(tool);

                    return editingToolId === tool.id ? (
                      <form
                        key={tool.id}
                        onSubmit={updateTool}
                        className="grid gap-3 rounded-studio bg-white p-4 text-ink shadow-soft ring-2 ring-limepop/70"
                      >
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                          <input
                            value={editingToolForm.name}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder={t("softwareName")}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          />
                          <select
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
                          </select>
                          <input
                            type="number"
                            min="0"
                            value={editingToolForm.subscriptionAmount}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({ ...current, subscriptionAmount: event.target.value }))
                            }
                            placeholder={t("subscriptionFee")}
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          />
                          <select
                            value={editingToolForm.subscriptionCurrency}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({
                                ...current,
                                subscriptionCurrency: event.target.value as CostItem["currency"]
                              }))
                            }
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          >
                            {currencyOptions.map((currency) => (
                              <option key={currency} value={currency}>{currency}</option>
                            ))}
                          </select>
                          <select
                            value={editingToolForm.subscriptionBillingCycle}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({
                                ...current,
                                subscriptionBillingCycle: event.target.value as NonNullable<Tool["subscription"]>["billingCycle"]
                              }))
                            }
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          >
                            <option value="monthly">{t("billingTypeMonthly")}</option>
                            <option value="yearly">{t("billingTypeYearly")}</option>
                          </select>
                          <input
                            type="date"
                            value={editingToolForm.subscriptionExpiresAt}
                            onChange={(event) =>
                              setEditingToolForm((current) => ({ ...current, subscriptionExpiresAt: event.target.value }))
                            }
                            className="h-11 rounded-full border-0 bg-cloud/75 px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                          />
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
                              {tool.subscription ? (
                                <>
                                  <span className="inline-flex items-center gap-2">
                                    <CreditCard size={14} />
                                    {tool.subscription.currency} {tool.subscription.amount.toLocaleString()} ·{" "}
                                    {tool.subscription.billingCycle === "monthly"
                                      ? t("billingTypeMonthly")
                                      : t("billingTypeYearly")}
                                  </span>
                                  <span className="inline-flex items-center gap-2">
                                    <Repeat size={14} />
                                    {t("monthlyEquivalent")}: {formatCurrency(monthlyCost)}
                                  </span>
                                  <span className="inline-flex items-center gap-2">
                                    <CalendarClock size={14} />
                                    {t("subscriptionExpiresAt")}: {tool.subscription.expiresAt}
                                  </span>
                                  <span className="inline-flex min-w-0 items-center gap-2">
                                    <Mail size={14} className="shrink-0" />
                                    <span className="truncate">
                                      {t("subscriptionAccountEmail")}: {tool.subscription.accountEmail}
                                    </span>
                                  </span>
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
                              onClick={() => removeTool(tool.id)}
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

              <Card tone="lime" className="p-5 sm:p-6">
                <SectionHeader eyebrow={t("templateReusable")} title={t("costTemplateLibrary")} />
                <form onSubmit={submitCost} className="mt-5 grid gap-3 rounded-studio bg-white/55 p-4">
                  <input
                    value={costForm.name}
                    onChange={(event) => setCostForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t("costTemplateName")}
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <select
                      value={costForm.category}
                      onChange={(event) =>
                        setCostForm((current) => ({ ...current, category: event.target.value as CostItem["category"] }))
                      }
                      className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      {(["software", "people", "outsourcing", "asset", "server", "other"] as CostItem["category"][]).map((category) => (
                        <option key={category} value={category}>{t(costCategoryKeys[category])}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={costForm.amount || ""}
                      onChange={(event) =>
                        setCostForm((current) => ({ ...current, amount: Number(event.target.value) }))
                      }
                      placeholder={t("amount")}
                      className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    />
                    <select
                      value={costForm.currency}
                      onChange={(event) =>
                        setCostForm((current) => ({ ...current, currency: event.target.value as CostItem["currency"] }))
                      }
                      className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      {(["CNY", "USD", "JPY", "EUR"] as CostItem["currency"][]).map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                    <select
                      value={costForm.billingType}
                      onChange={(event) =>
                        setCostForm((current) => ({ ...current, billingType: event.target.value as CostItem["billingType"] }))
                      }
                      className="h-11 rounded-full border-0 bg-white px-4 text-sm font-bold outline-none ring-1 ring-black/[0.06]"
                    >
                      {(["one-time", "monthly", "yearly", "hourly", "daily"] as CostItem["billingType"][]).map((billingType) => (
                        <option key={billingType} value={billingType}>{t(billingTypeKeys[billingType])}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" size="md">
                    <PackagePlus size={18} />
                    {t("addCostTemplate")}
                  </Button>
                </form>

                <div className="mt-5 grid gap-3">
                  {data.costTemplates.map((cost) => (
                    <div key={cost.id} className="rounded-studio bg-white/65 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black">{cost.name}</h3>
                          <p className="mt-1 text-sm font-bold text-muted">
                            {t(costCategoryKeys[cost.category])} · {t(billingTypeKeys[cost.billingType])}
                          </p>
                          <p className="mt-2 text-xs font-black text-ink/58">
                            {t("linkedPeople")}: {linkedPeopleByTemplate.get(cost.id) ?? 0}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <p className="text-right text-lg font-black">
                            {cost.currency} {cost.amount}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeCostTemplate(cost.id)}
                            aria-label={`${t("delete")} ${cost.name}`}
                            className="grid size-10 place-items-center rounded-full bg-white text-muted shadow-soft ring-1 ring-black/[0.04] transition hover:bg-coral hover:text-white"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
