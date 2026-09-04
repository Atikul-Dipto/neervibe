"use client";

import { api, ApiError } from "@/services/api";
import { useDataStore } from "./store";
import { useOpsStore } from "./ops";
import type { PackageStatus, Rider, Package } from "@/types/domain";

/**
 * Write actions. Every one of these hits the backend, patches the local
 * snapshot with the response, and leaves an audit entry. Nothing here is
 * UI-only state.
 */

// Mirrors backend/app/models/enums.py PACKAGE_STATUS_TRANSITIONS. The API
// enforces it too (400 on an invalid transition); mirroring lets the UI
// offer only legal actions.
export const PACKAGE_TRANSITIONS: Record<PackageStatus, PackageStatus[]> = {
  PACKAGE_CREATED: ["PICKUP_ASSIGNED", "CANCELLED"],
  PICKUP_ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["ARRIVED_AT_HUB"],
  ARRIVED_AT_HUB: ["SORTING"],
  SORTING: ["DISPATCHED"],
  DISPATCHED: ["IN_TRANSIT"],
  IN_TRANSIT: ["ARRIVED_AT_HUB", "ARRIVED_AT_DESTINATION_HUB", "LOST", "DAMAGED"],
  ARRIVED_AT_DESTINATION_HUB: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["RESCHEDULED", "RETURN_REQUESTED"],
  RESCHEDULED: ["OUT_FOR_DELIVERY"],
  RETURN_REQUESTED: ["RETURN_IN_TRANSIT"],
  RETURN_IN_TRANSIT: ["RETURNED"],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
  LOST: [],
  DAMAGED: [],
};

export const TRANSITION_LABELS: Partial<Record<PackageStatus, string>> = {
  PICKUP_ASSIGNED: "Assign pickup",
  PICKED_UP: "Confirm pickup",
  ARRIVED_AT_HUB: "Receive at hub",
  SORTING: "Start sorting",
  DISPATCHED: "Dispatch",
  IN_TRANSIT: "Mark in transit",
  ARRIVED_AT_DESTINATION_HUB: "Receive at destination hub",
  OUT_FOR_DELIVERY: "Send out for delivery",
  DELIVERED: "Mark delivered",
  DELIVERY_FAILED: "Mark delivery failed",
  RESCHEDULED: "Reschedule",
  RETURN_REQUESTED: "Request return",
  RETURN_IN_TRANSIT: "Return in transit",
  RETURNED: "Mark returned",
  CANCELLED: "Cancel shipment",
  LOST: "Report lost",
  DAMAGED: "Report damaged",
};

/** Transitions that need a rider chosen (last-mile hand-over). */
export const RIDER_TRANSITIONS = new Set<PackageStatus>(["PICKUP_ASSIGNED", "OUT_FOR_DELIVERY"]);

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.message) as { detail?: unknown };
      if (typeof body.detail === "string") return body.detail;
    } catch {
      // not JSON
    }
    return err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export async function transitionShipment(
  pkg: Package,
  newStatus: PackageStatus,
  opts: { riderId?: string; vehicleId?: string; nodeId?: string; note?: string } = {},
): Promise<Package> {
  const updated = await api.updatePackageStatus(pkg.id, {
    new_status: newStatus,
    rider_id: opts.riderId,
    vehicle_id: opts.vehicleId,
    node_id: opts.nodeId,
    metadata: opts.note ? { note: opts.note, source: "neervibe-portal" } : { source: "neervibe-portal" },
  });
  useDataStore.getState().patchPackage(updated);
  useDataStore.getState().applyPackageEvent({
    package_id: updated.id,
    tracking_number: updated.tracking_number,
    previous_status: pkg.current_status,
    new_status: updated.current_status,
    timestamp: updated.updated_at,
  });
  useOpsStore.getState().logAction({
    action: `${TRANSITION_LABELS[newStatus] ?? newStatus}`,
    target: pkg.tracking_number,
    detail: [opts.riderId ? "rider assigned" : null, opts.note].filter(Boolean).join(" · ") || undefined,
    scope: "api",
  });
  return updated;
}

export async function assignDriver(rider: Rider, vehicleId: string, vehicleLabel: string): Promise<Rider> {
  const updated = await api.assignRiderVehicle(rider.id, vehicleId);
  useDataStore.getState().patchRider(updated);
  useOpsStore.getState().logAction({ action: "Assigned vehicle", target: rider.name, detail: vehicleLabel, scope: "api" });
  return updated;
}
