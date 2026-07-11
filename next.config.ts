import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const isPortablePwaBuild = process.env.STUDIO_MAP_PWA_BUNDLE === "1";
const isGithubPagesBuild = process.env.GITHUB_PAGES === "1";
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
const basePath = isGithubPagesBuild ? "/SMOS" : "";
const withBasePath = (url: string) => `${basePath}${url}`;
const appShellRoutes = [
  "/",
  "/login",
  "/register",
  "/offline",
  "/dashboard",
  "/companies",
  "/company",
  "/projects",
  "/project",
  "/project-costs",
  "/project-share",
  "/costs",
  "/libraries",
  "/archive",
  "/share"
];
const getPrecacheRoute = (route: string) =>
  withBasePath(isGithubPagesBuild && route !== "/" ? `${route}/` : route);
const pagesDataRoutes = isGithubPagesBuild
  ? appShellRoutes.map((route) => withBasePath(route === "/" ? "/index.txt" : `${route}/index.txt`))
  : [];

const revisionExtensions = new Set([".css", ".ts", ".tsx"]);
const collectRevisionSources = (directory: string): string[] =>
  readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const source = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      return collectRevisionSources(source);
    }

    return [...revisionExtensions].some((extension) => entry.name.endsWith(extension)) ? [source] : [];
  });

const revisionSources = ["app", "components", "lib"].flatMap(collectRevisionSources).sort();

const pwaRevision = createHash("sha256");

for (const source of revisionSources) {
  pwaRevision.update(readFileSync(join(process.cwd(), source)));
}

const precacheRevision = pwaRevision.digest("hex").slice(0, 20);
const publicPrecacheFiles = [
  "public/brand/smos-logo-02.png",
  "public/icons/apple-touch-icon.png",
  "public/icons/pwa-192.png",
  "public/icons/pwa-512.png",
  "public/icons/pwa-maskable-192.png",
  "public/icons/pwa-maskable-512.png",
  "public/icons/pwa-maskable.svg"
];

const getFileRevision = (source: string) =>
  createHash("sha256").update(readFileSync(join(process.cwd(), source))).digest("hex").slice(0, 20);

const withSerwist = withSerwistInit({
  additionalPrecacheEntries: [
    ...appShellRoutes.map((url) => ({
      url: getPrecacheRoute(url),
      revision: precacheRevision
    })),
    ...pagesDataRoutes.map((url) => ({
      url,
      revision: precacheRevision
    })),
    {
      url: withBasePath("/manifest.webmanifest"),
      revision: precacheRevision
    },
    {
      url: withBasePath("/icon.svg"),
      revision: getFileRevision("app/icon.svg")
    },
    ...publicPrecacheFiles.map((source) => ({
      url: withBasePath(source.replace(/^public/, "")),
      revision: getFileRevision(source)
    }))
  ],
  cacheOnNavigation: true,
  disable: isDevelopment,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  register: true,
  reloadOnOnline: true,
  scope: basePath ? `${basePath}/` : "/",
  swDest: "public/sw.js",
  swSrc: "app/sw.ts"
});

const nextConfig: NextConfig = {
  basePath,
  distDir,
  images: { unoptimized: true },
  output: isGithubPagesBuild ? "export" : isPortablePwaBuild ? "standalone" : undefined,
  trailingSlash: isGithubPagesBuild,
  ...(isGithubPagesBuild
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/sw.js",
              headers: [
                { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
                { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
                { key: "Content-Type", value: "application/javascript; charset=utf-8" },
                { key: "Service-Worker-Allowed", value: "/" },
                { key: "X-Content-Type-Options", value: "nosniff" }
              ]
            },
            {
              source: "/manifest.webmanifest",
              headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }]
            }
          ];
        }
      })
};

export default withSerwist({
  ...nextConfig,
  env: {
    ...nextConfig.env,
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STATIC_EXPORT: isGithubPagesBuild ? "1" : "0",
    NEXT_PUBLIC_PWA_REVISION: precacheRevision
  }
});
