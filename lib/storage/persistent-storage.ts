export type BrowserStorageStatus = {
  durability: "best-effort" | "persistent" | "unsupported";
  quota?: number;
  usage?: number;
};

let persistenceRequest: Promise<BrowserStorageStatus> | null = null;

const readEstimate = async () => {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return {};
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      quota: estimate.quota,
      usage: estimate.usage
    };
  } catch {
    return {};
  }
};

/**
 * Best-effort request for browser-managed persistent storage. Browsers remain
 * free to deny the request, so encrypted user backups are still required.
 */
export function requestPersistentBrowserStorage(): Promise<BrowserStorageStatus> {
  if (persistenceRequest) {
    return persistenceRequest;
  }

  persistenceRequest = (async () => {
    const estimate = await readEstimate();

    if (
      typeof navigator === "undefined" ||
      !navigator.storage?.persisted ||
      !navigator.storage.persist
    ) {
      return { durability: "unsupported", ...estimate };
    }

    try {
      if (await navigator.storage.persisted()) {
        return { durability: "persistent", ...estimate };
      }

      const granted = await navigator.storage.persist();
      return {
        durability: granted ? "persistent" : "best-effort",
        ...estimate
      };
    } catch {
      return { durability: "best-effort", ...estimate };
    }
  })();

  return persistenceRequest;
}
