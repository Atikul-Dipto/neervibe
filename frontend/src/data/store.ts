"use client";

import { create } from "zustand";
import { api } from "@/services/api";
import type {
  AnalyticsOverview,
  Customer,
  DeliveryAttempt,
  LogisticsNode,
  LogisticsRoute,
  Merchant,
  Order,
  Package,
  PackageEvent,
  PackageLiveUpdate,
  Rider,
  Vehicle,
} from "@/types/domain";

/**
 * The application's data snapshot. One load pulls every entity the pages
 * need (the API caps pages at 500, and the network is a few hundred
 * records), after which every page, chart and filter works off the same
 * in-memory copy: cross-filtering is instantaneous and every number on
 * screen reconciles with every other.
 *
 * Loading is staged for a fast first paint: the core entities (network,
 * shipments, fleet, riders) unlock the UI; history (events, attempts,
 * orders, parties) streams in behind and re-derives when it lands. The
 * last good snapshot is cached in sessionStorage so a reload paints
 * instantly and revalidates in the background.
 *
 * Swapping the source (SSE, another API) means replacing the loaders only.
 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";

interface SnapshotData {
  nodes: LogisticsNode[];
  routes: LogisticsRoute[];
  vehicles: Vehicle[];
  riders: Rider[];
  packages: Package[];
  orders: Order[];
  merchants: Merchant[];
  customers: Customer[];
  events: PackageEvent[];
  attempts: DeliveryAttempt[];
  overview: AnalyticsOverview | null;
}

export interface DataState extends SnapshotData {
  status: LoadStatus;
  error: string | null;
  /** Non-fatal problems (an optional endpoint missing, a stale refresh). */
  warnings: string[];
  loadedAt: number | null;
  /** True while the secondary (history) entities are still arriving. */
  partial: boolean;
  /** True when the data on screen came from the session cache and has not been revalidated yet. */
  stale: boolean;
  refreshing: boolean;
  /** Bumped on every change so memoised derivations know when to recompute. */
  version: number;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  applyPackageEvent: (update: PackageLiveUpdate) => void;
  patchPackage: (pkg: Package) => void;
  patchRider: (rider: Rider) => void;
}

const REFRESH_MS = 90_000;
const CACHE_KEY = "neervibe-snapshot-v1";
const CACHE_MAX_AGE_MS = 15 * 60_000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function optional<T>(label: string, p: Promise<T[]>, warnings: string[]): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function fetchCore(warnings: string[]) {
  const [nodes, routes, packages, vehicles, riders] = await Promise.all([
    api.listNodes(),
    api.listRoutes({ limit: 1000 }),
    api.listAllPackages(),
    optional("vehicles", api.listVehicles({ limit: 500 }), warnings),
    optional("riders", api.listRiders({ limit: 500 }), warnings),
  ]);
  return { nodes, routes, packages, vehicles, riders };
}

