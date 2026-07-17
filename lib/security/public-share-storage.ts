import {
  getPublicShareRecord,
  type PublicShareRecord
} from "@/lib/storage/indexed-db";
import { validateWorkspaceId } from "@/lib/security/workspace-crypto";
import type { Project, ShareLink, Tool } from "@/lib/types";
import { isMoneyCurrency } from "@/lib/utils/money";

const PUBLIC_SHARE_PAYLOAD_SCHEMA = "studio-map-os.encrypted-public-share" as const;
const PUBLIC_SHARE_PAYLOAD_VERSION = 1 as const;
const PUBLIC_SHARE_SNAPSHOT_SCHEMA = "studio-map-os.public-share-snapshot" as const;
const PUBLIC_SHARE_SNAPSHOT_VERSION = 1 as const;
const PUBLIC_SHARE_RECORD_SCHEMA = "studio-map-os.public-share-record" as const;
const PUBLIC_SHARE_RECORD_VERSION = 1 as const;
const HKDF_SALT_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const SECURE_SHARE_TOKEN_PATTERN = /^smos_[0-9a-f]{48}$/;
const SHARE_TOKEN_DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type PublicShareDatabase = {
  projects: Project[];
  shareLinks: ShareLink[];
  tools: Tool[];
};

type PublicShareKeyDerivation = {
  name: "HKDF";
  hash: "SHA-256";
  salt: string;
};

type PublicShareCiphertext = {
  name: "AES-GCM";
  iv: string;
  ciphertext: string;
};

export type EncryptedPublicSharePayload = {
  schema: typeof PUBLIC_SHARE_PAYLOAD_SCHEMA;
  version: typeof PUBLIC_SHARE_PAYLOAD_VERSION;
  projectId: string;
  keyDerivation: PublicShareKeyDerivation;
  encryptedPayload: PublicShareCiphertext;
};

export type EncryptedPublicShareRecord = PublicShareRecord<EncryptedPublicSharePayload>;

export type DecryptedPublicShareSnapshot = {
  schema: typeof PUBLIC_SHARE_SNAPSHOT_SCHEMA;
  version: typeof PUBLIC_SHARE_SNAPSHOT_VERSION;
  tokenDigest: string;
  workspaceId: string;
  projectId: string;
  publishedAt: string;
  project: Project;
  shareLink: ShareLink;
};

export type PublicSharedProjectData = {
  project: Project;
  shareLink: ShareLink;
  canShowCost: boolean;
};

export type PublicShareStorageErrorCode =
  | "CRYPTO_UNAVAILABLE"
  | "INVALID_TOKEN"
  | "INVALID_RECORD"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED";

export class PublicShareStorageError extends Error {
  readonly code: PublicShareStorageErrorCode;

