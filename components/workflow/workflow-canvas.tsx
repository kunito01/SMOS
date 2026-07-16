"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Viewport
} from "@xyflow/react";
import {
  Circle,
  Maximize2,
  Minus,
  Plus,
  RectangleHorizontal,
  Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WorkflowNodeActionsProvider,
  WorkflowNodeComponent,
  type WorkflowCanvasNode,
  type WorkflowNodeLabels
} from "@/components/workflow/workflow-node";
import type {
  ProjectWorkflow,
  ProjectWorkflowAttachment,
  ProjectWorkflowNode
} from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { defaultWorkflowNodeFillColor } from "@/lib/utils/workflow-node-color";

export type WorkflowCanvasMode = "edit" | "readonly";

export type WorkflowCanvasLabels = WorkflowNodeLabels & {
  addCircle: string;
  addRectangle: string;
  fitView: string;
  newCircleText: string;
  newRectangleText: string;
  shareWorkflow: string;
  workflowCanvas: string;
  zoomIn: string;
  zoomOut: string;
};

export type WorkflowCanvasProps = {
  className?: string;
  labels?: Partial<WorkflowCanvasLabels>;
  mode: WorkflowCanvasMode;
  workflow: ProjectWorkflow;
  onChange?: (workflow: ProjectWorkflow) => void;
  onShare?: (workflow: ProjectWorkflow) => void | Promise<void>;
};

const defaultLabels: WorkflowCanvasLabels = {
  addCircle: "Add circle",
  addRectangle: "Add rounded rectangle",
  attachment: "Attachment",
  attachmentTooLarge: "The file must be 1 MiB or smaller.",
  deleteNode: "Delete node",
  downloadAttachment: "Download attachment",
  editNodeText: "Enter node text",
  fitView: "Fit view",
  invalidJson: "Select a valid JSON file.",
  invalidUtf8: "The file must contain valid UTF-8 text.",
  newCircleText: "New step",
  newRectangleText: "New workflow step",
  node: "Workflow node",
  nodeColor: "Block color",
  removeAttachment: "Remove attachment",
  replaceAttachment: "Replace attachment",
  shareWorkflow: "Download offline HTML",
  unsupportedAttachment: "Only .json and .md files are supported.",
  uploadAttachment: "Upload JSON or MD",
  workflowCanvas: "Workflow canvas",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out"
};

type WorkflowCanvasEdge = Edge<Record<string, never>, "default">;

const nodeTypes = {
  "workflow-node": WorkflowNodeComponent
};

const edgeStyle = {
  stroke: "rgb(var(--color-coral))",
  strokeLinecap: "round" as const,
  strokeWidth: 4
};

const withEdgeSelectionStyle = (edge: WorkflowCanvasEdge): WorkflowCanvasEdge => ({
  ...edge,
  style: {
    ...edgeStyle,
    ...(edge.selected
      ? {
          filter: "drop-shadow(0 3px 4px rgba(28, 35, 40, 0.24))",
          strokeWidth: 7
        }
      : {})
  }
});

const toFlowNode = (
  node: ProjectWorkflowNode,
  editable: boolean
): WorkflowCanvasNode => ({
  id: node.id,
  type: "workflow-node",
  position: node.position,
  width: node.size.width,
  height: node.size.height,
  style: {
    width: node.size.width,
    height: node.size.height
  },
  data: { workflowNode: node },
  draggable: editable,
  selectable: editable,
  connectable: editable,
  deletable: editable
});

const toFlowEdge = (
  edge: ProjectWorkflow["edges"][number],
  editable: boolean
): WorkflowCanvasEdge => ({
  id: edge.id,
  type: "default",
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle,
  targetHandle: edge.targetHandle,
  style: edgeStyle,
  interactionWidth: 28,
  selectable: editable,
  deletable: editable,
  focusable: editable,
  reconnectable: false
});

