"use client";

import { getActiveMockDatabaseWorkspaceId } from "@/lib/api/mock-persistence";
import { listAgentTools, runAgentTool } from "@/lib/integrations/agent-tools";

/**
 * Keeps a WebSocket open to the local smos-mcp relay while Agent access is on,
 * executes the tool calls it forwards, and reports status plus an action log
 * to the Archive card. Only ever talks to 127.0.0.1 and only after the relay
 * accepted the pairing token.
 */

export const AGENT_BRIDGE_DEFAULT_PORT = 3391;
export const AGENT_BRIDGE_SETTINGS_EVENT = "smos:agent-bridge-settings";
const SETTINGS_KEY_PREFIX = "studio-map-os.agent-bridge:";
const LOG_LIMIT = 50;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 15_000;

export type AgentBridgeSettings = {
  enabled: boolean;
  token: string;
  port: number;
};

export type AgentBridgeStatus = {
  state: "off" | "connecting" | "connected" | "error";
  message?: string;
};

export type AgentActionLogEntry = {
  at: string;
  tool: string;
  ok: boolean;
  summary: string;
};

const canUseBrowser = () => typeof window !== "undefined";
const settingsKey = (workspaceId: string) => `${SETTINGS_KEY_PREFIX}${workspaceId}`;
const logKey = (workspaceId: string) => `${SETTINGS_KEY_PREFIX}${workspaceId}:log`;

export const createAgentToken = () =>
  canUseBrowser() && window.crypto?.randomUUID
    ? window.crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

export const readAgentBridgeSettings = (workspaceId: string): AgentBridgeSettings => {
  const fallback: AgentBridgeSettings = { enabled: false, token: "", port: AGENT_BRIDGE_DEFAULT_PORT };
  if (!canUseBrowser()) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(settingsKey(workspaceId));
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<AgentBridgeSettings>;
    const port = Number(parsed.port);
    return {
      enabled: parsed.enabled === true,
      token: typeof parsed.token === "string" ? parsed.token : "",
      port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : AGENT_BRIDGE_DEFAULT_PORT
    };
  } catch {
    return fallback;
  }
};

export const writeAgentBridgeSettings = (workspaceId: string, patch: Partial<AgentBridgeSettings>) => {
  const next = { ...readAgentBridgeSettings(workspaceId), ...patch };
  if (!next.token) {
    next.token = createAgentToken();
  }
  if (canUseBrowser()) {
    window.localStorage.setItem(settingsKey(workspaceId), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(AGENT_BRIDGE_SETTINGS_EVENT, { detail: { workspaceId } }));
  }
  return next;
};

export const readAgentLog = (workspaceId: string): AgentActionLogEntry[] => {
  if (!canUseBrowser()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(logKey(workspaceId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is AgentActionLogEntry =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as AgentActionLogEntry).at === "string" &&
            typeof (entry as AgentActionLogEntry).tool === "string"
        )
      : [];
  } catch {
    return [];
  }
};

const statusListeners = new Set<(status: AgentBridgeStatus) => void>();
const logListeners = new Set<(entries: AgentActionLogEntry[]) => void>();
let latestStatus: AgentBridgeStatus = { state: "off" };

export const getAgentBridgeStatus = () => latestStatus;

export const subscribeAgentBridgeStatus = (listener: (status: AgentBridgeStatus) => void) => {
  statusListeners.add(listener);
  listener(latestStatus);
  return () => {
    statusListeners.delete(listener);
  };
};

export const subscribeAgentLog = (workspaceId: string, listener: (entries: AgentActionLogEntry[]) => void) => {
  logListeners.add(listener);
  listener(readAgentLog(workspaceId));
  return () => {
    logListeners.delete(listener);
  };
};

const publishStatus = (status: AgentBridgeStatus) => {
  latestStatus = status;
  statusListeners.forEach((listener) => listener(status));
};

