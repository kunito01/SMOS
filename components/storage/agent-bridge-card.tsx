"use client";

import { useEffect, useState } from "react";
import { Bot, Copy, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import {
  createAgentToken,
  getAgentBridgeStatus,
  readAgentBridgeSettings,
  subscribeAgentBridgeStatus,
  subscribeAgentLog,
  writeAgentBridgeSettings,
  type AgentActionLogEntry,
  type AgentBridgeStatus
} from "@/lib/integrations/agent-bridge";
import { cn } from "@/lib/utils/cn";

type AgentBridgeCardProps = {
  workspaceId: string;
};

const RELAY_PATH_PLACEHOLDER = "<SMOS>/tools/smos-mcp/index.mjs";

export function AgentBridgeCard({ workspaceId }: AgentBridgeCardProps) {
  const { language, t } = useI18n();
  const [settings, setSettings] = useState(() => readAgentBridgeSettings(workspaceId));
  const [status, setStatus] = useState<AgentBridgeStatus>(() => getAgentBridgeStatus());
  const [log, setLog] = useState<AgentActionLogEntry[]>([]);
  const [copied, setCopied] = useState("");
  const [portDraft, setPortDraft] = useState(String(settings.port));

  useEffect(() => {
    const next = readAgentBridgeSettings(workspaceId);
    setSettings(next);
    setPortDraft(String(next.port));
  }, [workspaceId]);

  useEffect(() => subscribeAgentBridgeStatus(setStatus), []);
  useEffect(() => subscribeAgentLog(workspaceId, setLog), [workspaceId]);

  const apply = (patch: Parameters<typeof writeAgentBridgeSettings>[1]) => {
    const next = writeAgentBridgeSettings(workspaceId, patch);
    setSettings(next);
    setPortDraft(String(next.port));
  };

  const commitPort = () => {
    const port = Number(portDraft);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
      apply({ port });
    } else {
      setPortDraft(String(settings.port));
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      // Clipboard access can be refused; the text stays visible to select by hand.
    }
  };

  const token = settings.token || "";
  const claudeCommand = `claude mcp add studio-map-os -e SMOS_AGENT_TOKEN=${token} -e SMOS_AGENT_PORT=${settings.port} -- node ${RELAY_PATH_PLACEHOLDER}`;
  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        "studio-map-os": {
          command: "node",
          args: [RELAY_PATH_PLACEHOLDER],
          env: { SMOS_AGENT_TOKEN: token, SMOS_AGENT_PORT: String(settings.port) }
        }
      }
    },
    null,
    2
  );

  const statusLabel = !settings.enabled
    ? t("agentBridgeStatusOff")
    : status.state === "connected"
      ? t("agentBridgeStatusConnected")
      : status.state === "error"
        ? t("agentBridgeStatusError").replace("{message}", status.message ?? "")
        : t("agentBridgeStatusConnecting");
  const statusTone = !settings.enabled
    ? "bg-ink/[0.06] text-muted"
    : status.state === "connected"
      ? "bg-[#97EECE] text-[#12263A]"
      : status.state === "error"
        ? "bg-coral/15 text-coral"
        : "bg-[#ffc700]/40 text-ink";

  return (
    <Card tone="glass" className="overflow-hidden bg-white/[0.76] p-5 sm:p-6">
      <SectionHeader eyebrow={t("agentBridgeEyebrow")} title={t("agentBridgeTitle")} />
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">{t("agentBridgeBody")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-black text-ink">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => apply({ enabled: event.target.checked })}
            className="size-5 accent-coral"
          />
          {t("agentBridgeEnable")}
        </label>
        <span className={cn("inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-black", statusTone)}>
          <Bot size={14} />
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.1em] text-muted">{t("agentBridgeToken")}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 basis-56 truncate rounded-full bg-white px-4 py-2.5 text-xs font-bold text-ink ring-1 ring-black/[0.06]">
              {token || "—"}
            </code>
            <Button type="button" size="sm" variant="ghost" disabled={!token} onClick={() => void copy("token", token)}>
              <Copy size={14} />
              {copied === "token" ? t("agentBridgeCopied") : t("agentBridgeCopy")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => apply({ token: createAgentToken() })}>
              <RefreshCw size={14} />
              {t("agentBridgeRegenerate")}
            </Button>
          </div>
        </div>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.1em] text-muted">{t("agentBridgePort")}</span>
          <input
            type="number"
            min={1024}
            max={65535}
            value={portDraft}
            onChange={(event) => setPortDraft(event.target.value)}
            onBlur={commitPort}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="h-11 w-full rounded-full border-0 bg-white px-4 text-sm font-bold text-ink outline-none ring-1 ring-black/[0.06] focus:ring-coral"
          />
        </label>
      </div>

      <p className="mt-4 text-xs font-bold leading-5 text-muted">{t("agentBridgeSetup")}</p>

      <div className="mt-3 grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black uppercase tracking-[0.1em] text-muted">{t("agentBridgeConfigTitle")}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={!token} onClick={() => void copy("command", claudeCommand)}>
              <Copy size={14} />
              {copied === "command" ? t("agentBridgeCopied") : "Claude Code"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!token} onClick={() => void copy("json", jsonConfig)}>
              <Copy size={14} />
              {copied === "json" ? t("agentBridgeCopied") : "JSON"}
            </Button>
          </div>
        </div>
        <pre className="studio-scroll max-w-full overflow-x-auto rounded-studio bg-ink p-4 text-[11px] font-semibold leading-5 text-white/85">
          {claudeCommand}
        </pre>
      </div>

      <p className="mt-3 text-xs font-bold leading-5 text-muted">{t("agentBridgeSafariNote")}</p>

      <div className="mt-5">
        <span className="text-xs font-black uppercase tracking-[0.1em] text-muted">{t("agentBridgeLogTitle")}</span>
        {log.length ? (
          <ul className="mt-2 grid gap-1.5">
            {log.slice(0, 12).map((entry, index) => (
              <li
                key={`${entry.at}-${index}`}
                className="flex min-w-0 flex-wrap items-baseline gap-x-2 rounded-2xl bg-white/80 px-3 py-2 text-xs"
              >
                <span className="shrink-0 font-bold tabular-nums text-muted">
                  {formatLocalizedDate(entry.at, language, { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className={cn("shrink-0 font-black", entry.ok ? "text-ink" : "text-coral")}>{entry.tool}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink/60">{entry.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs font-bold leading-5 text-muted">{t("agentBridgeLogEmpty")}</p>
        )}
      </div>
    </Card>
  );
}
