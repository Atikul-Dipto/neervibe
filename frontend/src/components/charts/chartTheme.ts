"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { cssVar, useTheme, type Theme } from "@/data/theme";
import type { ExceptionPriority, SlaState, StatusGroup } from "@/data/derive";

/**
 * SVG charts paint with literal colour strings — presentation attributes do
 * not resolve `var()` — so the palette is read out of the stylesheet once per
 * theme instead of being duplicated in TypeScript. `globals.css` stays the
 * single source of truth for every colour in the product.
 *
 * The fallbacks are the light values, which is also what renders on the
 * server, so the first paint matches the default theme.
 */
/**
 * Semantic colour names charts are given instead of literal hex, so a series
 * follows the active theme. Anything not in this list is passed through, which
 * lets a caller still supply a literal colour where it genuinely needs one.
 */
export type ChartColor =
  | "accent"
  | "accent-soft"
  | "good"
  | "sage"
  | "warning"
  | "danger"
  | "info"
  | "ai"
  | "muted"
  | "pink"
  | "ground"
  | (string & {});

export interface ChartTheme {
  series: string[];
  /** Resolve a `ChartColor` to a concrete colour for the active theme. */
  color: (c: ChartColor | undefined, fallback?: ChartColor) => string;
  grid: string;
  axis: string;
  cursor: string;
  tooltip: CSSProperties;
  statusGroup: Record<StatusGroup, string>;
  sla: Record<SlaState, string>;
  priority: Record<ExceptionPriority, string>;
  health: Record<"ok" | "warning" | "critical", string>;
}

function build(theme: Theme): ChartTheme {
  // Fallbacks only matter before the stylesheet is applied (SSR, first paint),
  // so they follow the requested theme rather than always assuming light.
  const dark = theme === "dark";
  const viz = (n: number, fallback: string) => cssVar(`--viz-${n}`, fallback);
  const good = viz(1, dark ? "#8fc767" : "#689d4b");
  const info = viz(2, dark ? "#6fa0c8" : "#4a7ba7");
  const ai = viz(3, dark ? "#a08cc9" : "#7e68a8");
  const sage = viz(4, dark ? "#bcd79f" : "#91ae6e");
  const warn = viz(5, dark ? "#d9a55e" : "#c08a2e");
  const bad = viz(6, dark ? "#ef8a8a" : "#d96868");
  const muted = viz(7, dark ? "#9aa48d" : "#7c8570");
  const pink = viz(8, dark ? "#d18cae" : "#b06a8c");

  const named: Record<string, string> = {
    accent: good,
    "accent-soft": cssVar("--accent-300", "#91ae6e"),
    good,
    sage,
    warning: warn,
    danger: bad,
    info,
    ai,
    muted,
    pink,
    ground: cssVar("--nv-950", "#f2f2f2"),
  };

  return {
    series: [good, info, ai, sage, warn, bad, muted, pink],
    color: (c, fallback = "accent") => (c ? (named[c] ?? c) : (named[fallback] ?? good)),
    grid: cssVar("--viz-grid", "#e2e4db"),
    axis: cssVar("--viz-axis", "#737e68"),
    cursor: cssVar("--viz-cursor", "rgba(31,36,25,0.05)"),
    tooltip: {
      background: cssVar("--nv-900", "#ffffff"),
      border: `1px solid ${cssVar("--nv-700", "#c7cbbc")}`,
      borderRadius: 6,
      fontSize: 12,
      color: cssVar("--ink-900", "#1f2419"),
      boxShadow: cssVar("--elev-md", "0 6px 18px -8px rgba(31,36,25,0.22)"),
    },
    // Status groups need eight distinguishable hues, more than the brand
    // palette carries, so the derived companions fill the gaps.
    statusGroup: {
      pending: muted,
      in_transit: info,
      out_for_delivery: ai,
      delivered: good,
      failed: bad,
      returns: warn,
      cancelled: cssVar("--ink-400", "#8f9885"),
      lost: pink,
    },
    sla: { on_track: good, at_risk: warn, breached: bad, met: good, missed: bad, n_a: muted },
    priority: { critical: bad, high: warn, medium: info, low: muted },
    health: { ok: good, warning: warn, critical: bad },
  };
}

/** The chart palette for the active theme. Recomputed only when it changes. */
export function useChartTheme(): ChartTheme {
  const theme = useTheme();
  return useMemo(() => build(theme), [theme]);
}
