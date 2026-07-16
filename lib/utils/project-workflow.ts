import type {
  ProjectWorkflow,
  ProjectWorkflowAttachment,
  ProjectWorkflowEdge,
  ProjectWorkflowNode,
  ProjectWorkflowViewport
} from "@/lib/types";
import {
  normalizeWorkflowNodeFillColor,
  workflowNodeFillColorPattern
} from "@/lib/utils/workflow-node-color";

export const projectWorkflowVersion = 1 as const;
export const maxProjectWorkflowCount = 100;
export const maxWorkflowLibraryCount = 500;
export const maxProjectWorkflowNodeCount = 500;
export const maxProjectWorkflowEdgeCount = 2_000;
export const maxProjectWorkflowAttachmentBytes = 1024 * 1024;
export const maxProjectWorkflowAttachmentTotalBytes = 6 * 1024 * 1024;
export const maxWorkflowLibraryAttachmentTotalBytes = 48 * 1024 * 1024;

const maxEntityIdLength = 160;
const maxWorkflowNameLength = 200;
const maxNodeTextLength = 10_000;
const maxCanvasCoordinate = 10_000_000;
const maxNodeDimension = 100_000;
const minViewportZoom = 0.05;
const maxViewportZoom = 8;
const entityIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const textEncoder = new TextEncoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  requiredKeys: ReadonlyArray<string>,
  optionalKeys: ReadonlyArray<string> = []
) => {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  return (
    requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  );
};

const invalidWorkflow = (message: string): never => {
  throw new Error(`Invalid project workflow: ${message}`);
};

const parseEntityId = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxEntityIdLength ||
    value !== value.trim() ||
    !entityIdPattern.test(value)
  ) {
    return invalidWorkflow(`${fieldName} is invalid`);
  }

  return value;
};

const parseCanonicalIsoDate = (value: unknown, fieldName: string) => {
  if (typeof value !== "string") {
    return invalidWorkflow(`${fieldName} is invalid`);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    return invalidWorkflow(`${fieldName} is invalid`);
  }

  return value;
};

const parseCanvasCoordinate = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > maxCanvasCoordinate
  ) {
    return invalidWorkflow(`${fieldName} is invalid`);
  }

  return value;
};

const parseNodeDimension = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > maxNodeDimension
  ) {
    return invalidWorkflow(`${fieldName} is invalid`);
  }

  return value;
};

const parseAttachment = (value: unknown): ProjectWorkflowAttachment => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "fileName",
      "kind",
      "mimeType",
      "size",
      "content",
      "uploadedAt"
    ])
  ) {
    return invalidWorkflow("attachment shape is invalid");
  }

  const id = parseEntityId(value.id, "attachment id");
  const fileName = value.fileName;
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    fileName.length > 255 ||
    fileName !== fileName.trim() ||
    fileName === "." ||
    fileName === ".." ||
    /[\\/\0]/u.test(fileName)
  ) {
    return invalidWorkflow("attachment file name is invalid");
  }

  const kind = value.kind;
  if (kind !== "json" && kind !== "markdown") {
    return invalidWorkflow("attachment kind is invalid");
  }

  const expectedMimeType = kind === "json" ? "application/json" : "text/markdown";
  if (value.mimeType !== expectedMimeType) {
    return invalidWorkflow("attachment MIME type does not match its kind");
  }

  const lowerFileName = fileName.toLocaleLowerCase();
  if (
    (kind === "json" && !lowerFileName.endsWith(".json")) ||
    (kind === "markdown" &&
      !lowerFileName.endsWith(".md") &&
      !lowerFileName.endsWith(".markdown"))
  ) {
    return invalidWorkflow("attachment file extension does not match its kind");
  }

  if (typeof value.content !== "string") {
    return invalidWorkflow("attachment content is invalid");
  }

  const contentSize = textEncoder.encode(value.content).byteLength;
  const declaredSize = value.size;
  if (
    typeof declaredSize !== "number" ||
    !Number.isInteger(declaredSize) ||
    declaredSize < 0 ||
    declaredSize !== contentSize ||
    contentSize > maxProjectWorkflowAttachmentBytes
  ) {
    return invalidWorkflow("attachment size is invalid");
  }

  if (kind === "json") {
    try {
      JSON.parse(value.content);
    } catch {
      return invalidWorkflow("JSON attachment content is invalid");
    }
  }

  return {
    id,
    fileName,
    kind,
    mimeType: expectedMimeType,
    size: contentSize,
    content: value.content,
    uploadedAt: parseCanonicalIsoDate(value.uploadedAt, "attachment upload date")
  };
};