  constructor(code: PublicShareStorageErrorCode, message: string) {
    super(message);
    this.name = "PublicShareStorageError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type JsonRecord = Record<string, unknown>;
type OwnedBytes = Uint8Array<ArrayBuffer>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const isRecord = (value: unknown): value is JsonRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (value: JsonRecord, expectedKeys: readonly string[]) => {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const isCanonicalIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const getWebCrypto = () => {
  const webCrypto = globalThis.crypto;

  if (!webCrypto?.subtle || typeof webCrypto.getRandomValues !== "function") {
    throw new PublicShareStorageError(
      "CRYPTO_UNAVAILABLE",
      "Secure public sharing requires the Web Crypto API."
    );
  }

  return webCrypto;
};

const randomBytes = (length: number): OwnedBytes =>
  getWebCrypto().getRandomValues(new Uint8Array(length));

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
};

const bytesToBase64Url = (bytes: Uint8Array) =>
  bytesToBase64(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const base64ToBytes = (
  value: unknown,
  fieldName: string,
  expectedLength?: number,
  minimumLength?: number
): OwnedBytes => {
  // Character-class scan, NOT `(?:....{4})*`: the grouped-quantifier form
  // throws RangeError ("Maximum call stack size exceeded") on strings past
  // ~5 MB. `length % 4 === 0` plus the round-trip re-encode below still fully
  // guarantee canonical base64.
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    throw new PublicShareStorageError("INVALID_RECORD", `${fieldName} is not canonical base64.`);
  }

  let bytes: OwnedBytes;

  try {
    bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new PublicShareStorageError("INVALID_RECORD", `${fieldName} is invalid.`);
  }

  if (
    bytesToBase64(bytes) !== value ||
    (expectedLength !== undefined && bytes.length !== expectedLength) ||
    (minimumLength !== undefined && bytes.length < minimumLength)
  ) {
    throw new PublicShareStorageError("INVALID_RECORD", `${fieldName} has an invalid length.`);
  }

  return bytes;
};

export const isSecurePublicShareToken = (token: string) =>
  typeof token === "string" && SECURE_SHARE_TOKEN_PATTERN.test(token);

export const createSecurePublicShareToken = () =>
  `smos_${bytesToHex(randomBytes(24))}`;

export const digestPublicShareToken = async (token: string) => {
  if (!isSecurePublicShareToken(token)) {
    throw new PublicShareStorageError("INVALID_TOKEN", "The public share token is invalid.");
  }

  const digest = await getWebCrypto().subtle.digest(
    "SHA-256",
    textEncoder.encode(token)
  );

  return bytesToBase64Url(new Uint8Array(digest));
};

const publicShareHkdfInfo = (
  tokenDigest: string,
  workspaceId: string,
  projectId: string
) =>
  textEncoder.encode(
    JSON.stringify([
      PUBLIC_SHARE_PAYLOAD_SCHEMA,
      PUBLIC_SHARE_PAYLOAD_VERSION,
      tokenDigest,
      workspaceId,
      projectId,
      "public-share-encryption-key"
    ])
  );

const derivePublicShareKey = async (
  token: string,
  tokenDigest: string,
  workspaceId: string,
  projectId: string,
  salt: OwnedBytes,
  usages: KeyUsage[]
) => {
  const tokenBytes = textEncoder.encode(token);

  try {
    const sourceKey = await getWebCrypto().subtle.importKey(
      "raw",
      tokenBytes,
      "HKDF",
      false,
      ["deriveKey"]
    );

    return await getWebCrypto().subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt,
        info: publicShareHkdfInfo(tokenDigest, workspaceId, projectId)
      },
      sourceKey,
      { name: "AES-GCM", length: 256 },
      false,
      usages
    );
  } finally {
    tokenBytes.fill(0);
  }
};

const publicShareAdditionalData = (record: EncryptedPublicShareRecord) =>
  textEncoder.encode(
    JSON.stringify([
      record.schema,
      record.version,
      record.tokenDigest,
      record.workspaceId,
      record.payload.projectId,
      record.updatedAt,
      record.payload.schema,
      record.payload.version,
      record.payload.keyDerivation.name,
      record.payload.keyDerivation.hash,
      record.payload.keyDerivation.salt,
      record.payload.encryptedPayload.name,
      record.payload.encryptedPayload.iv
    ])
  );

