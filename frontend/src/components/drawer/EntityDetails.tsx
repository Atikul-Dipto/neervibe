"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, MapPin } from "lucide-react";
import { useDerived } from "@/data/provider";
import { useOpsStore } from "@/data/ops";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { ROLE_BY_KEY } from "@/config/roles";
import { COUNTRY } from "@/config/country";
import { assignDriver, errorMessage } from "@/data/actions";
import { filtersToParams, useFilterStore } from "@/data/filters";
import { regionContains, inferVehicleLeg } from "@/components/map/geo";
import { formatBDT, formatMinutes, formatNumber, formatPct, formatRelative, humanize } from "@/data/format";
import { recommendForHub, recommendForRider } from "@/ai/recommend";
import { StatusPill, genericStatusTone } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Progress, Stat, utilizationTone } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/States";
import { Sparkline } from "@/components/charts/Sparkline";
import { DrawerSection, EntityLink, KV, NotFound, RecommendationCard, ShipmentList } from "./shared";
import { nodeTypeColors } from "@/components/map/nodeStyle";
import { roadRemainingFrom, useRoads } from "@/components/map/roads";

function useShipmentsLink() {
  const router = useRouter();
  const filters = useFilterStore((s) => s.filters);
  return (overrides: Partial<typeof filters>) => router.push(`/shipments?${filtersToParams({ ...filters, ...overrides }).toString()}`);
}

function ShowOnMap({ onClick, label = "Show on map" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 rounded border border-nv-700 px-2 py-1 text-[11px] text-ink-700 hover:bg-nv-850">
      <MapPin className="h-3 w-3" /> {label}
    </button>
  );
}

// --- Hub ---------------------------------------------------------------------