const parseNode = (value: unknown): ProjectWorkflowNode => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ["id", "shape", "position", "size", "text"],
      ["attachment", "fillColor"]
    ) ||
    !isRecord(value.position) ||
    !hasOnlyKeys(value.position, ["x", "y"]) ||
    !isRecord(value.size) ||
    !hasOnlyKeys(value.size, ["width", "height"])
  ) {
    return invalidWorkflow("node shape is invalid");
  }

  if (value.shape !== "rounded-rectangle" && value.shape !== "circle") {
    return invalidWorkflow("node type is invalid");
  }

  if (typeof value.text !== "string" || value.text.length > maxNodeTextLength) {
    return invalidWorkflow("node text is invalid");
  }

  if (
    value.fillColor !== undefined &&
    (typeof value.fillColor !== "string" ||
      !workflowNodeFillColorPattern.test(value.fillColor))
  ) {
    return invalidWorkflow("node fill color is invalid");
  }

  return {
    id: parseEntityId(value.id, "node id"),
    shape: value.shape,
    fillColor: normalizeWorkflowNodeFillColor(value.fillColor, value.shape),
    position: {
      x: parseCanvasCoordinate(value.position.x, "node x position"),
      y: parseCanvasCoordinate(value.position.y, "node y position")
    },
    size: {
      width: parseNodeDimension(value.size.width, "node width"),
      height: parseNodeDimension(value.size.height, "node height")
    },
    text: value.text,
    ...(value.attachment === undefined
      ? {}
      : { attachment: parseAttachment(value.attachment) })
  };
};

const parseEdge = (value: unknown): ProjectWorkflowEdge => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "source", "target"], ["sourceHandle", "targetHandle"])
  ) {
    return invalidWorkflow("edge shape is invalid");
  }

  return {
    id: parseEntityId(value.id, "edge id"),
    source: parseEntityId(value.source, "edge source"),
    target: parseEntityId(value.target, "edge target"),
    ...(value.sourceHandle === undefined
      ? {}
      : { sourceHandle: parseEntityId(value.sourceHandle, "edge source handle") }),
    ...(value.targetHandle === undefined
      ? {}
      : { targetHandle: parseEntityId(value.targetHandle, "edge target handle") })
  };
};

const parseViewport = (value: unknown): ProjectWorkflowViewport => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["x", "y", "zoom"])) {
    return invalidWorkflow("viewport shape is invalid");
  }

  if (
    typeof value.zoom !== "number" ||
    !Number.isFinite(value.zoom) ||
    value.zoom < minViewportZoom ||
    value.zoom > maxViewportZoom
  ) {
    return invalidWorkflow("viewport zoom is invalid");
  }

  return {
    x: parseCanvasCoordinate(value.x, "viewport x position"),
    y: parseCanvasCoordinate(value.y, "viewport y position"),
    zoom: value.zoom
  };
};

