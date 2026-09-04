"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useChartTheme, type ChartColor } from "./chartTheme";

export function Sparkline({ values, color = "accent", height = 28 }: { values: number[]; color?: ChartColor; height?: number }) {
  const chart = useChartTheme();
  const resolved = chart.color(color);
  if (values.length < 2) return <div style={{ height }} />;
  const data = values.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolved} stopOpacity={0.4} />
            <stop offset="100%" stopColor={resolved} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={resolved} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
