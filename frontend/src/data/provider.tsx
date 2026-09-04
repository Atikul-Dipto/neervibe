"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useDataStore } from "./store";
import { derive, EMPTY_DERIVED, type Derived, type Shipment } from "./derive";
import { applyFilters, useFilterStore } from "./filters";
import { useControlTowerStore } from "@/store/useControlTowerStore";

const DerivedContext = createContext<Derived>(EMPTY_DERIVED);

/**
 * Computes the analytics layer once per data change and shares it with
 * every page. Time-based fields (SLA countdowns, ages) tick once a minute.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const status = useDataStore((s) => s.status);
  const load = useDataStore((s) => s.load);
  const version = useDataStore((s) => s.version);
  const regions = useControlTowerStore((s) => s.regions);
  const loadRegions = useControlTowerStore((s) => s.loadRegions);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));

  useEffect(() => {
    if (status === "idle") void load();
    void loadRegions();
  }, [status, load, loadRegions]);

  useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 60000);
    return () => clearInterval(t);
  }, []);

  const derived = useMemo(() => {
    const s = useDataStore.getState();
    if (s.status !== "ready") return EMPTY_DERIVED;
    return derive({
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
      regions,
      now: minute * 60000,
    });
    // `version` is the store's change counter; it is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, status, regions, minute]);

  return <DerivedContext.Provider value={derived}>{children}</DerivedContext.Provider>;
}

export function useDerived(): Derived {
  return useContext(DerivedContext);
}

/** Shipments after the global filter bar + this page's cross filters. */
export function useFilteredShipments(): Shipment[] {
  const derived = useDerived();
  const filters = useFilterStore((s) => s.filters);
  const cross = useFilterStore((s) => s.cross);
  return useMemo(() => applyFilters(derived.shipments, filters, cross, derived.now), [derived, filters, cross]);
}

/** Shipments after the global filter bar only (ignores page cross filters),
 * for the visualisation that *produced* a cross filter so it keeps showing
 * the alternatives the user could pick next. */
export function useBarFilteredShipments(): Shipment[] {
  const derived = useDerived();
  const filters = useFilterStore((s) => s.filters);
  return useMemo(() => applyFilters(derived.shipments, filters, [], derived.now), [derived, filters]);
}

export function useDataStatus() {
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);
  const warnings = useDataStore((s) => s.warnings);
  const loadedAt = useDataStore((s) => s.loadedAt);
  const refreshing = useDataStore((s) => s.refreshing);
  const partial = useDataStore((s) => s.partial);
  const stale = useDataStore((s) => s.stale);
  const refresh = useDataStore((s) => s.refresh);
  const load = useDataStore((s) => s.load);
  return { status, error, warnings, loadedAt, refreshing, partial, stale, refresh, load };
}