export function HubDetail({ id }: { id: string }) {
  const derived = useDerived();
  const router = useRouter();
  const toShipments = useShipmentsLink();
  const h = derived.hubsById.get(id);
  const rec = useMemo(() => (h ? recommendForHub(h) : null), [h]);
  if (!h) return <NodeDetail id={id} />;
  const aging = { fresh: 0, day: 0, old: 0 };
  for (const s of h.pending) {
    const hrs = (derived.now - s.updatedAt) / 3600e3;
    if (hrs < 6) aging.fresh += 1;
    else if (hrs < 24) aging.day += 1;
    else aging.old += 1;
  }
  const ridersHere = derived.riders.filter((r) => r.baseNode?.id === h.id);
  const zones = new Map<string, { total: number; delivered: number }>();
  for (const s of derived.shipments) {
    if (s.city !== h.city || !s.district) continue;
    const z = zones.get(s.district) ?? { total: 0, delivered: 0 };
    z.total += 1;
    if (s.status === "DELIVERED") z.delivered += 1;
    zones.set(s.district, z);
  }
  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-ink-900">{h.name}</div>
            <div className="text-[11px] text-ink-500">
              {humanize(h.node.node_type)} · {h.city}
              {h.division && ` · ${h.division}`} · {h.node.node_code}
            </div>
          </div>
          <ShowOnMap onClick={() => router.push("/control-tower")} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill tone={genericStatusTone(h.node.operating_status)} withDot>
            {humanize(h.node.operating_status)}
          </StatusPill>
          <StatusPill tone={h.health === "critical" ? "danger" : h.health === "warning" ? "warning" : "good"}>{h.health === "ok" ? "Healthy" : humanize(h.health)}</StatusPill>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-ink-500">
            <span>Capacity utilisation</span>
            <span className="tabular-nums text-ink-700">
              {formatNumber(h.load)} / {formatNumber(h.capacity)} · {Math.round(h.utilization * 100)}%
            </span>
          </div>
          <Progress value={h.utilization} tone={utilizationTone(h.utilization)} label="Utilisation" />
        </div>
      </div>
      <DrawerSection title="Throughput">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Inbound" value={h.inbound.length} hint="on next arrivals" />
          <Stat label="Pending" value={h.pending.length} hint="waiting here" tone={h.pending.length > 10 ? "warning" : undefined} />
          <Stat label="Outbound" value={h.outbound.length} hint="dispatched" />
          <Stat label="Backlog age" value={h.backlogHours == null ? "—" : `${h.backlogHours.toFixed(1)}h`} />
          <Stat label="Processing" value={formatMinutes(h.processingMin)} hint="arrive → dispatch" />
          <Stat label="SLA risk" value={h.slaRisk} tone={h.slaRisk > 0 ? "danger" : "good"} />
        </div>
      </DrawerSection>
      <DrawerSection title="Recommendation">
        <RecommendationCard rec={rec} />
      </DrawerSection>
      <DrawerSection title="Shipment aging">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="< 6h" value={aging.fresh} tone="good" />
          <Stat label="6–24h" value={aging.day} tone={aging.day > 0 ? "warning" : undefined} />
          <Stat label="> 24h" value={aging.old} tone={aging.old > 0 ? "danger" : undefined} />
        </div>
      </DrawerSection>
      <DrawerSection title={`Pending parcels · ${h.pending.length}`} right={<button onClick={() => toShipments({ hubs: [h.id] })} className="text-[11px] text-accent-700 hover:underline">All shipments</button>}>
        <ShipmentList shipments={[...h.pending].sort((a, b) => a.updatedAt - b.updatedAt)} emptyMessage="Nothing waiting at this hub." />
      </DrawerSection>
      <DrawerSection title={`Zone performance · ${h.city}`}>
        {zones.size === 0 ? (
          <div className="text-xs text-ink-500">No zone data yet.</div>
        ) : (
          <div className="space-y-1">
            {[...zones.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .slice(0, 6)
              .map(([zone, z]) => (
                <div key={zone} className="flex items-center justify-between text-xs">
                  <span className="text-ink-700">{zone}</span>
                  <span className="tabular-nums text-ink-500">
                    {z.total} · <span className="text-ink-900">{formatPct(z.total ? (z.delivered / z.total) * 100 : null, 0)}</span> delivered
                  </span>
                </div>
              ))}
          </div>
        )}
      </DrawerSection>
      <DrawerSection title={`Riders based here · ${ridersHere.length}`}>
        {ridersHere.length === 0 ? (
          <div className="text-xs text-ink-500">No riders are based at this facility.</div>
        ) : (
          <div className="space-y-1">
            {ridersHere.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <EntityLink kind="rider" id={r.id}>{r.name}</EntityLink>
                <span className="text-ink-500">
                  {humanize(r.rider.status)} · {r.active.length} active
                </span>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>
    </div>
  );
}

// --- Generic facility (merchant centre, customer zone, pickup point) -----------

export function NodeDetail({ id }: { id: string }) {
  const derived = useDerived();
  const router = useRouter();
  const node = derived.nodesById.get(id);
  if (!node) return <NotFound what="facility" />;
  if (derived.hubsById.has(id)) return <HubDetail id={id} />;
  const from = derived.shipments.filter((s) => s.pkg.source_node_id === id);
  const to = derived.shipments.filter((s) => s.pkg.destination_node_id === id);
  const region = derived.regionOfNode(id);
  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-ink-900">{node.node_name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: nodeTypeColors()[node.node_type] }} />
              {humanize(node.node_type)} · {node.city}
              {region.district && ` · ${region.district}`}
            </div>
          </div>
          <ShowOnMap onClick={() => router.push("/control-tower")} />
        </div>
        <div className="mt-2">
          <StatusPill tone={genericStatusTone(node.operating_status)} withDot>
            {humanize(node.operating_status)}
          </StatusPill>
        </div>
      </div>
      <DrawerSection title="Details">
        <KV items={[{ k: "Code", v: node.node_code }, { k: "Address", v: node.address ?? "—" }, { k: "Capacity", v: formatNumber(node.capacity) }, { k: "Coordinates", v: `${node.latitude.toFixed(3)}, ${node.longitude.toFixed(3)}` }]} />
      </DrawerSection>
      <DrawerSection title={`Shipments from here · ${from.length}`}>
        <ShipmentList shipments={[...from].sort((a, b) => b.updatedAt - a.updatedAt)} max={6} />
      </DrawerSection>
      <DrawerSection title={`Shipments to here · ${to.length}`}>
        <ShipmentList shipments={[...to].sort((a, b) => b.updatedAt - a.updatedAt)} max={6} />
      </DrawerSection>
    </div>
  );
}

// --- Rider -------------------------------------------------------------------

export function RiderDetail({ id }: { id: string }) {
  const derived = useDerived();
  const router = useRouter();
  const role = useOpsStore((s) => s.role);
  const toShipments = useShipmentsLink();
  const r = derived.ridersById.get(id);
  const [vehicleId, setVehicleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idleInCity = useMemo(() => (r ? derived.riders.filter((x) => x.city === r.city && x.workload === "idle") : []), [derived.riders, r]);
  const rec = useMemo(() => (r ? recommendForRider(r, idleInCity) : null), [r, idleInCity]);
  if (!r) return <NotFound what="rider" />;
  const days = 14;
  const trend = Array.from({ length: days }, (_, i) => {
    const dayStart = derived.now - (days - 1 - i) * 86400e3;
    const key = new Date(dayStart).toISOString().slice(0, 10);
    return r.attempts.filter((a) => a.attempted_at.slice(0, 10) === key).length;
  });
  const freeVehicles = derived.vehicles.filter((v) => !derived.riders.some((x) => x.rider.vehicle_id === v.id) || v.id === r.rider.vehicle_id);
  const canAct = ROLE_BY_KEY[role].canAct;

  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-ink-900">{r.name}</div>
            <div className="text-[11px] text-ink-500">
              {r.rider.phone} · based at {r.baseNode ? <EntityLink kind="hub" id={r.baseNode.id}>{r.baseNode.node_name}</EntityLink> : "—"}
            </div>
          </div>
          <ShowOnMap onClick={() => router.push("/control-tower")} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill tone={genericStatusTone(r.rider.status)} withDot>
            {humanize(r.rider.status)}
          </StatusPill>
          <StatusPill tone={r.workload === "overloaded" ? "danger" : r.workload === "idle" ? "warning" : "neutral"}>{humanize(r.workload)}</StatusPill>
          {r.vehicle && <StatusPill tone="info">{r.vehicle.registration_number}</StatusPill>}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--accent-500) ${r.score ?? 0}%, var(--nv-800) 0)` }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-nv-950 text-sm font-semibold tabular-nums text-ink-900">{r.score ?? "—"}</div>
          </div>
          <div className="text-[11px] text-ink-500">
            <div className="text-xs text-ink-900">Performance score</div>
            50% success · 30% first attempt · 20% on time
          </div>
        </div>
      </div>
      <DrawerSection title="Performance">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Deliveries" value={r.deliveries} />
          <Stat label="Success" value={formatPct(r.successRate == null ? null : r.successRate * 100, 0)} tone={r.successRate != null && r.successRate < 0.75 ? "warning" : "good"} />
          <Stat label="First attempt" value={formatPct(r.firstAttemptRate == null ? null : r.firstAttemptRate * 100, 0)} />
          <Stat label="On time" value={formatPct(r.onTimeRate == null ? null : r.onTimeRate * 100, 0)} />
          <Stat label="Avg delivery" value={formatMinutes(r.avgDeliveryMin)} hint="out → delivered" />
          <Stat label="Failed" value={r.failedAttempts} tone={r.failedAttempts > 3 ? "warning" : undefined} />
        </div>
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Attempts per day · 14d</div>
          <Sparkline values={trend} height={36} />
        </div>
      </DrawerSection>
      <DrawerSection title="COD & earnings">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="COD in hand" value={formatBDT(r.codInHand, true)} tone={r.codInHand > 20000 ? "warning" : undefined} />
          <Stat label="COD collected" value={formatBDT(r.codCollected, true)} />
          <Stat label="Earnings" value={formatBDT(r.earnings, true)} hint="modelled" />
        </div>
      </DrawerSection>
      <DrawerSection title="Recommendation">
        <RecommendationCard rec={rec} />
      </DrawerSection>
      <DrawerSection title={`Current route · ${r.active.length} active`} right={<button onClick={() => toShipments({ riders: [r.id] })} className="text-[11px] text-accent-700 hover:underline">All shipments</button>}>
        <ShipmentList shipments={r.active} emptyMessage="Nothing assigned right now." />
      </DrawerSection>
      <DrawerSection title="Vehicle">
        <KV items={[{ k: "Assigned", v: r.vehicle ? <EntityLink kind="vehicle" id={r.vehicle.id}>{r.vehicle.registration_number}</EntityLink> : "None" }, { k: "Type", v: r.vehicle ? humanize(r.vehicle.vehicle_type) : "—" }]} />
        {canAct && (
          <div className="mt-2 flex gap-1.5">
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="flex-1" aria-label="Vehicle">
              <option value="">Choose vehicle…</option>
              {freeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration_number} · {humanize(v.vehicle_type)}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              disabled={!vehicleId || busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  const v = derived.vehiclesById.get(vehicleId);
                  await assignDriver(r.rider, vehicleId, v?.registration_number ?? vehicleId);
                  setVehicleId("");
                } catch (e) {
                  setErr(errorMessage(e, "Assignment failed"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Assign"}
            </Button>
          </div>
        )}
        {err && <ErrorState message={err} className="mt-2" />}
      </DrawerSection>
    </div>
  );
}

// --- Vehicle -----------------------------------------------------------------

export function VehicleDetail({ id }: { id: string }) {
  const derived = useDerived();
  const router = useRouter();
  const live = useControlTowerStore((s) => s.vehicles.get(id));
  const selectVehicle = useControlTowerStore((s) => s.selectVehicle);
  const setFollow = useControlTowerStore((s) => s.setFollowVehicle);
  const roads = useRoads();
  const v = derived.vehiclesById.get(id);
  if (!v) return <NotFound what="vehicle" />;
  const driver = derived.riders.find((r) => r.rider.vehicle_id === v.id) ?? null;
  const load = derived.shipments.filter((s) => s.pkg.assigned_vehicle_id === v.id && s.isActive);
  const weight = load.reduce((sum, s) => sum + s.pkg.package_weight, 0);
  const status = live?.status ?? v.status;
  const leg = live
    ? inferVehicleLeg({ lat: live.latitude, lon: live.longitude, heading: live.heading, speed: live.speed, status: live.status }, live.current_node_id ?? v.current_node_id, derived.routes, derived.nodesById, live.destination_node_id)
    : null;
  const dest = live?.destination_node_id ? derived.nodesById.get(live.destination_node_id) : leg?.dest;
  // Distance to go along the road actually being driven, not across country.
  const onRoad =
    leg && live
      ? roadRemainingFrom(
          roads,
          { lat: leg.source.latitude, lon: leg.source.longitude },
          { lat: live.latitude, lon: live.longitude },
          { lat: leg.dest.latitude, lon: leg.dest.longitude },
        )
      : null;
  const remaining = onRoad?.km ?? leg?.remainingKm ?? null;
  const etaMinutes = remaining != null && live && live.speed > 1 ? (remaining / live.speed) * 60 : leg?.etaMinutes ?? null;
  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-sm font-semibold text-ink-900">{v.registration_number}</div>
            <div className="text-[11px] text-ink-500">
              {humanize(v.vehicle_type)} · {v.capacity.toFixed(0)} kg capacity
            </div>
          </div>
          <button
            onClick={() => {
              selectVehicle(v);
              setFollow(true);
              router.push("/control-tower");
            }}
            className="flex items-center gap-1 rounded border border-nv-700 px-2 py-1 text-[11px] text-ink-700 hover:bg-nv-850"
          >
            <LocateFixed className="h-3 w-3" /> Follow
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill tone={genericStatusTone(status)} withDot>
            {humanize(status)}
          </StatusPill>
          {live && <StatusPill tone="accent">{live.speed.toFixed(0)} km/h</StatusPill>}
        </div>
      </div>
      <DrawerSection title="Next stop">
        {dest ? (
          <div>
            <EntityLink kind="hub" id={dest.id} className="text-sm font-semibold">
              {dest.node_name}
            </EntityLink>
            <div className="text-[11px] text-ink-500">
              {remaining != null ? `${remaining.toFixed(1)} km · ${formatMinutes(etaMinutes)}${onRoad && onRoad.variant.name !== "primary" ? " · longer road" : ""}` : dest.city}
            </div>
          </div>
        ) : (
          <div className="text-xs text-ink-500">{status === "EN_ROUTE" ? "Working out the current leg…" : `Stationary · ${humanize(status)}`}</div>
        )}
      </DrawerSection>
      <DrawerSection title="Load">
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-ink-500">
          <span>Utilisation</span>
          <span className="tabular-nums text-ink-700">
            {weight.toFixed(0)} / {v.capacity.toFixed(0)} kg · {load.length} parcels
          </span>
        </div>
        <Progress value={v.capacity ? weight / v.capacity : 0} tone={utilizationTone(v.capacity ? weight / v.capacity : 0)} label="Load" />
        <div className="mt-2">
          <ShipmentList shipments={load} emptyMessage="No parcels on board." />
        </div>
      </DrawerSection>
      <DrawerSection title="Driver">
        {driver ? (
          <div className="flex items-center justify-between text-xs">
            <EntityLink kind="rider" id={driver.id}>{driver.name}</EntityLink>
            <span className="text-ink-500">
              {humanize(driver.rider.status)} · score {driver.score ?? "—"}
            </span>
          </div>
        ) : (
          <div className="text-xs text-ink-500">No driver assigned. Assign one from a rider&apos;s profile.</div>
        )}
      </DrawerSection>
      <DrawerSection title="Telemetry">
        <KV
          items={[
            { k: "Position", v: live ? `${live.latitude.toFixed(3)}, ${live.longitude.toFixed(3)}` : v.current_latitude != null ? `${v.current_latitude.toFixed(3)}, ${v.current_longitude?.toFixed(3)}` : "—" },
            { k: "Heading", v: `${Math.round(live?.heading ?? v.heading)}°` },
            { k: "Last node", v: (live?.current_node_id ?? v.current_node_id) ? derived.nodesById.get(live?.current_node_id ?? v.current_node_id ?? "")?.node_name ?? "—" : "—" },
            { k: "Last update", v: formatRelative(live?.timestamp ?? v.updated_at) },
            { k: "Maintenance", v: status === "MAINTENANCE" ? "In workshop" : "No flag" },
          ]}
        />
      </DrawerSection>
    </div>
  );
}

// --- Merchant ----------------------------------------------------------------

export function MerchantDetail({ id }: { id: string }) {
  const derived = useDerived();
  const toShipments = useShipmentsLink();
  const m = derived.merchantsById.get(id);
  if (!m) return <NotFound what="merchant" />;
  const recent = [...m.shipments].sort((a, b) => b.createdAt - a.createdAt);
  const reasons = new Map<string, number>();
  for (const s of m.shipments) for (const a of s.attempts) if (a.result !== "SUCCESS") reasons.set(a.result, (reasons.get(a.result) ?? 0) + 1);
  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="text-sm font-semibold text-ink-900">{m.name}</div>
        <div className="text-[11px] text-ink-500">
          {m.city ?? "—"} · {m.merchant?.phone ?? ""} {m.merchant?.email ? `· ${m.merchant.email}` : ""}
        </div>
      </div>
      <DrawerSection title="Performance">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Shipments" value={m.total} hint={`${m.active} active`} />
          <Stat label="Delivery rate" value={formatPct(m.deliveryRate == null ? null : m.deliveryRate * 100, 0)} tone={m.deliveryRate != null && m.deliveryRate < 0.85 ? "warning" : "good"} />
          <Stat label="SLA met" value={formatPct(m.slaRate == null ? null : m.slaRate * 100, 0)} />
          <Stat label="Return rate" value={formatPct(m.returnRate == null ? null : m.returnRate * 100, 0)} tone={m.returnRate != null && m.returnRate > 0.08 ? "warning" : undefined} />
          <Stat label="Avg delivery" value={m.avgDeliveryHours == null ? "—" : `${m.avgDeliveryHours.toFixed(0)}h`} />
          <Stat label="Failures" value={m.failed} tone={m.failed > 0 ? "warning" : undefined} />
        </div>
      </DrawerSection>
      <DrawerSection title="COD & billing">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="COD value" value={formatBDT(m.codValue, true)} />
          <Stat label="Collected" value={formatBDT(m.codCollected, true)} tone="good" />
          <Stat label="Pending" value={formatBDT(m.codPending, true)} />
          <Stat label="Delivery revenue" value={formatBDT(m.revenue, true)} hint="modelled" />
        </div>
      </DrawerSection>
      <DrawerSection title="Return & failure reasons">
        {reasons.size === 0 ? (
          <div className="text-xs text-ink-500">No failed attempts recorded.</div>
        ) : (
          <div className="space-y-1 text-xs">
            {[...reasons.entries()].map(([k, n]) => (
              <div key={k} className="flex justify-between">
                <span className="text-ink-700">{humanize(k)}</span>
                <span className="tabular-nums text-ink-900">{n}</span>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>
      <DrawerSection title="Recent shipments" right={<button onClick={() => toShipments({ merchants: [m.id] })} className="text-[11px] text-accent-700 hover:underline">All shipments</button>}>
        <ShipmentList shipments={recent} />
      </DrawerSection>
    </div>
  );
}

// --- Route (network edge) ----------------------------------------------------

export function RouteDetail({ id }: { id: string }) {
  const derived = useDerived();
  const e = derived.routesById.get(id);
  if (!e) return <NotFound what="route" />;
  const src = derived.nodesById.get(e.source_node_id);
  const dst = derived.nodesById.get(e.destination_node_id);
  const on = derived.shipments.filter((s) => s.isActive && s.currentNode?.id === e.source_node_id && (s.status === "DISPATCHED" || s.status === "IN_TRANSIT"));
  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="text-sm font-semibold text-ink-900">
          {src?.city ?? "?"} → {dst?.city ?? "?"}
        </div>
        <div className="text-[11px] text-ink-500">
          {src?.node_name} to {dst?.node_name} · {humanize(e.road_type)}
        </div>
        <div className="mt-2 flex gap-1.5">
          <StatusPill tone={genericStatusTone(e.route_status)} withDot>
            {humanize(e.route_status)}
          </StatusPill>
          <StatusPill tone={e.congestion_level >= 0.8 ? "danger" : e.congestion_level >= 0.6 ? "warning" : "good"}>{Math.round(e.congestion_level * 100)}% congestion</StatusPill>
        </div>
      </div>
      <DrawerSection title="Performance">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Distance" value={`${e.distance_km.toFixed(0)} km`} />
          <Stat label="Planned" value={formatMinutes(e.estimated_travel_time)} />
          <Stat label="Current" value={formatMinutes(e.current_travel_time)} tone={e.current_travel_time > e.estimated_travel_time * 1.3 ? "danger" : undefined} />
          <Stat label="Risk" value={Math.round(e.risk_score * 100)} />
          <Stat label="Parcels" value={e.active_package_count} />
          <Stat label="Efficiency" value={formatPct((e.estimated_travel_time / Math.max(e.current_travel_time, 1)) * 100, 0)} hint="planned ÷ current" />
        </div>
        <div className="mt-2">
          <Progress value={e.congestion_level} tone={e.congestion_level >= 0.8 ? "danger" : e.congestion_level >= 0.6 ? "warning" : "good"} label="Congestion" />
        </div>
      </DrawerSection>
      <DrawerSection title="Endpoints">
        <KV items={[{ k: "From", v: src ? <EntityLink kind="hub" id={src.id}>{src.node_name}</EntityLink> : "—" }, { k: "To", v: dst ? <EntityLink kind="hub" id={dst.id}>{dst.node_name}</EntityLink> : "—" }]} />
      </DrawerSection>
      <DrawerSection title={`Shipments on this corridor · ${on.length}`}>
        <ShipmentList shipments={on} emptyMessage="No parcels currently on this corridor." />
      </DrawerSection>
    </div>
  );
}

// --- Region (division / district) -------------------------------------------

export function RegionDetail({ id }: { id: string }) {
  const derived = useDerived();
  const toShipments = useShipmentsLink();
  const liveVehicles = useControlTowerStore((s) => s.vehicles);
  const feature = derived.regions?.byId.get(id);
  if (!feature) return <NotFound what="area" />;
  const p = feature.properties;
  const inside = (lon: number, lat: number) => regionContains(feature, lon, lat);
  const facilities = derived.nodes.filter((n) => inside(n.longitude, n.latitude));
  const hubs = facilities.filter((n) => derived.hubsById.has(n.id));
  const shipments = derived.shipments.filter((s) => (p.level === "district" ? s.district === p.name : s.division === p.name));
  const activeShipments = shipments.filter((s) => s.isActive);
  const vehicles = [...liveVehicles.values()].filter((v) => inside(v.longitude, v.latitude));
  const riders = derived.riders.filter((r) => r.baseNode && inside(r.baseNode.longitude, r.baseNode.latitude));
  const breached = activeShipments.filter((s) => s.sla === "breached").length;
  const delivered = shipments.filter((s) => s.status === "DELIVERED").length;
  const judged = shipments.filter((s) => s.sla === "met" || s.sla === "missed");
  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="text-sm font-semibold text-ink-900">{p.name}</div>
        <div className="text-[11px] text-ink-500">
          {COUNTRY.levels[p.level].label}
          {p.division && ` · ${p.division} ${COUNTRY.levels.division.label}`}
        </div>
      </div>
      <DrawerSection title="Operations">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Active" value={activeShipments.length} hint="shipments" />
          <Stat label="Breached" value={breached} tone={breached > 0 ? "danger" : "good"} />
          <Stat label="Delivered" value={delivered} />
          <Stat label="SLA met" value={formatPct(judged.length ? (judged.filter((s) => s.sla === "met").length / judged.length) * 100 : null, 0)} />
          <Stat label="Vehicles" value={vehicles.length} hint="inside now" />
          <Stat label="Riders" value={riders.length} hint="based here" />
        </div>
      </DrawerSection>
      <DrawerSection title={`Facilities · ${facilities.length}`} right={<button onClick={() => toShipments(p.level === "district" ? { districts: [p.name] } : { divisions: [p.name] })} className="text-[11px] text-accent-700 hover:underline">Shipments</button>}>
        <div className="space-y-0.5">
          {hubs.map((n) => (
            <div key={n.id} className="flex items-center justify-between text-xs">
              <EntityLink kind="hub" id={n.id}>{n.node_name}</EntityLink>
              <span className="text-ink-500">{Math.round((derived.hubsById.get(n.id)?.utilization ?? 0) * 100)}%</span>
            </div>
          ))}
          {facilities.length > hubs.length && <div className="text-[11px] text-ink-500">+{facilities.length - hubs.length} merchant centres, pickup points and customer zones</div>}
        </div>
      </DrawerSection>
      <DrawerSection title="At-risk shipments">
        <ShipmentList shipments={activeShipments.filter((s) => s.sla === "breached" || s.sla === "at_risk").sort((a, b) => b.riskScore - a.riskScore)} emptyMessage="Nothing at risk in this area." />
      </DrawerSection>
    </div>
  );
}