const createEntityId = (prefix: string) => {
  const randomId = globalThis.crypto?.randomUUID?.();

  return randomId
    ? `${prefix}-${randomId}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const shouldCommitNodeChanges = (changes: NodeChange<WorkflowCanvasNode>[]) =>
  changes.some(
    (change) =>
      change.type === "add" ||
      change.type === "remove" ||
      change.type === "replace" ||
      (change.type === "position" && change.dragging === false)
  );

const shouldCommitEdgeChanges = (changes: EdgeChange<WorkflowCanvasEdge>[]) =>
  changes.some((change) => change.type !== "select");

function WorkflowCanvasInner({
  className,
  labels: labelOverrides,
  mode,
  onChange,
  onShare,
  workflow
}: WorkflowCanvasProps) {
  const editable = mode === "edit";
  const labels = useMemo(
    () => ({ ...defaultLabels, ...labelOverrides }),
    [labelOverrides]
  );
  const initialNodes = useMemo(
    () => workflow.nodes.map((node) => toFlowNode(node, editable)),
    // Initial state only; prop changes are synchronized by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const initialEdges = useMemo(
    () => workflow.edges.map((edge) => toFlowEdge(edge, editable)),
    // Initial state only; prop changes are synchronized by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [nodes, setNodes] = useState<WorkflowCanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<WorkflowCanvasEdge[]>(initialEdges);
  const [sharing, setSharing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const workflowRef = useRef(workflow);
  const canvasIdentityRef = useRef(`${workflow.id}:${mode}`);
  const synchronizingViewportRef = useRef(false);
  const {
    fitView,
    getViewport,
    screenToFlowPosition,
    setViewport,
    zoomIn,
    zoomOut
  } = useReactFlow<WorkflowCanvasNode, WorkflowCanvasEdge>();

  const replaceNodes = useCallback((nextNodes: WorkflowCanvasNode[]) => {
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }, []);

  const replaceEdges = useCallback((nextEdges: WorkflowCanvasEdge[]) => {
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
  }, []);

  useEffect(() => {
    workflowRef.current = workflow;

    const nextCanvasIdentity = `${workflow.id}:${mode}`;
    if (canvasIdentityRef.current === nextCanvasIdentity) {
      return;
    }

    canvasIdentityRef.current = nextCanvasIdentity;
    replaceNodes(workflow.nodes.map((node) => toFlowNode(node, editable)));
    replaceEdges(workflow.edges.map((edge) => toFlowEdge(edge, editable)));

    const frame = window.requestAnimationFrame(() => {
      synchronizingViewportRef.current = true;
      void setViewport(workflow.viewport, { duration: 0 }).finally(() => {
        synchronizingViewportRef.current = false;
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editable, mode, replaceEdges, replaceNodes, setViewport, workflow]);

  const serialize = useCallback(
    (
      nextNodes = nodesRef.current,
      nextEdges = edgesRef.current,
      viewport: Viewport = getViewport(),
      updateTimestamp = true
    ): ProjectWorkflow => {
      const nodeIds = new Set(nextNodes.map((node) => node.id));

      return {
        ...workflowRef.current,
        nodes: nextNodes.map((node) => {
          const model = node.data.workflowNode;
          const width = node.measured?.width ?? node.width ?? model.size.width;
          const height = node.measured?.height ?? node.height ?? model.size.height;

          return {
            ...model,
            position: { ...node.position },
            size: { width, height }
          };
        }),
        edges: nextEdges
          .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
          .map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
            ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {})
          })),
        viewport: { ...viewport },
        updatedAt: updateTimestamp
          ? new Date().toISOString()
          : workflowRef.current.updatedAt
      };
    },
    [getViewport]
  );

  const commit = useCallback(
    (
      nextNodes = nodesRef.current,
      nextEdges = edgesRef.current,
      viewport: Viewport = getViewport()
    ) => {
      if (!editable || !onChange) {
        return;
      }

      const nextWorkflow = serialize(nextNodes, nextEdges, viewport);
      workflowRef.current = nextWorkflow;
      onChange(nextWorkflow);
    },
    [editable, getViewport, onChange, serialize]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<WorkflowCanvasNode>[]) => {
      if (!editable) {
        return;
      }

      const nextNodes = applyNodeChanges(changes, nodesRef.current);
      const survivingNodeIds = new Set(nextNodes.map((node) => node.id));
      const nextEdges = edgesRef.current.filter(
        (edge) => survivingNodeIds.has(edge.source) && survivingNodeIds.has(edge.target)
      );

      replaceNodes(nextNodes);
      if (nextEdges.length !== edgesRef.current.length) {
        replaceEdges(nextEdges);
      }

      if (shouldCommitNodeChanges(changes)) {
        commit(nextNodes, nextEdges);
      }
    },
    [commit, editable, replaceEdges, replaceNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowCanvasEdge>[]) => {
      if (!editable) {
        return;
      }

      const nextEdges = applyEdgeChanges(changes, edgesRef.current).map(
        withEdgeSelectionStyle
      );
      replaceEdges(nextEdges);

      if (shouldCommitEdgeChanges(changes)) {
        commit(nodesRef.current, nextEdges);
      }
    },
    [commit, editable, replaceEdges]
  );

  const updateNode = useCallback(
    (
      nodeId: string,
      update: (node: WorkflowCanvasNode) => WorkflowCanvasNode
    ) => {
      const nextNodes = nodesRef.current.map((node) =>
        node.id === nodeId ? update(node) : node
      );
      replaceNodes(nextNodes);
      commit(nextNodes, edgesRef.current);
    },
    [commit, replaceNodes]
  );

  const patchNodeModel = useCallback(
    (nodeId: string, patch: Partial<ProjectWorkflowNode>) => {
      updateNode(nodeId, (node) => ({
        ...node,
        data: {
          ...node.data,
          workflowNode: {
            ...node.data.workflowNode,
            ...patch
          }
        }
      }));
    },
    [updateNode]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nextNodes = nodesRef.current.filter((node) => node.id !== nodeId);
      const nextEdges = edgesRef.current.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      );
      replaceNodes(nextNodes);
      replaceEdges(nextEdges);
      commit(nextNodes, nextEdges);
    },
    [commit, replaceEdges, replaceNodes]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      const nextEdges = edgesRef.current.filter((edge) => edge.id !== edgeId);
      replaceEdges(nextEdges);
      commit(nodesRef.current, nextEdges);
    },
    [commit, replaceEdges]
  );

  const resizeNode = useCallback(
    (
      nodeId: string,
      next: { x: number; y: number; width: number; height: number }
    ) => {
      updateNode(nodeId, (node) => {
        const model = node.data.workflowNode;

        return {
          ...node,
          position: { x: next.x, y: next.y },
          width: next.width,
          height: next.height,
          measured: { width: next.width, height: next.height },
          style: { ...node.style, width: next.width, height: next.height },
          data: {
            ...node.data,
            workflowNode: {
              ...model,
              position: { x: next.x, y: next.y },
              size: { width: next.width, height: next.height }
            }
          }
        };
      });
    },
    [updateNode]
  );

  const addNode = useCallback(
    (shape: ProjectWorkflowNode["shape"]) => {
      if (!editable) {
        return;
      }

      const bounds = rootRef.current?.getBoundingClientRect();
      const center = bounds
        ? screenToFlowPosition({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2
          })
        : { x: 0, y: 0 };
      const size =
        shape === "circle"
          ? { width: 220, height: 220 }
          : { width: 280, height: 160 };
      const model: ProjectWorkflowNode = {
        id: createEntityId("node"),
        shape,
        fillColor: defaultWorkflowNodeFillColor(shape),
        position: {
          x: center.x - size.width / 2,
          y: center.y - size.height / 2
        },
        size,
        text: shape === "circle" ? labels.newCircleText : labels.newRectangleText
      };
      const nextNodes = [...nodesRef.current, toFlowNode(model, true)];

      replaceNodes(nextNodes);
      commit(nextNodes, edgesRef.current);
    },
    [commit, editable, labels.newCircleText, labels.newRectangleText, replaceNodes, screenToFlowPosition]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!editable || !connection.source || !connection.target) {
        return;
      }

      const isDuplicate = edgesRef.current.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target &&
          edge.sourceHandle === connection.sourceHandle &&
          edge.targetHandle === connection.targetHandle
      );

      if (connection.source === connection.target || isDuplicate) {
        return;
      }

      const nextEdge = toFlowEdge(
        {
          id: createEntityId("edge"),
          source: connection.source,
          target: connection.target,
          ...(connection.sourceHandle
            ? { sourceHandle: connection.sourceHandle }
            : {}),
          ...(connection.targetHandle
            ? { targetHandle: connection.targetHandle }
            : {})
        },
        true
      );
      const nextEdges = [...edgesRef.current, nextEdge];

      replaceEdges(nextEdges);
      commit(nodesRef.current, nextEdges);
    },
    [commit, editable, replaceEdges]
  );

  const nodeActions = useMemo(
    () => ({
      labels,
      mode,
      onAttachmentChange: (
        nodeId: string,
        attachment?: ProjectWorkflowAttachment
      ) => patchNodeModel(nodeId, { attachment }),
      onFillColorChange: (nodeId: string, fillColor: string) =>
        patchNodeModel(nodeId, { fillColor }),
      onDelete: deleteNode,
      onResize: resizeNode,
      onTextChange: (nodeId: string, text: string) =>
        patchNodeModel(nodeId, { text })
    }),
    [deleteNode, labels, mode, patchNodeModel, resizeNode]
  );

  const shareWorkflow = useCallback(async () => {
    if (!onShare || sharing) {
      return;
    }

    setSharing(true);
    try {
      await onShare(serialize(nodesRef.current, edgesRef.current, getViewport(), false));
    } finally {
      setSharing(false);
    }
  }, [getViewport, onShare, serialize, sharing]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative h-[min(72dvh,760px)] min-h-[34rem] overflow-hidden rounded-studio-lg border border-black/[0.06] bg-white/[0.72] shadow-soft",
        className
      )}
      aria-label={labels.workflowCanvas}
    >
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
        {editable ? (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full bg-white/90 p-1.5 shadow-lift backdrop-blur-xl">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3"
              onClick={() => addNode("rounded-rectangle")}
              title={labels.addRectangle}
            >
              <RectangleHorizontal size={17} strokeWidth={2.3} />
              <span className="hidden sm:inline">{labels.addRectangle}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3"
              onClick={() => addNode("circle")}
              title={labels.addCircle}
            >
              <Circle size={17} strokeWidth={2.3} />
              <span className="hidden sm:inline">{labels.addCircle}</span>
            </Button>
          </div>
        ) : (
          <span />
        )}

        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/90 p-1.5 shadow-lift backdrop-blur-xl">
          <Button
            variant="icon"
            size="icon"
            className="size-9"
            onClick={() => void zoomOut({ duration: 180 })}
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
          >
            <Minus size={17} strokeWidth={2.4} />
          </Button>
          <Button
            variant="icon"
            size="icon"
            className="size-9"
            onClick={() => void fitView({ padding: 0.18, duration: 260 })}
            aria-label={labels.fitView}
            title={labels.fitView}
          >
            <Maximize2 size={16} strokeWidth={2.3} />
          </Button>
          <Button
            variant="icon"
            size="icon"
            className="size-9"
            onClick={() => void zoomIn({ duration: 180 })}
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
          >
            <Plus size={17} strokeWidth={2.4} />
          </Button>
          {onShare ? (
            <Button
              variant="secondary"
              size="sm"
              className="h-9 px-3"
              disabled={sharing}
              onClick={() => void shareWorkflow()}
              title={labels.shareWorkflow}
            >
              <Share2 size={16} strokeWidth={2.3} />
              <span className="hidden sm:inline">{labels.shareWorkflow}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <WorkflowNodeActionsProvider value={nodeActions}>
        <ReactFlow<WorkflowCanvasNode, WorkflowCanvasEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgeDoubleClick={(event, edge) => {
            if (editable) {
              event.stopPropagation();
              deleteEdge(edge.id);
            }
          }}
          onConnect={onConnect}
          onMoveEnd={(_, viewport) => {
            if (editable && !synchronizingViewportRef.current) {
              commit(nodesRef.current, edgesRef.current, viewport);
            }
          }}
          isValidConnection={(connection) =>
            editable &&
            connection.source !== connection.target &&
            !edgesRef.current.some(
              (edge) =>
                edge.source === connection.source &&
                edge.target === connection.target &&
                edge.sourceHandle === connection.sourceHandle &&
                edge.targetHandle === connection.targetHandle
            )
          }
          defaultViewport={workflow.viewport}
          defaultEdgeOptions={{
            type: "default",
            style: edgeStyle,
            interactionWidth: 28
          }}
          connectionMode={ConnectionMode.Strict}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={edgeStyle}
          nodesDraggable={editable}
          nodesConnectable={editable}
          nodesFocusable={editable}
          edgesFocusable={editable}
          edgesReconnectable={false}
          elementsSelectable={editable}
          deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
          minZoom={0.2}
          maxZoom={2.5}
          panOnDrag
          zoomOnPinch
          zoomOnScroll
          zoomOnDoubleClick={false}
          preventScrolling
          proOptions={{ hideAttribution: true }}
          colorMode="light"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.4}
            color="rgba(98, 113, 122, 0.32)"
          />
        </ReactFlow>
      </WorkflowNodeActionsProvider>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
