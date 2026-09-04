"use client";

import { create } from "zustand";
import type { DeliveryType, PackageStatus } from "@/types/domain";
import type { Shipment, SlaState } from "./derive";

/**
 * Global filter state + the cross-filter engine.
 *
 * Two layers:
 *  - `filters` are the always-available filter bar: date range, division,
 *    city, district, hub, merchant, status, service type, rider, vehicle,
 *    SLA state and free text. They persist across pages and in the URL.
 *  - `cross` are selections made *in* a visualisation (a bar, a map
 *    region, a KPI tile). They narrow every compatible view on the page
 *    and show up as removable chips. They are page-scoped: navigating
 *    clears them.
 *
 * Both layers apply as AND constraints through `applyFilters`.
 */
export type DatePreset = "today" | "24h" | "7d" | "30d" | "all" | "custom";

export type ListFilterKey =
  | "divisions"
  | "cities"
  | "districts"
  | "hubs"
  | "merchants"
  | "statuses"
  | "serviceTypes"
  | "riders"
  | "vehicles"
  | "sla"
  | "priorities"
  | "paymentTypes"
  | "statusGroups";

export interface GlobalFilters {
  preset: DatePreset;
  from: string | null;
  to: string | null;
  search: string;
  divisions: string[];
  cities: string[];
  districts: string[];
  hubs: string[];
  merchants: string[];
  statuses: PackageStatus[];
  statusGroups: string[];
  serviceTypes: DeliveryType[];
  riders: string[];
  vehicles: string[];
  sla: SlaState[];
  priorities: string[];
  paymentTypes: string[];
}

export interface CrossFilter {
  key: ListFilterKey;
  value: string;
  label: string;
  /** Which visualisation produced it — shown on the chip and used for the active-border state. */
  source: string;
}

export const EMPTY_FILTERS: GlobalFilters = {
  preset: "30d",
  from: null,
  to: null,
  search: "",
  divisions: [],
  cities: [],
  districts: [],
  hubs: [],
  merchants: [],
  statuses: [],
  statusGroups: [],
  serviceTypes: [],
  riders: [],
  vehicles: [],
  sla: [],
  priorities: [],
  paymentTypes: [],
};

export const LIST_KEYS: ListFilterKey[] = [
  "divisions", "cities", "districts", "hubs", "merchants", "statuses", "statusGroups",
  "serviceTypes", "riders", "vehicles", "sla", "priorities", "paymentTypes",
];

export const FILTER_LABELS: Record<ListFilterKey, string> = {
  divisions: "Division",
  cities: "City",
  districts: "Zone",
  hubs: "Hub",
  merchants: "Merchant",
  statuses: "Status",
  statusGroups: "Stage",
  serviceTypes: "Service",
  riders: "Rider",
  vehicles: "Vehicle",
  sla: "SLA",
  priorities: "Priority",
  paymentTypes: "Payment",
};

