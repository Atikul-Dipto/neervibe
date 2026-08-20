import { create } from "zustand";
import type { LogisticsNode, PackageLiveUpdate, VehicleLiveUpdate } from "@/types/domain";

const MAX_EVENT_LOG = 50;

interface ControlTowerState {
  selectedNode: LogisticsNode | null;
  selectedTrackingNumber: string | null;
  vehicles: Map<string, VehicleLiveUpdate>;
  eventLog: PackageLiveUpdate[];
  filters: { nodeType: string | null; city: string | null };

  selectNode: (node: LogisticsNode | null) => void;
  selectTrackingNumber: (trackingNumber: string | null) => void;
  upsertVehicle: (update: VehicleLiveUpdate) => void;
  pushEvent: (update: PackageLiveUpdate) => void;
  setFilter: (key: "nodeType" | "city", value: string | null) => void;
}

export const useControlTowerStore = create<ControlTowerState>((set) => ({
  selectedNode: null,
  selectedTrackingNumber: null,
  vehicles: new Map(),
  eventLog: [],
  filters: { nodeType: null, city: null },

  selectNode: (node) => set({ selectedNode: node, selectedTrackingNumber: null }),
  selectTrackingNumber: (trackingNumber) =>
    set({ selectedTrackingNumber: trackingNumber, selectedNode: null }),

  upsertVehicle: (update) =>
    set((s) => {
      const next = new Map(s.vehicles);
      next.set(update.vehicle_id, update);
      return { vehicles: next };
    }),

  pushEvent: (update) =>
    set((s) => ({ eventLog: [update, ...s.eventLog].slice(0, MAX_EVENT_LOG) })),

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
}));
