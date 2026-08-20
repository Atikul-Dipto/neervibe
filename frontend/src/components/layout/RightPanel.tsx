"use client";

import { useEffect, useState } from "react";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { api, ApiError } from "@/services/api";
import type { PackageTracking } from "@/types/domain";

export function RightPanel() {
  const selectedNode = useControlTowerStore((s) => s.selectedNode);
  const selectedTrackingNumber = useControlTowerStore((s) => s.selectedTrackingNumber);

  if (selectedTrackingNumber) {
    return (
      <PanelShell>
        <PackageTrackingView trackingNumber={selectedTrackingNumber} />
      </PanelShell>
    );
  }

  if (selectedNode) {
    return (
      <PanelShell>
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">{selectedNode.node_type.replaceAll("_", " ")}</div>
            <h2 className="text-lg font-semibold text-slate-100">{selectedNode.node_name}</h2>
            <div className="text-xs text-slate-500">{selectedNode.node_code}</div>
          </div>

          <StatusBadge status={selectedNode.operating_status} />

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
              <div className="text-xs uppercase tracking-wider text-slate-500">Address</div>
              <div className="text-sm text-slate-300">{selectedNode.address}</div>
            </div>
          )}
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
        Click a node on the map, or search a tracking number above, to inspect it here.
      </div>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-nv-800 bg-nv-950/60 p-4">
      {children}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-nv-800 bg-nv-900/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "OPERATIONAL"
      ? "bg-emerald-400"
      : status === "CONGESTED" || status === "DEGRADED"
        ? "bg-amber-400"
        : "bg-rose-400";
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-300">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {status}
    </div>
  );
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

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (error) return <div className="text-sm text-rose-400">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500">Package</div>
        <h2 className="font-mono text-base font-semibold text-slate-100">{data.tracking_number}</h2>
        <div className="mt-1 inline-block rounded-full border border-teal-500/40 bg-teal-500/10 px-2 py-0.5 text-xs text-teal-300">
          {data.current_status.replaceAll("_", " ")}
        </div>
      </div>

      <div className="relative space-y-0">
        {data.timeline.map((step, i) => (
          <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < data.timeline.length - 1 && (
              <span className="absolute left-[5px] top-3 h-full w-px bg-nv-700" />
            )}
            <span
              className={`z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                i === data.timeline.length - 1 ? "bg-teal-400" : "bg-slate-600"
              }`}
            />
            <div>
              <div className="text-xs font-medium text-slate-200">
                {(step.new_status ?? step.event_type).replaceAll("_", " ")}
              </div>
              <div className="text-[11px] text-slate-500">{new Date(step.timestamp).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