const appendLog = (workspaceId: string, entry: AgentActionLogEntry) => {
  const next = [entry, ...readAgentLog(workspaceId)].slice(0, LOG_LIMIT);
  if (canUseBrowser()) {
    window.localStorage.setItem(logKey(workspaceId), JSON.stringify(next));
  }
  logListeners.forEach((listener) => listener(next));
};

const summarizeArgs = (args: unknown) => {
  if (!args || typeof args !== "object") {
    return "";
  }
  const text = JSON.stringify(args);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
};

type RelayRequest = {
  type: "request";
  id: string;
  method: "list_tools" | "call_tool";
  name?: string;
  args?: Record<string, unknown>;
};

/**
 * Starts the bridge for a workspace and returns a stop function. Reconnects
 * with backoff while enabled; a wrong token (close code 4001) stops retrying.
 */
export const startAgentBridge = (workspaceId: string) => {
  if (!canUseBrowser()) {
    return () => undefined;
  }

  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer = 0;
  let reconnectDelay = RECONNECT_MIN_MS;

  const scheduleReconnect = () => {
    if (stopped) {
      return;
    }
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  };

  const handleRequest = async (request: RelayRequest) => {
    if (getActiveMockDatabaseWorkspaceId() !== workspaceId) {
      throw new Error("The signed-in workspace changed; reconnect the agent bridge.");
    }
    if (request.method === "list_tools") {
      return listAgentTools();
    }
    if (request.method === "call_tool") {
      const name = request.name ?? "";
      try {
        const result = await runAgentTool(name, request.args);
        appendLog(workspaceId, { at: new Date().toISOString(), tool: name, ok: true, summary: summarizeArgs(request.args) });
        return result;
      } catch (error) {
        appendLog(workspaceId, {
          at: new Date().toISOString(),
          tool: name,
          ok: false,
          summary: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
    throw new Error(`Unknown relay method: ${String(request.method)}`);
  };

  const connect = () => {
    if (stopped) {
      return;
    }
    const settings = readAgentBridgeSettings(workspaceId);
    if (!settings.enabled || !settings.token) {
      publishStatus({ state: "off" });
      return;
    }

    publishStatus({ state: "connecting" });
    let current: WebSocket;
    try {
      current = new WebSocket(`ws://127.0.0.1:${settings.port}`);
    } catch (error) {
      publishStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
      scheduleReconnect();
      return;
    }
    socket = current;

    current.addEventListener("open", () => {
      reconnectDelay = RECONNECT_MIN_MS;
      current.send(JSON.stringify({ type: "hello", token: settings.token, workspaceId }));
      publishStatus({ state: "connected" });
    });

    current.addEventListener("message", (event) => {
      let request: RelayRequest;
      try {
        request = JSON.parse(String(event.data)) as RelayRequest;
      } catch {
        return;
      }
      if (request?.type !== "request" || typeof request.id !== "string") {
        return;
      }
      void handleRequest(request)
        .then((result) => current.send(JSON.stringify({ type: "response", id: request.id, ok: true, result })))
        .catch((error: unknown) =>
          current.send(
            JSON.stringify({
              type: "response",
              id: request.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            })
          )
        );
    });

    current.addEventListener("close", (event) => {
      if (socket !== current) {
        return;
      }
      socket = null;
      if (stopped) {
        publishStatus({ state: "off" });
        return;
      }
      if (event.code === 4001) {
        publishStatus({ state: "error", message: "pairing token rejected" });
        return;
      }
      publishStatus({ state: "connecting" });
      scheduleReconnect();
    });

    current.addEventListener("error", () => {
      // The close event that follows carries the retry; nothing to do here.
    });
  };

  connect();

  return () => {
    stopped = true;
    window.clearTimeout(reconnectTimer);
    const current = socket;
    socket = null;
    current?.close(1000, "agent access turned off");
    publishStatus({ state: "off" });
  };
};
