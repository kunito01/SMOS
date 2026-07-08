import { mockApi, requireEntity } from "@/lib/api/mock-client";
import { hydrateMockDatabase, persistMockDatabase } from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import type { ShareSettings } from "@/lib/types";

export async function listShareLinks() {
  hydrateMockDatabase();
  return mockApi(mockDatabase.shareLinks);
}

export async function getShareLinkByToken(token: string) {
  hydrateMockDatabase();
  const link = requireEntity(
    mockDatabase.shareLinks.find((item) => item.token === token),
    `Share link not found: ${token}`
  );

  return mockApi(link);
}

export async function getSharedProject(token: string) {
  hydrateMockDatabase();
  const link = requireEntity(
    mockDatabase.shareLinks.find((item) => item.token === token),
    `Share link not found: ${token}`
  );
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === link.projectId),
    `Shared project not found: ${link.projectId}`
  );

  return mockApi({
    project,
    shareLink: link,
    canShowCost: link.allowCostPreview && project.shareSettings.allowCostPreview
  });
}

export async function createShareLink(projectId: string, allowCostPreview = false) {
  hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const existingLink = mockDatabase.shareLinks.find((item) => item.projectId === projectId);
  const token = existingLink?.token ?? `${projectId}-mock-share`;
  const link =
    existingLink ??
    {
      id: `share-${mockDatabase.shareLinks.length + 1}`,
      projectId,
      token,
      allowCostPreview,
      createdAt: new Date().toISOString()
    };

  link.allowCostPreview = allowCostPreview;

  project.shareSettings.isEnabled = true;
  project.shareSettings.token = token;
  project.shareSettings.allowCostPreview = allowCostPreview;

  if (!existingLink) {
    mockDatabase.shareLinks.push(link);
  }

  persistMockDatabase();

  return mockApi(link);
}

export async function updateShareSettings(projectId: string, settings: Partial<ShareSettings>) {
  hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );

  project.shareSettings = {
    ...project.shareSettings,
    ...settings
  };

  if (project.shareSettings.isEnabled && !project.shareSettings.token) {
    const link = await createShareLink(projectId, project.shareSettings.allowCostPreview);
    project.shareSettings.token = link.token;
  }

  const link = mockDatabase.shareLinks.find((item) => item.projectId === projectId);

  if (link) {
    link.allowCostPreview = project.shareSettings.allowCostPreview;
  }

  persistMockDatabase();

  return mockApi(project.shareSettings);
}
