import { formatLocalizedDate } from "@/lib/i18n/formatters";
import {
  formatDemoEntityName,
  getCompanyDisplayDescription,
  getProjectGroupDisplayDescription,
  getProjectGroupDisplayName,
  projectNameKeys,
  statusKeys,
  translateDomainLabel
} from "@/lib/i18n/domain-labels";
import { languageLocales, type Language, type TranslationKey } from "@/lib/i18n/translations";
import type { Company, DashboardOverview, Project, ProjectGroup, ProjectStatus } from "@/lib/types";
import {
  buildReportChromeLabels,
  clampReportPercent,
  downloadReportHtmlFile,
  embedReportCoverImage,
  escapeReportHtml,
  normalizeReportHexColor,
  readableReportTextColor,
  renderReportChromeFooter,
  renderReportChromeHeader,
  reportChromeStyles,
  sanitizeReportFileName,
  type ReportChromeLabels
} from "@/lib/utils/report-share-common";

export type SummaryReportMetricTone = "aqua" | "cloud" | "coral" | "ink" | "lime";

export type SummaryReportMetric = {
  label: string;
  value: string;
  tone?: SummaryReportMetricTone;
};

export type SummaryReportStatusSegment = {
  color: string;
  count: number;
  label: string;
};

export type SummaryReportProjectRow = {
  name: string;
  period: string;
  progress: number;
  statusColor: string;
  statusLabel: string;
};

export type SummaryReportGroupBranch = {
  name: string;
  projects: SummaryReportProjectRow[];
};

export type SummaryReportCompanyBranch = {
  name?: string;
  groups: SummaryReportGroupBranch[];
};

export type SummaryReportLabels = {
  averageProgress: string;
  generatedAt: string;
  portfolio: string;
  projects: string;
  statusDistribution: string;
  summary: string;
};

export type SummaryReportData = {
  averageProgress: number;
  chrome: ReportChromeLabels;
  coverImageUrl?: string;
  /** Brand logo (data URL) for company-scoped reports. */
  logoUrl?: string;
  description: string;
  generatedOn: string;
  labels: SummaryReportLabels;
  language: string;
  metrics: SummaryReportMetric[];
  scopeLabel: string;
  /** Studio-wide reports use the dashboard's animated pixel-city hero. */
  heroScene?: boolean;
  /** Studio-wide project timeline board (one colored bar per project). */
  gantt?: SummaryReportGantt;
  statusSegments: SummaryReportStatusSegment[];
  title: string;
  totalProjectCount: number;
  tree: SummaryReportCompanyBranch[];
};

export type SummaryReportScope =
  | { type: "all" }
  | { type: "company"; company: Company }
  | { type: "group"; group: ProjectGroup };

export type BuildSummaryReportInput = {
  scope: SummaryReportScope;
  /** Companies backing the "all" scope tree; a single-entry list is fine for other scopes. */
  companies: Company[];
  /** Groups that belong to the report scope (all groups for the "all" scope). */
  groups: ProjectGroup[];
  /** Projects already narrowed to the report scope. */
  projects: Project[];
  overview: DashboardOverview;
  formatAmount: (value: number) => string;
  language: Language;
  t: (key: TranslationKey) => string;
};

const statusOrder: ProjectStatus[] = ["active", "planning", "completed", "paused", "terminated"];

const statusColors: Record<ProjectStatus, string> = {
  active: "#F94622",
  planning: "#E3F596",
  completed: "#8EDBE8",
  paused: "#1C2328",
  terminated: "#D4A1DF"
};

export type SummaryReportGanttRow = {
  color: string;
  leftPct: number;
  name: string;
  widthPct: number;
};

export type SummaryReportGantt = {
  months: string[];
  rows: SummaryReportGanttRow[];
  title: string;
  todayLabel: string;
  todayPct: number | null;
};

const ganttPalette = [
  "#F94622",
  "#03B5AA",
  "#FFC700",
  "#3078A4",
  "#FD0079",
  "#8EDBE8",
  "#A33E43",
  "#E3F596",
  "#1C2328",
  "#D4A1DF"
];

const parseGanttDay = (value: string) => {
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);

  return Number.isFinite(parsed) ? new Date(parsed) : null;
};

const ganttMonthKey = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

const ganttDaysInMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const ganttMonthPosition = (date: Date, firstMonth: number) =>
  ganttMonthKey(date) - firstMonth +
  (date.getUTCDate() - 1) / ganttDaysInMonth(date.getUTCFullYear(), date.getUTCMonth());

