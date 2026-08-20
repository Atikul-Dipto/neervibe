"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import type { Vehicle, VehicleStatus } from "@/types/domain";

const STATUS_OPTIONS: (VehicleStatus | "")[] = [
  "",
  "IDLE",
  "EN_ROUTE",
  "LOADING",
  "UNLOADING",
  "MAINTENANCE",
  "OFFLINE",
];

const STATUS_TONE: Record<string, string> = {
  EN_ROUTE: "text-teal-300 border-teal-500/40 bg-teal-500/10",
  IDLE: "text-slate-400 border-slate-600 bg-slate-800",
  LOADING: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  UNLOADING: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  MAINTENANCE: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  OFFLINE: "text-slate-500 border-slate-700 bg-slate-900",
};

export function VehiclesView() {
  const [status, setStatus] = useState<VehicleStatus | "">("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const liveVehicles = useControlTowerStore((s) => s.vehicles);
  const selectVehicle = useControlTowerStore((s) => s.selectVehicle);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listVehicles({ status: status || undefined, limit: 200 })
      .then(setVehicles)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load vehicles"))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Vehicles</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as VehicleStatus | "")}
          className="rounded-md border border-nv-700 bg-nv-900 px-3 py-1.5 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || "ALL"} value={s}>
              {s ? s.replaceAll("_", " ") : "All statuses"}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading vehicles…</div>}
      {error && <div className="text-sm text-rose-400">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-nv-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-nv-900 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Registration</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Speed (km/h)</th>
                <th className="px-4 py-2.5">Capacity (kg)</th>
                <th className="px-4 py-2.5">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nv-800">
              {vehicles.map((v) => {
                const live = liveVehicles.get(v.id);
                const speed = live?.speed ?? v.speed;
                const status = live?.status ?? v.status;
                const lat = live?.latitude ?? v.current_latitude;
                const lon = live?.longitude ?? v.current_longitude;
                return (
                  <tr
                    key={v.id}
                    onClick={() => selectVehicle(v)}
                    className="cursor-pointer transition-colors hover:bg-nv-900/60"
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-200">{v.registration_number}</td>
                    <td className="px-4 py-2.5 text-slate-400">{v.vehicle_type.replaceAll("_", " ")}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[status] ?? STATUS_TONE.IDLE}`}
                      >
                        {status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{speed.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-slate-400">{v.capacity.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {lat != null && lon != null ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No vehicles match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
