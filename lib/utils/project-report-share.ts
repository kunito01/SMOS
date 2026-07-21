import type { ProjectWorkflow } from "@/lib/types";
import {
  clampReportPercent,
  downloadReportHtmlFile,
  embedReportCoverImage,
  escapeReportHtml,
  normalizeReportHexColor,
  readableReportTextColor,
  renderReportChromeFooter,
  renderReportChromeHeader,
  reportChromeStyles,
  reportHexColorWithAlpha,
  sanitizeReportFileName,
  type ReportChromeLabels
} from "@/lib/utils/report-share-common";

export type ProjectReportMetricTone = "aqua" | "cloud" | "coral" | "ink" | "lime";

export type ProjectReportMetric = {
  label: string;
  value: string;
  tone?: ProjectReportMetricTone;
};

export type ProjectReportTask = {
  completed: boolean;
  dueDate: string;
  owner: string;
  title: string;
};

export type ProjectReportPhase = {
  color: string;
  name: string;
  notes: string;
  people: string[];
  period: string;
  status: string;
  target: string;
  tasks: ProjectReportTask[];
  tools: string[];
};

export type ProjectReportTimelineRow = {
  label: string;
  values: string[];
};

export type ProjectReportPayment = {
  amount: string;
  dueDate: string;
  notes: string;
  receivedDate?: string;
  title: string;
  type: string;
};

export type ProjectReportLabels = {
  collectionProgress: string;
  dueDate: string;
  notes: string;
  owner: string;
  paymentItems: string;
  paymentReceivedDate: string;
  paymentStatus: string;
  people: string;
  projectContent: string;
  projectSettings: string;
  projectStatus: string;
  projectSummary: string;
  projectTimeline: string;
  period: string;
  stage: string;
  status: string;
  target: string;
  tasks: string;
  tools: string;
  workflow: string;
  workflowDownloadAttachment: string;
  workflowEmpty: string;
  workflowFitView: string;
  workflowZoomIn: string;
  workflowZoomOut: string;
};

export type ProjectReportData = {
  chrome: ReportChromeLabels;
  collectionBody: string;
  collectionProgress: number;
  coverImageUrl?: string;
  dateRange: string;
  description: string;
  groupName?: string;
  language: string;
  labels: ProjectReportLabels;
  paymentMetrics: ProjectReportMetric[];
  payments: ProjectReportPayment[];
  phases: ProjectReportPhase[];
  projectName: string;
  status: {
    label: string;
    tone: "active" | "completed" | "paused" | "planning" | "terminated";
  };
  summaryMetrics: ProjectReportMetric[];
  timelineRows: ProjectReportTimelineRow[];
  workflows: ProjectWorkflow[];
};

const escapeHtml = escapeReportHtml;
const clampPercent = clampReportPercent;
const embedCoverImage = embedReportCoverImage;

export const sanitizeProjectReportFileName = (projectName: string) =>
  sanitizeReportFileName(projectName, "Studio Map OS Project");

const renderMetric = (metric: ProjectReportMetric) => {
  const tone = metric.tone ?? "cloud";

  return `<article class="metric metric--${tone}">
    <p class="metric__label">${escapeHtml(metric.label)}</p>
    <p class="metric__value">${escapeHtml(metric.value)}</p>
  </article>`;
};

const renderChips = (values: string[]) =>
  values.length
    ? `<div class="chips">${values.map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("")}</div>`
    : `<span class="empty-value">—</span>`;

const renderTask = (task: ProjectReportTask, labels: ProjectReportLabels) => `<li class="task${task.completed ? " task--done" : ""}">
  <span class="task__mark" aria-hidden="true">${task.completed ? "✓" : "○"}</span>
  <span class="task__body">
    <span class="task__title">${escapeHtml(task.title)}</span>
    <span class="task__meta">
      <span>${escapeHtml(labels.dueDate)} · ${escapeHtml(task.dueDate)}</span>
      <span>${escapeHtml(labels.owner)} · ${escapeHtml(task.owner)}</span>
    </span>
  </span>
</li>`;

