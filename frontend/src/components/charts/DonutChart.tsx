"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import clsx from "clsx";
import { useChartTheme, type ChartColor } from "./chartTheme";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: ChartColor;
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  onClick,
  activeKey,
  height = 180,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  onClick?: (key: string) => void;
  activeKey?: string | null;
  height?: number;
}) {
  const CHART = useChartTheme();
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div className="py-6 text-center text-xs text-ink-500">No data for the current filters.</div>;
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
              onClick={(entry) => onClick?.((entry as unknown as DonutSlice).key)}
              style={{ cursor: onClick ? "pointer" : undefined }}
            >
              {shown.map((s) => (
                <Cell key={s.key} fill={CHART.color(s.color)} opacity={activeKey && activeKey !== s.key ? 0.35 : 1} />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART.tooltip} itemStyle={{ color: CHART.tooltip.color }} formatter={(v) => [Number(v).toLocaleString(), ""]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <div className="text-lg font-semibold tabular-nums text-ink-900">{centerValue}</div>}
          {centerLabel && <div className="text-[10px] uppercase tracking-wider text-ink-500">{centerLabel}</div>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {shown.map((s) => (
          <button
            key={s.key}
            onClick={onClick ? () => onClick(s.key) : undefined}
            className={clsx(
              "flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left text-[11px] transition-colors",
              onClick && "hover:bg-nv-850",
              activeKey === s.key ? "text-accent-700" : "text-ink-600",
            )}
            aria-pressed={activeKey === s.key}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: CHART.color(s.color) }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="text-ink-900">{s.value.toLocaleString()}</span>
              <span className="ml-1 text-ink-500">{Math.round((s.value / total) * 100)}%</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
