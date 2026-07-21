const MAX_EMBEDDED_COVER_BYTES = 12 * 1024 * 1024;
const supportedImageMimeTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const supportedDataImagePattern = /^data:image\/(?:avif|gif|jpe?g|png|webp);base64,[a-z0-9+/=\s]+$/i;

export const escapeReportHtml = (value: string | number) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const clampReportPercent = (value: number) =>
  Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));

export const sanitizeReportFileName = (name: string, fallback: string) => {
  const sanitized = name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);

  return `${sanitized || fallback}.html`;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to encode the cover image"));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read the cover image")));
    reader.readAsDataURL(blob);
  });

export const embedReportCoverImage = async (imageUrl?: string) => {
  const source = imageUrl?.trim();

  if (!source) {
    return null;
  }

  if (supportedDataImagePattern.test(source)) {
    return source;
  }

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch(source, { credentials: "same-origin", signal: controller.signal });
    window.clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    if (!supportedImageMimeTypes.has(blob.type) || blob.size > MAX_EMBEDDED_COVER_BYTES) {
      return null;
    }

    const dataUrl = await blobToDataUrl(blob);
    return supportedDataImagePattern.test(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
};

export const normalizeReportHexColor = (value: string, fallback: string) =>
  /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;

export const reportHexColorWithAlpha = (value: string, alpha: number, fallback: string) => {
  const parsed = Number.parseInt(normalizeReportHexColor(value, fallback).slice(1), 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;

  return `rgba(${red},${green},${blue},${alpha})`;
};

export const readableReportTextColor = (value: string, fallback: string) => {
  const parsed = Number.parseInt(normalizeReportHexColor(value, fallback).slice(1), 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.58 ? "#1C2328" : "#FFFFFF";
};

export type ReportChromeLabels = {
  eyebrow: string;
  footerCopyright: string;
  footerRights: string;
  footerCollaboration: string;
  footerMoreInfo: string;
};

export const buildReportChromeLabels = (
  t: (key: ReportChromeTranslationKey) => string
): ReportChromeLabels => ({
  eyebrow: t("loginEyebrow"),
  footerCopyright: t("footerCopyright"),
  footerRights: t("footerRights"),
  footerCollaboration: t("footerCollaboration"),
  footerMoreInfo: t("footerMoreInfo")
});

type ReportChromeTranslationKey =
  | "loginEyebrow"
  | "footerCopyright"
  | "footerRights"
  | "footerCollaboration"
  | "footerMoreInfo";

export const reportBrandMarkSvg = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="64" height="64" rx="18" ry="18" fill="#000000"/><path fill="#FFFFFF" d="M49.79,31.22c-.35,3.07,2.07,5.79,5.18,5.65.15.09.28.17.35.25s.03.35-.02.46c-2.67,6.02-7.96,10.91-13.63,14.15-2.2,1.26-4.45,2.29-6.85,3.05-.93.3-1.75.34-2.69.06-2.3-.68-4.46-1.64-6.58-2.79-6.51-3.56-12.45-9.2-14.96-16.29-1.77-5-2.02-10.41-.49-15.49,2.8-9.28,11.99-13.85,21.13-10.33-6.18,4.18-9.33,11.6-8.21,18.93.17,1,.31,1.95.64,2.87-.55-4.21,0-8.39,1.76-12.22,2.88-6.3,8.88-10.56,15.85-10.76,4.82-.14,9.31,2,12.26,5.76.14.26.25.8-.1.9-2.44.71-4.03,3.08-3.63,5.63-2.91-.09-5.21,2.21-5.25,5-.05,2.83,2.22,5.22,5.22,5.18Z"/></svg>`;

export const reportChromeStyles = `.report-chrome-header{display:flex;align-items:center;gap:.6rem;padding:.5rem .35rem 0}
    .report-chrome-header svg{width:2.35rem;height:2.35rem;flex:0 0 auto}
    .report-chrome-copy{display:flex;min-width:0;flex-direction:column;justify-content:center}
    .report-chrome-eyebrow{font-size:.52rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:rgba(28,35,40,.72)}
    .report-chrome-title{margin-top:.16rem;font-size:1.05rem;font-weight:900;letter-spacing:-.01em;line-height:1;white-space:nowrap;color:#1c2328}
    .report-chrome-footer{padding:1.7rem .75rem .6rem;text-align:center;color:rgba(28,35,40,.48);font-size:.72rem;font-weight:650;line-height:1.6}
    .report-chrome-footer p{margin:0;overflow-wrap:anywhere}
    .report-chrome-footer a{color:#ff0099;font-weight:900;text-decoration:none}
    .report-chrome-footer a:hover,.report-chrome-footer a:focus-visible{text-decoration:underline;text-underline-offset:4px}
    @media print{.report-chrome-header,.report-chrome-footer{break-inside:avoid}}`;

export const renderReportChromeHeader = (labels: ReportChromeLabels) => `<header class="report-chrome-header">
      ${reportBrandMarkSvg}
      <span class="report-chrome-copy">
        <span class="report-chrome-eyebrow">${escapeReportHtml(labels.eyebrow)}</span>
        <span class="report-chrome-title">STUDIO MAP OS</span>
      </span>
    </header>`;

export const renderReportChromeFooter = (labels: ReportChromeLabels) => `<footer class="report-chrome-footer">
      <p>${escapeReportHtml(labels.footerCopyright)} ${escapeReportHtml(labels.footerRights)}</p>
      <p>${escapeReportHtml(labels.footerCollaboration)} <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a> ${escapeReportHtml(labels.footerMoreInfo)}</p>
    </footer>`;

export const downloadReportHtmlFile = (html: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
