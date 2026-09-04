"use client";

import { useEffect } from "react";
import { useLiveChannel } from "@/hooks/useLiveChannel";
import { api } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { useDataStore } from "@/data/store";
import { useSystemStore } from "@/data/system";
import type { PackageLiveUpdate, VehicleLiveUpdate } from "@/types/domain";

const SELECTED_VEHICLE_POLL_MS = 3000;

/**
 * Owns the app's persistent WebSocket subscriptions and fans every update
 * out to the stores: vehicle positions to the map store, package status
 * changes to both the event log and the data snapshot. Always mounted at
 * the shell, so feeds keep flowing whichever page is open.
 */
export function LiveDataProvider() {
  const upsertVehicle = useControlTowerStore((s) => s.upsertVehicle);
  const pushEvent = useControlTowerStore((s) => s.pushEvent);
  const applyPackageEvent = useDataStore((s) => s.applyPackageEvent);
  const setWs = useSystemStore((s) => s.setWs);
  const selectedVehicleId = useControlTowerStore((s) => s.selectedVehicle?.id ?? null);
  const refreshSelectedVehicle = useControlTowerStore((s) => s.refreshSelectedVehicle);

  const wsState = useLiveChannel<VehicleLiveUpdate>("vehicles", upsertVehicle);
  useLiveChannel<PackageLiveUpdate>("packages", (u) => {
    pushEvent(u);
    applyPackageEvent(u);
  });

  useEffect(() => {
    setWs(wsState);
  }, [wsState, setWs]);

  // The live feed carries position/heading but not which node a vehicle
  // last left, and that field is what the "next stop" inference hangs on.
  // While a vehicle is selected, keep its REST snapshot fresh.
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
          // Transient; the next poll will catch up.
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
