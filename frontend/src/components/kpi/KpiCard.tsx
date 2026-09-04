"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import clsx from "clsx";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/charts/Sparkline";

export type KpiTone = "neutral" | "good" | "warning" | "danger" | "accent" | "ai";

const VALUE_COLOR: Record<KpiTone, string> = {
  neutral: "text-ink-900",
  good: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-rose-300",
  accent: "text-cyan-300",
  ai: "text-violet-300",
};

const DOT_COLOR: Record<KpiTone, string> = {
  neutral: "bg-ink-500",
  good: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  accent: "bg-cyan-400",
  ai: "bg-violet-400",
};

export interface KpiDelta {
  /** Percentage or absolute change vs the comparison window. */
  value: number;
  suffix?: string;
  /** Whether an increase is good (deliveries) or bad (delays). */
  goodIsUp?: boolean;
  label?: string;
}

/**
 * Compact, information-rich metric tile: label, value, secondary context,
 * a trend indicator, a status dot and an optional sparkline. Clickable when
 * it can drill down; `active` marks it as the source of a cross filter.
 */
export function KpiCard({
  label,
  value,
  sub,
  delta,
  trend,
  tone = "neutral",
  onClick,
  active,
  loading,
  icon,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: KpiDelta | null;
  trend?: number[];
  tone?: KpiTone;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  hint?: string;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  const deltaGood = delta ? (delta.goodIsUp ?? true ? delta.value >= 0 : delta.value <= 0) : true;
  return (
    <Card
      interactive={!!onClick}
      selected={active}
      className={clsx("relative overflow-hidden p-0", className)}
      title={hint}
    >
      <Comp
        onClick={onClick}
        className={clsx("flex w-full flex-col gap-1 px-3 py-2.5 text-left", onClick && "focus-visible:outline-none")}
        aria-pressed={onClick ? active : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            {icon}
            {label}
          </span>
          <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", DOT_COLOR[tone])} aria-hidden />
        </div>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-16" />
        ) : (
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className={clsx("text-xl font-semibold leading-tight tabular-nums", VALUE_COLOR[tone])}>{value}</div>
              {(sub || delta) && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
                  {delta && (
                    <span className={clsx("inline-flex items-center gap-0.5 tabular-nums", deltaGood ? "text-emerald-300" : "text-rose-300")}>
                      {delta.value > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta.value < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {delta.value > 0 ? "+" : ""}
                      {Math.abs(delta.value) >= 100 ? Math.round(delta.value) : delta.value.toFixed(1)}
                      {delta.suffix ?? "%"}
                    </span>
                  )}
                  <span className="truncate">{delta?.label ?? sub}</span>
                </div>
              )}
            </div>
            {trend && trend.length > 1 && (
              <div className="w-20 shrink-0">
                <Sparkline values={trend} color={tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "good" ? "good" : "accent"} />
              </div>
            )}
          </div>
        )}
      </Comp>
    </Card>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8", className)}>{children}</div>;
}
