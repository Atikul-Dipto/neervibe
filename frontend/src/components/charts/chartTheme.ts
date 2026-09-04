import type { ExceptionPriority, SlaState, StatusGroup } from "@/data/derive";

// Chart palette tuned for the dark surfaces (every hue ≥ 3:1 on #0f151d).
export const CHART = {
  series: ["#22d3ee", "#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#94a3b8", "#f472b6"],
  grid: "#1e2833",
  axis: "#7c8a99",
  cursor: "rgba(255,255,255,0.04)",
  tooltip: {
    background: "#0f151d",
    border: "1px solid #2a3644",
    borderRadius: 6,
    fontSize: 12,
    color: "#e6edf3",
    boxShadow: "0 6px 20px -6px rgba(0,0,0,0.6)",
  },
};

export const STATUS_GROUP_COLORS: Record<StatusGroup, string> = {
  pending: "#94a3b8",
  in_transit: "#22d3ee",
  out_for_delivery: "#60a5fa",
  delivered: "#34d399",
  failed: "#f87171",
  returns: "#fbbf24",
  cancelled: "#64748b",
  lost: "#fb7185",
};

export const SLA_COLORS: Record<SlaState, string> = {
  on_track: "#34d399",
  at_risk: "#fbbf24",
  breached: "#f87171",
  met: "#34d399",
  missed: "#f87171",
  n_a: "#64748b",
};

export const PRIORITY_COLORS: Record<ExceptionPriority, string> = {
  critical: "#f87171",
  high: "#fbbf24",
  medium: "#60a5fa",
  low: "#94a3b8",
};

export const HEALTH_COLORS = { ok: "#34d399", warning: "#fbbf24", critical: "#f87171" } as const;
