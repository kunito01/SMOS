import type { ProjectWorkflow, ProjectWorkflowAttachment } from "@/lib/types";
import { reportBrandMarkSvg, type ReportChromeLabels } from "@/lib/utils/report-share-common";

export const MAX_WORKFLOW_ATTACHMENT_BYTES = 1024 * 1024;

const defaultWorkflowChrome: ReportChromeLabels = {
  eyebrow: "Creative project operating system",
  footerCopyright: "Copyright © 2026 Colorinu Games Limited.",
  footerRights: "All rights reserved.",
  footerCollaboration: "Interested in collaboration? Reach out to",
  footerMoreInfo: "for more information"
};

export type WorkflowAttachmentReadErrorCode =
  | "unsupported-type"
  | "too-large"
  | "invalid-utf8"
  | "invalid-json";

export class WorkflowAttachmentReadError extends Error {
  constructor(
    public readonly code: WorkflowAttachmentReadErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WorkflowAttachmentReadError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const createId = (prefix: string) => {
  const randomId = globalThis.crypto?.randomUUID?.();

  return randomId
    ? `${prefix}-${randomId}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const fileExtension = (fileName: string) => {
  const match = /\.([^.]+)$/u.exec(fileName.trim());
  return match?.[1]?.toLocaleLowerCase("en-US") ?? "";
};

const sanitizeFileName = (fileName: string, fallback: string) => {
  const sanitized = fileName
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\.+/u, "")
    .slice(0, 180);

  return sanitized || fallback;
};

const decodeUtf8 = (bytes: Uint8Array) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new WorkflowAttachmentReadError(
      "invalid-utf8",
      "The selected file must contain valid UTF-8 text."
    );
  }
};

export async function readWorkflowAttachmentFile(
  file: File
): Promise<ProjectWorkflowAttachment> {
  if (file.size > MAX_WORKFLOW_ATTACHMENT_BYTES) {
    throw new WorkflowAttachmentReadError(
      "too-large",
      "Workflow attachments must be 1 MiB or smaller."
    );
  }

  const extension = fileExtension(file.name);
  const kind = extension === "json" ? "json" : extension === "md" ? "markdown" : null;

  if (!kind) {
    throw new WorkflowAttachmentReadError(
      "unsupported-type",
      "Only .json and .md workflow attachments are supported."
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const content = decodeUtf8(bytes);
  const contentSize = new TextEncoder().encode(content).byteLength;

  if (kind === "json") {
    try {
      JSON.parse(content);
    } catch {
      throw new WorkflowAttachmentReadError(
        "invalid-json",
        "The selected JSON file is not valid JSON."
      );
    }
  }

  return {
    id: createId("workflow-attachment"),
    fileName: sanitizeFileName(file.name, kind === "json" ? "workflow.json" : "workflow.md"),
    kind,
    mimeType: kind === "json" ? "application/json" : "text/markdown",
    // TextDecoder intentionally removes a UTF-8 BOM. Persist the exact byte
    // length of the stored string so backup validation remains deterministic.
    size: contentSize,
    content,
    uploadedAt: new Date().toISOString()
  };
}

const requireBrowserDocument = () => {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Workflow downloads are available only in a browser.");
  }
};

const downloadBlob = (blob: Blob, fileName: string) => {
  requireBrowserDocument();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
};

export function downloadWorkflowAttachment(attachment: ProjectWorkflowAttachment) {
  const fallback = attachment.kind === "json" ? "workflow.json" : "workflow.md";
  const fileName = sanitizeFileName(attachment.fileName, fallback);

  downloadBlob(
    new Blob([attachment.content], {
      type: `${attachment.mimeType};charset=utf-8`
    }),
    fileName
  );
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  if (typeof globalThis.btoa !== "function") {
    throw new Error("Base64 encoding is unavailable in this environment.");
  }

  return globalThis.btoa(binary);
};

const workflowToBase64 = (workflow: ProjectWorkflow) =>
  bytesToBase64(new TextEncoder().encode(JSON.stringify(workflow)));

const escapeHtml = (value: string) =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");

/**
 * Creates a dependency-free HTML viewer. User-authored strings live only in a
 * base64 JSON payload and are inserted with textContent by the viewer script.
 */
export function createWorkflowShareHtml(workflow: ProjectWorkflow, chrome: ReportChromeLabels = defaultWorkflowChrome) {
  const payload = workflowToBase64(workflow);
  const documentTitle = escapeHtml(`${workflow.name || "Workflow"} · Studio Map OS`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <title>${documentTitle}</title>
  <style>
    :root{--canvas:#eef6f6;--surface:#fff;--ink:#1c2328;--muted:#62717a;--aqua:#b0ebef;--lime:#f1f427;--coral:#f94622;--cloud:#e5eaeb}
    *{box-sizing:border-box}
    html,body{height:100%;margin:0;overflow:hidden;background:var(--canvas);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button{font:inherit}
    .app{height:100%;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));gap:12px}
    .brand{display:flex;align-items:center;gap:9px;padding:2px 6px 0}
    .brand svg{width:34px;height:34px;flex:none}
    .brand-eyebrow{margin:0;color:var(--muted);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
    .brand-title{margin:2px 0 0;font-size:15px;font-weight:900;letter-spacing:-.01em;line-height:1;white-space:nowrap}
    .chrome-footer{padding:0 6px 2px;text-align:center;color:rgba(28,35,40,.48);font-size:10px;font-weight:650;line-height:1.5}
    .chrome-footer p{margin:0;overflow-wrap:anywhere}
    .chrome-footer a{color:#ff0099;font-weight:900;text-decoration:none}
    .chrome-footer a:hover,.chrome-footer a:focus-visible{text-decoration:underline;text-underline-offset:3px}
    .header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-radius:24px;background:rgba(255,255,255,.82);box-shadow:0 18px 50px rgba(28,45,55,.12);backdrop-filter:blur(18px)}
    .eyebrow{margin:0 0 4px;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
    h1{margin:0;max-width:72vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(20px,3vw,30px);line-height:1;font-weight:900}
    .controls{display:flex;gap:7px;flex:none}
    .control{min-width:42px;height:42px;border:0;border-radius:999px;background:var(--cloud);color:var(--ink);font-weight:900;cursor:pointer}
    .control:hover,.control:focus-visible{background:var(--lime);outline:0}
    .canvas{position:relative;min-height:0;overflow:hidden;border-radius:32px;background-color:rgba(255,255,255,.78);background-image:radial-gradient(circle,rgba(98,113,122,.3) 1px,transparent 1.5px);background-size:24px 24px;box-shadow:0 24px 70px rgba(28,45,55,.12);touch-action:none;cursor:grab}
    .canvas.panning{cursor:grabbing}
    .scene{position:absolute;left:0;top:0;width:1px;height:1px;transform-origin:0 0;will-change:transform}
    .edges{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none}
    .edge{fill:none;stroke:var(--coral);stroke-width:4;stroke-linecap:round;opacity:.78;vector-effect:non-scaling-stroke}
    .node{position:absolute;display:grid;grid-template-rows:minmax(0,1fr) auto;gap:10px;padding:18px;background:rgba(255,255,255,.94);color:var(--ink);box-shadow:0 18px 45px rgba(28,45,55,.16);border:1px solid rgba(28,35,40,.08);overflow:hidden}
    .node.rect{border-radius:24px}
    .node.circle{place-content:center;border-radius:9999px;background:rgba(176,235,239,.95);padding:28px;text-align:center}
    .node-text{align-self:center;min-width:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-weight:700;line-height:1.28}
    .attachment{max-width:100%;min-height:36px;border:0;border-radius:999px;background:var(--ink);color:#fff;padding:8px 13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:800;cursor:pointer}
    .attachment:hover,.attachment:focus-visible{background:var(--coral);outline:2px solid #fff;outline-offset:2px}
    .empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:360px;padding:18px 22px;border-radius:22px;background:rgba(255,255,255,.9);text-align:center;font-weight:800;color:var(--muted);box-shadow:0 18px 45px rgba(28,45,55,.12)}
    @media(max-width:560px){.app{padding:8px;gap:8px}.header{padding:12px;border-radius:20px}.control{min-width:38px;height:38px}.canvas{border-radius:24px}}
    @media(max-height:560px){.app{gap:6px}.brand{gap:6px;padding:0 4px}.brand svg{width:24px;height:24px}.brand-eyebrow{font-size:6px}.brand-title{margin-top:1px;font-size:12px}.chrome-footer{font-size:8px;line-height:1.35}}
  </style>
</head>
<body>
  <main class="app">
    <div class="brand">
      ${reportBrandMarkSvg}
      <div>
        <p class="brand-eyebrow">${escapeHtml(chrome.eyebrow)}</p>
        <p class="brand-title">STUDIO MAP OS</p>
      </div>
    </div>
    <header class="header">
      <div><p class="eyebrow">Studio Map OS Workflow</p><h1 id="workflow-title">Workflow</h1></div>
      <div class="controls" aria-label="Canvas controls">
        <button class="control" id="zoom-out" type="button" aria-label="Zoom out">−</button>
        <button class="control" id="fit-view" type="button" aria-label="Fit view">Fit</button>
        <button class="control" id="zoom-in" type="button" aria-label="Zoom in">+</button>
      </div>
    </header>
    <section class="canvas" id="canvas" aria-label="Read-only workflow canvas">
      <div class="scene" id="scene"><svg class="edges" id="edges" aria-hidden="true"></svg><div id="nodes"></div></div>
    </section>
    <footer class="chrome-footer">
      <p>${escapeHtml(chrome.footerCopyright)} ${escapeHtml(chrome.footerRights)}</p>
      <p>${escapeHtml(chrome.footerCollaboration)} <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a> ${escapeHtml(chrome.footerMoreInfo)}</p>
    </footer>
  </main>
  <script id="workflow-payload" type="application/octet-stream">${payload}</script>
  <script>
    (() => {
      "use strict";
      const payload = document.getElementById("workflow-payload").textContent.trim();
      const bytes = Uint8Array.from(atob(payload), character => character.charCodeAt(0));
      const workflow = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      const canvas = document.getElementById("canvas");
      const scene = document.getElementById("scene");
      const nodesRoot = document.getElementById("nodes");
      const edgesRoot = document.getElementById("edges");
      const title = document.getElementById("workflow-title");
      const nodeById = new Map(workflow.nodes.map(node => [node.id, node]));
      let view = { x: workflow.viewport.x, y: workflow.viewport.y, zoom: workflow.viewport.zoom };
      let drag = null;

      const safeFileName = (value, fallback) => {
        let next = Array.from(String(value || ""), character => {
          const code = character.charCodeAt(0);
          const reserved = ["/", String.fromCharCode(92), ":", "*", "?", String.fromCharCode(34), "<", ">", "|"];
          return reserved.includes(character) || code < 32 || code === 127 ? "-" : character;
        }).join("").trim().slice(0, 180);
        while (next.startsWith(".")) next = next.slice(1);
        return next || fallback;
      };
      const nodeFillColor = node => {
        const value = typeof node.fillColor === "string" ? node.fillColor : "";
        if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
        return node.shape === "circle" ? "#B0EBEF" : "#FFFFFF";
      };
      const readableTextColor = fillColor => {
        const parsed = Number.parseInt(fillColor.slice(1), 16);
        const red = (parsed >> 16) & 255;
        const green = (parsed >> 8) & 255;
        const blue = parsed & 255;
        const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
        return luminance > 0.58 ? "#1C2328" : "#FFFFFF";
      };
      const applyView = () => {
        scene.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.zoom + ")";
      };
      const downloadAttachment = attachment => {
        const blob = new Blob([attachment.content], { type: attachment.mimeType + ";charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = safeFileName(attachment.fileName, attachment.kind === "json" ? "workflow.json" : "workflow.md");
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      const endpoint = (node, handle, source) => {
        const onLeft = handle === "left" || (!handle && !source);
        return {
          x: node.position.x + (onLeft ? 0 : node.size.width),
          y: node.position.y + node.size.height / 2,
          direction: onLeft ? -1 : 1
        };
      };

      title.textContent = workflow.name || "Workflow";
      workflow.edges.forEach(edge => {
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        if (!sourceNode || !targetNode) return;
        const source = endpoint(sourceNode, edge.sourceHandle, true);
        const target = endpoint(targetNode, edge.targetHandle, false);
        const curve = Math.max(72, Math.abs(target.x - source.x) * .46);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "edge");
        path.setAttribute("d", "M " + source.x + " " + source.y + " C " + (source.x + source.direction * curve) + " " + source.y + ", " + (target.x + target.direction * curve) + " " + target.y + ", " + target.x + " " + target.y);
        edgesRoot.append(path);
      });
      workflow.nodes.forEach(node => {
        const element = document.createElement("article");
        const text = document.createElement("div");
        element.className = "node " + (node.shape === "circle" ? "circle" : "rect");
        element.style.left = node.position.x + "px";
        element.style.top = node.position.y + "px";
        element.style.width = node.size.width + "px";
        element.style.height = node.size.height + "px";
        const fillColor = nodeFillColor(node);
        element.style.backgroundColor = fillColor;
        element.style.color = readableTextColor(fillColor);
        text.className = "node-text";
        text.textContent = node.text;
        element.append(text);
        if (node.attachment) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "attachment";
          button.textContent = "Download · " + node.attachment.fileName;
          button.addEventListener("click", event => {
            event.stopPropagation();
            downloadAttachment(node.attachment);
          });
          element.append(button);
        }
        nodesRoot.append(element);
      });
      if (!workflow.nodes.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "This workflow has no nodes yet.";
        canvas.append(empty);
      }

      const setZoom = (nextZoom, anchorX = canvas.clientWidth / 2, anchorY = canvas.clientHeight / 2) => {
        const zoom = Math.min(2.5, Math.max(.2, nextZoom));
        const worldX = (anchorX - view.x) / view.zoom;
        const worldY = (anchorY - view.y) / view.zoom;
        view = { x: anchorX - worldX * zoom, y: anchorY - worldY * zoom, zoom };
        applyView();
      };
      const fitView = () => {
        if (!workflow.nodes.length) {
          view = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, zoom: 1 };
          applyView();
          return;
        }
        const minX = Math.min(...workflow.nodes.map(node => node.position.x));
        const minY = Math.min(...workflow.nodes.map(node => node.position.y));
        const maxX = Math.max(...workflow.nodes.map(node => node.position.x + node.size.width));
        const maxY = Math.max(...workflow.nodes.map(node => node.position.y + node.size.height));
        const padding = 72;
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const zoom = Math.min(1.5, Math.max(.2, Math.min((canvas.clientWidth - padding * 2) / width, (canvas.clientHeight - padding * 2) / height)));
        view = { x: (canvas.clientWidth - width * zoom) / 2 - minX * zoom, y: (canvas.clientHeight - height * zoom) / 2 - minY * zoom, zoom };
        applyView();
      };

      canvas.addEventListener("pointerdown", event => {
        if (event.target.closest("button")) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add("panning");
      });
      canvas.addEventListener("pointermove", event => {
        if (!drag || drag.id !== event.pointerId) return;
        view.x = drag.viewX + event.clientX - drag.x;
        view.y = drag.viewY + event.clientY - drag.y;
        applyView();
      });
      const endDrag = event => {
        if (!drag || drag.id !== event.pointerId) return;
        drag = null;
        canvas.classList.remove("panning");
      };
      canvas.addEventListener("pointerup", endDrag);
      canvas.addEventListener("pointercancel", endDrag);
      canvas.addEventListener("wheel", event => {
        event.preventDefault();
        const bounds = canvas.getBoundingClientRect();
        setZoom(view.zoom * Math.exp(-event.deltaY * .0015), event.clientX - bounds.left, event.clientY - bounds.top);
      }, { passive: false });
      document.getElementById("zoom-in").addEventListener("click", () => setZoom(view.zoom * 1.2));
      document.getElementById("zoom-out").addEventListener("click", () => setZoom(view.zoom / 1.2));
      document.getElementById("fit-view").addEventListener("click", fitView);
      applyView();
    })();
  </script>
</body>
</html>`;
}

export const createWorkflowShareFileName = (workflow: ProjectWorkflow) => {
  const slug = sanitizeFileName(workflow.name, "workflow")
    .replace(/\.[^.]+$/u, "")
    .replace(/\s+/gu, "-")
    .toLocaleLowerCase("en-US")
    .slice(0, 80);

  return `studio-map-os-workflow-${slug || "workflow"}.html`;
};

export function downloadWorkflowShareHtml(workflow: ProjectWorkflow, chrome?: ReportChromeLabels) {
  const html = createWorkflowShareHtml(workflow, chrome);

  downloadBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    createWorkflowShareFileName(workflow)
  );
}
