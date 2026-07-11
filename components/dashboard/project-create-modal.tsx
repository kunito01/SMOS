"use client";

import { useEffect, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { librariesApi, projectsApi } from "@/lib/api";
import {
  formatDemoEntityName,
  getProjectGroupDisplayName,
  personTypeKeys,
  statusKeys,
  toolCategoryKeys
} from "@/lib/i18n/domain-labels";
import type {
  Company,
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

const statusOptions: ProjectStatus[] = ["planning", "active", "paused", "terminated", "completed"];

const defaultProjectStartDate = "2026-06-01";
const defaultProjectEndDate = "2026-10-24";

const createInitialForm = (companies: Company[], groups: ProjectGroup[]): CreateProjectInput => ({
  name: "",
  companyId: companies[0]?.id ?? "",
  groupId: groups[0]?.id ?? "",
  status: "planning",
  startDate: defaultProjectStartDate,
  endDate: defaultProjectEndDate,
  toolIds: [],
  personIds: [],
  costTemplateIds: []
});

export function ProjectCreateModal({ companies, groups, open, onClose, onCreated }: ProjectCreateModalProps) {
  const { language, t } = useI18n();
  const [people, setPeople] = useState<Person[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [form, setForm] = useState<CreateProjectInput>(() => createInitialForm(companies, groups));

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(createInitialForm(companies, groups));

    let isMounted = true;

    async function loadLibraries() {
      const [nextPeople, nextTools] = await Promise.all([
        librariesApi.listPeople(),
        librariesApi.listTools()
      ]);

      if (isMounted) {
        setPeople(nextPeople);
        setTools(nextTools);
      }
    }

    loadLibraries();

    return () => {
      isMounted = false;
    };
  }, [companies, groups, open]);

  useEffect(() => {
    if (!form.companyId && companies[0]) {
      setForm((current) => ({ ...current, companyId: companies[0].id }));
    }
  }, [companies, form.companyId]);

  useEffect(() => {
    setForm((current) => {
      const nextGroupId = groups.some((group) => group.id === current.groupId)
        ? current.groupId
        : groups[0]?.id ?? "";

      return nextGroupId === current.groupId ? current : { ...current, groupId: nextGroupId };
    });
  }, [groups]);

  if (!open) {
    return null;
  }

  const toggle = (key: "toolIds" | "personIds", id: string) => {
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
    const project = await projectsApi.createProject({
      ...form,
      name,
      endDate: form.endDate >= form.startDate ? form.endDate : form.startDate,
      costTemplateIds: []
    });
    onCreated(project);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm">
      <Card tone="white" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-hidden">
        <form onSubmit={submit} className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-5 sm:p-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-limepop">
                  <FolderPlus size={21} />
                </span>
                <p className="text-sm font-black uppercase text-muted">{t("addProject")}</p>
              </div>
              <h2 className="mt-3 text-3xl font-black leading-none">{t("createProjectTitle")}</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">{t("createProjectBudgetBody")}</p>
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
                      <Select
                        value={form.companyId}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, companyId: event.target.value }))
                        }
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      >
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {formatDemoEntityName(company.name, company.id, "company", t)}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("chooseGroup")}</span>
                      <Select
                        value={form.groupId}
                        onChange={(event) => setForm((current) => ({ ...current, groupId: event.target.value }))}
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      >
                        {groups.length === 0 ? <option value="">{t("unassignedGroup")}</option> : null}
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {getProjectGroupDisplayName(group, language, t)}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("projectStatus")}</span>
                      <Select
                        value={form.status}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, status: event.target.value as ProjectStatus }))
                        }
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>{t(statusKeys[status])}</option>
                        ))}
                      </Select>
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
                        required
                        value={form.startDate}
                        onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-muted">{t("endDate")}</span>
                      <input
                        type="date"
                        required
                        min={form.startDate}
                        value={form.endDate}
                        onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                        className="h-12 rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06]"
                      />
                    </label>
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
    </ModalPortal>
  );
}