const fallbackTimelineColor = "#E3F596";

const normalizeTimelineColor = (value: string) => normalizeReportHexColor(value, fallbackTimelineColor);

const timelineColorWithAlpha = (value: string, alpha: number) =>
  reportHexColorWithAlpha(value, alpha, fallbackTimelineColor);

const readableTimelineTextColor = (value: string) => readableReportTextColor(value, fallbackTimelineColor);

const renderTimelineLabel = (label: string, tasks = false) =>
  `<div class="timeline-label${tasks ? " timeline-label--tasks" : ""}">${escapeHtml(label)}</div>`;

const renderTimelineCell = (
  content: string,
  color: string,
  alpha: number,
  className = ""
) =>
  `<div class="timeline-cell${className ? ` ${className}` : ""}" style="background:${timelineColorWithAlpha(color, alpha)}">${content}</div>`;

const renderTimelineBoard = (data: ProjectReportData) => {
  if (!data.phases.length) {
    return `<div class="timeline-meta"><span>${escapeHtml(data.labels.projectTimeline)}</span><strong>${escapeHtml(data.dateRange)}</strong></div>
      <p class="timeline-empty">—</p>`;
  }

  const phaseCount = Math.max(data.phases.length, 1);
  const minimumWidth = 9 + phaseCount * 14 + Math.max(phaseCount, 1) * 0.55;
  const gridStyle = `grid-template-columns:9rem repeat(${phaseCount},minmax(14rem,1fr));min-width:${minimumWidth}rem`;
  const phases = data.phases;
  const rows = [
    renderTimelineLabel(data.labels.stage),
    ...phases.map((phase) => {
      const color = normalizeTimelineColor(phase.color);
      return `<div class="timeline-cell timeline-cell--stage" style="background:${color};color:${readableTimelineTextColor(color)}">${escapeHtml(phase.name)}</div>`;
    }),
    renderTimelineLabel(data.labels.period),
    ...phases.map((phase) =>
      renderTimelineCell(`<strong>${escapeHtml(phase.period)}</strong>`, phase.color, 0.15)
    ),
    renderTimelineLabel(data.labels.target),
    ...phases.map((phase) =>
      renderTimelineCell(`<p>${escapeHtml(phase.target)}</p>`, phase.color, 0.7, "timeline-cell--tall")
    ),
    renderTimelineLabel(data.labels.tasks, true),
    ...phases.map((phase) =>
      renderTimelineCell(
        phase.tasks.length
          ? `<ul class="tasks">${phase.tasks.map((task) => renderTask(task, data.labels)).join("")}</ul>`
          : `<span class="empty-value">—</span>`,
        phase.color,
        0.4,
        "timeline-cell--tasks"
      )
    ),
    renderTimelineLabel(data.labels.people),
    ...phases.map((phase) => renderTimelineCell(renderChips(phase.people), phase.color, 0.7)),
    renderTimelineLabel(data.labels.tools),
    ...phases.map((phase) => renderTimelineCell(renderChips(phase.tools), phase.color, 0.7)),
    renderTimelineLabel(data.labels.notes),
    ...phases.map((phase) =>
      renderTimelineCell(`<p>${escapeHtml(phase.notes)}</p>`, phase.color, 0.15, "timeline-cell--notes")
    ),
    ...data.timelineRows.flatMap((row) => [
      renderTimelineLabel(row.label),
      ...phases.map((phase, index) =>
        renderTimelineCell(
          `<p>${escapeHtml(row.values[index] || "—")}</p>`,
          phase.color,
          0.15,
          "timeline-cell--notes"
        )
      )
    ])
  ];

  return `<div class="timeline-meta"><span>${escapeHtml(data.labels.projectTimeline)}</span><strong>${escapeHtml(data.dateRange)}</strong></div>
    <div class="timeline-scroll" role="region" tabindex="0" aria-label="${escapeHtml(data.labels.projectTimeline)}">
      <div class="timeline-grid" style="${gridStyle}">${rows.join("")}</div>
    </div>`;
};