export const normalizeProjectWorkflow = (value: unknown): ProjectWorkflow => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "name",
      "version",
      "nodes",
      "edges",
      "viewport",
      "createdAt",
      "updatedAt"
    ]) ||
    value.version !== projectWorkflowVersion ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    value.nodes.length > maxProjectWorkflowNodeCount ||
    value.edges.length > maxProjectWorkflowEdgeCount
  ) {
    return invalidWorkflow("workflow shape is invalid or unsupported");
  }

  const name = value.name;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > maxWorkflowNameLength
  ) {
    return invalidWorkflow("workflow name is invalid");
  }

  const nodes = value.nodes.map(parseNode);
  const nodeIds = new Set<string>();
  const attachmentIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      return invalidWorkflow("workflow contains duplicate node ids");
    }
    nodeIds.add(node.id);

    if (node.attachment) {
      if (attachmentIds.has(node.attachment.id)) {
        return invalidWorkflow("workflow contains duplicate attachment ids");
      }
      attachmentIds.add(node.attachment.id);
    }
  }

  const edges = value.edges.map(parseEdge);
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      return invalidWorkflow("workflow contains duplicate edge ids");
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return invalidWorkflow("workflow contains an edge with a missing node");
    }
    edgeIds.add(edge.id);
  }

  const createdAt = parseCanonicalIsoDate(value.createdAt, "workflow creation date");
  const updatedAt = parseCanonicalIsoDate(value.updatedAt, "workflow update date");
  if (updatedAt < createdAt) {
    return invalidWorkflow("workflow update date precedes its creation date");
  }

  return {
    id: parseEntityId(value.id, "workflow id"),
    name: name.trim(),
    version: projectWorkflowVersion,
    nodes,
    edges,
    viewport: parseViewport(value.viewport),
    createdAt,
    updatedAt
  };
};

export const normalizeProjectWorkflows = (value: unknown): ProjectWorkflow[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxProjectWorkflowCount) {
    return invalidWorkflow("workflow collection is invalid");
  }

  const workflows = value.map(normalizeProjectWorkflow);
  const workflowIds = new Set<string>();
  let attachmentBytes = 0;

  for (const workflow of workflows) {
    if (workflowIds.has(workflow.id)) {
      return invalidWorkflow("project contains duplicate workflow ids");
    }
    workflowIds.add(workflow.id);

    for (const node of workflow.nodes) {
      attachmentBytes += node.attachment?.size ?? 0;
      if (attachmentBytes > maxProjectWorkflowAttachmentTotalBytes) {
        return invalidWorkflow("project workflow attachments are too large");
      }
    }
  }

  return workflows;
};

export const normalizeWorkflowLibrary = (value: unknown): ProjectWorkflow[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxWorkflowLibraryCount) {
    return invalidWorkflow("global workflow collection is invalid");
  }

  const workflows = value.map(normalizeProjectWorkflow);
  const workflowIds = new Set<string>();
  let attachmentBytes = 0;

  for (const workflow of workflows) {
    if (workflowIds.has(workflow.id)) {
      return invalidWorkflow("global library contains duplicate workflow ids");
    }
    workflowIds.add(workflow.id);

    for (const node of workflow.nodes) {
      attachmentBytes += node.attachment?.size ?? 0;
      if (attachmentBytes > maxWorkflowLibraryAttachmentTotalBytes) {
        return invalidWorkflow("global workflow attachments are too large");
      }
    }
  }

  return workflows;
};

export const isWorkflowLibrary = (value: unknown): value is ProjectWorkflow[] => {
  try {
    normalizeWorkflowLibrary(value);
    return true;
  } catch {
    return false;
  }
};

export const normalizeProjectWorkflowIds = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxProjectWorkflowCount) {
    return invalidWorkflow("project workflow references are invalid");
  }

  const ids = value.map((id, index) => parseEntityId(id, `workflow reference ${index + 1}`));
  if (new Set(ids).size !== ids.length) {
    return invalidWorkflow("project contains duplicate workflow references");
  }

  return ids;
};

export const isProjectWorkflowIds = (value: unknown): value is string[] => {
  try {
    normalizeProjectWorkflowIds(value);
    return true;
  } catch {
    return false;
  }
};

export const isProjectWorkflows = (value: unknown): value is ProjectWorkflow[] => {
  try {
    normalizeProjectWorkflows(value);
    return true;
  } catch {
    return false;
  }
};

export const createEmptyProjectWorkflow = (input: {
  id: string;
  name: string;
  createdAt?: string;
}): ProjectWorkflow => {
  const timestamp = input.createdAt ?? new Date().toISOString();

  return normalizeProjectWorkflow({
    id: input.id,
    name: input.name,
    version: projectWorkflowVersion,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp
  });
};

export const projectWorkflowsHaveContent = (workflows: ReadonlyArray<ProjectWorkflow>) =>
  workflows.some((workflow) => workflow.nodes.length > 0);