const isShareLinkExpired = (link: ShareLink) => {
  if (!link.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(link.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
};

export const sanitizeProjectForPublicShare = (
  project: Project,
  link: ShareLink,
  workspaceTools: Tool[]
): Project => {
  // Workflow attachments may contain private source files. They are never
  // published through a project share unless a separate, explicit capability
  // and sanitization policy is added in the future.
  const projectWithoutWorkflows = { ...project };
  delete projectWithoutWorkflows.workflows;
  delete projectWithoutWorkflows.workflowIds;
  const canShowCost = link.allowCostPreview && project.shareSettings.allowCostPreview;
  const showDeliverables = project.shareSettings.showDeliverables;
  const showTimeline = project.shareSettings.showTimeline;
  const showPeople = project.shareSettings.showPeople;
  const showTools = project.shareSettings.showTools;
  const includePhases = showTimeline || showDeliverables || canShowCost;
  const usedToolIds = new Set([
    ...project.tools.map((tool) => tool.id),
    ...project.phases.flatMap((phase) => phase.toolIds ?? [])
  ]);
  const subscriptionCosts = canShowCost
    ? workspaceTools.flatMap((tool, index) => {
        if (!usedToolIds.has(tool.id) || !tool.subscription || tool.subscription.amount <= 0) {
          return [];
        }

        return [{
          id: `public-subscription-${index + 1}`,
          projectId: project.id,
          name: "Subscription",
          category: "software" as const,
          amount:
            tool.subscription.billingCycle === "yearly"
              ? tool.subscription.amount / 12
              : tool.subscription.amount,
          currency: tool.subscription.currency,
          billingType: "monthly" as const,
          startDate: project.startDate,
          endDate: tool.subscription.expiresAt,
          isActual: true,
          visibility: "private" as const
        }];
      })
    : [];

  return structuredClone({
    ...projectWithoutWorkflows,
    timelineTitle: undefined,
    timelineRows: undefined,
    people: showPeople
      ? project.people.map((person) => ({
          id: person.id,
          name: person.name,
          role: person.role,
          avatar: person.avatar,
          type: person.type
        }))
      : [],
    tools: showTools
      ? project.tools.map((tool, index) => ({
          id: `public-tool-${index + 1}`,
          name: tool.name,
          category: tool.category,
          icon: tool.icon
        }))
      : [],
    phases: includePhases
      ? project.phases.map((phase) => ({
          ...phase,
          name: showTimeline || showDeliverables ? phase.name : "Phase",
          description: "",
          notes: undefined,
          assigneeId: undefined,
          personIds: undefined,
          toolIds: undefined,
          deliverables: showDeliverables
            ? phase.deliverables.map((deliverable) => ({
                ...deliverable,
                description: "",
                assigneeId: "",
                tasks: deliverable.tasks.map((task) => ({
                  ...task,
                  title: "",
                  assigneeId: "",
                  dueDate: undefined
                }))
              }))
            : []
        }))
      : [],
    budget: canShowCost && project.budget
      ? {
          ...project.budget,
          phases: project.budget.phases.map((phaseBudget) => ({
            ...phaseBudget,
            personnel: phaseBudget.personnel.map((line, index) => ({
              ...line,
              id: `public-personnel-${index + 1}`,
              personId: undefined,
              roleLevel: "Personnel"
            })),
            dailyExpenseLines: phaseBudget.dailyExpenseLines.map((line, index) => ({
              ...line,
              id: `public-daily-${index + 1}`,
              name: "Daily expense"
            })),
            extraCosts: phaseBudget.extraCosts.map((line, index) => ({
              ...line,
              id: `public-extra-${index + 1}`,
              costTemplateId: undefined,
              name: "Expense"
            })),
            softwareCosts: phaseBudget.softwareCosts.map((line, index) => ({
              ...line,
              id: `public-software-${index + 1}`,
              toolId: undefined,
              name: "Software"
            }))
          }))
        }
      : undefined,
    costs: canShowCost
      ? [
          ...project.costs.map((cost, index) => ({
            ...cost,
            id: `public-cost-${index + 1}`,
            name: "Cost"
          })),
          ...subscriptionCosts
        ]
      : [],
    payments: [],
    materials: project.shareSettings.showMaterials
      ? project.materials.map((material) => ({
          ...material,
          ownerId: showPeople ? material.ownerId : ""
        }))
      : [],
    versions: project.shareSettings.showVersions ? project.versions : [],
    activity: []
  } satisfies Project);
};

const isValidPublicProject = (value: unknown): value is Project =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.description === "string" &&
  typeof value.coverImage === "string" &&
  typeof value.startDate === "string" &&
  typeof value.endDate === "string" &&
  typeof value.progress === "number" &&
  Number.isFinite(value.progress) &&
  Array.isArray(value.people) &&
  Array.isArray(value.tools) &&
  Array.isArray(value.phases) &&
  value.phases.every(
    (phase) =>
      isRecord(phase) &&
      Array.isArray(phase.deliverables) &&
      phase.deliverables.every(
        (deliverable) => isRecord(deliverable) && Array.isArray(deliverable.tasks)
      )
  ) &&
  Array.isArray(value.costs) &&
  Array.isArray(value.payments) &&
  Array.isArray(value.materials) &&
  Array.isArray(value.versions) &&
  Array.isArray(value.activity) &&
  isRecord(value.shareSettings) &&
  value.shareSettings.isEnabled === true &&
  typeof value.shareSettings.token === "string";

const isValidShareLink = (value: unknown): value is ShareLink =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.projectId === "string" &&
  typeof value.token === "string" &&
  typeof value.allowCostPreview === "boolean" &&
  typeof value.createdAt === "string" &&
  isCanonicalIsoDate(value.createdAt) &&
  (value.expiresAt === undefined || isCanonicalIsoDate(value.expiresAt)) &&
  (value.displayCurrency === undefined || isMoneyCurrency(value.displayCurrency));

const parseEncryptedPublicSharePayload = (value: unknown): EncryptedPublicSharePayload => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "projectId",
      "keyDerivation",
      "encryptedPayload"
    ]) ||
    value.schema !== PUBLIC_SHARE_PAYLOAD_SCHEMA ||
    value.version !== PUBLIC_SHARE_PAYLOAD_VERSION ||
    typeof value.projectId !== "string" ||
    value.projectId.length === 0 ||
    !isRecord(value.keyDerivation) ||
    !hasExactKeys(value.keyDerivation, ["name", "hash", "salt"]) ||
    value.keyDerivation.name !== "HKDF" ||
    value.keyDerivation.hash !== "SHA-256" ||
    !isRecord(value.encryptedPayload) ||
    !hasExactKeys(value.encryptedPayload, ["name", "iv", "ciphertext"]) ||
    value.encryptedPayload.name !== "AES-GCM"
  ) {
    throw new PublicShareStorageError("INVALID_RECORD", "The encrypted public share is invalid.");
  }

  const salt = base64ToBytes(value.keyDerivation.salt, "HKDF salt", HKDF_SALT_BYTES);
  const iv = base64ToBytes(value.encryptedPayload.iv, "AES-GCM IV", AES_GCM_IV_BYTES);
  const ciphertext = base64ToBytes(
    value.encryptedPayload.ciphertext,
    "AES-GCM ciphertext",
    undefined,
    AES_GCM_TAG_BYTES + 1
  );

  return {
    schema: PUBLIC_SHARE_PAYLOAD_SCHEMA,
    version: PUBLIC_SHARE_PAYLOAD_VERSION,
    projectId: value.projectId,
    keyDerivation: {
      name: "HKDF",
      hash: "SHA-256",
      salt: bytesToBase64(salt)
    },
    encryptedPayload: {
      name: "AES-GCM",
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    }
  };
};

