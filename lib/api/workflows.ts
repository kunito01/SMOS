import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import type { ProjectWorkflow } from "@/lib/types";
import {
  createEmptyProjectWorkflow,
  normalizeProjectWorkflow,
  normalizeWorkflowLibrary
} from "@/lib/utils/project-workflow";

export type CreateWorkflowInput = {
  name: string;
};

const createWorkflowId = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure workflow identity generation is unavailable");
  }

  return `workflow_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
};

export async function listWorkflows() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.workflows);
}

export async function getWorkflow(workflowId: string) {
  await hydrateMockDatabase();
  return mockApi(
    requireEntity(
      mockDatabase.workflows.find((workflow) => workflow.id === workflowId),
      `Workflow not found: ${workflowId}`
    )
  );
}

export async function createWorkflow(input: CreateWorkflowInput) {
  await hydrateMockDatabase();
  const workflow = createEmptyProjectWorkflow({
    id: createWorkflowId(),
    name: input.name
  });
  const previousWorkflows = structuredClone(mockDatabase.workflows);
  mockDatabase.workflows = normalizeWorkflowLibrary([...mockDatabase.workflows, workflow]);

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.workflows = previousWorkflows;
    throw error;
  }

  return mockApi(workflow);
}

export async function updateWorkflow(
  workflowId: string,
  workflow: ProjectWorkflow
) {
  await hydrateMockDatabase();
  const workflowIndex = mockDatabase.workflows.findIndex((item) => item.id === workflowId);
  const currentWorkflow = requireEntity(
    workflowIndex >= 0 ? mockDatabase.workflows[workflowIndex] : undefined,
    `Workflow not found: ${workflowId}`
  );

  if (workflow.id !== workflowId) {
    throw new Error("A workflow update cannot change its identity");
  }

  const nextWorkflow = normalizeProjectWorkflow({
    ...workflow,
    id: workflowId,
    createdAt: currentWorkflow.createdAt,
    updatedAt: new Date().toISOString()
  });
  const previousWorkflows = structuredClone(mockDatabase.workflows);
  const nextWorkflows = structuredClone(mockDatabase.workflows);
  nextWorkflows[workflowIndex] = nextWorkflow;
  mockDatabase.workflows = normalizeWorkflowLibrary(nextWorkflows);

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.workflows = previousWorkflows;
    throw error;
  }

  return mockApi(nextWorkflow);
}

export async function deleteWorkflow(workflowId: string) {
  await hydrateMockDatabase();
  const workflow = requireEntity(
    mockDatabase.workflows.find((item) => item.id === workflowId),
    `Workflow not found: ${workflowId}`
  );
  const previousWorkflows = structuredClone(mockDatabase.workflows);
  const previousProjects = structuredClone(mockDatabase.projects);

  mockDatabase.workflows = mockDatabase.workflows.filter((item) => item.id !== workflowId);
  mockDatabase.projects = mockDatabase.projects.map((project) => ({
    ...project,
    workflowIds: (project.workflowIds ?? []).filter((id) => id !== workflowId)
  }));

  try {
    await persistMockDatabase();
  } catch (error) {
    mockDatabase.workflows = previousWorkflows;
    mockDatabase.projects = previousProjects;
    throw error;
  }

  return mockApi(workflow);
}
