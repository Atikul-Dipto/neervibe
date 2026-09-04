"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** Text shown right of the bar; defaults to the formatted value. */
  display?: string;
  secondary?: ReactNode;
  color?: string;
}

/** Ranked horizontal bars — the workhorse for "top hubs", "city performance",
 * "merchant ranking". Rows are clickable to cross-filter. */
export function BarList({
  rows,
  onClick,
  activeKey,
  format = (v) => v.toLocaleString(),
  max,
  className,
  emptyMessage = "No data for the current filters.",
}: {
  rows: BarRow[];
  onClick?: (key: string) => void;
  activeKey?: string | null;
  format?: (v: number) => string;
  max?: number;
  className?: string;
  emptyMessage?: string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-ink-500">{emptyMessage}</div>;
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {rows.map((r) => {
        const active = activeKey === r.key;
        const Comp = onClick ? "button" : "div";
        return (
          <Comp
            key={r.key}
            onClick={onClick ? () => onClick(r.key) : undefined}
            className={clsx(
              "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded px-1.5 py-1 text-left transition-colors",
              onClick && "cursor-pointer hover:bg-nv-850",
              active && "bg-accent-100/50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]",
            )}
            aria-pressed={onClick ? active : undefined}
          >
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={clsx("truncate text-xs", active ? "text-accent-700" : "text-ink-700")}>{r.label}</span>
                {r.secondary && <span className="shrink-0 text-[10px] text-ink-500">{r.secondary}</span>}
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-nv-800">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, backgroundColor: r.color ?? "#22d3ee" }}
                />
              </div>
            </div>
            <span className="w-14 text-right text-xs tabular-nums text-ink-900">{r.display ?? format(r.value)}</span>
          </Comp>
        );
      })}
    </div>
  );
}
