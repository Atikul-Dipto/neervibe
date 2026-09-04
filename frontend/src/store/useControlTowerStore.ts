import { create } from "zustand";
import { COUNTRY } from "@/config/country";
import { regionContains, type RegionFeature, type RegionProps } from "@/components/map/geo";
import type {
  LogisticsNode,
  LogisticsRoute,
  PackageLiveUpdate,
  PackageTracking,
  Vehicle,
  VehicleLiveUpdate,
} from "@/types/domain";

const MAX_EVENT_LOG = 50;

export type ActiveView =
  | "network"
  | "operations"
  | "packages"
  | "vehicles"
  | "hubs"
  | "analytics"
  | "ai";

/** A selected administrative area — just the feature's properties; the
 * geometry stays in `regions` and is looked up by id when needed. */
export type RegionRef = RegionProps;

export interface RegionIndex {
  division: RegionFeature[];
  district: RegionFeature[];
  byId: Map<string, RegionFeature>;
}

let regionsPromise: Promise<RegionIndex> | null = null;

async function fetchRegions(): Promise<RegionIndex> {
  const load = async (url: string): Promise<RegionFeature[]> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const fc = (await res.json()) as GeoJSON.FeatureCollection;
    return fc.features as RegionFeature[];
  };
  const [division, district] = await Promise.all([
    load(COUNTRY.levels.division.file),
    load(COUNTRY.levels.district.file),
  ]);
  const byId = new Map<string, RegionFeature>();
  for (const f of [...division, ...district]) byId.set(f.properties.id, f);
  return { division, district, byId };
}

/** The selected area is context, not a filter: it stays while the user
 * inspects things *inside* it, but picking something outside (a vehicle
 * from the table that happens to be in another division) releases it, so
 * the map never shows a hub or vehicle under the "outside the area" wash. */
function regionAfterPick(s: ControlTowerState, lon: number | null, lat: number | null): RegionRef | null {
  const region = s.selectedRegion;
  if (!region || lon == null || lat == null || !s.regions) return region;
  const feature = s.regions.byId.get(region.id);
  return feature && regionContains(feature, lon, lat) ? region : null;
}

interface ControlTowerState {
  activeView: ActiveView;
  selectedNode: LogisticsNode | null;
  selectedTrackingNumber: string | null;
  selectedVehicle: Vehicle | null;
  selectedRegion: RegionRef | null;
  /** Full tracking payload for `selectedTrackingNumber`, once fetched. */
  trackedPackage: PackageTracking | null;
  vehicles: Map<string, VehicleLiveUpdate>;
  eventLog: PackageLiveUpdate[];
  filters: { nodeType: string | null; city: string | null };
  /** The static network, shared so panels can do area stats without refetching. */
  nodes: LogisticsNode[];
  routes: LogisticsRoute[];
  regions: RegionIndex | null;
  regionsError: string | null;
  /** Camera tracks the selected vehicle as it moves (Uber-style). */
  followVehicle: boolean;
  showBoundaries: boolean;

  setActiveView: (view: ActiveView) => void;
  selectNode: (node: LogisticsNode | null) => void;
  selectTrackingNumber: (trackingNumber: string | null) => void;
  selectVehicle: (vehicle: Vehicle | null) => void;
  /** Replace the selected vehicle's REST snapshot without resetting follow/camera state. */
  refreshSelectedVehicle: (vehicle: Vehicle) => void;
  selectRegion: (region: RegionRef | null) => void;
  setTrackedPackage: (pkg: PackageTracking | null) => void;
  upsertVehicle: (update: VehicleLiveUpdate) => void;
  pushEvent: (update: PackageLiveUpdate) => void;
  setFilter: (key: "nodeType" | "city", value: string | null) => void;
  setNetwork: (nodes: LogisticsNode[], routes: LogisticsRoute[]) => void;
  loadRegions: () => Promise<void>;
  setFollowVehicle: (follow: boolean) => void;
  setShowBoundaries: (show: boolean) => void;
}

export const useControlTowerStore = create<ControlTowerState>((set, get) => ({
  activeView: "network",
  selectedNode: null,
  selectedTrackingNumber: null,
  selectedVehicle: null,
  selectedRegion: null,
  trackedPackage: null,
  vehicles: new Map(),
  eventLog: [],
  filters: { nodeType: null, city: null },
  nodes: [],
  routes: [],
  regions: null,
  regionsError: null,
  followVehicle: false,
  showBoundaries: true,

  setActiveView: (view) => set({ activeView: view }),

  // Node / vehicle / package selections are mutually exclusive; a selected
  // region is the surrounding *context* and survives them, so the camera
  // can fall back to the area when the inner selection is cleared.
  selectNode: (node) =>
    set((s) => ({
      selectedNode: node,
      selectedTrackingNumber: null,
      selectedVehicle: null,
      trackedPackage: null,
      selectedRegion: node ? regionAfterPick(s, node.longitude, node.latitude) : s.selectedRegion,
    })),
  // A package path can span the whole country, so it always gets the full map.
  selectTrackingNumber: (trackingNumber) =>
    set((s) => ({
      selectedTrackingNumber: trackingNumber,
      selectedNode: null,
      selectedVehicle: null,
      trackedPackage: null,
      selectedRegion: trackingNumber ? null : s.selectedRegion,
    })),
  selectVehicle: (vehicle) =>
    set((s) => {
      const live = vehicle ? s.vehicles.get(vehicle.id) : undefined;
      return {
        selectedVehicle: vehicle,
        selectedNode: null,
        selectedTrackingNumber: null,
        trackedPackage: null,
        followVehicle: vehicle != null,
        selectedRegion: vehicle
          ? regionAfterPick(s, live?.longitude ?? vehicle.current_longitude, live?.latitude ?? vehicle.current_latitude)
          : s.selectedRegion,
      };
    }),
  refreshSelectedVehicle: (vehicle) =>
    set((s) => (s.selectedVehicle?.id === vehicle.id ? { selectedVehicle: vehicle } : {})),
  selectRegion: (region) =>
    set({
      selectedRegion: region,
      selectedNode: null,
      selectedVehicle: null,
      selectedTrackingNumber: null,
      trackedPackage: null,
    }),
  setTrackedPackage: (pkg) =>
    set((s) => (pkg == null || s.selectedTrackingNumber === pkg.tracking_number ? { trackedPackage: pkg } : {})),

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

  setNetwork: (nodes, routes) => set({ nodes, routes }),

  loadRegions: async () => {
    if (get().regions) return;
    regionsPromise ??= fetchRegions();
    try {
      set({ regions: await regionsPromise, regionsError: null });
    } catch (err) {
      regionsPromise = null;
      set({ regionsError: err instanceof Error ? err.message : String(err) });
    }
  },

  setFollowVehicle: (follow) => set({ followVehicle: follow }),
  setShowBoundaries: (show) => set({ showBoundaries: show }),
}));
