"use client";

import { useEffect, useMemo, useState } from "react";
import { LocateFixed, Navigation, X, ZoomOut } from "lucide-react";
import { COUNTRY } from "@/config/country";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { api, ApiError } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { NODE_TYPE_COLORS } from "@/components/map/nodeStyle";
import { findRegionAt, inferVehicleLeg, regionContains } from "@/components/map/geo";
import type { LogisticsNode, NodeType, PackageTracking } from "@/types/domain";

export function RightPanel() {
  const selectedNode = useControlTowerStore((s) => s.selectedNode);
  const selectedTrackingNumber = useControlTowerStore((s) => s.selectedTrackingNumber);
  const selectedVehicle = useControlTowerStore((s) => s.selectedVehicle);
  const selectedRegion = useControlTowerStore((s) => s.selectedRegion);
  const liveVehicles = useControlTowerStore((s) => s.vehicles);
  const nodes = useControlTowerStore((s) => s.nodes);
  const routes = useControlTowerStore((s) => s.routes);
  const regions = useControlTowerStore((s) => s.regions);
  const followVehicle = useControlTowerStore((s) => s.followVehicle);
  const setFollowVehicle = useControlTowerStore((s) => s.setFollowVehicle);
  const selectNode = useControlTowerStore((s) => s.selectNode);
  const selectRegion = useControlTowerStore((s) => s.selectRegion);
  const clearSelection = selectNode;

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const districtAt = (lon: number | null, lat: number | null) =>
    regions && lon != null && lat != null ? findRegionAt(regions.district, lon, lat) : null;

  if (selectedTrackingNumber) {
    return (
      <PanelShell onClose={() => clearSelection(null)}>
        <PackageTrackingView trackingNumber={selectedTrackingNumber} nodesById={nodesById} />
      </PanelShell>
    );
  }

  if (selectedVehicle) {
    const live = liveVehicles.get(selectedVehicle.id);
    const status = live?.status ?? selectedVehicle.status;
    const speed = live?.speed ?? selectedVehicle.speed;
    const lat = live?.latitude ?? selectedVehicle.current_latitude;
    const lon = live?.longitude ?? selectedVehicle.current_longitude;
    const leg = live
      ? inferVehicleLeg(
          { lat: live.latitude, lon: live.longitude, heading: live.heading, speed: live.speed, status: live.status },
          selectedVehicle.current_node_id,
          routes,
          nodesById,
        )
      : null;
    const district = districtAt(lon, lat);

    return (
      <PanelShell onClose={() => clearSelection(null)}>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-500">
              {selectedVehicle.vehicle_type.replaceAll("_", " ")}
            </div>
            <h2 className="font-mono text-lg font-semibold text-ink-900">
              {selectedVehicle.registration_number}
            </h2>
          </div>

          <StatusPill tone={statusTone(status)} withDot>
            {status.replaceAll("_", " ")}
          </StatusPill>

          <Card className="border-plum/20 bg-gradient-to-br from-accent-100 to-white p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              <Navigation className="h-3 w-3 text-accent-700" aria-hidden />
              Next stop
            </div>
            {leg ? (
              <>
                <button
                  onClick={() => selectNode(leg.dest)}
                  className="mt-1 text-left text-sm font-semibold text-ink-900 transition-colors hover:text-plum"
                  title="Open this facility"
                >
                  {leg.dest.node_name}
                </button>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="bg-gradient-to-r from-plum to-accent-700 bg-clip-text text-2xl font-bold tabular-nums text-transparent">
                    {formatMinutes(leg.etaMinutes)}
                  </span>
                  <span className="text-xs text-ink-500">{leg.remainingKm.toFixed(1)} km to go</span>
                </div>
                <div className="text-[11px] text-ink-500">from {leg.source.node_name}</div>
              </>
            ) : (
              <div className="mt-1 text-sm text-ink-600">
                {status === "EN_ROUTE"
                  ? "Working out the current leg…"
                  : `Stationary · ${status.replaceAll("_", " ").toLowerCase()}`}
              </div>
            )}
          </Card>

          <Button
            variant={followVehicle ? "primary" : "secondary"}
            className="w-full"
            onClick={() => setFollowVehicle(!followVehicle)}
          >
            <LocateFixed className="h-3.5 w-3.5" aria-hidden />
            {followVehicle ? "Following on map" : "Follow on map"}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Speed" value={`${speed.toFixed(1)} km/h`} />
            <Stat label="Heading" value={`${Math.round(live?.heading ?? selectedVehicle.heading)}°`} />
            <Stat label="Capacity" value={`${selectedVehicle.capacity.toFixed(0)} kg`} />
            <Stat label={COUNTRY.levels.district.label} value={district?.properties.name ?? "—"} />
          </div>
        </div>
      </PanelShell>
    );
  }

  if (selectedNode) {
    const district = districtAt(selectedNode.longitude, selectedNode.latitude);
    return (
      <PanelShell onClose={() => clearSelection(null)}>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-500">{selectedNode.node_type.replaceAll("_", " ")}</div>
            <h2 className="text-lg font-semibold text-ink-900">{selectedNode.node_name}</h2>
            <div className="text-xs text-ink-500">{selectedNode.node_code}</div>
          </div>

          <StatusPill tone={statusTone(selectedNode.operating_status)} withDot>
            {selectedNode.operating_status}
          </StatusPill>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Current Load" value={selectedNode.current_load.toLocaleString()} />
            <Stat label="Capacity" value={selectedNode.capacity.toLocaleString()} />
            <Stat
              label="Utilization"
              value={`${selectedNode.capacity > 0 ? Math.round((selectedNode.current_load / selectedNode.capacity) * 100) : 0}%`}
            />
            <Stat label="City" value={selectedNode.city} />
          </div>

          {district && (
            <button
              onClick={() => selectRegion(district.properties)}
              className="group flex w-full items-center justify-between rounded-md border border-nv-800 bg-nv-900 px-3 py-2 text-left transition-all duration-200 hover:border-plum/30 hover:bg-accent-100"
              title="Focus this area on the map"
            >
              <span>
                <span className="block text-[10px] uppercase tracking-wider text-ink-500">Area</span>
                <span className="text-sm text-ink-900">
                  {district.properties.name} {COUNTRY.levels.district.label}
                  {district.properties.division && (
                    <span className="text-ink-500"> · {district.properties.division}</span>
                  )}
                </span>
              </span>
              <span className="text-xs text-accent-700 opacity-0 transition-opacity group-hover:opacity-100">Focus →</span>
            </button>
          )}

          {selectedNode.address && (
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-500">Address</div>
              <div className="text-sm text-ink-700">{selectedNode.address}</div>
            </div>
          )}
        </div>
      </PanelShell>
    );
  }

  if (selectedRegion) {
    const feature = regions?.byId.get(selectedRegion.id) ?? null;
    const inside = (lon: number, lat: number) => (feature ? regionContains(feature, lon, lat) : false);
    const nodesInside = nodes.filter((n) => inside(n.longitude, n.latitude));
    const nodeIds = new Set(nodesInside.map((n) => n.id));
    const vehiclesInside = Array.from(liveVehicles.values()).filter((v) => inside(v.longitude, v.latitude));
    const moving = vehiclesInside.filter((v) => v.status === "EN_ROUTE").length;
    const routesTouching = routes.filter((r) => nodeIds.has(r.source_node_id) || nodeIds.has(r.destination_node_id)).length;
    const capacity = nodesInside.reduce((sum, n) => sum + n.capacity, 0);
    const load = nodesInside.reduce((sum, n) => sum + n.current_load, 0);
    const utilization = capacity > 0 ? Math.round((load / capacity) * 100) : 0;
    const byType = new Map<NodeType, number>();
    for (const n of nodesInside) byType.set(n.node_type, (byType.get(n.node_type) ?? 0) + 1);
    const listed = [...nodesInside].sort((a, b) => b.capacity - a.capacity).slice(0, 12);

    return (
      <PanelShell onClose={() => selectRegion(null)}>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-500">
              {COUNTRY.levels[selectedRegion.level].label}
              {selectedRegion.division && ` · ${selectedRegion.division} ${COUNTRY.levels.division.label}`}
            </div>
            <h2 className="text-lg font-semibold text-ink-900">{selectedRegion.name}</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Facilities" value={String(nodesInside.length)} />
            <Stat label="Vehicles inside" value={`${vehiclesInside.length}`} hint={`${moving} moving`} />
            <Stat label="Routes" value={String(routesTouching)} />
            <Stat label="Utilization" value={`${utilization}%`} />
          </div>

          {byType.size > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-500">By type</div>
              <div className="flex flex-wrap gap-1.5">
                {[...byType.entries()].map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1.5 rounded-full border border-nv-800 bg-nv-900 px-2 py-0.5 text-[11px] capitalize text-ink-700"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: NODE_TYPE_COLORS[type] }} />
                    {type.replaceAll("_", " ").toLowerCase()}
                    <span className="font-semibold tabular-nums text-ink-900">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-500">Facilities</div>
            {nodesInside.length === 0 ? (
              <div className="text-xs text-ink-500">No facilities inside this area yet.</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {listed.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => selectNode(n)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 hover:translate-x-0.5 hover:bg-accent-300/40"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: NODE_TYPE_COLORS[n.node_type] }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-900">{n.node_name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-400">
                      {n.node_type.replaceAll("_", " ")}
                    </span>
                  </button>
                ))}
                {nodesInside.length > listed.length && (
                  <div className="px-2 pt-1 text-[11px] text-ink-500">+{nodesInside.length - listed.length} more</div>
                )}
              </div>
            )}
          </div>

          <Button variant="secondary" className="w-full" onClick={() => selectRegion(null)}>
            <ZoomOut className="h-3.5 w-3.5" aria-hidden />
            Zoom out
          </Button>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <div className="flex h-full items-center justify-center text-center text-sm text-ink-500">
        Click a facility, vehicle or area on the map — or search a tracking number above — to inspect it here.
      </div>
    </PanelShell>
  );
}

function PanelShell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-nv-800 bg-nv-950/60 p-4">
      {onClose && (
        <button
          onClick={onClose}
          className="group mb-2 self-end rounded-md p-1 text-ink-500 transition-colors hover:bg-nv-900 hover:text-ink-900"
          title="Close (Esc)"
        >
          <X className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
        </button>
      )}
      {children}
    </aside>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-base font-semibold tabular-nums text-ink-900">{value}</div>
      {hint && <div className="text-[10px] text-ink-500">{hint}</div>}
    </Card>
  );
}

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

