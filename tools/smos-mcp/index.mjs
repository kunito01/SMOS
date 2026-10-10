#!/usr/bin/env node
/**
 * Studio Map OS agent bridge (MCP relay).
 *
 * Speaks MCP over stdio to the agent client and keeps a localhost WebSocket
 * open for the running Studio Map OS PWA. Every tool call is forwarded to the
 * PWA, which executes it against the signed-in workspace and answers back.
 * The PWA is the source of truth for the tool list, so this relay never has
 * to be updated when the app gains new tools.
 */
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";

const token = (process.env.SMOS_AGENT_TOKEN ?? "").trim();
const port = Number(process.env.SMOS_AGENT_PORT ?? 3391);
const requestTimeoutMs = 30_000;

// stdout carries the MCP protocol, so diagnostics go to stderr.
const log = (...parts) => console.error("[smos-mcp]", ...parts);

if (!token) {
  log("SMOS_AGENT_TOKEN is missing. Copy the pairing token from Studio Map OS → Archive → Agent access.");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  log(`SMOS_AGENT_PORT must be a port between 1024 and 65535, got ${process.env.SMOS_AGENT_PORT}`);
  process.exit(1);
}

const NOT_CONNECTED =
  "Studio Map OS is not connected. Open the app in Chrome, sign in, and turn on Agent access on the Archive page.";

let pwa = null;
const pending = new Map();

const server = new Server(
  { name: "studio-map-os", version: "1.0.0" },
  { capabilities: { tools: { listChanged: true } } }
);

const rejectAllPending = (reason) => {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
  }
  pending.clear();
};

const ask = (method, payload = {}) =>
  new Promise((resolve, reject) => {
    if (!pwa || pwa.readyState !== pwa.OPEN) {
      reject(new Error(NOT_CONNECTED));
      return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Studio Map OS did not answer in time"));
    }, requestTimeoutMs);
    pending.set(id, { resolve, reject, timer });
    pwa.send(JSON.stringify({ type: "request", id, method, ...payload }));
  });

const wss = new WebSocketServer({ host: "127.0.0.1", port });

wss.on("listening", () => log(`waiting for Studio Map OS on ws://127.0.0.1:${port}`));
wss.on("error", (error) => {
  log(`cannot listen on port ${port}: ${error.message}`);
  process.exit(1);
});

wss.on("connection", (socket) => {
  let authenticated = false;
  const authTimer = setTimeout(() => {
    if (!authenticated) {
      socket.close(4001, "authentication timeout");
    }
  }, 5_000);

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (!authenticated) {
      if (message?.type === "hello" && typeof message.token === "string" && message.token === token) {
        authenticated = true;
        clearTimeout(authTimer);
        if (pwa && pwa !== socket) {
          pwa.close(4002, "replaced by a newer Studio Map OS window");
        }
        pwa = socket;
        log(`Studio Map OS connected (workspace ${message.workspaceId ?? "unknown"})`);
        server.sendToolListChanged().catch(() => undefined);
      } else {
        socket.close(4001, "unauthorized");
      }
      return;
    }

    if (message?.type === "response") {
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) {
        entry.resolve(message.result);
      } else {
        entry.reject(new Error(typeof message.error === "string" ? message.error : "Tool call failed"));
      }
    }
  });

  socket.on("close", () => {
    clearTimeout(authTimer);
    if (pwa === socket) {
      pwa = null;
      rejectAllPending("Studio Map OS disconnected");
      log("Studio Map OS disconnected");
      server.sendToolListChanged().catch(() => undefined);
    }
  });
});

// Browsers answer ping frames automatically; this keeps idle connections alive.
const keepAlive = setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.ping();
    }
  }
}, 25_000);
keepAlive.unref();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const tools = await ask("list_tools");
    return { tools: Array.isArray(tools) ? tools : [] };
  } catch {
    return {
      tools: [
        {
          name: "smos_status",
          description: `${NOT_CONNECTED} Call this to re-check the connection.`,
          inputSchema: { type: "object", properties: {}, additionalProperties: false }
        }
      ]
    };
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};

  if (name === "smos_status") {
    const connected = Boolean(pwa && pwa.readyState === pwa.OPEN);
    return {
      content: [{ type: "text", text: connected ? "Studio Map OS is connected." : NOT_CONNECTED }],
      isError: !connected
    };
  }

  try {
    const result = await ask("call_tool", { name, args });
    const text = typeof result === "string" ? result : JSON.stringify(result ?? null, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      isError: true
    };
  }
});

const shutdown = () => {
  rejectAllPending("smos-mcp is shutting down");
  wss.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(new StdioServerTransport());
log("MCP server ready on stdio");
