"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { api, ApiError } from "@/services/api";
import { Card } from "@/components/ui/Card";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import { LoadingState, ErrorState } from "@/components/ui/States";
import type { PackageTracking } from "@/types/domain";

export function RightPanel() {
  const selectedNode = useControlTowerStore((s) => s.selectedNode);
  const selectedTrackingNumber = useControlTowerStore((s) => s.selectedTrackingNumber);
  const selectedVehicle = useControlTowerStore((s) => s.selectedVehicle);
  const liveVehicles = useControlTowerStore((s) => s.vehicles);
  const clearSelection = useControlTowerStore((s) => s.selectNode);

  if (selectedTrackingNumber) {
    return (
      <PanelShell onClose={() => clearSelection(null)}>
        <PackageTrackingView trackingNumber={selectedTrackingNumber} />
      </PanelShell>
    );
  }

  if (selectedVehicle) {
    const live = liveVehicles.get(selectedVehicle.id);
    const status = live?.status ?? selectedVehicle.status;
    const speed = live?.speed ?? selectedVehicle.speed;
    const lat = live?.latitude ?? selectedVehicle.current_latitude;
    const lon = live?.longitude ?? selectedVehicle.current_longitude;
    return (
      <PanelShell onClose={() => clearSelection(null)}>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">
              {selectedVehicle.vehicle_type.replaceAll("_", " ")}
            </div>
            <h2 className="font-mono text-lg font-semibold text-zinc-100">
              {selectedVehicle.registration_number}
            </h2>
          </div>

          <StatusPill tone={statusTone(status)} withDot>
            {status.replaceAll("_", " ")}
          </StatusPill>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Speed" value={`${speed.toFixed(1)} km/h`} />
            <Stat label="Heading" value={`${Math.round(live?.heading ?? selectedVehicle.heading)}°`} />
            <Stat label="Capacity" value={`${selectedVehicle.capacity.toFixed(0)} kg`} />
            <Stat label="Position" value={lat != null && lon != null ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : "—"} />
          </div>
        </div>
      </PanelShell>
    );
  }

  if (selectedNode) {
    return (
      <PanelShell onClose={() => clearSelection(null)}>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">{selectedNode.node_type.replaceAll("_", " ")}</div>
            <h2 className="text-lg font-semibold text-zinc-100">{selectedNode.node_name}</h2>
            <div className="text-xs text-zinc-500">{selectedNode.node_code}</div>
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

          {selectedNode.address && (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">Address</div>
              <div className="text-sm text-zinc-300">{selectedNode.address}</div>
            </div>
          )}
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
        Click a node or vehicle, or search a tracking number above, to inspect it here.
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
          className="group mb-2 self-end rounded-md p-1 text-zinc-500 transition-colors hover:bg-nv-900 hover:text-zinc-200"
          title="Close"
        >
          <X className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
        </button>
      )}
      {children}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-base font-semibold tabular-nums text-zinc-100">{value}</div>
    </Card>
  );
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
  return { value: `${hours}h ${mins}m`, unit: "", sub: "Estimated delivery" };
}

function PackageTrackingView({ trackingNumber }: { trackingNumber: string }) {
  const [data, setData] = useState<PackageTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    api
      .trackPackage(trackingNumber)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "Tracking number not found" : "Failed to load"))
      .finally(() => setLoading(false));
  }, [trackingNumber]);

  if (loading) return <LoadingState label="Loading tracking history…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const eta = formatEta(data.expected_delivery_at, data.current_status);

  return (
    <div className="-m-4 overflow-hidden rounded-lg border border-nv-800 bg-gradient-to-b from-nv-850 to-nv-900">
      <div className="border-b border-nv-800 p-4">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Package</div>
        <h2 className="font-mono text-base font-semibold text-zinc-100">{data.tracking_number}</h2>
        <StatusPill tone="accent" withDot className="mt-1.5">
          {data.current_status.replaceAll("_", " ")}
        </StatusPill>

        {eta && (
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="bg-gradient-to-r from-teal-300 to-teal-500 bg-clip-text text-3xl font-bold tabular-nums text-transparent">
                {eta.value}
              </span>
              {eta.unit && <span className="text-sm text-zinc-400">{eta.unit}</span>}
            </div>
            <div className="text-xs text-zinc-500">{eta.sub}</div>
          </div>
        )}
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
                      ? "z-10 h-2.5 w-2.5 shrink-0 animate-[pulse-ring_1.6s_ease-out_infinite] rounded-full bg-teal-400 text-teal-400"
                      : "z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-600"
                  }
                />
                {i < data.timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-nv-700" />}
              </div>
              <div>
                <div className={isCurrent ? "text-xs font-semibold text-zinc-50" : "text-xs font-medium text-zinc-300"}>
                  {(step.new_status ?? step.event_type).replaceAll("_", " ")}
                </div>
                <div className="text-[11px] text-zinc-500">{new Date(step.timestamp).toLocaleString()}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