const encodeBase64Json = (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
};

const renderWorkflowViewers = (data: ProjectReportData) =>
  data.workflows.length
    ? `<div class="workflow-list">${data.workflows
        .map(
          (_, index) => `<article class="workflow-viewer" data-workflow-index="${index}" data-download-label="${escapeHtml(data.labels.workflowDownloadAttachment)}">
            <header class="workflow-header">
              <div><p class="workflow-eyebrow">${escapeHtml(data.labels.workflow)}</p><h3 class="workflow-title"></h3></div>
              <div class="workflow-controls" aria-label="${escapeHtml(data.labels.workflow)}">
                <button type="button" data-workflow-action="zoom-out" aria-label="${escapeHtml(data.labels.workflowZoomOut)}">−</button>
                <button type="button" data-workflow-action="fit" aria-label="${escapeHtml(data.labels.workflowFitView)}">Fit</button>
                <button type="button" data-workflow-action="zoom-in" aria-label="${escapeHtml(data.labels.workflowZoomIn)}">+</button>
              </div>
            </header>
            <div class="workflow-canvas" aria-label="${escapeHtml(data.labels.workflow)}">
              <div class="workflow-scene"><svg class="workflow-edges" aria-hidden="true"></svg><div class="workflow-nodes"></div></div>
            </div>
          </article>`
        )
        .join("")}</div>`
    : `<p class="workflow-empty">${escapeHtml(data.labels.workflowEmpty)}</p>`;

const renderPayment = (payment: ProjectReportPayment, labels: ProjectReportLabels) => `<article class="payment">
  <div class="payment__heading">
    <div>
      <p class="payment__type">${escapeHtml(payment.type)}</p>
      <h3>${escapeHtml(payment.title)}</h3>
    </div>
    <strong>${escapeHtml(payment.amount)}</strong>
  </div>
  <div class="payment__meta">
    <span>${escapeHtml(labels.dueDate)} · ${escapeHtml(payment.dueDate)}</span>
    ${payment.receivedDate ? `<span>${escapeHtml(labels.paymentReceivedDate)} · ${escapeHtml(payment.receivedDate)}</span>` : ""}
  </div>
  ${payment.notes ? `<p class="payment__notes"><b>${escapeHtml(labels.notes)}</b> · ${escapeHtml(payment.notes)}</p>` : ""}
</article>`;

const createProjectReportHtmlWithCover = (data: ProjectReportData, embeddedCover: string | null) => {
  const progress = clampPercent(data.collectionProgress);
  const coverStyle = embeddedCover ? ` style="background-image:linear-gradient(180deg,rgba(28,35,40,.08),rgba(28,35,40,.86)),url('${embeddedCover}')"` : "";
  const statusTone = data.status.tone;
  const workflowPayload = encodeBase64Json(data.workflows);
  const nonceBytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(nonceBytes);
  const scriptNonce = Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, "0")).join("") || "smos-project-report";
  const cuneiformFontStyle = data.language === "sux"
    ? `@font-face{font-family:"SMOS Cuneiform";font-style:normal;font-weight:400;font-display:swap;src:local("Noto Sans Cuneiform"),url("https://fonts.gstatic.com/s/notosanscuneiform/v18/bMrrmTWK7YY-MF22aHGGd7H8PhJtvBDWgb8.ttf") format("truetype");unicode-range:U+12000-123FF,U+12400-1247F,U+12480-1254F}`
    : "";
  const reportFontFamily = data.language === "sux"
    ? `"SMOS Cuneiform",Inter,ui-rounded,"SF Pro Rounded","SF Pro Display",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`
    : `Inter,ui-rounded,"SF Pro Rounded","SF Pro Display",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

  return `<!doctype html>
