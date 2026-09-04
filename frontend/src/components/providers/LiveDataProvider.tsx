"use client";

import { useEffect } from "react";
import { useLiveChannel } from "@/hooks/useLiveChannel";
import { api } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import type { PackageLiveUpdate, VehicleLiveUpdate } from "@/types/domain";

const SELECTED_VEHICLE_POLL_MS = 3000;

/**
 * Owns the app's persistent WebSocket subscriptions and writes every update
 * straight into the shared store. Always mounted at the page root — the
 * bottom event stream and vehicle positions need to keep flowing no matter
 * which page (Network/Operations/Packages/...) is currently showing, so
 * these subscriptions must not live inside a page-specific component that
 * gets unmounted when the user switches tabs.
 */
export function LiveDataProvider() {
  const upsertVehicle = useControlTowerStore((s) => s.upsertVehicle);
  const pushEvent = useControlTowerStore((s) => s.pushEvent);
  const selectedVehicleId = useControlTowerStore((s) => s.selectedVehicle?.id ?? null);
  const refreshSelectedVehicle = useControlTowerStore((s) => s.refreshSelectedVehicle);

  useLiveChannel<VehicleLiveUpdate>("vehicles", upsertVehicle);
  useLiveChannel<PackageLiveUpdate>("packages", pushEvent);

  // The live feed carries position/heading but not which node a vehicle
  // last left — and that field is what the "next stop" inference hangs on.
  // While a vehicle is selected, keep its REST snapshot fresh so the leg
  // flips to the new edge promptly after each arrival.
  useEffect(() => {
    if (!selectedVehicleId) return;
    let cancelled = false;
    const poll = () =>
      api
        .getVehicle(selectedVehicleId)
        .then((v) => {
          if (!cancelled) refreshSelectedVehicle(v);
        })
        .catch(() => {
          // Transient — the next poll will catch up.
        });
    poll();
    const timer = setInterval(poll, SELECTED_VEHICLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedVehicleId, refreshSelectedVehicle]);

  return null;
}