async function fetchHistory(warnings: string[]) {
  const [orders, merchants, customers, events, attempts, overview] = await Promise.all([
    optional("orders", api.listAllOrders(), warnings),
    optional("merchants", api.listMerchants({ limit: 500 }), warnings),
    optional("customers", api.listCustomers({ limit: 500 }), warnings),
    optional("events", api.listEvents({ limit: 1000 }), warnings),
    optional("delivery attempts", api.listAllDeliveryAttempts(), warnings),
    api.getAnalyticsOverview().catch((err) => {
      warnings.push(`analytics overview: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }),
  ]);
  return { orders, merchants, customers, events, attempts, overview };
}

function readCache(): { data: SnapshotData; loadedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: SnapshotData; loadedAt: number };
    if (!parsed?.data?.packages?.length || Date.now() - parsed.loadedAt > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: SnapshotData, loadedAt: number) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, loadedAt }));
  } catch {
    // Quota or private mode: the cache is a convenience only.
  }
}

function pick(s: DataState): SnapshotData {
  return {
    nodes: s.nodes,
    routes: s.routes,
    vehicles: s.vehicles,
    riders: s.riders,
    packages: s.packages,
    orders: s.orders,
    merchants: s.merchants,
    customers: s.customers,
    events: s.events,
    attempts: s.attempts,
    overview: s.overview,
  };
}

export const useDataStore = create<DataState>((set, get) => ({
  status: "idle",
  error: null,
  warnings: [],
  loadedAt: null,
  partial: false,
  stale: false,
  refreshing: false,
  version: 0,
  nodes: [],
  routes: [],
  vehicles: [],
  riders: [],
  packages: [],
  orders: [],
  merchants: [],
  customers: [],
  events: [],
  attempts: [],
  overview: null,

  load: async () => {
    if (get().status === "loading") return;
    const cached = typeof window !== "undefined" ? readCache() : null;
    if (cached) {
      set((s) => ({ ...cached.data, status: "ready", stale: true, loadedAt: cached.loadedAt, version: s.version + 1 }));
    } else {
      set({ status: "loading", error: null });
    }
    const warnings: string[] = [];
    try {
      const core = await fetchCore(warnings);
      set((s) => ({ ...core, status: "ready", partial: true, stale: false, error: null, warnings, loadedAt: Date.now(), version: s.version + 1 }));
      const history = await fetchHistory(warnings);
      set((s) => {
        const next = { ...s, ...history, partial: false, warnings, loadedAt: Date.now(), version: s.version + 1 };
        writeCache(pick(next as DataState), next.loadedAt);
        return next;
      });
      if (!refreshTimer && typeof window !== "undefined") {
        refreshTimer = setInterval(() => {
          if (document.visibilityState === "visible") void get().refresh();
        }, REFRESH_MS);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (get().status === "ready") set((s) => ({ warnings: [...s.warnings, `revalidation failed: ${message}`], stale: true }));
      else set({ status: "error", error: message });
    }
  },

  refresh: async () => {
    if (get().refreshing || get().status !== "ready") return;
    set({ refreshing: true });
    const warnings: string[] = [];
    try {
      const [core, history] = await Promise.all([fetchCore(warnings), fetchHistory(warnings)]);
      set((s) => {
        const next = { ...s, ...core, ...history, loadedAt: Date.now(), refreshing: false, stale: false, partial: false, warnings, version: s.version + 1 };
        writeCache(pick(next as DataState), next.loadedAt);
        return next;
      });
    } catch (err) {
      set((s) => ({
        refreshing: false,
        warnings: [...s.warnings.slice(-4), `refresh failed: ${err instanceof Error ? err.message : String(err)}`],
      }));
    }
  },

  // A live status change becomes both a package patch and a synthetic
  // event, so tables, KPIs, timelines and the event stream all move
  // together without waiting for the next full refresh.
  applyPackageEvent: (update) =>
    set((s) => {
      const idx = s.packages.findIndex((p) => p.id === update.package_id);
      if (idx === -1) return {};
      const prev = s.packages[idx];
      if (prev.current_status === update.new_status && prev.updated_at >= update.timestamp) return {};
      const next: Package = {
        ...prev,
        current_status: update.new_status,
        updated_at: update.timestamp,
        actual_delivery_at: update.new_status === "DELIVERED" ? (prev.actual_delivery_at ?? update.timestamp) : prev.actual_delivery_at,
      };
      const packages = s.packages.slice();
      packages[idx] = next;
      const event: PackageEvent = {
        id: `live-${update.package_id}-${update.timestamp}`,
        package_id: update.package_id,
        event_type: "PACKAGE_STATUS_CHANGED",
        node_id: null,
        latitude: null,
        longitude: null,
        timestamp: update.timestamp,
        previous_status: update.previous_status,
        new_status: update.new_status,
        rider_id: prev.assigned_rider_id,
        vehicle_id: prev.assigned_vehicle_id,
        event_metadata: {},
        created_at: update.timestamp,
      };
      return { packages, events: [event, ...s.events].slice(0, 1500), version: s.version + 1 };
    }),

  patchPackage: (pkg) =>
    set((s) => {
      const idx = s.packages.findIndex((p) => p.id === pkg.id);
      const packages = s.packages.slice();
      if (idx === -1) packages.unshift(pkg);
      else packages[idx] = pkg;
      return { packages, version: s.version + 1 };
    }),

  patchRider: (rider) =>
    set((s) => {
      const idx = s.riders.findIndex((r) => r.id === rider.id);
      const riders = s.riders.slice();
      if (idx === -1) riders.push(rider);
      else riders[idx] = rider;
      return { riders, version: s.version + 1 };
    }),
}));
