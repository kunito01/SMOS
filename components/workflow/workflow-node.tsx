"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { Palette, Trash2 } from "lucide-react";
import type {
  ProjectWorkflowAttachment,
  ProjectWorkflowNode
} from "@/lib/types";
import {
  WorkflowAttachmentControl,
  type WorkflowAttachmentLabels
} from "@/components/workflow/workflow-attachment-control";
import { cn } from "@/lib/utils/cn";
import {
  normalizeWorkflowNodeFillColor,
  readableWorkflowNodeTextColor
} from "@/lib/utils/workflow-node-color";

export type WorkflowCanvasNodeData = Record<string, unknown> & {
  workflowNode: ProjectWorkflowNode;
};

export type WorkflowCanvasNode = Node<WorkflowCanvasNodeData, "workflow-node">;

export type WorkflowNodeLabels = WorkflowAttachmentLabels & {
  deleteNode: string;
  editNodeText: string;
  node: string;
  nodeColor: string;
};

type WorkflowNodeActions = {
  labels: WorkflowNodeLabels;
  mode: "edit" | "readonly";
  onAttachmentChange: (nodeId: string, attachment?: ProjectWorkflowAttachment) => void;
  onFillColorChange: (nodeId: string, fillColor: string) => void;
  onDelete: (nodeId: string) => void;
  onResize: (
    nodeId: string,
    next: { x: number; y: number; width: number; height: number }
  ) => void;
  onTextChange: (nodeId: string, text: string) => void;
};

const WorkflowNodeActionsContext = createContext<WorkflowNodeActions | null>(null);

export function WorkflowNodeActionsProvider({
  children,
  value
}: {
  children: ReactNode;
  value: WorkflowNodeActions;
}) {
  return (
    <WorkflowNodeActionsContext.Provider value={value}>
      {children}
    </WorkflowNodeActionsContext.Provider>
  );
}

const useWorkflowNodeActions = () => {
  const context = useContext(WorkflowNodeActionsContext);

  if (!context) {
    throw new Error("WorkflowNodeComponent must be rendered inside WorkflowNodeActionsProvider.");
  }

  return context;
};

const handleStyle = {
  width: 14,
  height: 14,
  border: "3px solid rgba(255,255,255,0.96)",
  background: "rgb(var(--color-coral))",
  boxShadow: "0 5px 14px rgba(28,35,40,0.2)"
};

export function WorkflowNodeComponent({ data, id, selected }: NodeProps<WorkflowCanvasNode>) {
  const actions = useWorkflowNodeActions();
  const node = data.workflowNode;
  const [draftText, setDraftText] = useState(node.text);
  const editable = actions.mode === "edit";
  const isCircle = node.shape === "circle";
  const fillColor = normalizeWorkflowNodeFillColor(node.fillColor, node.shape);
  const textColor = readableWorkflowNodeTextColor(fillColor);

  useEffect(() => {
    setDraftText(node.text);
  }, [node.text]);

  return (
    <article
      className={cn(
        "relative grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-visible border border-black/[0.08] shadow-lift",
        isCircle ? "place-content-center rounded-full p-7 text-center" : "rounded-studio p-4",
        selected && editable ? "ring-4 ring-coral/20" : "ring-1 ring-white/50"
      )}
      style={{ backgroundColor: fillColor, color: textColor }}
      aria-label={`${actions.labels.node}: ${node.text || actions.labels.editNodeText}`}
    >
      {editable ? (
        <NodeResizer
          color="rgb(var(--color-coral))"
          isVisible={selected}
          minWidth={isCircle ? 180 : 200}
          minHeight={isCircle ? 180 : 120}
          keepAspectRatio={isCircle}
          onResizeEnd={(_, params) => {
            actions.onResize(id, params);
          }}
        />
      ) : null}

      {editable ? (
        <label
          title={actions.labels.nodeColor}
          onPointerDown={(event) => event.stopPropagation()}
          className={cn(
            "nodrag nopan nowheel absolute left-2 top-2 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/90 text-ink shadow-soft ring-1 ring-black/[0.08] transition hover:scale-105 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-coral",
            isCircle && "left-5 top-5"
          )}
        >
          <Palette size={15} strokeWidth={2.35} aria-hidden="true" />
          <span
            className="absolute bottom-1 right-1 size-2.5 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: fillColor }}
            aria-hidden="true"
          />
          <input
            type="color"
            value={fillColor}
            onChange={(event) =>
              actions.onFillColorChange(id, event.currentTarget.value)
            }
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={actions.labels.nodeColor}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      ) : null}

      {editable ? (
        <button
          type="button"
          onClick={() => actions.onDelete(id)}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={actions.labels.deleteNode}
          className={cn(
            "nodrag nopan absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-ink/10 text-ink/64 transition hover:bg-coral hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
            isCircle && "right-5 top-5"
          )}
        >
          <Trash2 size={14} strokeWidth={2.3} />
        </button>
      ) : null}

      {editable ? (
        <textarea
          rows={1}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onBlur={() => {
            if (draftText !== node.text) {
              actions.onTextChange(id, draftText);
            }
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={actions.labels.editNodeText}
          placeholder={actions.labels.editNodeText}
          className={cn(
            "nodrag nopan nowheel h-full min-h-0 w-full resize-none self-stretch overflow-y-auto bg-transparent text-sm font-bold leading-[1.28] text-current outline-none placeholder:text-current placeholder:opacity-40",
            isCircle ? "px-4 text-center" : "px-8"
          )}
        />
      ) : (
        <p
          className={cn(
            "nodrag nopan nowheel h-full min-h-0 min-w-0 self-stretch overflow-y-auto whitespace-pre-wrap break-words text-sm font-bold leading-[1.28] [overflow-wrap:anywhere]",
            isCircle && "px-3 text-center"
          )}
        >
          {node.text}
        </p>
      )}

      <WorkflowAttachmentControl
        attachment={node.attachment}
        mode={actions.mode}
        labels={actions.labels}
        onChange={(attachment) => actions.onAttachmentChange(id, attachment)}
        className={cn("w-full", isCircle && "px-2")}
      />

      <Handle
        id="left"
        type="target"
        position={Position.Left}
        isConnectable={editable}
        style={{
          ...handleStyle,
          opacity: editable ? 1 : 0,
          pointerEvents: editable ? "auto" : "none"
        }}
        aria-label="Input connection"
        aria-hidden={!editable}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={editable}
        style={{
          ...handleStyle,
          opacity: editable ? 1 : 0,
          pointerEvents: editable ? "auto" : "none"
        }}
        aria-label="Output connection"
        aria-hidden={!editable}
      />
    </article>
  );
}
