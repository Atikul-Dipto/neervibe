"use client";

import { useAnalyticsOverview } from "@/hooks/useAnalyticsOverview";
import { StatCard, StatSection } from "./StatCard";

export function AnalyticsView() {
  const { data, loading, error } = useAnalyticsOverview();

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-slate-100">Analytics</h1>

      {loading && <div className="text-sm text-slate-500">Loading network analytics…</div>}
      {error && <div className="text-sm text-rose-400">{error}</div>}

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
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Highest-Volume Hubs
            </h2>
            <div className="overflow-x-auto rounded-lg border border-nv-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-nv-900 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Hub</th>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Current Load</th>
                    <th className="px-4 py-2.5">Capacity</th>
                    <th className="px-4 py-2.5">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nv-800">
                  {data.network_metrics.highest_volume_hubs.map((h) => (
                    <tr key={h.node_id}>
                      <td className="px-4 py-2.5 text-slate-300">{h.node_name}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-400">{h.node_code}</td>
                      <td className="px-4 py-2.5 text-slate-400">{h.current_load.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-400">{h.capacity.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {h.capacity > 0 ? `${((h.current_load / h.capacity) * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  {data.network_metrics.highest_volume_hubs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        No hub volume data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
