import { cssVar } from "@/data/theme";
import type { NodeType } from "@/types/domain";

// Node types are a categorical scale, so they come off the data-viz ramp in
// globals.css rather than carrying their own colours — that way they follow the
// theme and stay distinguishable on both grounds. Restrained by design: this is
// an enterprise control centre, not a game.
export function nodeTypeColors(): Record<NodeType, string> {
  return {
    MERCHANT: cssVar("--viz-5", "#c08a2e"),
    PICKUP_POINT: cssVar("--tone-warn-300", "#8e6417"),
    HUB: cssVar("--viz-2", "#4a7ba7"),
    SORTING_CENTER: cssVar("--tone-info-600", "#345c80"),
    REGIONAL_HUB: cssVar("--viz-3", "#7e68a8"),
    DISTRIBUTION_CENTER: cssVar("--viz-8", "#b06a8c"),
    DELIVERY_HUB: cssVar("--viz-1", "#689d4b"),
    CUSTOMER: cssVar("--viz-7", "#7c8570"),
  };
}

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

/** Free-flowing → gridlocked, on the theme's good/warning/danger ramp. */
export function congestionColor(level: number): string {
  if (level < 0.3) return cssVar("--tone-good-500", "#6d9145");
  if (level < 0.6) return cssVar("--tone-warn-400", "#c08a2e");
  if (level < 0.8) return cssVar("--tone-warn-500", "#b07c22");
  return cssVar("--tone-bad-400", "#d96868");
}