<html lang="${escapeHtml(data.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src https://fonts.gstatic.com; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(data.projectName)}</title>
  <style>
    ${cuneiformFontStyle}
    :root{color-scheme:light;--ink:#1c2328;--muted:#5d6a72;--aqua:#8edbe8;--aqua-strong:#03b5aa;--lime:#e3f596;--coral:#f94a22;--pink:#f7567c;--cloud:#f4e9d8;--cream:#fffae3;--white:#fff;--deep:#023436;--radius-xl:2.4rem;--radius-lg:1.7rem;--radius-md:1.2rem}
    *{box-sizing:border-box}
    html{background:#edf9f7}
    body{margin:0;color:var(--ink);font-family:${reportFontFamily};background:radial-gradient(circle at 8% 8%,rgba(142,219,232,.58),transparent 28rem),radial-gradient(circle at 92% 36%,rgba(227,245,150,.75),transparent 31rem),linear-gradient(150deg,#f9fffd,#f6f2e9);font-weight:650;line-height:1.5}
    h1,h2,h3,p{margin:0;overflow-wrap:anywhere}
    h1,h2,h3,strong,.metric__value{font-weight:900}
    .report{width:min(100%,94rem);margin:0 auto;padding:clamp(.85rem,2.4vw,2.4rem)}
    .report-section{margin-top:clamp(1rem,2vw,1.6rem);border:1px solid rgba(28,35,40,.06);border-radius:var(--radius-xl);box-shadow:0 24px 70px rgba(28,35,40,.10)}
    .hero{position:relative;display:flex;min-height:clamp(25rem,58vw,38rem);flex-direction:column;justify-content:flex-end;overflow:hidden;padding:clamp(1.2rem,4vw,3.4rem);color:#fff;background-color:#284b50;background-image:radial-gradient(circle at 20% 20%,rgba(142,219,232,.88),transparent 31%),radial-gradient(circle at 82% 78%,rgba(227,245,150,.72),transparent 34%),linear-gradient(145deg,#335b61,var(--deep));background-position:center;background-size:cover}
    .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(28,35,40,.46),transparent 62%);pointer-events:none}
    .hero__content{position:relative;z-index:1;max-width:58rem}
    .hero__meta{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem}
    .hero__meta span{display:inline-flex;min-height:2.1rem;align-items:center;border-radius:999px;background:rgba(255,255,255,.85);padding:.45rem .85rem;color:var(--ink);font-size:.74rem;font-weight:850;backdrop-filter:blur(12px)}
    .hero h1{max-width:18ch;font-size:clamp(2.2rem,6.6vw,6rem);letter-spacing:-.065em;line-height:.91}
    .hero__description{max-width:54rem;margin-top:1.15rem;color:rgba(255,255,255,.82);font-size:clamp(.95rem,1.4vw,1.15rem);line-height:1.7}
    .panel{padding:clamp(1rem,3vw,2rem)}
    .section-kicker{font-size:.74rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;opacity:.58}
    .section-title{margin-top:.4rem;font-size:clamp(1.55rem,3vw,2.8rem);letter-spacing:-.04em;line-height:1}
    .summary{background:var(--deep);color:#fff}
    .summary-grid,.payment-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1.4rem}
    .metric{min-width:0;min-height:8.4rem;border-radius:var(--radius-md);padding:1rem;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
    .metric--aqua{background:var(--aqua-strong)}.metric--cloud{background:var(--cream)}.metric--coral{background:var(--pink)}.metric--ink{background:var(--ink);color:#fff}.metric--lime{background:var(--lime)}
    .metric__label{font-size:.7rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;opacity:.62}
    .metric__value{margin-top:1.55rem;font-size:clamp(1.35rem,2.8vw,2.25rem);letter-spacing:-.04em;line-height:1}
    .status-panel{display:flex;align-items:center;justify-content:space-between;gap:1rem;background:var(--ink);color:#fff}
    .status-badge{display:inline-flex;min-height:3.2rem;align-items:center;border-radius:999px;padding:.7rem 1.25rem;color:var(--ink);font-size:clamp(.95rem,2vw,1.25rem);font-weight:900}
    .status--planning{background:var(--lime)}.status--active{background:var(--coral);color:#fff}.status--paused{background:var(--cloud)}.status--terminated{background:#d4a1df}.status--completed{background:var(--aqua)}
    .content{background:rgba(255,255,255,.88)}
    .timeline-meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem;margin-top:1.15rem;border-radius:1rem;background:#ffc700;padding:.8rem 1rem;font-size:.74rem;font-weight:900}
    .timeline-scroll{margin-top:.8rem;overflow-x:auto;overscroll-behavior-x:contain;padding-bottom:.35rem}
    .timeline-scroll:focus-visible{outline:3px solid var(--coral);outline-offset:4px}
    .timeline-empty{margin-top:.8rem;border-radius:1rem;background:var(--cloud);padding:1.2rem;text-align:center;color:var(--muted);font-weight:850}
    .timeline-grid{display:grid;gap:.5rem}
    .timeline-label,.timeline-cell{min-width:0;border-radius:1rem;padding:.8rem;font-size:.78rem;overflow-wrap:anywhere}
    .timeline-label{position:sticky;left:0;z-index:3;display:grid;min-height:4rem;place-items:center;background:#1e577b;color:#fff;text-align:center;font-weight:900;box-shadow:12px 0 28px rgba(17,31,38,.08)}
    .timeline-label--tasks{background:#2379af}
    .timeline-cell{display:grid;min-height:4rem;align-content:center;color:var(--ink);font-weight:750;line-height:1.45}
    .timeline-cell--stage{place-items:center;text-align:center;font-size:.95rem;font-weight:900}
    .timeline-cell--tall{min-height:7rem;align-content:start}.timeline-cell--tasks{min-height:9rem;align-content:start}.timeline-cell--notes{min-height:5rem;align-content:start;white-space:pre-wrap}
    .workflow-subheading{margin-top:2rem;padding-top:1.5rem;border-top:1px solid rgba(28,35,40,.1)}
    .workflow-list{display:grid;gap:1rem;margin-top:1rem}
    .workflow-viewer{display:grid;grid-template-rows:auto minmax(26rem,58vh);gap:.75rem;min-width:0;border-radius:var(--radius-lg);background:#e2dac2;padding:.75rem;box-shadow:inset 0 0 0 1px rgba(28,35,40,.06)}
    .workflow-header{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.45rem .55rem}
    .workflow-eyebrow{color:var(--muted);font-size:.65rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.workflow-title{margin-top:.2rem;font-size:clamp(1.1rem,2vw,1.6rem)}
    .workflow-controls{display:flex;flex:none;gap:.35rem}.workflow-controls button{min-width:2.65rem;height:2.65rem;border:0;border-radius:999px;background:rgba(255,255,255,.88);color:var(--ink);font:inherit;font-size:.75rem;font-weight:900;cursor:pointer;box-shadow:0 8px 22px rgba(28,35,40,.08)}.workflow-controls button:hover,.workflow-controls button:focus-visible{background:var(--lime);outline:2px solid var(--coral);outline-offset:2px}
    .workflow-canvas{position:relative;min-height:0;overflow:hidden;border-radius:1.5rem;background-color:rgba(255,255,255,.78);background-image:radial-gradient(circle,rgba(98,113,122,.3) 1px,transparent 1.5px);background-size:24px 24px;touch-action:none;cursor:grab}.workflow-canvas.is-panning{cursor:grabbing}
    .workflow-scene{position:absolute;left:0;top:0;width:1px;height:1px;transform-origin:0 0;will-change:transform}.workflow-edges{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none}.workflow-edge{fill:none;stroke:var(--coral);stroke-width:4;stroke-linecap:round;opacity:.78;vector-effect:non-scaling-stroke}
    .workflow-node{position:absolute;display:grid;grid-template-rows:minmax(0,1fr) auto;gap:.65rem;overflow:hidden;border:1px solid rgba(28,35,40,.08);padding:1rem;box-shadow:0 18px 45px rgba(28,45,55,.16)}.workflow-node--rectangle{border-radius:1.5rem}.workflow-node--circle{place-content:center;border-radius:9999px;padding:1.75rem;text-align:center}.workflow-node__text{align-self:center;min-width:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.82rem;font-weight:800;line-height:1.28}
    .workflow-attachment{max-width:100%;min-height:2.25rem;border:0;border-radius:999px;background:var(--ink);color:#fff;padding:.5rem .8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}.workflow-attachment:hover,.workflow-attachment:focus-visible{background:var(--coral);outline:2px solid #fff;outline-offset:2px}
    .workflow-empty{margin-top:1rem;border-radius:1rem;background:rgba(255,255,255,.72);padding:1rem;color:var(--muted);font-weight:800}
    .chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.55rem}.chip{display:inline-flex;min-height:1.9rem;align-items:center;border-radius:999px;background:#fff;padding:.35rem .7rem;font-size:.76rem;font-weight:850}
    .empty-value{display:block;margin-top:.45rem;color:var(--muted)}
    .tasks{display:grid;gap:.45rem;margin:.55rem 0 0;padding:0;list-style:none}.task{display:flex;align-items:flex-start;gap:.7rem;border-radius:.85rem;background:#fff;padding:.7rem}.task__mark{display:grid;width:1.8rem;height:1.8rem;flex:0 0 auto;place-items:center;border-radius:.55rem;background:var(--aqua);font-weight:900}.task--done .task__mark{background:var(--coral);color:#fff}.task--done .task__title{text-decoration:line-through;opacity:.52}.task__body{min-width:0}.task__title{display:block;font-size:.88rem;font-weight:850}.task__meta{display:flex;flex-wrap:wrap;gap:.35rem .75rem;margin-top:.25rem;color:var(--muted);font-size:.68rem}
    .settings{background:#e9e5df}.payment-metrics{grid-template-columns:repeat(5,minmax(0,1fr))}.payments-label{margin-top:1.5rem;font-size:.75rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.payments{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;margin-top:.75rem}.payment{min-width:0;border-radius:var(--radius-md);background:#fff;padding:1rem}.payment__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.payment__type{color:var(--muted);font-size:.65rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.payment h3{margin-top:.2rem;font-size:1rem}.payment strong{font-size:1.25rem;white-space:nowrap}.payment__meta{display:flex;flex-wrap:wrap;gap:.35rem .8rem;margin-top:.85rem;color:var(--muted);font-size:.72rem}.payment__notes{margin-top:.7rem;font-size:.78rem;line-height:1.6}.payment-empty{margin-top:.75rem;border-radius:var(--radius-md);background:#fff;padding:1rem;color:var(--muted)}
    .collection{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr);gap:clamp(1rem,3vw,2rem);align-items:center;background:#ffc700}.collection__value{font-size:clamp(3.5rem,11vw,8rem);font-weight:950;letter-spacing:-.08em;line-height:.8}.collection__track{height:1.15rem;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.68)}.collection__bar{height:100%;border-radius:inherit;background:var(--ink)}.collection__body{margin-top:1rem;color:rgba(28,35,40,.66);font-size:.88rem;line-height:1.7}
    @media(max-width:900px){.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.payment-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.payments{grid-template-columns:1fr}.collection{grid-template-columns:1fr}}
    @media(max-width:560px){:root{--radius-xl:1.75rem;--radius-lg:1.35rem}.report{padding:.55rem}.report-section{margin-top:.7rem}.hero{min-height:28rem;padding:1rem}.hero h1{font-size:clamp(2.2rem,14vw,4rem)}.panel{padding:1rem}.status-panel{align-items:flex-start;flex-direction:column}.summary-grid,.payment-metrics{grid-template-columns:1fr 1fr;gap:.5rem}.metric{min-height:7.2rem;padding:.8rem}.metric__value{margin-top:1.15rem}.payment__heading{flex-direction:column}.payment strong{white-space:normal}.collection__value{font-size:4rem}.timeline-label,.timeline-cell{border-radius:.8rem;padding:.65rem;font-size:.68rem}.workflow-viewer{grid-template-rows:auto minmax(22rem,55vh);padding:.5rem}.workflow-header{align-items:flex-start}.workflow-controls button{min-width:2.35rem;height:2.35rem}.workflow-canvas{border-radius:1.15rem}}
    @media(max-width:360px){.summary-grid,.payment-metrics{grid-template-columns:1fr}.hero__meta{gap:.35rem}.hero__meta span{font-size:.64rem}.task__meta{display:grid}}
    ${reportChromeStyles}
    @media print{body{background:#fff}.report{width:100%;padding:0}.report-section{break-inside:avoid;box-shadow:none}.payment{break-inside:avoid}}
  </style>
</head>
<body>
  <main class="report">
    ${renderReportChromeHeader(data.chrome)}
    <section class="report-section hero"${coverStyle}>
      <div class="hero__content">
        <div class="hero__meta">${data.groupName ? `<span>${escapeHtml(data.groupName)}</span>` : ""}<span>${escapeHtml(data.dateRange)}</span></div>
        <h1>${escapeHtml(data.projectName)}</h1>
        <p class="hero__description">${escapeHtml(data.description)}</p>
      </div>
    </section>

    <section class="report-section panel summary">
      <p class="section-kicker">${escapeHtml(data.labels.projectSummary)}</p>
      <h2 class="section-title">${escapeHtml(data.projectName)}</h2>
      <div class="summary-grid">${data.summaryMetrics.map(renderMetric).join("")}</div>
    </section>

    <section class="report-section panel status-panel">
      <div>
        <p class="section-kicker">${escapeHtml(data.labels.status)}</p>
        <h2 class="section-title">${escapeHtml(data.labels.projectStatus)}</h2>
      </div>
      <span class="status-badge status--${statusTone}">${escapeHtml(data.status.label)}</span>
    </section>

    <section class="report-section panel content">
      <p class="section-kicker">${escapeHtml(data.labels.projectContent)}</p>
      <h2 class="section-title">${escapeHtml(data.labels.projectTimeline)}</h2>
      ${renderTimelineBoard(data)}
      <div class="workflow-subheading">
        <p class="section-kicker">${escapeHtml(data.labels.workflow)}</p>
        <h2 class="section-title">${escapeHtml(data.labels.workflow)}</h2>
      </div>
      ${renderWorkflowViewers(data)}
    </section>

    <section class="report-section panel settings">
      <p class="section-kicker">${escapeHtml(data.labels.projectSettings)}</p>
      <h2 class="section-title">${escapeHtml(data.labels.paymentStatus)}</h2>
      <div class="payment-metrics">${data.paymentMetrics.map(renderMetric).join("")}</div>
      <p class="payments-label">${escapeHtml(data.labels.paymentItems)}</p>
      ${data.payments.length ? `<div class="payments">${data.payments.map((payment) => renderPayment(payment, data.labels)).join("")}</div>` : `<p class="payment-empty">—</p>`}
    </section>

    <section class="report-section panel collection">
      <div>
        <p class="section-kicker">${escapeHtml(data.labels.collectionProgress)}</p>
        <p class="collection__value">${progress}%</p>
      </div>
      <div>
        <div class="collection__track" aria-label="${escapeHtml(data.labels.collectionProgress)} ${progress}%"><div class="collection__bar" style="width:${progress}%"></div></div>
        <p class="collection__body">${escapeHtml(data.collectionBody)}</p>
      </div>
    </section>
    ${renderReportChromeFooter(data.chrome)}
  </main>
  <script id="project-workflow-payload" type="application/octet-stream">${workflowPayload}</script>
  <script nonce="${scriptNonce}">
    (() => {
      "use strict";
      const payload = document.getElementById("project-workflow-payload").textContent.trim();
      const bytes = Uint8Array.from(atob(payload), character => character.charCodeAt(0));
      const workflows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

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
      const endpoint = (node, handle, source) => {
        const onLeft = handle === "left" || (!handle && !source);
        return {
          x: node.position.x + (onLeft ? 0 : node.size.width),
          y: node.position.y + node.size.height / 2,
          direction: onLeft ? -1 : 1
        };
      };
      const downloadAttachment = (attachment, viewer) => {
        const blob = new Blob([attachment.content], { type: attachment.mimeType + ";charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = safeFileName(attachment.fileName, attachment.kind === "json" ? "workflow.json" : "workflow.md");
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        viewer.focus({ preventScroll: true });
      };

      document.querySelectorAll(".workflow-viewer").forEach(viewer => {
        const workflow = workflows[Number(viewer.dataset.workflowIndex)];
        if (!workflow) return;

        const canvas = viewer.querySelector(".workflow-canvas");
        const scene = viewer.querySelector(".workflow-scene");
        const nodesRoot = viewer.querySelector(".workflow-nodes");
        const edgesRoot = viewer.querySelector(".workflow-edges");
        const title = viewer.querySelector(".workflow-title");
        const nodeById = new Map(workflow.nodes.map(node => [node.id, node]));
        let view = { x: workflow.viewport.x, y: workflow.viewport.y, zoom: workflow.viewport.zoom };
        let drag = null;

        title.textContent = workflow.name || "Workflow";
        viewer.tabIndex = -1;

        workflow.edges.forEach(edge => {
          const sourceNode = nodeById.get(edge.source);
          const targetNode = nodeById.get(edge.target);
          if (!sourceNode || !targetNode) return;
          const source = endpoint(sourceNode, edge.sourceHandle, true);
          const target = endpoint(targetNode, edge.targetHandle, false);
          const curve = Math.max(72, Math.abs(target.x - source.x) * .46);
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("class", "workflow-edge");
          path.setAttribute("d", "M " + source.x + " " + source.y + " C " + (source.x + source.direction * curve) + " " + source.y + ", " + (target.x + target.direction * curve) + " " + target.y + ", " + target.x + " " + target.y);
          edgesRoot.append(path);
        });

        workflow.nodes.forEach(node => {
          const element = document.createElement("article");
          const text = document.createElement("div");
          const fillColor = nodeFillColor(node);
          element.className = "workflow-node " + (node.shape === "circle" ? "workflow-node--circle" : "workflow-node--rectangle");
          element.style.left = node.position.x + "px";
          element.style.top = node.position.y + "px";
          element.style.width = node.size.width + "px";
          element.style.height = node.size.height + "px";
          element.style.backgroundColor = fillColor;
          element.style.color = readableTextColor(fillColor);
          text.className = "workflow-node__text";
          text.textContent = node.text;
          element.append(text);
          if (node.attachment) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "workflow-attachment";
            button.textContent = viewer.dataset.downloadLabel + " · " + node.attachment.fileName;
            button.addEventListener("click", event => {
              event.stopPropagation();
              downloadAttachment(node.attachment, viewer);
            });
            element.append(button);
          }
          nodesRoot.append(element);
        });

        const applyView = () => {
          scene.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.zoom + ")";
        };
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
          const padding = 64;
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
          canvas.classList.add("is-panning");
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
          canvas.classList.remove("is-panning");
        };
        canvas.addEventListener("pointerup", endDrag);
        canvas.addEventListener("pointercancel", endDrag);
        canvas.addEventListener("wheel", event => {
          event.preventDefault();
          const bounds = canvas.getBoundingClientRect();
          setZoom(view.zoom * Math.exp(-event.deltaY * .0015), event.clientX - bounds.left, event.clientY - bounds.top);
        }, { passive: false });
        viewer.querySelector('[data-workflow-action="zoom-in"]').addEventListener("click", () => setZoom(view.zoom * 1.2));
        viewer.querySelector('[data-workflow-action="zoom-out"]').addEventListener("click", () => setZoom(view.zoom / 1.2));
        viewer.querySelector('[data-workflow-action="fit"]').addEventListener("click", fitView);
        applyView();
      });
    })();
  </script>
</body>
</html>`;
};

export const createProjectReportHtml = async (data: ProjectReportData) =>
  createProjectReportHtmlWithCover(data, await embedCoverImage(data.coverImageUrl));

export const downloadProjectReportHtml = async (data: ProjectReportData) => {
  const html = await createProjectReportHtml(data);
  downloadReportHtmlFile(html, sanitizeProjectReportFileName(data.projectName));
};
