"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { Select } from "@/components/ui/Select";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
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

const STATUS_TONE: Record<string, Tone> = {
  EN_ROUTE: "accent",
  IDLE: "neutral",
  LOADING: "warning",
  UNLOADING: "warning",
  MAINTENANCE: "danger",
  OFFLINE: "neutral",
};

interface VehicleRow {
  vehicle: Vehicle;
  status: string;
  speed: number;
  lat: number | null;
  lon: number | null;
}

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

  const rows: VehicleRow[] = vehicles.map((v) => {
    const live = liveVehicles.get(v.id);
    return {
      vehicle: v,
      status: live?.status ?? v.status,
      speed: live?.speed ?? v.speed,
      lat: live?.latitude ?? v.current_latitude,
      lon: live?.longitude ?? v.current_longitude,
    };
  });

  const columns: TableColumn<VehicleRow>[] = [
    { header: "Registration", cell: (r) => <span className="font-mono text-zinc-200">{r.vehicle.registration_number}</span> },
    { header: "Type", cell: (r) => <span className="text-zinc-400">{r.vehicle.vehicle_type.replaceAll("_", " ")}</span> },
    {
      header: "Status",
      cell: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replaceAll("_", " ")}</StatusPill>,
    },
    { header: "Speed (km/h)", cell: (r) => <span className="tabular-nums text-zinc-400">{r.speed.toFixed(1)}</span> },
    { header: "Capacity (kg)", cell: (r) => <span className="tabular-nums text-zinc-400">{r.vehicle.capacity.toFixed(0)}</span> },
    {
      header: "Position",
      cell: (r) => (
        <span className="tabular-nums text-zinc-500">
          {r.lat != null && r.lon != null ? `${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">Vehicles</h1>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as VehicleStatus | "")}
          className="w-56"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || "ALL"} value={s}>
              {s ? s.replaceAll("_", " ") : "All statuses"}
            </option>
          ))}
        </Select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState message={error} />}

      {!loading && !error && (
        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.vehicle.id}
          onRowClick={(r) => selectVehicle(r.vehicle)}
          emptyMessage="No vehicles match this filter."
        />
      )}
    </div>
  );
}
