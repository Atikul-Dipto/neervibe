"use client";

import { create } from "zustand";
import type { ConnectionState } from "@/hooks/useLiveChannel";

/** Live health of the pieces the UI depends on, for the top-bar status. */
interface SystemState {
  ws: ConnectionState;
  api: "ok" | "degraded" | "down" | "unknown";
  apiChecks: Record<string, boolean>;
  apiCheckedAt: number | null;
  apiLatencyMs: number | null;
  setWs: (ws: ConnectionState) => void;
  setApi: (api: SystemState["api"], checks: Record<string, boolean>, latencyMs: number | null) => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  ws: "connecting",
  api: "unknown",
  apiChecks: {},
  apiCheckedAt: null,
  apiLatencyMs: null,
  setWs: (ws) => set({ ws }),
  setApi: (api, apiChecks, apiLatencyMs) => set({ api, apiChecks, apiLatencyMs, apiCheckedAt: Date.now() }),
}));
