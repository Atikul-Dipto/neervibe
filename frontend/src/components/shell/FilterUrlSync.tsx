"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FILTER_URL_KEYS, filterParamString, filtersToParams, paramsToFilters, useFilterStore } from "@/data/filters";

/**
 * Two-way binding between the filter store and the URL, so every filtered
 * view is a shareable deep link and browser back/forward restores state.
 *
 *  - A URL that carries filter params (a deep link, a KPI drill-down) is
 *    authoritative and hydrates the store.
 *  - Navigating to a page whose URL carries none keeps the current filters
 *    and writes them into the new URL, so filters persist across pages.
 *  - Cross filters are page-scoped and reset on navigation.
 */
export function FilterUrlSync() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const filters = useFilterStore((s) => s.filters);
  const replaceFilters = useFilterStore((s) => s.replaceFilters);
  const clearCross = useFilterStore((s) => s.clearCross);
  const lastApplied = useRef<string | null>(null);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const str = filterParamString(params);
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      clearCross();
      if (str === "") {
        lastApplied.current = null; // carry current filters into the new URL
        return;
      }
    }
    if (str !== lastApplied.current) {
      lastApplied.current = str;
      replaceFilters(paramsToFilters(params));
    }
  }, [params, pathname, replaceFilters, clearCross]);

  useEffect(() => {
    const desired = filterParamString(filtersToParams(filters));
    if (desired === lastApplied.current) return;
    lastApplied.current = desired;
    const merged = new URLSearchParams(params.toString());
    for (const k of [...merged.keys()]) if (FILTER_URL_KEYS.has(k)) merged.delete(k);
    for (const [k, v] of filtersToParams(filters)) merged.set(k, v);
    const qs = merged.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return null;
}
