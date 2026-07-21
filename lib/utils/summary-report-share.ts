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
import type { Language, TranslationKey } from "@/lib/i18n/translations";
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
  description: string;
  generatedOn: string;
  labels: SummaryReportLabels;
  language: string;
  metrics: SummaryReportMetric[];
  scopeLabel: string;
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

const createSummaryReportHtmlWithCover = (data: SummaryReportData, embeddedCover: string | null) => {
  const coverStyle = embeddedCover
    ? ` style="background-image:linear-gradient(180deg,rgba(28,35,40,.08),rgba(28,35,40,.86)),url('${embeddedCover}')"`
    : "";
  const cuneiformFontStyle = data.language === "sux"
    ? `@font-face{font-family:"SMOS Cuneiform";font-style:normal;font-weight:400;font-display:swap;src:local("Noto Sans Cuneiform"),url("https://fonts.gstatic.com/s/notosanscuneiform/v18/bMrrmTWK7YY-MF22aHGGd7H8PhJtvBDWgb8.ttf") format("truetype");unicode-range:U+12000-123FF,U+12400-1247F,U+12480-1254F}`
    : "";
  const reportFontFamily = data.language === "sux"
    ? `"SMOS Cuneiform",Inter,ui-rounded,"SF Pro Rounded","SF Pro Display",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`
    : `Inter,ui-rounded,"SF Pro Rounded","SF Pro Display",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

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
    *{box-sizing:border-box}
    html{background:#edf9f7}
    body{margin:0;color:var(--ink);font-family:${reportFontFamily};background:radial-gradient(circle at 8% 8%,rgba(142,219,232,.58),transparent 28rem),radial-gradient(circle at 92% 36%,rgba(227,245,150,.75),transparent 31rem),linear-gradient(150deg,#f9fffd,#f6f2e9);font-weight:650;line-height:1.5}
    h1,h2,h3,p{margin:0;overflow-wrap:anywhere}
    h1,h2,h3,strong,.metric__value{font-weight:900}
    .report{width:min(100%,94rem);margin:0 auto;padding:clamp(.85rem,2.4vw,2.4rem)}
    .report-section{margin-top:clamp(1rem,2vw,1.6rem);border:1px solid rgba(28,35,40,.06);border-radius:var(--radius-xl);box-shadow:0 24px 70px rgba(28,35,40,.10)}
    .hero{position:relative;display:flex;min-height:clamp(22rem,48vw,32rem);flex-direction:column;justify-content:flex-end;overflow:hidden;padding:clamp(1.2rem,4vw,3.4rem);color:#fff;background-color:#284b50;background-image:radial-gradient(circle at 20% 20%,rgba(142,219,232,.88),transparent 31%),radial-gradient(circle at 82% 78%,rgba(227,245,150,.72),transparent 34%),linear-gradient(145deg,#335b61,var(--deep));background-position:center;background-size:cover}
    .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(28,35,40,.46),transparent 62%);pointer-events:none}
    .hero__content{position:relative;z-index:1;max-width:58rem}
    .hero__meta{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem}
    .hero__meta span{display:inline-flex;min-height:2.1rem;align-items:center;border-radius:999px;background:rgba(255,255,255,.85);padding:.45rem .85rem;color:var(--ink);font-size:.74rem;font-weight:850;backdrop-filter:blur(12px)}
    .hero h1{max-width:18ch;font-size:clamp(2.2rem,6.6vw,5.4rem);letter-spacing:-.065em;line-height:.91}
    .hero__description{max-width:54rem;margin-top:1.15rem;color:rgba(255,255,255,.82);font-size:clamp(.95rem,1.4vw,1.15rem);line-height:1.7}
    .panel{padding:clamp(1rem,3vw,2rem)}
    .section-kicker{font-size:.74rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;opacity:.58}
    .section-title{margin-top:.4rem;font-size:clamp(1.55rem,3vw,2.8rem);letter-spacing:-.04em;line-height:1}
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
    @media(max-width:560px){:root{--radius-xl:1.75rem;--radius-lg:1.35rem}.report{padding:.55rem}.report-section{margin-top:.7rem}.hero{min-height:24rem;padding:1rem}.hero h1{font-size:clamp(2rem,12vw,3.4rem)}.panel{padding:1rem}.summary-grid{grid-template-columns:1fr 1fr;gap:.5rem}.metric{min-height:7.2rem;padding:.8rem}.metric__value{margin-top:1.15rem}.project-row__head{flex-direction:column;align-items:flex-start;gap:.3rem}}
    @media(max-width:360px){.summary-grid{grid-template-columns:1fr}.hero__meta{gap:.35rem}.hero__meta span{font-size:.64rem}}
    ${reportChromeStyles}
    @media print{body{background:#fff}.report{width:100%;padding:0}.report-section{break-inside:avoid;box-shadow:none}.company-branch,.group-branch{break-inside:avoid}}
  </style>
</head>
<body>
  <main class="report">
    ${renderReportChromeHeader(data.chrome)}
    <section class="report-section hero"${coverStyle}>
      <div class="hero__content">
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