const validateEncryptedPublicShareRecord = (
  value: PublicShareRecord<unknown>
): EncryptedPublicShareRecord => {
  if (
    value.schema !== PUBLIC_SHARE_RECORD_SCHEMA ||
    value.version !== PUBLIC_SHARE_RECORD_VERSION ||
    !SHARE_TOKEN_DIGEST_PATTERN.test(value.tokenDigest) ||
    typeof value.workspaceId !== "string" ||
    value.workspaceId.length === 0 ||
    !isCanonicalIsoDate(value.updatedAt)
  ) {
    throw new PublicShareStorageError("INVALID_RECORD", "The public share record is invalid.");
  }

  return {
    schema: PUBLIC_SHARE_RECORD_SCHEMA,
    version: PUBLIC_SHARE_RECORD_VERSION,
    tokenDigest: value.tokenDigest,
    workspaceId: value.workspaceId,
    updatedAt: value.updatedAt,
    payload: parseEncryptedPublicSharePayload(value.payload)
  };
};

const validateDecryptedSnapshot = (
  value: unknown,
  record: EncryptedPublicShareRecord,
  token: string
): DecryptedPublicShareSnapshot => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "version",
      "tokenDigest",
      "workspaceId",
      "projectId",
      "publishedAt",
      "project",
      "shareLink"
    ]) ||
    value.schema !== PUBLIC_SHARE_SNAPSHOT_SCHEMA ||
    value.version !== PUBLIC_SHARE_SNAPSHOT_VERSION ||
    value.tokenDigest !== record.tokenDigest ||
    value.workspaceId !== record.workspaceId ||
    value.projectId !== record.payload.projectId ||
    value.publishedAt !== record.updatedAt ||
    !isValidPublicProject(value.project) ||
    !isValidShareLink(value.shareLink) ||
    value.project.id !== record.payload.projectId ||
    value.shareLink.projectId !== record.payload.projectId ||
    value.shareLink.token !== token ||
    value.project.shareSettings.token !== token ||
    isShareLinkExpired(value.shareLink)
  ) {
    throw new PublicShareStorageError("INVALID_RECORD", "The public share snapshot is invalid.");
  }

  return value as DecryptedPublicShareSnapshot;
};

