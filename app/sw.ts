/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const offlineFallbackUrl = new URL(
  process.env.NEXT_PUBLIC_BASE_PATH ? "offline/" : "offline",
  self.registration.scope
).pathname;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    ignoreURLParametersMatching: [/.*/]
  },
  clientsClaim: true,
  // A waiting worker never activates while any tab or installed PWA window
  // stays open, so deployed fixes kept being served from the old precache.
  // Taking over immediately means the next reload after a deploy runs the new
  // build; local-first data lives in IndexedDB, so a reload is always safe.
  skipWaiting: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    // Cloud storage and Google sign-in answers must never come from the
    // cross-origin NetworkFirst cache that defaultCache applies to every GET:
    // a stale Drive download or identity reply would mask the real state.
    {
      matcher: ({ url }) =>
        /^(www\.googleapis\.com|oauth2\.googleapis\.com|api\.apple-cloudkit\.com)$/.test(url.hostname),
      handler: new NetworkOnly()
    },
    ...defaultCache
  ],
  fallbacks: {
    entries: [
      {
        url: offlineFallbackUrl,
        matcher: ({ request }) => request.destination === "document"
      }
    ]
  }
});

serwist.addEventListeners();

export {};