const GOOD_STATUSES = new Set(["OPERATIONAL", "EN_ROUTE", "IDLE", "AVAILABLE"]);
const WARN_STATUSES = new Set(["CONGESTED", "DEGRADED", "LOADING", "UNLOADING"]);

function statusTone(status: string): Tone {
  if (GOOD_STATUSES.has(status)) return "good";
  if (WARN_STATUSES.has(status)) return "warning";
  return "danger";
}

const TERMINAL_PACKAGE_STATUSES = new Set([
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "LOST",
  "DAMAGED",
  "DELIVERY_FAILED",
]);

// Real countdown to `expected_delivery_at` — never fabricated. Terminal
// states (already delivered, cancelled, ...) have nothing left to count
// down to, so they render no ETA at all rather than a stale/misleading one.
function formatEta(expectedDeliveryAt: string | null, status: string): { value: string; unit: string; sub: string } | null {
  if (TERMINAL_PACKAGE_STATUSES.has(status) || !expectedDeliveryAt) return null;
  const diffMinutes = Math.round((new Date(expectedDeliveryAt).getTime() - Date.now()) / 60000);
  if (diffMinutes <= 0) return { value: "Running", unit: "late", sub: "Past expected delivery time" };
  if (diffMinutes < 60) return { value: String(diffMinutes), unit: "min", sub: "Estimated delivery" };
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (hours < 24) return { value: `${hours}h ${mins}m`, unit: "", sub: "Estimated delivery" };
  return { value: `${Math.floor(hours / 24)}d ${hours % 24}h`, unit: "", sub: "Estimated delivery" };
}