const encryptPublicShare = async (
  project: Project,
  shareLink: ShareLink,
  workspaceTools: Tool[],
  workspaceId: string,
  publishedAt: string
): Promise<EncryptedPublicShareRecord> => {
  const token = shareLink.token;
  const tokenDigest = await digestPublicShareToken(token);
  const salt = randomBytes(HKDF_SALT_BYTES);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const record: EncryptedPublicShareRecord = {
    schema: PUBLIC_SHARE_RECORD_SCHEMA,
    version: PUBLIC_SHARE_RECORD_VERSION,
    tokenDigest,
    workspaceId,
    updatedAt: publishedAt,
    payload: {
      schema: PUBLIC_SHARE_PAYLOAD_SCHEMA,
      version: PUBLIC_SHARE_PAYLOAD_VERSION,
      projectId: project.id,
      keyDerivation: {
        name: "HKDF",
        hash: "SHA-256",
        salt: bytesToBase64(salt)
      },
      encryptedPayload: {
        name: "AES-GCM",
        iv: bytesToBase64(iv),
        ciphertext: ""
      }
    }
  };
  const snapshot: DecryptedPublicShareSnapshot = {
    schema: PUBLIC_SHARE_SNAPSHOT_SCHEMA,
    version: PUBLIC_SHARE_SNAPSHOT_VERSION,
    tokenDigest,
    workspaceId,
    projectId: project.id,
    publishedAt,
    project: sanitizeProjectForPublicShare(project, shareLink, workspaceTools),
    shareLink: structuredClone(shareLink)
  };
  const plaintext = textEncoder.encode(JSON.stringify(snapshot));

  try {
    const key = await derivePublicShareKey(
      token,
      tokenDigest,
      workspaceId,
      project.id,
      salt,
      ["encrypt"]
    );
    const ciphertext = await getWebCrypto().subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: publicShareAdditionalData(record),
        tagLength: AES_GCM_TAG_BYTES * 8
      },
      key,
      plaintext
    );
    record.payload.encryptedPayload.ciphertext = bytesToBase64(new Uint8Array(ciphertext));
    return record;
  } catch (error) {
    if (error instanceof PublicShareStorageError) {
      throw error;
    }
    throw new PublicShareStorageError("ENCRYPTION_FAILED", "The public share could not be encrypted.");
  } finally {
    plaintext.fill(0);
  }
};

