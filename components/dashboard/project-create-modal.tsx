"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { librariesApi, projectsApi } from "@/lib/api";
import {
  billingTypeKeys,
  costCategoryKeys,
  groupNameKeys,
  personTypeKeys,
  statusKeys,
  toolCategoryKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import type {
  Company,
  CostItem,
  CostLibraryItem,
  CreateProjectInput,
  Person,
  Project,
  ProjectGroup,
  ProjectStatus,
  Tool
} from "@/lib/types";
import { cn } from "@/lib/utils/cn";

type ProjectCreateModalProps = {
  companies: Company[];
  groups: ProjectGroup[];
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
};

const statusOptions: ProjectStatus[] = ["planning", "active", "paused", "completed"];

const today = "2026-06-26";

const addMonths = (date: string, months: number) => {
  const next = new Date(`${date}T00:00:00`);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
};

export function ProjectCreateModal({ companies, groups, open, onClose, onCreated }: ProjectCreateModalProps) {
  const { t } = useI18n();
  const [people, setPeople] = useState<Person[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [costTemplates, setCostTemplates] = useState<CostLibraryItem[]>([]);
  const [form, setForm] = useState<CreateProjectInput>({
    name: "",
    companyId: companies[0]?.id ?? "",
    groupId: groups[0]?.id ?? "",
    status: "planning",
    startDate: today,
    endDate: addMonths(today, 4),
    toolIds: [],
    personIds: [],
    costTemplateIds: []
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    let isMounted = true;

    async function loadLibraries() {
      const [nextPeople, nextTools, nextCostTemplates] = await Promise.all([
        librariesApi.listPeople(),
        librariesApi.listTools(),
        librariesApi.listCostTemplates()
      ]);

      if (isMounted) {
        setPeople(nextPeople);
        setTools(nextTools);
        setCostTemplates(nextCostTemplates);
        setForm((current) => ({
          ...current,
          personIds: current.personIds.length ? current.personIds : nextPeople.slice(0, 3).map((person) => person.id),
          toolIds: current.toolIds.length ? current.toolIds : nextTools.slice(0, 4).map((tool) => tool.id),
          costTemplateIds: current.costTemplateIds.length
            ? current.costTemplateIds
            : nextCostTemplates.slice(0, 2).map((cost) => cost.id)
        }));
      }
    }

    loadLibraries();

    return () => {
      isMounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!form.companyId && companies[0]) {
      setForm((current) => ({ ...current, companyId: companies[0].id }));
    }
  }, [companies, form.companyId]);

  const availableGroups = useMemo(
    () => groups.filter((group) => group.companyId === form.companyId),
    [form.companyId, groups]
  );

  useEffect(() => {
    if (availableGroups.length && !availableGroups.some((group) => group.id === form.groupId)) {
      setForm((current) => ({ ...current, groupId: availableGroups[0].id }));
    }
  }, [availableGroups, form.groupId]);

  if (!open) {
    return null;
  }

  const toggle = (key: "toolIds" | "personIds" | "costTemplateIds", id: string) => {
    setForm((current) => {
      const values = current[key];
      return {
        ...current,
        [key]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id]
      };
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim() || t("projectNamePlaceholder");
    const project = await projectsApi.createProject({ ...form, name });
    onCreated(project);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-3 backdrop-blur-sm">
      <Card tone="white" className="max-h-[92vh] w-full max-w-5xl overflow-hidden">
        <form onSubmit={submit} className="flex max-h-[92vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-5 sm:p-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-limepop">
                  <FolderPlus size={21} />
                </span>
                <p className="text-sm font-black uppercase text-muted">{t("addProject")}</p>
              </div>
              <h2 className="mt-3 text-3xl font-black leading-none">{t("createProjectTitle")}</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">{t("createProjectBody")}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={t("cancel")} onClick={onClose}>
              <X size={20} />
            </Button>
          </div>

          <div className="studio-scroll overflow-y-auto p-5 sm:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.6fr)]">
              <div className="grid gap-4">
                <section className="rounded-studio bg-cloud/70 p-4">
                  <h3 className="text-xl font-black">{t("projectBasics")}</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 sm:col-span-2">
                      <span className="text-sm font-black text-muted">{t("projectName")}</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder={t("projectNamePlaceholder")}
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06] focus:ring-coral"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("chooseCompany")}</span>
                      <select
                        value={form.companyId}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, companyId: event.target.value, groupId: "" }))
                        }
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      >
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>{company.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("chooseGroup")}</span>
                      <select
                        value={form.groupId}
                        onChange={(event) => setForm((current) => ({ ...current, groupId: event.target.value }))}
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      >
                        {availableGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {translateDomainLabel(group.name, groupNameKeys, t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("projectStatus")}</span>
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, status: event.target.value as ProjectStatus }))
                        }
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>{t(statusKeys[status])}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="rounded-studio bg-cloud/70 p-4">
                  <h3 className="text-xl font-black">{t("projectDates")}</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("startDate")}</span>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("endDate")}</span>
                      <input
                        type="date"
                        value={form.endDate}
                        onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-studio bg-cloud/70 p-4">
                  <h3 className="text-xl font-black">{t("chooseCostTemplates")}</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {costTemplates.map((cost) => (
                      <label key={cost.id} className="flex cursor-pointer gap-3 rounded-studio bg-white p-3">
                        <input
                          type="checkbox"
                          checked={form.costTemplateIds.includes(cost.id)}
                          onChange={() => toggle("costTemplateIds", cost.id)}
                          className="mt-1 size-5 shrink-0 accent-coral"
                        />
                        <span className="min-w-0">
                          <span className="block font-black">{cost.name}</span>
                          <span className="mt-1 block text-xs font-bold text-muted">
                            {t(costCategoryKeys[cost.category as CostItem["category"]])} · {cost.currency} {cost.amount} · {t(billingTypeKeys[cost.billingType])}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid gap-4 content-start">
                <section className="rounded-studio bg-limepop p-4">
                  <h3 className="text-xl font-black">{t("choosePeople")}</h3>
                  <div className="mt-4 grid gap-2">
                    {people.map((person) => (
                      <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-full bg-white/70 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={form.personIds.includes(person.id)}
                          onChange={() => toggle("personIds", person.id)}
                          className="size-5 accent-coral"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-black">{person.name}</span>
                        <Pill tone="cloud" className="min-h-7 px-3 text-xs">{t(personTypeKeys[person.type])}</Pill>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="rounded-studio bg-ink p-4 text-white">
                  <h3 className="text-xl font-black">{t("chooseTools")}</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tools.map((tool) => {
                      const active = form.toolIds.includes(tool.id);
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => toggle("toolIds", tool.id)}
                          className={cn(
                            "h-10 rounded-full px-4 text-sm font-black transition",
                            active ? "bg-limepop text-ink" : "bg-white/10 text-white hover:bg-white/20"
                          )}
                        >
                          {tool.name} · {t(toolCategoryKeys[tool.category])}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-black/[0.06] p-5 sm:p-6">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" size="md">
              <FolderPlus size={18} />
              {t("createProject")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
