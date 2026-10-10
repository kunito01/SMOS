"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/app-providers";
import {
  AGENT_BRIDGE_SETTINGS_EVENT,
  readAgentBridgeSettings,
  startAgentBridge
} from "@/lib/integrations/agent-bridge";

/** Headless: keeps the local agent bridge alive while it is enabled for the signed-in workspace. */
export function AgentBridgeClient() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId;

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    let stop: (() => void) | null = null;
    const sync = () => {
      const settings = readAgentBridgeSettings(workspaceId);
      if (settings.enabled && !stop) {
        stop = startAgentBridge(workspaceId);
      } else if (!settings.enabled && stop) {
        stop();
        stop = null;
      }
    };
    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (!detail?.workspaceId || detail.workspaceId === workspaceId) {
        // Port or token changes need a fresh connection.
        if (stop) {
          stop();
          stop = null;
        }
        sync();
      }
    };

    sync();
    window.addEventListener(AGENT_BRIDGE_SETTINGS_EVENT, onSettings);

    return () => {
      window.removeEventListener(AGENT_BRIDGE_SETTINGS_EVENT, onSettings);
      stop?.();
    };
  }, [workspaceId]);

  return null;
}
