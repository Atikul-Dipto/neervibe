"use client";

import { useEffect, useMemo } from "react";
import { Info } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { StatusPill, genericStatusTone } from "@/components/ui/StatusPill";
import { Progress, utilizationTone } from "@/components/ui/primitives";
import { ChartCard } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { useFilterStore, effectiveLists } from "@/data/filters";
import { inferVehicleLeg } from "@/components/map/geo";
import { formatMinutes, formatPct, formatRelative, humanize } from "@/data/format";
import type { Vehicle, VehicleLiveUpdate } from "@/types/domain";

interface FleetRow {
  v: Vehicle;
  live: VehicleLiveUpdate | undefined;
  status: string;
  driver: string | null;
  driverId: string | null;
  load: number;
  weight: number;
  utilization: number;
  nextStop: string | null;
  eta: number | null;
  speed: number;
  updatedAt: string;
}

export default function FleetPage() {
  return (
    <DataGate>
      <Fleet />
    </DataGate>
  );
}

function Fleet() {
  const { derived, filters, cross } = usePageData();
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const liveVehicles = useControlTowerStore((s) => s.vehicles);
  const setLayer = useControlTowerStore((s) => s.setLayer);
  const clearAll = useFilterStore((s) => s.clearAll);
  const lists = effectiveLists(filters, cross);

  // Fleet view: vehicles front and centre, riders off.
  useEffect(() => {
    setLayer("riders", false);
    setLayer("routes", true);
    return () => setLayer("riders", true);
  }, [setLayer]);

  const rows = useMemo<FleetRow[]>(() => {
    return derived.vehicles
      .filter((v) => !lists.vehicles.length || lists.vehicles.includes(v.id))
      .map((v) => {
        const live = liveVehicles.get(v.id);
        const driver = derived.riders.find((r) => r.rider.vehicle_id === v.id) ?? null;
        const load = derived.shipments.filter((s) => s.isActive && s.pkg.assigned_vehicle_id === v.id);
        const weight = load.reduce((sum, s) => sum + s.pkg.package_weight, 0);
        const leg = live ? inferVehicleLeg({ lat: live.latitude, lon: live.longitude, heading: live.heading, speed: live.speed, status: live.status }, live.current_node_id ?? v.current_node_id, derived.routes, derived.nodesById) : null;
        const dest = live?.destination_node_id ? derived.nodesById.get(live.destination_node_id) : leg?.dest;
        const node = derived.nodesById.get(live?.current_node_id ?? v.current_node_id ?? "");
        return {
          v,
          live,
          status: live?.status ?? v.status,
          driver: driver?.name ?? null,
          driverId: driver?.id ?? null,
          load: load.length,
          weight,
          utilization: v.capacity ? weight / v.capacity : 0,
          nextStop: dest?.node_name ?? null,
          eta: leg?.etaMinutes ?? null,
          speed: live?.speed ?? v.speed,
          updatedAt: live?.timestamp ?? v.updated_at,
          city: node?.city,
        } as FleetRow & { city?: string };
      })
      .filter((r) => !lists.cities.length || (r as FleetRow & { city?: string }).city == null || lists.cities.includes((r as FleetRow & { city?: string }).city!));
  }, [derived, liveVehicles, lists.vehicles, lists.cities]);

  const enRoute = rows.filter((r) => r.status === "EN_ROUTE").length;
  const idle = rows.filter((r) => r.status === "IDLE").length;
  const down = rows.filter((r) => r.status === "MAINTENANCE" || r.status === "OFFLINE").length;
  const avgUtil = rows.length ? (rows.reduce((s, r) => s + r.utilization, 0) / rows.length) * 100 : 0;
  const avgSpeed = rows.filter((r) => r.status === "EN_ROUTE").reduce((s, r, _, a) => s + r.speed / a.length, 0);
  const byType = new Map<string, number>();
  for (const r of rows) byType.set(r.v.vehicle_type, (byType.get(r.v.vehicle_type) ?? 0) + 1);

  const columns = useMemo<DataColumn<FleetRow>[]>(
    () => [
      { key: "reg", header: "Registration", locked: true, cell: (r) => <span className="font-mono text-ink-900">{r.v.registration_number}</span>, value: (r) => r.v.registration_number },
      { key: "type", header: "Type", cell: (r) => <span className="text-ink-600">{humanize(r.v.vehicle_type)}</span>, value: (r) => r.v.vehicle_type },
      { key: "status", header: "Status", cell: (r) => <StatusPill tone={genericStatusTone(r.status)} size="xs" withDot>{humanize(r.status)}</StatusPill>, value: (r) => r.status },
      { key: "driver", header: "Driver", cell: (r) => <span className="text-ink-600">{r.driver ?? "—"}</span>, value: (r) => r.driver ?? "" },
      { key: "speed", header: "Speed", align: "right", cell: (r) => <span className="text-ink-600">{r.speed.toFixed(0)} km/h</span>, value: (r) => r.speed },
      {
        key: "load",
        header: "Load",
        cell: (r) => (
          <div className="min-w-24">
            <div className="flex justify-between text-[10px] text-ink-500"><span>{r.load} parcels</span><span>{Math.round(r.utilization * 100)}%</span></div>
            <Progress value={r.utilization} tone={utilizationTone(r.utilization)} label="Load" />
          </div>
        ),
        value: (r) => r.utilization,
      },
      { key: "next", header: "Next stop", cell: (r) => <span className="text-ink-600">{r.nextStop ?? "—"}{r.eta != null && <span className="text-ink-500"> · {formatMinutes(r.eta)}</span>}</span>, value: (r) => r.nextStop ?? "" },
      { key: "capacity", header: "Capacity", align: "right", defaultHidden: true, cell: (r) => <span className="text-ink-600">{r.v.capacity.toFixed(0)} kg</span>, value: (r) => r.v.capacity },
      { key: "updated", header: "Last update", cell: (r) => <span className="text-ink-500">{formatRelative(r.updatedAt)}</span>, value: (r) => Date.parse(r.updatedAt) },
    ],
    [],
  );

  return (
    <Page>
      <PageHeader title="Fleet" description="Vehicles and line-haul transport: live positions, load, drivers and next stops." />
      <KpiGrid>
        <KpiCard label="Vehicles" value={rows.length} />
        <KpiCard label="En route" value={enRoute} tone="accent" />
        <KpiCard label="Idle" value={idle} tone={idle > rows.length / 2 ? "warning" : "neutral"} />
        <KpiCard label="Down" value={down} tone={down > 0 ? "danger" : "good"} sub="maintenance / offline" />
        <KpiCard label="Avg load" value={formatPct(avgUtil, 0)} tone={avgUtil < 30 ? "warning" : "good"} sub="of weight capacity" />
        <KpiCard label="Avg speed" value={`${avgSpeed.toFixed(0)} km/h`} sub="vehicles moving" />
        <KpiCard label="Live feed" value={liveVehicles.size} sub="positions in the last tick" tone={liveVehicles.size > 0 ? "good" : "warning"} />
        <KpiCard label="With driver" value={rows.filter((r) => r.driver).length} sub={`of ${rows.length}`} />
      </KpiGrid>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_420px]">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.v.id} onRowClick={(r) => open("vehicle", r.v.id)} activeKey={drawerItem?.kind === "vehicle" ? drawerItem.id : null} initialSort={{ key: "status", dir: "asc" }} exportName="fleet" emptyWhat="vehicles" onClearFilters={clearAll} dense />
        <div className="space-y-3">
          <Card className="relative h-72 overflow-hidden">
            <MapViewLoader />
          </Card>
          <ChartCard title="Fleet mix" subtitle="Vehicles by type" empty={rows.length === 0}>
            <DonutChart slices={[...byType.entries()].map(([t, n], i) => ({ key: t, label: humanize(t), value: n, color: ["#22d3ee", "#60a5fa", "#a78bfa", "#34d399", "#fbbf24"][i % 5] }))} centerValue={String(rows.length)} centerLabel="vehicles" height={130} />
          </ChartCard>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <ChartCard title="Utilisation signals" subtitle="Rule-based: idle vehicles with cargo nearby, overloaded vehicles, down vehicles" empty={rows.length === 0}>
          <BarList
            rows={[...rows]
              .sort((a, b) => b.utilization - a.utilization)
              .slice(0, 10)
              .map((r) => ({ key: r.v.id, label: r.v.registration_number, value: r.utilization * 100, display: `${Math.round(r.utilization * 100)}%`, secondary: `${humanize(r.status)} · ${r.load} parcels`, color: r.utilization > 0.9 ? "#f87171" : r.utilization < 0.2 ? "#fbbf24" : "#22d3ee" }))}
            max={100}
            onClick={(k) => open("vehicle", k)}
          />
        </ChartCard>
        <Card className="p-4 text-xs text-ink-600">
          <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
            <Info className="h-3.5 w-3.5 text-cyan-300" /> Maintenance & fuel
          </div>
          <p>
            Vehicle telematics (odometer, fuel level, engine hours) are not yet ingested by the platform, so maintenance prediction and fuel anomaly detection are not shown rather than estimated. The data model already reserves
            them; once a telematics feed is connected the same rules used for SLA risk apply here.
          </p>
          <p className="mt-2">
            What is real today: live position and speed every 3 seconds, load from assigned parcels, driver assignment, and status flags ({down} vehicle{down === 1 ? "" : "s"} currently down).
          </p>
        </Card>
      </div>
    </Page>
  );
}
