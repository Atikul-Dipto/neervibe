"use client";

import { useLiveChannel } from "@/hooks/useLiveChannel";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import type { PackageLiveUpdate, VehicleLiveUpdate } from "@/types/domain";

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

  useLiveChannel<VehicleLiveUpdate>("vehicles", upsertVehicle);
  useLiveChannel<PackageLiveUpdate>("packages", pushEvent);

  return null;
}
