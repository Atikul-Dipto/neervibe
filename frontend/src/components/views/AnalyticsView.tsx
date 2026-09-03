"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAnalyticsOverview } from "@/hooks/useAnalyticsOverview";
import { StatCard, StatSection } from "./StatCard";
import { Card } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { StatCardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import type { AnalyticsOverview, HubVolume } from "@/types/domain";

// Package-status colors — the same Tailwind hexes already used for status
// pills elsewhere in the app (PackagesView/VehiclesView tone maps), reused
// here for brand consistency, validated for >=3:1 contrast against the
// nv-950 chart surface via the dataviz skill's validator.
const STATUS_CHART_COLORS = {
  inTransit: "#2dd4bf", // teal-400 — active/neutral
  delivered: "#34d399", // emerald-400 — good
  delayed: "#fbbf24", // amber-400 — warning
  failed: "#fb7185", // rose-400 — critical
  returns: "#94a3b8", // slate-400 — neutral/exception
};

const CHART_TOOLTIP_STYLE = {
  background: "#0a2224",
  border: "1px solid #123338",
  borderRadius: 8,
  fontSize: 12,
  color: "#f4f4f5",
};

function statusDistribution(network: AnalyticsOverview["network"]) {
  return [
    { name: "In Transit", value: network.in_transit, color: STATUS_CHART_COLORS.inTransit },
    { name: "Delivered", value: network.delivered, color: STATUS_CHART_COLORS.delivered },
    { name: "Delayed", value: network.delayed, color: STATUS_CHART_COLORS.delayed },
    { name: "Failed", value: network.failed_deliveries, color: STATUS_CHART_COLORS.failed },
    { name: "Returns", value: network.returns, color: STATUS_CHART_COLORS.returns },
  ];
}

export function AnalyticsView() {
  const { data, loading, error } = useAnalyticsOverview();

  const columns: TableColumn<HubVolume>[] = [
    { header: "Hub", cell: (h) => <span className="text-zinc-300">{h.node_name}</span> },
    { header: "Code", cell: (h) => <span className="font-mono text-zinc-400">{h.node_code}</span> },
    { header: "Current Load", cell: (h) => <span className="tabular-nums text-zinc-400">{h.current_load.toLocaleString()}</span> },
    { header: "Capacity", cell: (h) => <span className="tabular-nums text-zinc-400">{h.capacity.toLocaleString()}</span> },
    {
      header: "Utilization",
      cell: (h) => (
        <span className="tabular-nums text-zinc-400">
          {h.capacity > 0 ? `${((h.current_load / h.capacity) * 100).toFixed(1)}%` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-zinc-100">Analytics</h1>

      {loading && (
        <StatSection title="Network Overview">
          {Array.from({ length: 8 }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </StatSection>
      )}
      {error && <ErrorState message={error} />}

      {data && (
        <>
          <StatSection title="Network Overview">
            <StatCard label="Total Packages" value={data.network.total_packages.toLocaleString()} />
            <StatCard label="In Transit" value={data.network.in_transit.toLocaleString()} tone="warn" />
            <StatCard label="Delivered" value={data.network.delivered.toLocaleString()} tone="good" />
            <StatCard label="Delayed" value={data.network.delayed.toLocaleString()} tone={data.network.delayed > 0 ? "bad" : "default"} />
            <StatCard label="Failed Deliveries" value={data.network.failed_deliveries.toLocaleString()} tone="bad" />
            <StatCard label="Returns" value={data.network.returns.toLocaleString()} />
            <StatCard label="Active Vehicles" value={data.network.active_vehicles.toLocaleString()} />
            <StatCard label="Active Riders" value={data.network.active_riders.toLocaleString()} />
            <StatCard label="Active Routes" value={data.network.active_routes.toLocaleString()} />
            <StatCard label="Network Utilization" value={`${data.network.network_utilization_pct.toFixed(1)}%`} />
          </StatSection>

          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Package Status Distribution
            </h2>
            <Card className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={statusDistribution(data.network)}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: "#f4f4f5" }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {statusDistribution(data.network).map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </section>

          <StatSection title="Network Metrics">
            <StatCard label="Active Nodes" value={data.network_metrics.active_nodes.toLocaleString()} />
            <StatCard
              label="Congested Routes"
              value={data.network_metrics.congested_routes.toLocaleString()}
              tone={data.network_metrics.congested_routes > 0 ? "warn" : "default"}
            />
            <StatCard
              label="High-Risk Routes"
              value={data.network_metrics.high_risk_routes.toLocaleString()}
              tone={data.network_metrics.high_risk_routes > 0 ? "bad" : "default"}
            />
            <StatCard label="Throughput (24h)" value={data.network_metrics.network_throughput_24h.toLocaleString()} />
          </StatSection>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Highest-Volume Hubs
            </h2>

            {data.network_metrics.highest_volume_hubs.length > 0 && (
              <Card className="mb-3 p-4">
                <ResponsiveContainer width="100%" height={Math.max(120, data.network_metrics.highest_volume_hubs.length * 32)}>
                  <BarChart
                    data={data.network_metrics.highest_volume_hubs}
                    layout="vertical"
                    margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="node_code"
                      width={80}
                      tick={{ fill: "#a1a1aa", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: "#f4f4f5" }}
                      formatter={(value) => (typeof value === "number" ? value.toLocaleString() : value)}
                    />
                    <Bar dataKey="current_load" fill="#2dd4bf" radius={[0, 4, 4, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            <Table
              columns={columns}
              rows={data.network_metrics.highest_volume_hubs}
              rowKey={(h) => h.node_id}
              emptyMessage="No hub volume data yet."
            />
          </section>
        </>
      )}
    </div>
  );
}