interface FilterState {
  filters: GlobalFilters;
  cross: CrossFilter[];
  setPreset: (preset: DatePreset) => void;
  setRange: (from: string | null, to: string | null) => void;
  setSearch: (q: string) => void;
  setList: (key: ListFilterKey, values: string[]) => void;
  toggleValue: (key: ListFilterKey, value: string) => void;
  clearKey: (key: ListFilterKey) => void;
  clearAll: () => void;
  replaceFilters: (filters: GlobalFilters) => void;
  toggleCross: (cf: CrossFilter) => void;
  /** Replace every cross filter from one source with a single value (radio behaviour). */
  setCross: (cf: CrossFilter | null, source: string) => void;
  removeCross: (key: ListFilterKey, value: string) => void;
  clearCrossSource: (source: string) => void;
  clearCross: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  filters: EMPTY_FILTERS,
  cross: [],
  setPreset: (preset) => set((s) => ({ filters: { ...s.filters, preset, ...(preset !== "custom" ? { from: null, to: null } : {}) } })),
  setRange: (from, to) => set((s) => ({ filters: { ...s.filters, preset: "custom", from, to } })),
  setSearch: (search) => set((s) => ({ filters: { ...s.filters, search } })),
  setList: (key, values) => set((s) => ({ filters: { ...s.filters, [key]: values } })),
  toggleValue: (key, value) =>
    set((s) => {
      const list = s.filters[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { filters: { ...s.filters, [key]: next } };
    }),
  clearKey: (key) => set((s) => ({ filters: { ...s.filters, [key]: [] } })),
  clearAll: () => set({ filters: EMPTY_FILTERS, cross: [] }),
  replaceFilters: (filters) => set({ filters }),
  toggleCross: (cf) =>
    set((s) => {
      const exists = s.cross.some((c) => c.key === cf.key && c.value === cf.value);
      return { cross: exists ? s.cross.filter((c) => !(c.key === cf.key && c.value === cf.value)) : [...s.cross, cf] };
    }),
  setCross: (cf, source) =>
    set((s) => {
      const rest = s.cross.filter((c) => c.source !== source);
      return { cross: cf ? [...rest, cf] : rest };
    }),
  removeCross: (key, value) => set((s) => ({ cross: s.cross.filter((c) => !(c.key === key && c.value === value)) })),
  clearCrossSource: (source) => set((s) => ({ cross: s.cross.filter((c) => c.source !== source) })),
  clearCross: () => set({ cross: [] }),
}));

// --- Date range -----------------------------------------------------------

export function dateRange(filters: GlobalFilters, now = Date.now()): { from: number; to: number } | null {
  switch (filters.preset) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start.getTime(), to: now };
    }
    case "24h":
      return { from: now - 24 * 3600e3, to: now };
    case "7d":
      return { from: now - 7 * 86400e3, to: now };
    case "30d":
      return { from: now - 30 * 86400e3, to: now };
    case "custom": {
      const from = filters.from ? new Date(filters.from).getTime() : 0;
      const to = filters.to ? new Date(filters.to).getTime() + 86400e3 - 1 : now;
      return { from, to };
    }
    default:
      return null;
  }
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "All",
  custom: "Custom",
};

/** The comparison window of the same length immediately before the current one. */
export function previousRange(filters: GlobalFilters, now = Date.now()): { from: number; to: number } | null {
  const r = dateRange(filters, now);
  if (!r) return null;
  const len = r.to - r.from;
  return { from: r.from - len, to: r.from - 1 };
}

// --- Applying filters -----------------------------------------------------

function listMatch(list: string[], value: string | null | undefined): boolean {
  return list.length === 0 || (value != null && list.includes(value));
}

/** Combined view of bar filters + cross filters, as one AND constraint set. */
export function effectiveLists(filters: GlobalFilters, cross: CrossFilter[]): Record<ListFilterKey, string[]> {
  const out = {} as Record<ListFilterKey, string[]>;
  for (const key of LIST_KEYS) {
    const extra = cross.filter((c) => c.key === key).map((c) => c.value);
    const base = filters[key] as string[];
    out[key] = base.length && extra.length ? base.filter((v) => extra.includes(v)) : [...base, ...extra];
  }
  return out;
}