const buildSummaryReportGantt = (
  projects: Project[],
  projectName: (project: Project) => string,
  language: Language,
  t: (key: TranslationKey) => string
): SummaryReportGantt | undefined => {
  const dated = projects
    .map((project) => {
      const start = parseGanttDay(project.startDate);
      const end = parseGanttDay(project.endDate);

      return start && end && end >= start ? { project, start, end } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  if (!dated.length) {
    return undefined;
  }

  const firstMonth = Math.min(...dated.map(({ start }) => ganttMonthKey(start)));
  const lastMonth = Math.max(...dated.map(({ end }) => ganttMonthKey(end)));
  const totalMonths = lastMonth - firstMonth + 1;
  const monthFormatter = new Intl.DateTimeFormat(languageLocales[language], {
    year: "2-digit",
    month: "short"
  });

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayMonth = ganttMonthKey(todayUtc);

  return {
    months: Array.from({ length: totalMonths }, (_, index) => {
      const absolute = firstMonth + index;

      return monthFormatter.format(new Date(Date.UTC(Math.floor(absolute / 12), absolute % 12, 1)));
    }),
    rows: dated.map(({ project, start, end }, index) => {
      const startPos = ganttMonthPosition(start, firstMonth);
      const endPos =
        ganttMonthPosition(end, firstMonth) +
        1 / ganttDaysInMonth(end.getUTCFullYear(), end.getUTCMonth());

      return {
        color: ganttPalette[index % ganttPalette.length],
        leftPct: (startPos / totalMonths) * 100,
        name: projectName(project),
        widthPct: Math.max(((endPos - startPos) / totalMonths) * 100, 0.75)
      };
    }),
    title: t("ganttSectionTitle"),
    todayLabel: t("ganttToday"),
    todayPct:
      todayMonth >= firstMonth && todayMonth <= lastMonth
        ? (ganttMonthPosition(todayUtc, firstMonth) / totalMonths) * 100
        : null
  };
};

export const buildSummaryReportData = ({
  scope,
  companies,
  groups,
  projects,
  overview,
  formatAmount,
  language,
  t
}: BuildSummaryReportInput): SummaryReportData => {
  const projectRow = (project: Project): SummaryReportProjectRow => ({
    name: formatDemoEntityName(
      translateDomainLabel(project.name, projectNameKeys, t),
      project.id,
      "project",
      t,
      project.isExample
    ),
    period: `${formatLocalizedDate(project.startDate, language)} - ${formatLocalizedDate(project.endDate, language)}`,
    progress: clampReportPercent(project.progress),
    statusColor: statusColors[project.status],
    statusLabel: t(statusKeys[project.status])
  });

  const groupBranches = (branchProjects: Project[]): SummaryReportGroupBranch[] => {
    const knownGroupIds = new Set(groups.map((group) => group.id));
    const branches = groups
      .map((group) => ({
        name: getProjectGroupDisplayName(group, language, t),
        projects: branchProjects.filter((project) => project.groupId === group.id).map(projectRow)
      }))
      .filter((branch) => branch.projects.length > 0);
    const unassigned = branchProjects.filter(
      (project) => !project.groupId || !knownGroupIds.has(project.groupId)
    );

    if (unassigned.length) {
      branches.push({ name: t("unassignedGroup"), projects: unassigned.map(projectRow) });
    }

    return branches;
  };

  const tree: SummaryReportCompanyBranch[] =
    scope.type === "all"
      ? companies
          .map((company) => ({
            name: formatDemoEntityName(company.name, company.id, "company", t),
            groups: groupBranches(projects.filter((project) => project.companyId === company.id))
          }))
          .filter((branch) => branch.groups.length > 0)
      : [{ groups: groupBranches(projects) }];

  const subject =
    scope.type === "all"
      ? {
          title: t("summaryReportAllTitle"),
          description: t("summaryReportAllDescription"),
          coverImageUrl: undefined
        }
      : scope.type === "company"
        ? {
            title: formatDemoEntityName(scope.company.name, scope.company.id, "company", t),
            description: getCompanyDisplayDescription(scope.company, t),
            coverImageUrl: scope.company.coverImage
          }
        : {
            title: getProjectGroupDisplayName(scope.group, language, t),
            description: getProjectGroupDisplayDescription(scope.group, t),
            coverImageUrl: scope.group.coverImage
          };

  const metrics: SummaryReportMetric[] = [];

  if (scope.type === "all") {
    metrics.push({ label: t("companiesCount"), value: String(companies.length), tone: "aqua" });
  }

  if (scope.type === "group") {
    const associatedCompanyCount = new Set(projects.map((project) => project.companyId)).size;
    metrics.push({ label: t("companiesCount"), value: String(associatedCompanyCount), tone: "aqua" });
  }

  if (scope.type !== "group") {
    metrics.push({ label: t("projectGroupsCount"), value: String(groups.length), tone: "lime" });
  }

  metrics.push(
    { label: t("projectsCount"), value: String(overview.totalProjectCount), tone: "cloud" },
    { label: t("activeCount"), value: String(overview.activeProjectCount), tone: "coral" },
    { label: t("averageProgressShort"), value: `${overview.averageProgress}%`, tone: "aqua" },
    { label: t("metricDue"), value: String(overview.releasedProjectCount), tone: "cloud" },
    { label: t("projectBudgetTotal"), value: formatAmount(overview.budgetCostTotal), tone: "lime" },
    { label: t("actualCostSoFar"), value: formatAmount(overview.actualCostSoFar), tone: "ink" }
  );

  return {
    averageProgress: clampReportPercent(overview.averageProgress),
    chrome: buildReportChromeLabels(t),
    coverImageUrl: subject.coverImageUrl,
    logoUrl:
      scope.type === "company" && scope.company.logoImage?.startsWith("data:")
        ? scope.company.logoImage
        : undefined,
    description: subject.description,
    generatedOn: formatLocalizedDate(new Date(), language),
    labels: {
      averageProgress: t("averageProgressShort"),
      generatedAt: t("summaryReportGeneratedAt"),
      portfolio: t("portfolioTree"),
      projects: t("projectsCount"),
      statusDistribution: t("projectStatusPie"),
      summary: t("studioSummary")
    },
    language,
    metrics,
    scopeLabel: t(
      scope.type === "all" ? "scopeAll" : scope.type === "company" ? "scopeCompany" : "scopeGroup"
    ),
    heroScene: scope.type === "all",
    gantt:
      scope.type === "all"
        ? buildSummaryReportGantt(projects, (project) => projectRow(project).name, language, t)
        : undefined,
    statusSegments: statusOrder.map((status) => ({
      color: statusColors[status],
      count: projects.filter((project) => project.status === status).length,
      label: t(statusKeys[status])
    })),
    title: subject.title,
    totalProjectCount: overview.totalProjectCount,
    tree
  };
};

const renderMetric = (metric: SummaryReportMetric) => {
  const tone = metric.tone ?? "cloud";

  return `<article class="metric metric--${tone}">
    <p class="metric__label">${escapeReportHtml(metric.label)}</p>
    <p class="metric__value">${escapeReportHtml(metric.value)}</p>
  </article>`;
};

const statusPieGradient = (segments: SummaryReportStatusSegment[]) => {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  if (!total) {
    return "conic-gradient(#e3f596 0% 100%)";
  }

  let offset = 0;
  const stops = segments
    .filter((segment) => segment.count > 0)
    .map((segment) => {
      const start = offset;
      const end = offset + (segment.count / total) * 100;
      offset = end;
      return `${normalizeReportHexColor(segment.color, "#E3F596")} ${start}% ${end}%`;
    });

  return `conic-gradient(${stops.join(", ")})`;
};

const renderStatusLegend = (segments: SummaryReportStatusSegment[]) =>
  segments
    .map(
      (segment) => `<div class="legend-row">
        <span class="legend-row__label"><span class="legend-row__dot" style="background:${normalizeReportHexColor(segment.color, "#E3F596")}"></span>${escapeReportHtml(segment.label)}</span>
        <span class="legend-row__count">${segment.count}</span>
      </div>`
    )
    .join("");

const renderProjectRow = (row: SummaryReportProjectRow) => {
  const statusColor = normalizeReportHexColor(row.statusColor, "#E3F596");

  return `<div class="project-row">
    <span class="project-row__fill" style="width:${clampReportPercent(row.progress)}%"></span>
    <span class="project-row__body">
      <span class="project-row__head">
        <span class="project-row__name">${escapeReportHtml(row.name)}</span>
        <span class="project-row__stats">
          <span class="project-row__status" style="background:${statusColor};color:${readableReportTextColor(statusColor, "#E3F596")}">${escapeReportHtml(row.statusLabel)}</span>
          <span class="project-row__progress">${clampReportPercent(row.progress)}%</span>
        </span>
      </span>
      <span class="project-row__period">${escapeReportHtml(row.period)}</span>
    </span>
  </div>`;
};

const renderGroupBranch = (branch: SummaryReportGroupBranch) => `<div class="group-branch">
  <div class="group-branch__head">
    <span class="group-branch__name">${escapeReportHtml(branch.name)}</span>
    <span class="group-branch__count">${branch.projects.length}</span>
  </div>
  <div class="group-branch__projects">${branch.projects.map(renderProjectRow).join("")}</div>
</div>`;

const renderCompanyBranch = (branch: SummaryReportCompanyBranch) => `<div class="company-branch">
  ${branch.name ? `<h3 class="company-branch__name">${escapeReportHtml(branch.name)}</h3>` : ""}
  <div class="company-branch__groups">${branch.groups.map(renderGroupBranch).join("")}</div>
</div>`;

const renderPortfolio = (data: SummaryReportData) =>
  data.tree.length && data.tree.some((branch) => branch.groups.length)
    ? `<div class="portfolio">${data.tree.map(renderCompanyBranch).join("")}</div>`
    : `<p class="portfolio-empty">—</p>`;

const pixelSceneClouds = [
  "left:6%;top:13%;width:9rem",
  "left:16%;top:25%;width:7rem",
  "left:56%;top:16%;width:8rem",
  "left:72%;top:28%;width:6rem"
];

const pixelSceneFarBuildings = [
  "left:8%;bottom:22%;height:21%;width:8%",
  "left:18%;bottom:22%;height:30%;width:7%",
  "left:28%;bottom:22%;height:24%;width:8%",
  "left:39%;bottom:22%;height:43%;width:10%",
  "left:53%;bottom:22%;height:28%;width:8%",
  "left:65%;bottom:22%;height:34%;width:9%",
  "left:79%;bottom:22%;height:26%;width:8%"
];

const pixelSceneNearBuildings = [
  "left:0%;bottom:0;height:22%;width:11%",
  "left:11%;bottom:0;height:31%;width:13%",
  "left:25%;bottom:0;height:24%;width:9%",
  "left:36%;bottom:0;height:34%;width:12%",
  "left:50%;bottom:0;height:26%;width:11%",
  "left:64%;bottom:0;height:38%;width:13%",
  "left:79%;bottom:0;height:28%;width:10%",
  "left:90%;bottom:0;height:36%;width:10%"
];

const pixelWindows = (count: number) => "<i></i>".repeat(count);

/** Static mirror of the dashboard's PixelHeroScene; animation is CSS-only. */
const renderPixelScene = () => `<div class="pixel-hero-scene" aria-hidden="true">
  <div class="pixel-pastel-sky">
    <div class="pixel-pastel-sun"></div>
    <div class="pixel-pastel-haze pixel-pastel-haze--one"></div>
    <div class="pixel-pastel-haze pixel-pastel-haze--two"></div>
    ${pixelSceneClouds.map((style) => `<div class="pixel-cloud" style="${style}"><span></span><span></span><span></span><span></span></div>`).join("")}
  </div>
  <div class="pixel-city-horizon"></div>
  ${pixelSceneFarBuildings.map((style, index) => `<div class="pixel-city-building pixel-city-building--far" style="${style}">${pixelWindows(index % 2 === 0 ? 12 : 15)}</div>`).join("")}
  <div class="pixel-city-bridge"><span></span><span></span><span></span></div>
  ${pixelSceneNearBuildings.map((style, index) => `<div class="pixel-city-building pixel-city-building--near" style="${style}">${pixelWindows(index % 3 === 0 ? 18 : 14)}</div>`).join("")}
  <div class="pixel-city-ground"><span class="pixel-city-ground__light"></span><span class="pixel-city-ground__reflection pixel-city-ground__reflection--one"></span><span class="pixel-city-ground__reflection pixel-city-ground__reflection--two"></span></div>
  <div class="pixel-pastel-vignette"></div>
</div>`;

const renderGanttSection = (data: SummaryReportData) => {
  const gantt = data.gantt;

  if (!gantt) {
    return "";
  }

  const todayOverlay =
    gantt.todayPct === null
      ? ""
      : `<div class="gantt-today" style="left:${gantt.todayPct}%"><i></i><b${
          gantt.todayPct > 88 ? ` style="left:auto;right:calc(100% + 4px)"` : ""
        }>${escapeReportHtml(gantt.todayLabel)}</b></div>`;

  return `<section class="report-section panel gantt-section">
      <p class="section-kicker">${escapeReportHtml(data.labels.projects)}</p>
      <h2 class="section-title">${escapeReportHtml(gantt.title)}</h2>
      <div class="gantt-flex">
        <div class="gantt-names">${gantt.rows
          .map((row) => `<span class="gantt-name">${escapeReportHtml(row.name)}</span>`)
          .join("")}</div>
        <div class="gantt-board">
          <div class="gantt-bg" aria-hidden="true">${"<span></span>".repeat(gantt.months.length)}</div>
          <div class="gantt-lane"></div>
          <div class="gantt-months">${gantt.months
            .map((month) => `<span>${escapeReportHtml(month)}</span>`)
            .join("")}</div>
          <div class="gantt-rows">${gantt.rows
            .map(
              (row) => `<div class="gantt-row"><span class="gantt-bar" style="left:${row.leftPct}%;width:${row.widthPct}%;background:${normalizeReportHexColor(row.color, "#E3F596")}"></span></div>`
            )
            .join("")}</div>
          ${todayOverlay}
        </div>
      </div>
    </section>`;
};

const createSummaryReportHtmlWithCover = (data: SummaryReportData, embeddedCover: string | null) => {
  const coverStyle = embeddedCover
    ? ` style="background-image:linear-gradient(180deg,rgba(28,35,40,.04),rgba(28,35,40,.43)),url('${embeddedCover}')"`
    : "";
  const cuneiformFontStyle = data.language === "sux"
    ? `@font-face{font-family:"SMOS Cuneiform";font-style:normal;font-weight:400;font-display:swap;src:local("Noto Sans Cuneiform"),url("https://fonts.gstatic.com/s/notosanscuneiform/v18/bMrrmTWK7YY-MF22aHGGd7H8PhJtvBDWgb8.ttf") format("truetype");unicode-range:U+12000-123FF,U+12400-1247F,U+12480-1254F}`
    : "";
  const reportFontFamily = data.language === "sux"
    ? `"SMOS Cuneiform",Inter,"SF Pro Rounded","SF Pro Display","PingFang SC","Hiragino Sans GB","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`
    : `Inter,"SF Pro Rounded","SF Pro Display","PingFang SC","Hiragino Sans GB","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

  return `<!doctype html>
<html lang="${escapeReportHtml(data.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src https://fonts.gstatic.com; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeReportHtml(data.title)}</title>
  <style>
    ${cuneiformFontStyle}
    :root{color-scheme:light;--ink:#1c2328;--muted:#5d6a72;--aqua:#8edbe8;--aqua-strong:#03b5aa;--lime:#e3f596;--coral:#f94a22;--pink:#f7567c;--cloud:#f4e9d8;--cream:#fffae3;--white:#fff;--deep:#023436;--radius-xl:2.4rem;--radius-lg:1.7rem;--radius-md:1.2rem}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html{background:#edf9f7}
    body{margin:0;color:var(--ink);font-family:${reportFontFamily};background:radial-gradient(circle at 8% 8%,rgba(142,219,232,.58),transparent 28rem),radial-gradient(circle at 92% 36%,rgba(227,245,150,.75),transparent 31rem),linear-gradient(150deg,#f9fffd,#f6f2e9);font-weight:650;line-height:1.5}
    h1,h2,h3,p{margin:0;overflow-wrap:anywhere}
    h1,h2,h3,strong,.metric__value{font-weight:900}
    .report{width:min(100%,94rem);margin:0 auto;padding:clamp(.85rem,2.4vw,2.4rem)}
    .report-section{margin-top:clamp(1rem,2vw,1.6rem);border:1px solid rgba(28,35,40,.06);border-radius:var(--radius-xl);box-shadow:0 24px 70px rgba(28,35,40,.10)}
    .hero{position:relative;display:flex;min-height:clamp(22rem,48vw,32rem);flex-direction:column;justify-content:flex-end;overflow:hidden;padding:clamp(1.2rem,4vw,3.4rem);color:#fff;background-color:#284b50;background-image:radial-gradient(circle at 20% 20%,rgba(142,219,232,.88),transparent 31%),radial-gradient(circle at 82% 78%,rgba(227,245,150,.72),transparent 34%),linear-gradient(145deg,#335b61,var(--deep));background-position:center;background-size:cover}
    .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(28,35,40,.23),transparent 62%);pointer-events:none}
    .hero__content{position:relative;z-index:1;max-width:58rem}
    .hero__logo{display:block;height:3.4rem;width:auto;max-width:100%;margin-bottom:1.1rem;object-fit:contain}
    .hero__meta{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem}
    .hero__meta span{display:inline-flex;min-height:2.1rem;align-items:center;border-radius:999px;background:rgba(255,255,255,.85);padding:.45rem .85rem;color:var(--ink);font-size:.74rem;font-weight:850;backdrop-filter:blur(12px)}
    .hero h1{max-width:18ch;font-size:clamp(1.6rem,3.2vw,2.4rem);letter-spacing:-.015em;line-height:1.1}
    .hero__description{max-width:54rem;margin-top:1.15rem;color:rgba(255,255,255,.82);font-size:clamp(.95rem,1.4vw,1.15rem);line-height:1.7}
    .panel{padding:clamp(1rem,3vw,2rem)}
    .section-kicker{font-size:.74rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;opacity:.58}
    .section-title{margin-top:.4rem;font-size:clamp(1.35rem,2.4vw,2rem);letter-spacing:-.015em;line-height:1.1}
    .summary{background:var(--deep);color:#fff}
    .summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1.4rem}
    .metric{min-width:0;min-height:8.4rem;border-radius:var(--radius-md);padding:1rem;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
    .metric--aqua{background:var(--aqua-strong)}.metric--cloud{background:var(--cream)}.metric--coral{background:var(--pink)}.metric--ink{background:var(--ink);color:#fff}.metric--lime{background:var(--lime)}
    .metric__label{font-size:.7rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;opacity:.62}
    .metric__value{margin-top:1.55rem;font-size:clamp(1.35rem,2.8vw,2.25rem);letter-spacing:-.04em;line-height:1}
    .status{background:#a33e43;color:#fff}
    .status-layout{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(1rem,3vw,2rem);align-items:center;margin-top:1.4rem}
    .pie{position:relative;display:grid;place-items:center;aspect-ratio:1/1;width:min(100%,17rem);margin:0 auto;border-radius:999px;box-shadow:0 18px 45px rgba(28,35,40,.22),inset 0 0 0 1px rgba(255,250,227,.35)}
    .pie__center{display:flex;aspect-ratio:1/1;width:52%;flex-direction:column;align-items:center;justify-content:center;border-radius:999px;background:#fafcd9;color:var(--ink);text-align:center;box-shadow:0 12px 30px rgba(28,35,40,.18)}
    .pie__value{font-size:clamp(1.5rem,4.5vw,2.25rem);font-weight:900;letter-spacing:-.05em;line-height:1}
    .pie__label{max-width:80%;margin-top:.3rem;font-size:.62rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;opacity:.62}
    .status-legend{display:grid;gap:.55rem}
    .legend-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;border-radius:999px;background:#fafcd9;padding:.6rem 1rem;color:var(--ink);font-size:.85rem;font-weight:900}
    .legend-row__label{display:flex;min-width:0;align-items:center;gap:.55rem}
    .legend-row__dot{display:inline-block;width:.8rem;height:.8rem;flex:0 0 auto;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(28,35,40,.14)}
    .legend-row__count{flex:0 0 auto}
    .portfolio-section{background:#fafcd9}
    .portfolio{display:grid;gap:1rem;margin-top:1.4rem}
    .company-branch{min-width:0;border-radius:var(--radius-lg);background:rgba(255,255,255,.55);padding:clamp(.85rem,2vw,1.25rem);box-shadow:inset 0 0 0 1px rgba(28,35,40,.06)}
    .company-branch__name{font-size:clamp(1.15rem,2.2vw,1.6rem);letter-spacing:-.03em}
    .company-branch__groups{display:grid;gap:.85rem;margin-top:.85rem;border-left:2px solid rgba(28,35,40,.1);padding-left:clamp(.7rem,1.6vw,1.15rem)}
    .company-branch__name + .company-branch__groups{margin-top:1rem}
    .group-branch{min-width:0;border-radius:var(--radius-md);background:rgba(255,255,255,.78);padding:.85rem}
    .group-branch__head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.7rem}
    .group-branch__name{min-width:0;overflow-wrap:anywhere;font-size:1rem;font-weight:900}
    .group-branch__count{flex:0 0 auto;border-radius:999px;background:var(--aqua);padding:.25rem .75rem;font-size:.72rem;font-weight:900}
    .group-branch__projects{display:grid;gap:.55rem}
    .project-row{position:relative;display:block;min-width:0;overflow:hidden;border-radius:1.15rem;background:rgba(255,255,255,.85);box-shadow:0 6px 18px rgba(28,35,40,.07)}
    .project-row__fill{position:absolute;inset:0 auto 0 0;background:rgba(227,245,150,.66)}
    .project-row__body{position:relative;z-index:1;display:block;padding:.6rem .85rem}
    .project-row__head{display:flex;align-items:center;justify-content:space-between;gap:.75rem}
    .project-row__name{min-width:0;overflow-wrap:anywhere;font-size:.9rem;font-weight:900}
    .project-row__stats{display:flex;flex:0 0 auto;align-items:center;gap:.5rem}
    .project-row__status{display:inline-flex;min-height:1.55rem;align-items:center;border-radius:999px;padding:.2rem .65rem;font-size:.68rem;font-weight:900;white-space:nowrap}
    .project-row__progress{font-size:.8rem;font-weight:900;color:rgba(28,35,40,.62)}
    .project-row__period{display:block;margin-top:.2rem;font-size:.68rem;font-weight:800;color:var(--muted)}
    .portfolio-empty{margin-top:1.4rem;border-radius:1rem;background:rgba(255,255,255,.72);padding:1.2rem;text-align:center;color:var(--muted);font-weight:850}
    @media(max-width:900px){.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.status-layout{grid-template-columns:1fr}}
    @media(max-width:560px){:root{--radius-xl:1.75rem;--radius-lg:1.35rem}.report{padding:.55rem}.report-section{margin-top:.7rem}.hero{min-height:24rem;padding:1rem}.hero h1{font-size:clamp(1.45rem,6.5vw,1.9rem)}.panel{padding:1rem}.summary-grid{grid-template-columns:1fr 1fr;gap:.5rem}.metric{min-height:7.2rem;padding:.8rem}.metric__value{margin-top:1.15rem}.project-row__head{flex-direction:column;align-items:flex-start;gap:.3rem}}
    @media(max-width:360px){.summary-grid{grid-template-columns:1fr}.hero__meta{gap:.35rem}.hero__meta span{font-size:.64rem}}
    .hero--scene{justify-content:flex-start;background:#9adfe2}
    .hero--scene::after{content:none}
    .hero--scene h1{color:#1c2328}
    .hero--scene .hero__description{color:rgba(28,35,40,.8)}
    .pixel-hero-scene{position:absolute;inset:0;overflow:hidden;image-rendering:pixelated;background:linear-gradient(180deg,#7bd8e6 0%,#bdeee7 36%,#fff2a9 62%,#75bdd7 100%)}
    .pixel-hero-scene::before{content:"";position:absolute;inset:0;opacity:.2;background:linear-gradient(90deg,rgba(255,255,255,.22) 1px,transparent 1px),linear-gradient(180deg,rgba(255,255,255,.18) 1px,transparent 1px);background-size:12px 12px}
    .pixel-hero-scene::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.28),transparent 18%,transparent 76%,rgba(28,73,108,.14)),linear-gradient(180deg,rgba(255,255,255,.18),transparent 38%,rgba(19,83,122,.28))}
    .pixel-pastel-sky,.pixel-city-horizon,.pixel-city-bridge,.pixel-city-ground,.pixel-pastel-vignette{position:absolute;inset:0}
    .pixel-pastel-sun{position:absolute;left:16%;top:47%;width:7.5rem;height:7.5rem;background:linear-gradient(90deg,transparent 0 12px,rgba(255,249,181,.96) 12px calc(100% - 12px),transparent calc(100% - 12px)),linear-gradient(180deg,transparent 0 12px,rgba(255,249,181,.96) 12px calc(100% - 12px),transparent calc(100% - 12px));box-shadow:0 0 0 12px rgba(255,244,156,.28),0 0 66px rgba(255,207,95,.4);animation:sr-sun-pulse 6s steps(4,end) infinite}
    .pixel-pastel-haze{position:absolute;height:34%;width:30%;background:linear-gradient(90deg,transparent,rgba(255,251,182,.26),transparent);filter:blur(6px);opacity:.6;transform:skewX(-14deg);animation:sr-light-sweep 10s steps(10,end) infinite}
    .pixel-pastel-haze--one{left:20%;top:28%}
    .pixel-pastel-haze--two{left:58%;top:18%;animation-delay:-4s}
    .pixel-cloud{position:absolute;height:3.4rem;opacity:.72;animation:sr-cloud-drift 18s steps(12,end) infinite}
    .pixel-cloud span{position:absolute;display:block;height:12px;background:rgba(237,255,220,.82);box-shadow:0 12px 0 rgba(211,243,211,.74),24px 12px 0 rgba(229,252,218,.84),48px 24px 0 rgba(202,233,211,.64)}
    .pixel-cloud span:nth-child(1){left:0;top:12px;width:48px}
    .pixel-cloud span:nth-child(2){left:36px;top:0;width:72px}
    .pixel-cloud span:nth-child(3){left:72px;top:24px;width:54px}
    .pixel-cloud span:nth-child(4){left:102px;top:12px;width:42px}
    .pixel-city-horizon{top:auto;height:48%;background:linear-gradient(180deg,transparent 0 16%,rgba(255,247,183,.34) 16% 19%,transparent 19%),linear-gradient(180deg,transparent,rgba(104,184,202,.12))}
    .pixel-city-building{position:absolute;display:grid;grid-template-columns:repeat(3,minmax(5px,1fr));align-content:start;gap:10px;padding:14px 11px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.12),0 12px 28px rgba(51,121,153,.12)}
    .pixel-city-building--far{background:linear-gradient(180deg,rgba(130,205,211,.58),rgba(70,157,187,.68)),repeating-linear-gradient(90deg,transparent 0 22px,rgba(255,255,255,.14) 22px 24px)}
    .pixel-city-building--near{z-index:2;background:linear-gradient(180deg,rgba(51,140,181,.86),rgba(35,94,145,.96)),repeating-linear-gradient(90deg,transparent 0 24px,rgba(255,255,255,.1) 24px 26px);box-shadow:inset 0 0 0 2px rgba(5,45,85,.22),0 -10px 0 rgba(91,184,199,.1)}
    .pixel-city-building i{display:block;min-height:10px;background:rgba(230,255,191,.48);animation:sr-window 6.2s steps(2,end) infinite}
    .pixel-city-building i:nth-child(2n){background:rgba(163,236,230,.56)}
    .pixel-city-building i:nth-child(5n){opacity:.15}
    .pixel-city-bridge{top:auto;bottom:21%;height:4.8rem;background:linear-gradient(180deg,transparent 0 54%,rgba(45,146,179,.56) 54% 66%,transparent 66%),repeating-linear-gradient(90deg,transparent 0 54px,rgba(45,146,179,.42) 54px 62px);opacity:.68}
    .pixel-city-bridge span{position:absolute;bottom:1.35rem;width:8rem;height:.75rem;background:rgba(239,255,184,.66);animation:sr-window 4.8s steps(2,end) infinite}
    .pixel-city-bridge span:nth-child(1){left:12%}
    .pixel-city-bridge span:nth-child(2){left:42%;animation-delay:-1.8s}
    .pixel-city-bridge span:nth-child(3){right:14%;animation-delay:-3s}
    .pixel-city-ground{top:auto;z-index:3;height:22%;background:linear-gradient(180deg,rgba(255,239,164,.72),rgba(71,181,203,.3) 10%,rgba(22,91,144,.88) 52%,rgba(16,73,124,.96)),repeating-linear-gradient(90deg,rgba(255,255,255,.16) 0 38px,transparent 38px 44px)}
    .pixel-city-ground__light{position:absolute;left:7%;right:7%;top:1rem;height:.8rem;background:rgba(255,243,165,.76);box-shadow:0 0 30px rgba(255,206,95,.32)}
    .pixel-city-ground__reflection{position:absolute;top:3.1rem;height:1.05rem;background:rgba(239,255,184,.34);animation:sr-reflection 6s steps(4,end) infinite}
    .pixel-city-ground__reflection--one{left:16%;width:13rem}
    .pixel-city-ground__reflection--two{right:20%;width:9rem;animation-delay:-2.6s}
    .pixel-pastel-vignette{z-index:4;pointer-events:none;background:linear-gradient(90deg,rgba(239,251,243,.36),transparent 20%,transparent 76%,rgba(29,95,143,.1)),linear-gradient(180deg,rgba(255,255,255,.12),transparent 45%,rgba(14,73,125,.28))}
    @keyframes sr-sun-pulse{0%,100%{opacity:.72;transform:scale(.98)}50%{opacity:1;transform:scale(1.02)}}
    @keyframes sr-cloud-drift{0%,100%{transform:translateX(-.5rem)}50%{transform:translateX(1.25rem)}}
    @keyframes sr-window{0%,100%{opacity:.56}50%{opacity:.92}}
    @keyframes sr-light-sweep{0%,100%{transform:translateX(-8%) skewX(-16deg);opacity:.2}45%{transform:translateX(14%) skewX(-16deg);opacity:.48}}
    @keyframes sr-reflection{0%,100%{opacity:.18;transform:translateX(-.4rem)}50%{opacity:.46;transform:translateX(.6rem)}}
    .gantt-section{background:#fafcd9}
    .gantt-flex{display:flex;margin-top:1.4rem}
    .gantt-names{display:grid;flex:0 0 auto;row-gap:.4rem;width:10rem;padding-top:2.15rem}
    .gantt-name{display:flex;align-items:center;height:1.35rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-right:.6rem;font-size:.72rem;font-weight:900;display:block;line-height:1.35rem}
    .gantt-board{position:relative;flex:1;min-width:0}
    .gantt-lane{height:.9rem}
    .gantt-months{display:flex;height:1.25rem}
    .gantt-months span{flex:1;min-width:0;overflow:hidden;white-space:nowrap;padding:0 .3rem;font-size:.6rem;font-weight:900;text-transform:uppercase;color:rgba(28,35,40,.55)}
    .gantt-bg{position:absolute;left:0;right:0;top:.9rem;bottom:0;display:flex}
    .gantt-bg span{flex:1;border-left:1px solid rgba(28,35,40,.15);background:linear-gradient(to right,rgba(28,35,40,.07) 1px,transparent 1px);background-size:25% 100%}
    .gantt-rows{position:relative;display:grid;row-gap:.4rem}
    .gantt-row{position:relative;height:1.35rem;break-inside:avoid}
    .gantt-bar{position:absolute;top:50%;height:.85rem;transform:translateY(-50%);border-radius:999px;box-shadow:0 1px 2px rgba(28,35,40,.18)}
    .gantt-today{position:absolute;top:0;bottom:0;z-index:2;pointer-events:none}
    .gantt-today i{position:absolute;top:.9rem;bottom:0;display:block;border-left:2px dashed #f94622}
    .gantt-today b{position:absolute;top:0;left:4px;border-radius:999px;background:#f94622;padding:.1rem .45rem;color:#fff;font-size:.55rem;font-style:normal;font-weight:900;white-space:nowrap}
    ${reportChromeStyles}
    @media print{body{background:#fff}.report{width:100%;padding:0}.report-section{break-inside:avoid;box-shadow:none}.company-branch,.group-branch{break-inside:avoid}}
  </style>
</head>
<body>
  <main class="report">
    ${renderReportChromeHeader(data.chrome)}
    <section class="report-section hero${data.heroScene ? " hero--scene" : ""}"${data.heroScene ? "" : coverStyle}>
      ${data.heroScene ? renderPixelScene() : ""}
      <div class="hero__content">
        ${data.logoUrl ? `<img class="hero__logo" src="${escapeReportHtml(data.logoUrl)}" alt="${escapeReportHtml(data.title)}">` : ""}
        <div class="hero__meta"><span>${escapeReportHtml(data.scopeLabel)}</span><span>${escapeReportHtml(data.labels.generatedAt)} · ${escapeReportHtml(data.generatedOn)}</span></div>
        <h1>${escapeReportHtml(data.title)}</h1>
        <p class="hero__description">${escapeReportHtml(data.description)}</p>
      </div>
    </section>

    <section class="report-section panel summary">
      <p class="section-kicker">${escapeReportHtml(data.labels.summary)}</p>
      <h2 class="section-title">${escapeReportHtml(data.title)}</h2>
      <div class="summary-grid">${data.metrics.map(renderMetric).join("")}</div>
    </section>

    <section class="report-section panel status">
      <p class="section-kicker">${escapeReportHtml(data.labels.statusDistribution)}</p>
      <h2 class="section-title">${data.totalProjectCount}</h2>
      <div class="status-layout">
        <div class="pie" style="background:${statusPieGradient(data.statusSegments)}">
          <div class="pie__center">
            <span class="pie__value">${data.averageProgress}%</span>
            <span class="pie__label">${escapeReportHtml(data.labels.averageProgress)}</span>
          </div>
        </div>
        <div class="status-legend">${renderStatusLegend(data.statusSegments)}</div>
      </div>
    </section>

    ${renderGanttSection(data)}

    <section class="report-section panel portfolio-section">
      <p class="section-kicker">${escapeReportHtml(data.labels.projects)}</p>
      <h2 class="section-title">${escapeReportHtml(data.labels.portfolio)}</h2>
      ${renderPortfolio(data)}
    </section>
    ${renderReportChromeFooter(data.chrome)}
  </main>
</body>
</html>`;
};

export const createSummaryReportHtml = async (data: SummaryReportData) =>
  createSummaryReportHtmlWithCover(data, await embedReportCoverImage(data.coverImageUrl));

export const downloadSummaryReportHtml = async (data: SummaryReportData) => {
  const html = await createSummaryReportHtml(data);
  downloadReportHtmlFile(html, sanitizeReportFileName(data.title, "Studio Map OS"));
};