export const buildEncryptedPublicShareRecords = async (
  database: PublicShareDatabase,
  workspaceId: string
): Promise<EncryptedPublicShareRecord[]> => {
  try {
    validateWorkspaceId(workspaceId);
  } catch {
    throw new PublicShareStorageError("INVALID_RECORD", "The public share workspace ID is invalid.");
  }

  const candidates = database.shareLinks.flatMap((shareLink) => {
    const projects = database.projects.filter((project) => project.id === shareLink.projectId);

    if (projects.length !== 1) {
      return [];
    }

    const project = projects[0];

    if (
      !isValidShareLink(shareLink) ||
      !isSecurePublicShareToken(shareLink.token) ||
      !project.shareSettings.isEnabled ||
      project.shareSettings.token !== shareLink.token ||
      isShareLinkExpired(shareLink)
    ) {
      return [];
    }

    return [{ project, shareLink }];
  });
  const tokenCounts = new Map<string, number>();

  candidates.forEach(({ shareLink }) => {
    tokenCounts.set(shareLink.token, (tokenCounts.get(shareLink.token) ?? 0) + 1);
  });

  const uniqueCandidates = candidates.filter(
    ({ shareLink }) => tokenCounts.get(shareLink.token) === 1
  );
  const publishedAt = new Date().toISOString();

  return Promise.all(
    uniqueCandidates.map(({ project, shareLink }) =>
      encryptPublicShare(project, shareLink, database.tools, workspaceId, publishedAt)
    )
  );
};

export const getEncryptedPublicShareRecord = async (token: string) => {
  if (!isSecurePublicShareToken(token)) {
    return null;
  }

  const tokenDigest = await digestPublicShareToken(token);
  const stored = await getPublicShareRecord<unknown>(tokenDigest);
  return stored ? validateEncryptedPublicShareRecord(stored) : null;
};

export const decryptPublicShareRecord = async (
  storedRecord: PublicShareRecord<unknown>,
  token: string
) => {
  if (!isSecurePublicShareToken(token)) {
    throw new PublicShareStorageError("INVALID_TOKEN", "The public share token is invalid.");
  }

  const record = validateEncryptedPublicShareRecord(storedRecord);
  const tokenDigest = await digestPublicShareToken(token);

  if (tokenDigest !== record.tokenDigest) {
    throw new PublicShareStorageError("INVALID_TOKEN", "The public share token does not match.");
  }

  const salt = base64ToBytes(
    record.payload.keyDerivation.salt,
    "HKDF salt",
    HKDF_SALT_BYTES
  );
  const iv = base64ToBytes(
    record.payload.encryptedPayload.iv,
    "AES-GCM IV",
    AES_GCM_IV_BYTES
  );
  let plaintextBytes: OwnedBytes | null = null;

  try {
    const key = await derivePublicShareKey(
      token,
      tokenDigest,
      record.workspaceId,
      record.payload.projectId,
      salt,
      ["decrypt"]
    );
    const plaintext = await getWebCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: publicShareAdditionalData(record),
        tagLength: AES_GCM_TAG_BYTES * 8
      },
      key,
      base64ToBytes(
        record.payload.encryptedPayload.ciphertext,
        "AES-GCM ciphertext",
        undefined,
        AES_GCM_TAG_BYTES + 1
      )
    );
    plaintextBytes = new Uint8Array(plaintext);
    const parsed = JSON.parse(textDecoder.decode(plaintextBytes)) as unknown;
    return validateDecryptedSnapshot(parsed, record, token);
  } catch (error) {
    if (error instanceof PublicShareStorageError) {
      throw error;
    }
    throw new PublicShareStorageError("DECRYPTION_FAILED", "The public share could not be decrypted.");
  } finally {
    plaintextBytes?.fill(0);
  }
};

export const readPublicShareSnapshot = async (token: string) => {
  const record = await getEncryptedPublicShareRecord(token);
  return record ? decryptPublicShareRecord(record, token) : null;
};

export const createPublicSharedProjectData = (
  snapshot: DecryptedPublicShareSnapshot
): PublicSharedProjectData => ({
  project: snapshot.project,
  shareLink: snapshot.shareLink,
  canShowCost:
    snapshot.shareLink.allowCostPreview && snapshot.project.shareSettings.allowCostPreview
});
