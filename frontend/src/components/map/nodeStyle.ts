import type { NodeType } from "@/types/domain";

// Color-coded by node type — used for the map circle layer and the legend.
// Kept restrained (no neon) per the "enterprise control center, not a game"
// design rule.
export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  MERCHANT: "#f59e0b",
  PICKUP_POINT: "#eab308",
  HUB: "#38bdf8",
  SORTING_CENTER: "#818cf8",
  REGIONAL_HUB: "#a78bfa",
  DISTRIBUTION_CENTER: "#f472b6",
  DELIVERY_HUB: "#34d399",
  CUSTOMER: "#94a3b8",
};

export const NODE_TYPE_RADIUS: Record<NodeType, number> = {
  MERCHANT: 4,
  PICKUP_POINT: 4,
  HUB: 6,
  SORTING_CENTER: 7,
  REGIONAL_HUB: 8,
  DISTRIBUTION_CENTER: 10,
  DELIVERY_HUB: 6,
  CUSTOMER: 3,
};

export function congestionColor(level: number): string {
  if (level < 0.3) return "#22c55e";
  if (level < 0.6) return "#eab308";
  if (level < 0.8) return "#f97316";
  return "#ef4444";
}