function PackageTrackingView({
  trackingNumber,
  nodesById,
}: {
  trackingNumber: string;
  nodesById: Map<string, LogisticsNode>;
}) {
  const setTrackedPackage = useControlTowerStore((s) => s.setTrackedPackage);
  const [data, setData] = useState<PackageTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .trackPackage(trackingNumber)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Share with the map so it can draw the package's path.
        setTrackedPackage(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError && e.status === 404 ? "Tracking number not found" : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackingNumber, setTrackedPackage]);

  if (loading) return <LoadingState label="Loading tracking history…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const eta = formatEta(data.expected_delivery_at, data.current_status);
  const origin = nodesById.get(data.source_node_id);
  const destination = nodesById.get(data.destination_node_id);

  return (
    <div className="-m-4 overflow-hidden rounded-lg border border-nv-800 bg-gradient-to-b from-nv-850 to-nv-900">
      <div className="border-b border-nv-800 p-4">
        <div className="text-xs uppercase tracking-wider text-ink-500">Package</div>
        <h2 className="font-mono text-base font-semibold text-ink-900">{data.tracking_number}</h2>
        <StatusPill tone="accent" withDot className="mt-1.5">
          {data.current_status.replaceAll("_", " ")}
        </StatusPill>

        {eta && (
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="bg-gradient-to-r from-plum to-accent-700 bg-clip-text text-3xl font-bold tabular-nums text-transparent">
                {eta.value}
              </span>
              {eta.unit && <span className="text-sm text-ink-600">{eta.unit}</span>}
            </div>
            <div className="text-xs text-ink-500">{eta.sub}</div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
          <span className="text-ink-500">From</span>
          <span className="truncate text-ink-700">{origin?.node_name ?? "—"}</span>
          <span className="text-ink-500">To</span>
          <span className="truncate text-ink-700">{destination?.node_name ?? "—"}</span>
        </div>
      </div>

      <div className="p-4">
        {data.timeline.map((step, i) => {
          const isCurrent = i === data.timeline.length - 1;
          return (
            <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
              <div className="flex w-2.5 shrink-0 flex-col items-center">
                <span
                  className={
                    isCurrent
                      ? "z-10 h-2.5 w-2.5 shrink-0 animate-[pulse-ring_1.6s_ease-out_infinite] rounded-full bg-plum text-plum"
                      : "z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-ink-400"
                  }
                />
                {i < data.timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-nv-700" />}
              </div>
              <div>
                <div className={isCurrent ? "text-xs font-semibold text-ink-900" : "text-xs font-medium text-ink-700"}>
                  {(step.new_status ?? step.event_type).replaceAll("_", " ")}
                </div>
                <div className="text-[11px] text-ink-500">{new Date(step.timestamp).toLocaleString()}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