export function matchesLists(s: Shipment, lists: Record<ListFilterKey, string[]>, search: string): boolean {
  if (!listMatch(lists.divisions, s.division)) return false;
  if (!listMatch(lists.cities, s.city)) return false;
  if (!listMatch(lists.districts, s.district)) return false;
  if (lists.hubs.length && !(lists.hubs.includes(s.currentNode?.id ?? "") || lists.hubs.includes(s.pkg.source_node_id) || lists.hubs.includes(s.pkg.destination_node_id))) return false;
  if (!listMatch(lists.merchants, s.pkg.merchant_id)) return false;
  if (!listMatch(lists.statuses, s.status)) return false;
  if (!listMatch(lists.statusGroups, s.group)) return false;
  if (!listMatch(lists.serviceTypes, s.pkg.delivery_type)) return false;
  if (!listMatch(lists.riders, s.pkg.assigned_rider_id)) return false;
  if (!listMatch(lists.vehicles, s.pkg.assigned_vehicle_id)) return false;
  if (!listMatch(lists.sla, s.sla)) return false;
  if (!listMatch(lists.priorities, s.pkg.priority)) return false;
  if (!listMatch(lists.paymentTypes, s.pkg.payment_type)) return false;
  if (search) {
    const q = search.toLowerCase();
    const hay = `${s.trackingNumber} ${s.pkg.order_id} ${s.merchantName} ${s.customerName} ${s.city} ${s.origin?.node_name ?? ""} ${s.destination?.node_name ?? ""} ${s.riderName ?? ""} ${s.vehicleReg ?? ""} ${s.status}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function applyFilters(shipments: Shipment[], filters: GlobalFilters, cross: CrossFilter[], now = Date.now()): Shipment[] {
  const range = dateRange(filters, now);
  const lists = effectiveLists(filters, cross);
  const q = filters.search.trim();
  return shipments.filter((s) => {
    if (range && (s.createdAt < range.from || s.createdAt > range.to)) return false;
    return matchesLists(s, lists, q);
  });
}

/** Same list/search constraints, but for the *previous* window (for deltas). */
export function applyFiltersPrevious(shipments: Shipment[], filters: GlobalFilters, cross: CrossFilter[], now = Date.now()): Shipment[] {
  const range = previousRange(filters, now);
  if (!range) return [];
  const lists = effectiveLists(filters, cross);
  const q = filters.search.trim();
  return shipments.filter((s) => s.createdAt >= range.from && s.createdAt <= range.to && matchesLists(s, lists, q));
}

export function countActive(filters: GlobalFilters, cross: CrossFilter[]): number {
  let n = cross.length;
  for (const key of LIST_KEYS) n += (filters[key] as string[]).length;
  if (filters.search) n += 1;
  if (filters.preset !== EMPTY_FILTERS.preset) n += 1;
  return n;
}

// --- URL persistence ------------------------------------------------------

const URL_KEYS: Record<ListFilterKey, string> = {
  divisions: "division",
  cities: "city",
  districts: "zone",
  hubs: "hub",
  merchants: "merchant",
  statuses: "status",
  statusGroups: "stage",
  serviceTypes: "service",
  riders: "rider",
  vehicles: "vehicle",
  sla: "sla",
  priorities: "priority",
  paymentTypes: "payment",
};

export const FILTER_URL_KEYS = new Set(["range", "from", "to", "q", ...Object.values(URL_KEYS)]);

export function filtersToParams(filters: GlobalFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.preset !== EMPTY_FILTERS.preset) p.set("range", filters.preset);
  if (filters.preset === "custom") {
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
  }
  if (filters.search) p.set("q", filters.search);
  for (const key of LIST_KEYS) {
    const list = filters[key] as string[];
    if (list.length) p.set(URL_KEYS[key], list.join(","));
  }
  return p;
}

export function paramsToFilters(params: URLSearchParams): GlobalFilters {
  const f: GlobalFilters = { ...EMPTY_FILTERS };
  const range = params.get("range") as DatePreset | null;
  if (range && range in PRESET_LABELS) f.preset = range;
  f.from = params.get("from");
  f.to = params.get("to");
  if (f.from || f.to) f.preset = "custom";
  f.search = params.get("q") ?? "";
  for (const key of LIST_KEYS) {
    const raw = params.get(URL_KEYS[key]);
    (f[key] as string[]) = raw ? raw.split(",").filter(Boolean) : [];
  }
  return f;
}

/** Only the filter-owned params, sorted, so comparisons ignore unrelated query keys. */
export function filterParamString(params: URLSearchParams): string {
  const entries = [...params.entries()].filter(([k]) => FILTER_URL_KEYS.has(k)).sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entries).toString();
}
