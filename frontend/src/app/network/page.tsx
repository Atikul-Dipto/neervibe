"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard } from "@/components/kpi/KpiCard";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { Tabs } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { BarList } from "@/components/charts/BarList";
import { useOpenDrawer } from "@/data/hooks";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { FINANCE } from "@/config/finance";
import { haversineKm } from "@/components/map/geo";
import { formatBDT, formatNumber, formatPct } from "@/data/format";

type Panel = "flows" | "od" | "capacity" | "bottlenecks" | "planning";

export default function NetworkPage() {
  return (
    <DataGate>
      <Network />
    </DataGate>
  );
}

function Network() {
  const { derived, shipments } = usePageData();
  const open = useOpenDrawer();
  const setLayer = useControlTowerStore((s) => s.setLayer);
  const layers = useControlTowerStore((s) => s.layers);
  const [panel, setPanel] = useState<Panel>("flows");

  useEffect(() => {
    setLayer("routes", true);
    setLayer("vehicles", false);
    setLayer("riders", false);
    return () => {
      setLayer("vehicles", true);
      setLayer("riders", true);
      setLayer("heatmap", false);
    };
  }, [setLayer]);

  const cityOf = (id: string) => derived.nodesById.get(id)?.city ?? "?";
  // Corridor demand = active shipments travelling between the two cities.
  const flows = useMemo(() => {
    const od = new Map<string, number>();
    for (const s of shipments) if (s.isActive && s.origin) od.set(`${s.origin.city}|${s.city}`, (od.get(`${s.origin.city}|${s.city}`) ?? 0) + 1);
    const seen = new Set<string>();
    return [...derived.routes]
      .map((r) => ({ r, demand: od.get(`${cityOf(r.source_node_id)}|${cityOf(r.destination_node_id)}`) ?? 0 }))
      .filter(({ r }) => cityOf(r.source_node_id) !== cityOf(r.destination_node_id))
      .sort((a, b) => b.demand - a.demand)
      .filter(({ r }) => { const k = `${cityOf(r.source_node_id)}|${cityOf(r.destination_node_id)}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 10)
      .map(({ r, demand }) => ({ key: r.id, label: `${cityOf(r.source_node_id)} → ${cityOf(r.destination_node_id)}`, value: demand, secondary: `${r.distance_km.toFixed(0)} km · ${Math.round(r.congestion_level * 100)}%`, color: r.congestion_level >= 0.8 ? "danger" : r.congestion_level >= 0.6 ? "warning" : "accent" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived.routes, shipments]);

  const od = useMemo(() => {
    const cities = [...new Set(shipments.flatMap((s) => [s.origin?.city ?? "?", s.city]))].sort();
    const m = new Map<string, number>();
    for (const s of shipments) m.set(`${s.origin?.city ?? "?"}|${s.city}`, (m.get(`${s.origin?.city ?? "?"}|${s.city}`) ?? 0) + 1);
    const max = Math.max(1, ...m.values());
    return { cities, get: (a: string, b: string) => m.get(`${a}|${b}`) ?? 0, max };
  }, [shipments]);

  const bottlenecks = useMemo(
    () =>
      [...derived.routes]
        .filter((r) => r.congestion_level >= 0.5 || r.route_status !== "ACTIVE")
        .sort((a, b) => b.congestion_level - a.congestion_level)
        .map((r) => ({ key: r.id, label: `${cityOf(r.source_node_id)} → ${cityOf(r.destination_node_id)}`, value: r.congestion_level * 100, display: `${Math.round(r.congestion_level * 100)}%`, secondary: `+${r.current_travel_time - r.estimated_travel_time} min · ${r.active_package_count} parcels`, color: r.congestion_level >= 0.8 ? "danger" : "warning" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derived.routes],
  );

  const cost = useMemo(
    () =>
      [...derived.routes]
        .map((r) => ({ r, cost: r.distance_km * FINANCE.linehaulPerKm * Math.max(1, r.active_package_count) }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10)
        .map(({ r, cost }) => ({ key: r.id, label: `${cityOf(r.source_node_id)} → ${cityOf(r.destination_node_id)}`, value: cost, display: formatBDT(cost, true), secondary: `${formatBDT(r.distance_km * FINANCE.linehaulPerKm)}/parcel`, color: "ai" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derived.routes],
  );

  // New-hub recommendation: districts with the most active demand and no
  // hub within 25 km of their demand centroid.
  const hubGaps = useMemo(() => {
    const byDistrict = new Map<string, { n: number; lat: number; lon: number; city: string }>();
    for (const s of derived.shipments) {
      if (!s.isActive || !s.district || !s.destination) continue;
      const d = byDistrict.get(s.district) ?? { n: 0, lat: 0, lon: 0, city: s.city };
      d.n += 1;
      d.lat += s.destination.latitude;
      d.lon += s.destination.longitude;
      byDistrict.set(s.district, d);
    }
    return [...byDistrict.entries()]
      .map(([district, d]) => {
        const c = { lat: d.lat / d.n, lon: d.lon / d.n };
        const nearest = Math.min(...derived.hubs.map((h) => haversineKm(c, { lat: h.node.latitude, lon: h.node.longitude })), Infinity);
        return { district, city: d.city, n: d.n, nearestKm: nearest };
      })
      .filter((x) => x.nearestKm > 25)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  }, [derived]);

  const reroutes = derived.routes.filter((r) => r.estimated_travel_time / Math.max(r.current_travel_time, 1) < 0.7);
  const avgCongestion = derived.routes.length ? (derived.routes.reduce((s, r) => s + r.congestion_level, 0) / derived.routes.length) * 100 : 0;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-nv-800 bg-nv-950/60">
        <div className="grid grid-cols-2 gap-1.5 border-b border-nv-800 p-2">
          <KpiCard label="Hubs" value={derived.hubs.length} />
          <KpiCard label="Corridors" value={derived.routes.length} />
          <KpiCard label="Avg congestion" value={formatPct(avgCongestion, 0)} tone={avgCongestion > 50 ? "warning" : "good"} />
          <KpiCard label="Bottlenecks" value={bottlenecks.length} tone={bottlenecks.length ? "danger" : "good"} />
        </div>
        <div className="border-b border-nv-800 p-2">
          <Tabs value={panel} onChange={setPanel} className="flex-wrap" tabs={[{ key: "flows", label: "Flows" }, { key: "od", label: "O-D matrix" }, { key: "capacity", label: "Capacity" }, { key: "bottlenecks", label: "Bottlenecks" }, { key: "planning", label: "Planning" }]} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {panel === "flows" && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Shipment flows · active shipments between cities</div>
              <BarList rows={flows} onClick={(k) => open("route", k)} />
              <div className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Transportation cost · modelled</div>
              <BarList rows={cost} onClick={(k) => open("route", k)} />
              <div className="mt-3 flex items-center justify-between rounded border border-nv-800 bg-nv-900 px-2 py-1.5 text-xs">
                <span className="text-ink-700">Delivery density layer</span>
                <Button size="xs" variant={layers.heatmap ? "primary" : "secondary"} onClick={() => setLayer("heatmap", !layers.heatmap)}>
                  {layers.heatmap ? "On" : "Show"}
                </Button>
              </div>
            </>
          )}
          {panel === "od" && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Origin → destination · shipments in window</div>
              <div className="overflow-x-auto">
                <table className="text-[10px]">
                  <thead>
                    <tr>
                      <th className="px-1 py-0.5 text-left text-ink-500">from \ to</th>
                      {od.cities.map((c) => (
                        <th key={c} className="px-1 py-0.5 text-ink-500" style={{ writingMode: "vertical-rl" }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {od.cities.map((a) => (
                      <tr key={a}>
                        <td className="px-1 py-0.5 text-ink-700">{a}</td>
                        {od.cities.map((b) => {
                          const n = od.get(a, b);
                          return (
                            <td key={b} className="px-0.5 py-0.5 text-center tabular-nums" style={{ backgroundColor: n ? `rgba(34,211,238,${0.12 + (n / od.max) * 0.6})` : "transparent" }}>
                              <span className={n ? "text-ink-900" : "text-ink-400"}>{n || "·"}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {panel === "capacity" && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Hub capacity · click for detail</div>
              <BarList rows={[...derived.hubs].sort((a, b) => b.utilization - a.utilization).map((h) => ({ key: h.id, label: h.name, value: h.utilization * 100, display: `${Math.round(h.utilization * 100)}%`, secondary: `${formatNumber(h.load)} / ${formatNumber(h.capacity)}`, color: h.health === "critical" ? "danger" : h.health === "warning" ? "warning" : "good" }))} max={100} onClick={(k) => open("hub", k)} />
            </>
          )}
          {panel === "bottlenecks" && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Network bottlenecks · congestion ≥ 50%</div>
              {bottlenecks.length === 0 ? <div className="text-xs text-ink-500">No congested corridors right now.</div> : <BarList rows={bottlenecks} max={100} onClick={(k) => open("route", k)} />}
            </>
          )}
          {panel === "planning" && (
            <div className="space-y-4 text-xs">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">New hub recommendation</div>
                {hubGaps.length === 0 ? (
                  <div className="text-ink-500">Every district with active demand has a hub within 25 km.</div>
                ) : (
                  hubGaps.map((g) => (
                    <div key={g.district} className="mb-1.5 rounded border border-violet-500/30 bg-violet-500/5 p-2">
                      <div className="text-ink-900">{g.district} ({g.city})</div>
                      <div className="text-ink-600">{g.n} active parcels; nearest hub {g.nearestKm.toFixed(0)} km away. A delivery hub here would cut last-mile distance for {formatPct((g.n / Math.max(1, derived.shipments.filter((s) => s.isActive).length)) * 100, 0)} of active volume.</div>
                    </div>
                  ))
                )}
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Network optimisation</div>
                {reroutes.length === 0 ? (
                  <div className="text-ink-500">All corridors are within 30% of planned travel time.</div>
                ) : (
                  reroutes.map((r) => (
                    <button key={r.id} onClick={() => open("route", r.id)} className="mb-1 block w-full rounded border border-nv-800 bg-nv-900 p-2 text-left hover:bg-nv-850">
                      <div className="text-ink-900">{cityOf(r.source_node_id)} → {cityOf(r.destination_node_id)}</div>
                      <div className="text-ink-600">Running at {formatPct((r.estimated_travel_time / Math.max(r.current_travel_time, 1)) * 100, 0)} efficiency; route via the nearest regional hub or hold non-urgent dispatches.</div>
                    </button>
                  ))
                )}
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Route simulation & digital twin</div>
                <p className="text-ink-600">The live simulator is the network&apos;s digital twin: every vehicle, parcel and corridor on this map is state the backend advances every 3 seconds. Test interventions before making them.</p>
                <div className="mt-1.5 flex gap-1.5">
                  <Link href="/ai?tab=simulate"><Button size="xs" variant="ai">Open simulator</Button></Link>
                  <Link href="/control-tower"><Button size="xs" variant="secondary">Control tower</Button></Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className={clsx("relative min-w-0 flex-1")}>
        <MapViewLoader />
      </div>
    </div>
  );
}
