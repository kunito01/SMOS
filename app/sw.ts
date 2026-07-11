/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

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
  skipWaiting: false,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: defaultCache,
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
