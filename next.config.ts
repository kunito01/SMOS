import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const isPortablePwaBuild = process.env.STUDIO_MAP_PWA_BUNDLE === "1";
const distDir = process.env.NEXT_DIST_DIR ?? ".next";

const localeRevisionSources = readdirSync(join(process.cwd(), "lib/i18n/locales"))
  .filter((source) => source.endsWith(".ts"))
  .sort()
  .map((source) => `lib/i18n/locales/${source}`);

const revisionSources = [
  "app/layout.tsx",
  "app/manifest.ts",
  "app/offline/page.tsx",
  "app/globals.css",
  "components/i18n/language-toggle.tsx",
  "components/providers/app-providers.tsx",
  "lib/i18n/translations.ts",
  ...localeRevisionSources
];

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
    ...["/", "/login", "/register", "/offline", "/manifest.webmanifest"].map((url) => ({
      url,
      revision: precacheRevision
    })),
    {
      url: "/icon.svg",
      revision: getFileRevision("app/icon.svg")
    },
    ...publicPrecacheFiles.map((source) => ({
      url: source.replace(/^public/, ""),
      revision: getFileRevision(source)
    }))
  ],
  cacheOnNavigation: true,
  disable: isDevelopment,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  register: true,
  reloadOnOnline: true,
  swDest: "public/sw.js",
  swSrc: "app/sw.ts"
});

const nextConfig: NextConfig = {
  distDir,
  output: isPortablePwaBuild ? "standalone" : undefined,
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
};

export default withSerwist({
  ...nextConfig,
  env: {
    ...nextConfig.env,
    NEXT_PUBLIC_PWA_REVISION: precacheRevision
  }
});
