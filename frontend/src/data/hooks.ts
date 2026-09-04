"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { filtersToParams, useFilterStore, type GlobalFilters, type ListFilterKey } from "./filters";
import { useDrawerStore } from "./drawer";

/**
 * Drill-down: navigate to a page carrying the current filters plus
 * overrides, so "click delayed KPI" lands on /shipments already filtered.
 */
export function useDrill() {
  const router = useRouter();
  const filters = useFilterStore((s) => s.filters);
  return useCallback(
    (route: string, overrides: Partial<GlobalFilters> = {}) => {
      const qs = filtersToParams({ ...filters, ...overrides }).toString();
      router.push(`${route}${qs ? `?${qs}` : ""}`);
    },
    [router, filters],
  );
}

/**
 * Cross-filter helper for a visualisation. `toggle` behaves like a radio
 * within the same source (clicking a second bar replaces the first) and
 * clears when the active value is clicked again.
 */
export function useCross(source: string) {
  const cross = useFilterStore((s) => s.cross);
  const setCross = useFilterStore((s) => s.setCross);
  const mine = useMemo(() => cross.filter((c) => c.source === source), [cross, source]);
  const activeValue = (key: ListFilterKey) => mine.find((c) => c.key === key)?.value ?? null;
  const toggle = (key: ListFilterKey, value: string, label: string) => {
    if (activeValue(key) === value) setCross(null, source);
    else setCross({ key, value, label, source }, source);
  };
  return { active: mine.length > 0, activeValue, toggle, clear: () => setCross(null, source) };
}

export function useOpenDrawer() {
  return useDrawerStore((s) => s.open);
}
