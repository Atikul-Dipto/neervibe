"use client";

import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import { useChartTheme, type ChartColor } from "./chartTheme";

export interface TrendSeries {
  key: string;
  label: string;
  color?: ChartColor;
  kind?: "area" | "line" | "bar";
  stackId?: string;
  dashed?: boolean;
  yAxisId?: "left" | "right";
}

export function TrendChart({
  data,
  xKey,
  series,
  height = 200,
  yFormatter = (v) => String(v),
  xFormatter,
  onPointClick,
  activeX,
  referenceX,
  legend = true,
  syncId,
}: {
  data: object[];
  xKey: string;
  series: TrendSeries[];
  height?: number;
  yFormatter?: (v: number) => string;
  xFormatter?: (v: string) => string;
  onPointClick?: (x: string) => void;
  activeX?: string | null;
  /** Vertical marker (e.g. "now" between history and forecast). */
  referenceX?: string;
  legend?: boolean;
  syncId?: string;
}) {
  const CHART = useChartTheme();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.key));
  const hasRight = series.some((s) => s.yAxisId === "right");

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data as Record<string, unknown>[]}
          margin={{ top: 8, right: hasRight ? 8 : 12, bottom: 0, left: 0 }}
          syncId={syncId}
          onClick={(state) => {
            const label = (state as { activeLabel?: string } | null)?.activeLabel;
            if (onPointClick && label != null) onPointClick(String(label));
          }}
          style={{ cursor: onPointClick ? "pointer" : undefined }}
        >
          <defs>
            {series.map((s, i) => {
              const color = s.color ? CHART.color(s.color) : CHART.series[i % CHART.series.length];
              return (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: CHART.axis, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            tickFormatter={xFormatter}
            minTickGap={24}
          />
          <YAxis yAxisId="left" tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => yFormatter(Number(v))} />
          {hasRight && <YAxis yAxisId="right" orientation="right" tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} axisLine={false} width={36} />}
          <Tooltip
            cursor={{ fill: CHART.cursor, stroke: CHART.grid }}
            contentStyle={CHART.tooltip}
            labelStyle={{ color: CHART.axis, marginBottom: 4 }}
            itemStyle={{ padding: 0 }}
            formatter={(value, name) => [typeof value === "number" ? yFormatter(value) : String(value), String(name)]}
            labelFormatter={(l) => (xFormatter ? xFormatter(String(l)) : String(l))}
          />
          {referenceX && <ReferenceLine x={referenceX} yAxisId="left" stroke={CHART.axis} strokeDasharray="3 3" />}
          {activeX && <ReferenceLine x={activeX} yAxisId="left" stroke={CHART.series[0]} strokeWidth={2} />}
          {visible.map((s, idx) => {
            const i = series.indexOf(s);
            const color = s.color ? CHART.color(s.color) : CHART.series[i % CHART.series.length];
            const common = { dataKey: s.key, name: s.label, yAxisId: s.yAxisId ?? "left", isAnimationActive: false as const };
            if (s.kind === "bar") return <Bar key={s.key} {...common} fill={color} stackId={s.stackId} radius={idx === visible.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={28} />;
            if (s.kind === "line") return <Line key={s.key} {...common} type="monotone" stroke={color} strokeWidth={2} dot={false} strokeDasharray={s.dashed ? "4 3" : undefined} />;
            return <Area key={s.key} {...common} type="monotone" stroke={color} strokeWidth={2} fill={`url(#grad-${s.key})`} stackId={s.stackId} strokeDasharray={s.dashed ? "4 3" : undefined} />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
      {legend && series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1">
          {series.map((s, i) => {
            const color = s.color ? CHART.color(s.color) : CHART.series[i % CHART.series.length];
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(s.key)) next.delete(s.key);
                    else if (next.size < series.length - 1) next.add(s.key);
                    return next;
                  })
                }
                className={clsx("flex items-center gap-1.5 text-[11px] transition-opacity", off ? "opacity-40" : "text-ink-600 hover:text-ink-900")}
                aria-pressed={!off}
                title={off ? `Show ${s.label}` : `Hide ${s.label}`}
              >
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
