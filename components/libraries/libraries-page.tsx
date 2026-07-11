"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { librariesApi } from "@/lib/api";
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
import { languageLocales } from "@/lib/i18n/translations";
import type { CostItem, CostLibraryItem, Person, PersonProjectParticipation, ProjectStatus, Tool } from "@/lib/types";
import { formatCurrency, toCny } from "@/lib/utils/money";

type LibrariesData = {
  people: Person[];
  tools: Tool[];
  costTemplates: CostLibraryItem[];
  personProjects: PersonProjectParticipation[];
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
  const { language, t } = useI18n();
  const [data, setData] = useState<LibrariesData | null>(null);
  const [personForm, setPersonForm] = useState(defaultPerson);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPersonForm, setEditingPersonForm] = useState(defaultPerson);
  const [toolForm, setToolForm] = useState(defaultTool);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editingToolForm, setEditingToolForm] = useState(defaultTool);
  const [costForm, setCostForm] = useState(defaultCost);
  const [pendingDelete, setPendingDelete] = useState<PendingLibraryDelete | null>(null);
  const [expandedPersonProjectsId, setExpandedPersonProjectsId] = useState<string | null>(null);

  const load = async () => {
    const [people, tools, costTemplates, personProjects, subscriptionSummary] = await Promise.all([
      librariesApi.listPeople(),
      librariesApi.listTools(),
      librariesApi.listCostTemplates(),
      librariesApi.listPersonProjectParticipation(),
      librariesApi.getToolSubscriptionSummary()
    ]);
    setData({ people, tools, costTemplates, personProjects, subscriptionSummary });
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
  const personProjectsById = useMemo(
    () => new Map((data?.personProjects ?? []).map((summary) => [summary.personId, summary])),
    [data?.personProjects]
  );

  const formatMoney = (currency?: CostItem["currency"], amount?: number) =>
    amount && currency ? `${currency} ${amount.toLocaleString(languageLocales[language])}` : t("noDailyCost");
  const formatCny = (value: number) => formatCurrency(value, "CNY", languageLocales[language]);

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
                        value: formatCny(data.subscriptionSummary.monthlyTotal),
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
                              {formatCny(participation?.actualCostTotal ?? 0)}
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
                              <span className="mt-1 block text-xs font-bold text-ink/42">
                                {projectRows.length} {t("projectsCount")}
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
                                    href={`/projects/${project.projectId}`}
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
                                            t
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
                                        <span>{formatCny(project.actualCostSoFar)}</span>
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
                      {formatCny(data.subscriptionSummary.monthlyTotal)}
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
                                    {tool.subscription.currency} {tool.subscription.amount.toLocaleString(languageLocales[language])} ·{" "}
                                    {tool.subscription.billingCycle === "monthly"
                                      ? t("billingTypeMonthly")
                                      : t("billingTypeYearly")}
                                  </span>
                                  <span className="inline-flex items-center gap-2">
                                    <Repeat size={14} />
                                    {t("monthlyEquivalent")}: {formatCny(monthlyCost)}
                                  </span>
                                  <span className="inline-flex items-center gap-2">
                                    <CalendarClock size={14} />
                                    {t("subscriptionExpiresAt")}: {formatLocalizedDate(tool.subscription.expiresAt, language)}
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
                  eyebrowClassName="text-white"
                />
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
                  ))}
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
