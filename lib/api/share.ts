import { mockApi, requireEntity } from "@/lib/api/mock-client";
import {
  getActiveMockDatabaseWorkspaceId,
  hydrateMockDatabase,
  persistMockDatabase
} from "@/lib/api/mock-persistence";
import { mockDatabase } from "@/lib/mock";
import {
  createPublicSharedProjectData,
  createSecurePublicShareToken,
  decryptPublicShareRecord,
  getEncryptedPublicShareRecord,
  isSecurePublicShareToken,
  readPublicShareSnapshot
} from "@/lib/security/public-share-storage";
import type { ShareLink, ShareSettings } from "@/lib/types";
import type { MoneyCurrency } from "@/lib/utils/money";

const isShareLinkExpired = (link: ShareLink) => {
  if (!link.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(link.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
};

const ensureSecureUniqueShareToken = async (
  currentToken: string | undefined,
  workspaceId: string,
  projectId: string,
  reservedTokens: Set<string> = new Set()
) => {
  if (
    currentToken &&
    isSecurePublicShareToken(currentToken) &&
    !reservedTokens.has(currentToken)
  ) {
    const published = await getEncryptedPublicShareRecord(currentToken);

    if (
      !published ||
      (published.workspaceId === workspaceId && published.payload.projectId === projectId)
    ) {
      reservedTokens.add(currentToken);
      return currentToken;
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = createSecurePublicShareToken();

    if (!reservedTokens.has(candidate) && !(await getEncryptedPublicShareRecord(candidate))) {
      reservedTokens.add(candidate);
      return candidate;
    }
  }

  throw new Error("Unable to allocate a unique share token");
};

const requireActiveWorkspaceId = () => {
  const workspaceId = getActiveMockDatabaseWorkspaceId();

  if (!workspaceId) {
    throw new Error("An unlocked workspace is required to manage sharing");
  }

  return workspaceId;
};

const getEnabledActiveShare = (token: string) => {
  const links = mockDatabase.shareLinks.filter((item) => item.token === token);

  if (links.length !== 1) {
    return null;
  }

  const link = links[0];
  const projects = mockDatabase.projects.filter((item) => item.id === link.projectId);

  if (projects.length !== 1) {
    return null;
  }

  const project = projects[0];

  if (
    !project.shareSettings.isEnabled ||
    project.shareSettings.token !== token ||
    isShareLinkExpired(link)
  ) {
    return null;
  }

  return { link, project };
};

export async function listShareLinks() {
  await hydrateMockDatabase();
  return mockApi(mockDatabase.shareLinks);
}

export async function getShareLinkByToken(token: string) {
  await hydrateMockDatabase();
  const link = requireEntity(
    mockDatabase.shareLinks.find((item) => item.token === token),
    `Share link not found: ${token}`
  );

  return mockApi(link);
}

export async function getSharedProject(token: string) {
  const normalizedToken = token.trim();
  const published = await getEncryptedPublicShareRecord(normalizedToken);
  const activeWorkspaceId = getActiveMockDatabaseWorkspaceId();
  let activeShare: ReturnType<typeof getEnabledActiveShare> = null;

  if (activeWorkspaceId) {
    await hydrateMockDatabase();
    activeShare = getEnabledActiveShare(normalizedToken);
  }

  if (
    published &&
    activeShare &&
    (published.workspaceId !== activeWorkspaceId ||
      published.payload.projectId !== activeShare.project.id)
  ) {
    throw new Error("Ambiguous share token binding");
  }

  if (published) {
    const snapshot = await decryptPublicShareRecord(published, normalizedToken);
    return mockApi(createPublicSharedProjectData(snapshot));
  }

  // Legacy weak tokens and secure records not yet migrated into IndexedDB can
  // be recovered only from the workspace that is already unlocked in memory.
  if (!activeWorkspaceId || !activeShare) {
    throw new Error(`Share link not found: ${normalizedToken}`);
  }

  const secureToken = await ensureSecureUniqueShareToken(
    activeShare.link.token,
    activeWorkspaceId,
    activeShare.project.id
  );
  activeShare.link.token = secureToken;
  activeShare.project.shareSettings.token = secureToken;
  await persistMockDatabase();

  const snapshot = await readPublicShareSnapshot(secureToken);

  if (!snapshot) {
    throw new Error("The active share could not be published securely");
  }

  return mockApi(createPublicSharedProjectData(snapshot));
}

export async function createShareLink(
  projectId: string,
  allowCostPreview = false,
  displayCurrency: MoneyCurrency = "CNY"
) {
  const workspaceId = requireActiveWorkspaceId();
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const existingLink = mockDatabase.shareLinks.find((item) => item.projectId === projectId);
  const token = await ensureSecureUniqueShareToken(
    existingLink?.token ?? project.shareSettings.token,
    workspaceId,
    projectId
  );
  const link =
    existingLink ??
    {
      id: `share-${token.slice(5, 21)}`,
      projectId,
      token,
      allowCostPreview,
      displayCurrency,
      createdAt: new Date().toISOString()
    };

  link.token = token;
  link.allowCostPreview = allowCostPreview;
  link.displayCurrency = displayCurrency;
  project.shareSettings.isEnabled = true;
  project.shareSettings.token = token;
  project.shareSettings.allowCostPreview = allowCostPreview;

  if (!existingLink) {
    mockDatabase.shareLinks.push(link);
  }

  await persistMockDatabase();
  return mockApi(link);
}

export async function updateShareSettings(
  projectId: string,
  settings: Partial<ShareSettings>,
  displayCurrency?: MoneyCurrency
) {
  const workspaceId = requireActiveWorkspaceId();
  await hydrateMockDatabase();
  const project = requireEntity(
    mockDatabase.projects.find((item) => item.id === projectId),
    `Project not found: ${projectId}`
  );
  const safeSettings = { ...settings };
  delete safeSettings.token;

  project.shareSettings = {
    ...project.shareSettings,
    ...safeSettings
  };

  let link = mockDatabase.shareLinks.find((item) => item.projectId === projectId);

  if (project.shareSettings.isEnabled) {
    const token = await ensureSecureUniqueShareToken(
      link?.token ?? project.shareSettings.token,
      workspaceId,
      projectId
    );

    if (!link) {
      link = {
        id: `share-${token.slice(5, 21)}`,
        projectId,
        token,
        allowCostPreview: project.shareSettings.allowCostPreview,
        displayCurrency: displayCurrency ?? "CNY",
        createdAt: new Date().toISOString()
      };
      mockDatabase.shareLinks.push(link);
    }

    link.token = token;
    link.allowCostPreview = project.shareSettings.allowCostPreview;
    link.displayCurrency = displayCurrency ?? link.displayCurrency ?? "CNY";
    project.shareSettings.token = token;
  } else if (link) {
    link.allowCostPreview = project.shareSettings.allowCostPreview;
    if (displayCurrency) {
      link.displayCurrency = displayCurrency;
    }
  }

  // The persistence transaction rebuilds this workspace's complete public
  // record set, so disabling or rotating a link revokes the old record atomically.
  await persistMockDatabase();
  return mockApi(project.shareSettings);
}

export async function updateShareDisplayCurrency(displayCurrency: MoneyCurrency) {
  const workspaceId = requireActiveWorkspaceId();
  await hydrateMockDatabase();
  const reservedTokens = new Set<string>();

  for (const link of mockDatabase.shareLinks) {
    const project = mockDatabase.projects.find((item) => item.id === link.projectId);
    link.displayCurrency = displayCurrency;

    if (project?.shareSettings.isEnabled) {
      link.token = await ensureSecureUniqueShareToken(
        link.token,
        workspaceId,
        project.id,
        reservedTokens
      );
      project.shareSettings.token = link.token;
    }
  }

  await persistMockDatabase();

  return mockApi({
    displayCurrency,
    updatedLinkCount: mockDatabase.shareLinks.length
  });
}
