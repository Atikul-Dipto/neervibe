"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
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

const STATUS_TONE: Record<string, string> = {
  DELIVERED: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  CANCELLED: "text-slate-400 border-slate-600 bg-slate-800",
  DELIVERY_FAILED: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  LOST: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  DAMAGED: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  RETURNED: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  RETURN_REQUESTED: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  RETURN_IN_TRANSIT: "text-amber-400 border-amber-500/40 bg-amber-500/10",
};
const DEFAULT_TONE = "text-teal-300 border-teal-500/40 bg-teal-500/10";

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

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Packages</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as PackageStatus | "")}
          className="rounded-md border border-nv-700 bg-nv-900 px-3 py-1.5 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || "ALL"} value={s}>
              {s ? s.replaceAll("_", " ") : "All statuses"}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading packages…</div>}
      {error && <div className="text-sm text-rose-400">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-nv-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-nv-900 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Tracking #</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Priority</th>
                <th className="px-4 py-2.5">Weight (kg)</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5">Expected Delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nv-800">
              {packages.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => selectTrackingNumber(p.tracking_number)}
                  className="cursor-pointer transition-colors hover:bg-nv-900/60"
                >
                  <td className="px-4 py-2.5 font-mono text-slate-200">{p.tracking_number}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[p.current_status] ?? DEFAULT_TONE}`}
                    >
                      {p.current_status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{p.priority}</td>
                  <td className="px-4 py-2.5 text-slate-400">{p.package_weight.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {p.expected_delivery_at ? new Date(p.expected_delivery_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {packages.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No packages match this filter.
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
