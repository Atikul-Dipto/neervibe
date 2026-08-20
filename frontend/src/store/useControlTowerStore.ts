import { create } from "zustand";
import type { LogisticsNode, PackageLiveUpdate, Vehicle, VehicleLiveUpdate } from "@/types/domain";

const MAX_EVENT_LOG = 50;

export type ActiveView =
  | "network"
  | "operations"
  | "packages"
  | "vehicles"
  | "hubs"
  | "analytics"
  | "ai";

interface ControlTowerState {
  activeView: ActiveView;
  selectedNode: LogisticsNode | null;
  selectedTrackingNumber: string | null;
  selectedVehicle: Vehicle | null;
  vehicles: Map<string, VehicleLiveUpdate>;
  eventLog: PackageLiveUpdate[];
  filters: { nodeType: string | null; city: string | null };

  setActiveView: (view: ActiveView) => void;
  selectNode: (node: LogisticsNode | null) => void;
  selectTrackingNumber: (trackingNumber: string | null) => void;
  selectVehicle: (vehicle: Vehicle | null) => void;
  upsertVehicle: (update: VehicleLiveUpdate) => void;
  pushEvent: (update: PackageLiveUpdate) => void;
  setFilter: (key: "nodeType" | "city", value: string | null) => void;
}

export const useControlTowerStore = create<ControlTowerState>((set) => ({
  activeView: "network",
  selectedNode: null,
  selectedTrackingNumber: null,
  selectedVehicle: null,
  vehicles: new Map(),
  eventLog: [],
  filters: { nodeType: null, city: null },

  setActiveView: (view) => set({ activeView: view }),

  selectNode: (node) =>
    set({ selectedNode: node, selectedTrackingNumber: null, selectedVehicle: null }),
  selectTrackingNumber: (trackingNumber) =>
    set({ selectedTrackingNumber: trackingNumber, selectedNode: null, selectedVehicle: null }),
  selectVehicle: (vehicle) =>
    set({ selectedVehicle: vehicle, selectedNode: null, selectedTrackingNumber: null }),

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
