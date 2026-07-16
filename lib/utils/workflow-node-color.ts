import type { ProjectWorkflowNode } from "@/lib/types";

export const workflowNodeFillColorPattern = /^#[0-9a-fA-F]{6}$/;

export const defaultWorkflowNodeFillColor = (
  shape: ProjectWorkflowNode["shape"]
) => (shape === "circle" ? "#B0EBEF" : "#FFFFFF");

export const normalizeWorkflowNodeFillColor = (
  value: unknown,
  shape: ProjectWorkflowNode["shape"]
) =>
  typeof value === "string" && workflowNodeFillColorPattern.test(value)
    ? value.toUpperCase()
    : defaultWorkflowNodeFillColor(shape);

export const readableWorkflowNodeTextColor = (fillColor: string) => {
  const normalized = normalizeWorkflowNodeFillColor(
    fillColor,
    "rounded-rectangle"
  ).slice(1);
  const parsed = Number.parseInt(normalized, 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.58 ? "#1C2328" : "#FFFFFF";
};
