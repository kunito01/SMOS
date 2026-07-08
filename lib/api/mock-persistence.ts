import { createProjectPayments, mockDatabase } from "@/lib/mock";
import type { CostLibraryItem, Person, Project, ShareLink, Tool } from "@/lib/types";

const storageKey = "studio-map-os.mock-database";
let hydrated = false;

type PersistedMockDatabase = {
  projects: Project[];
  people: Person[];
  tools: Tool[];
  costLibrary: CostLibraryItem[];
  shareLinks: ShareLink[];
};

const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

export function hydrateMockDatabase() {
  if (hydrated || !canUseStorage()) {
    return;
  }

  hydrated = true;
  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return;
  }

  try {
    const persisted = JSON.parse(raw) as Partial<PersistedMockDatabase>;
    const seededToolsById = new Map(mockDatabase.tools.map((tool) => [tool.id, tool]));

    if (persisted.projects?.length) {
      mockDatabase.projects = persisted.projects;
      mockDatabase.projects = mockDatabase.projects.map((project, index) => ({
        ...project,
        payments: Array.isArray(project.payments) ? project.payments : createProjectPayments(project.id, index)
      }));
    }

    if (persisted.people?.length) {
      mockDatabase.people = persisted.people;
    }

    if (persisted.tools?.length) {
      mockDatabase.tools = persisted.tools.map((tool) => ({
        ...tool,
        subscription: tool.subscription ?? seededToolsById.get(tool.id)?.subscription
      }));
    }

    if (persisted.costLibrary?.length) {
      mockDatabase.costLibrary = persisted.costLibrary;
    }

    if (persisted.shareLinks?.length) {
      mockDatabase.shareLinks = persisted.shareLinks;
    }
  } catch {
    window.localStorage.removeItem(storageKey);
  }
}

export function persistMockDatabase() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      projects: mockDatabase.projects,
      people: mockDatabase.people,
      tools: mockDatabase.tools,
      costLibrary: mockDatabase.costLibrary,
      shareLinks: mockDatabase.shareLinks
    } satisfies PersistedMockDatabase)
  );
}
