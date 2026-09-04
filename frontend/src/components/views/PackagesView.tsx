"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { Select } from "@/components/ui/Select";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import type { Package, PackageStatus } from "@/types/domain";

const STATUS_OPTIONS: (PackageStatus | "")[] = [
  "",
  "PACKAGE_CREATED",
  "PICKUP_ASSIGNED",
  "PICKED_UP",
  "ARRIVED_AT_HUB",
  "SORTING",
  "DISPATCHED",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION_HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURN_IN_TRANSIT",
  "RETURNED",
  "RESCHEDULED",
  "LOST",
  "DAMAGED",
];

const STATUS_TONE: Record<string, Tone> = {
  DELIVERED: "good",
  CANCELLED: "neutral",
  DELIVERY_FAILED: "danger",
  LOST: "danger",
  DAMAGED: "danger",
  RETURNED: "warning",
  RETURN_REQUESTED: "warning",
  RETURN_IN_TRANSIT: "warning",
};

export function PackagesView() {
  const [status, setStatus] = useState<PackageStatus | "">("");
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectTrackingNumber = useControlTowerStore((s) => s.selectTrackingNumber);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listPackages({ status: status || undefined, limit: 100 })
      .then(setPackages)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load packages"))
      .finally(() => setLoading(false));
  }, [status]);

  const columns: TableColumn<Package>[] = [
    { header: "Tracking #", cell: (p) => <span className="font-mono text-ink-900">{p.tracking_number}</span> },
    {
      header: "Status",
      cell: (p) => (
        <StatusPill tone={STATUS_TONE[p.current_status] ?? "accent"}>
          {p.current_status.replaceAll("_", " ")}
        </StatusPill>
      ),
    },
    { header: "Priority", cell: (p) => <span className="text-ink-600">{p.priority}</span> },
    { header: "Weight (kg)", cell: (p) => <span className="tabular-nums text-ink-600">{p.package_weight.toFixed(2)}</span> },
    { header: "Created", cell: (p) => <span className="text-ink-500">{new Date(p.created_at).toLocaleString()}</span> },
    {
      header: "Expected Delivery",
      cell: (p) => (
        <span className="text-ink-500">
          {p.expected_delivery_at ? new Date(p.expected_delivery_at).toLocaleString() : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink-900">Packages</h1>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as PackageStatus | "")}
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
          rows={packages}
          rowKey={(p) => p.id}
          onRowClick={(p) => selectTrackingNumber(p.tracking_number)}
          emptyMessage="No packages match this filter."
        />
      )}
    </div>
  );
}
