"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Bookmark, CalendarDays, Check, ChevronDown, FilterX, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useDerived } from "@/data/provider";
import {
  FILTER_LABELS,
  LIST_KEYS,
  PRESET_LABELS,
  countActive,
  filtersToParams,
  useFilterStore,
  type DatePreset,
  type ListFilterKey,
} from "@/data/filters";
import { useOpsStore } from "@/data/ops";
import { SLA_LABELS, SLA_STATES, STATUS_GROUPS } from "@/data/derive";
import { DELIVERY_TYPES, PACKAGE_STATUSES } from "@/types/domain";
import { humanize } from "@/data/format";
import { Chip, Popover } from "@/components/ui/primitives";

interface Option {
  value: string;
  label: string;
  hint?: string;
}

const PRESETS: DatePreset[] = ["today", "24h", "7d", "30d", "all"];

/** The always-available global filter bar with active-filter chips. */
export function FilterBar() {
  const pathname = usePathname();
  const router = useRouter();
  const derived = useDerived();
  const filters = useFilterStore((s) => s.filters);
  const cross = useFilterStore((s) => s.cross);
  const setPreset = useFilterStore((s) => s.setPreset);
  const setRange = useFilterStore((s) => s.setRange);
  const setSearch = useFilterStore((s) => s.setSearch);
  const setList = useFilterStore((s) => s.setList);
  const toggleValue = useFilterStore((s) => s.toggleValue);
  const removeCross = useFilterStore((s) => s.removeCross);
  const clearAll = useFilterStore((s) => s.clearAll);
  const savedViews = useOpsStore((s) => s.savedViews);
  const saveView = useOpsStore((s) => s.saveView);
  const deleteView = useOpsStore((s) => s.deleteView);
  const [mobileOpen, setMobileOpen] = useState(false);

  const options = useMemo<Record<ListFilterKey, Option[]>>(() => {
    const m = derived;
    return {
      divisions: m.divisions.map((d) => ({ value: d, label: d })),
      cities: m.cities.map((c) => ({ value: c, label: c })),
      districts: m.districts.map((d) => ({ value: d, label: d })),
      hubs: m.hubNodes.map((h) => ({ value: h.id, label: h.node_name, hint: h.city })),
      merchants: m.merchants.map((x) => ({ value: x.id, label: x.name, hint: x.city ?? undefined })),
      statuses: PACKAGE_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
      statusGroups: STATUS_GROUPS.map((g) => ({ value: g.key, label: g.label })),
      serviceTypes: DELIVERY_TYPES.map((t) => ({ value: t, label: humanize(t) })),
      riders: m.riders.map((r) => ({ value: r.id, label: r.name, hint: r.city ?? undefined })),
      vehicles: m.vehicles.map((v) => ({ value: v.id, label: v.registration_number, hint: humanize(v.vehicle_type) })),
      sla: SLA_STATES.map((s) => ({ value: s, label: SLA_LABELS[s] })),
      priorities: ["URGENT", "HIGH", "NORMAL", "LOW"].map((p) => ({ value: p, label: humanize(p) })),
      paymentTypes: [
        { value: "COD", label: "COD" },
        { value: "PREPAID", label: "Prepaid" },
      ],
    };
  }, [derived]);

  const labelFor = (key: ListFilterKey, value: string) => options[key].find((o) => o.value === value)?.label ?? value;
  const active = countActive(filters, cross);
  const BAR_KEYS: ListFilterKey[] = ["divisions", "cities", "districts", "hubs", "merchants", "statuses", "serviceTypes", "riders", "vehicles", "sla"];

  const chips: { key: ListFilterKey; value: string; label: string; source?: string }[] = [];
  for (const key of LIST_KEYS) for (const v of filters[key] as string[]) chips.push({ key, value: v, label: labelFor(key, v) });
  for (const c of cross) chips.push({ key: c.key, value: c.value, label: c.label, source: c.source });

  const onSaveView = () => {
    const name = window.prompt("Name this view");
    if (!name) return;
    saveView(name.trim(), pathname, filtersToParams(filters).toString());
  };

  return (
    <div className="shrink-0 border-b border-nv-800 bg-nv-950/70">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 md:px-4">
        <div className="flex items-center gap-0.5 rounded-md border border-nv-800 bg-nv-900 p-0.5" role="group" aria-label="Date range">
          <CalendarDays className="ml-1.5 h-3.5 w-3.5 text-ink-500" aria-hidden />
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={clsx("rounded px-2 py-0.5 text-[11px] transition-colors", filters.preset === p ? "bg-nv-800 text-ink-900" : "text-ink-600 hover:text-ink-900")}
              aria-pressed={filters.preset === p}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => setPreset("custom")}
            className={clsx("rounded px-2 py-0.5 text-[11px]", filters.preset === "custom" ? "bg-nv-800 text-ink-900" : "text-ink-600 hover:text-ink-900")}
            aria-pressed={filters.preset === "custom"}
          >
            Custom
          </button>
          {filters.preset === "custom" && (
            <span className="flex items-center gap-1 pl-1">
              <input type="date" value={filters.from ?? ""} onChange={(e) => setRange(e.target.value || null, filters.to)} className="rounded border border-nv-700 bg-nv-950/60 px-1 py-0.5 text-[11px] text-ink-700" aria-label="From date" />
              <span className="text-ink-500">–</span>
              <input type="date" value={filters.to ?? ""} onChange={(e) => setRange(filters.from, e.target.value || null)} className="rounded border border-nv-700 bg-nv-950/60 px-1 py-0.5 text-[11px] text-ink-700" aria-label="To date" />
            </span>
          )}
        </div>

        <button onClick={() => setMobileOpen((v) => !v)} className="flex items-center gap-1 rounded-md border border-nv-800 bg-nv-900 px-2 py-1 text-[11px] text-ink-600 md:hidden" aria-expanded={mobileOpen}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters {active > 0 && <span className="text-accent-700">({active})</span>}
        </button>

        <div className={clsx("flex-wrap items-center gap-1.5", mobileOpen ? "flex w-full" : "hidden md:flex")}>
          {BAR_KEYS.map((key) => (
            <MultiSelect key={key} label={FILTER_LABELS[key]} options={options[key]} values={filters[key] as string[]} onToggle={(v) => toggleValue(key, v)} onClear={() => setList(key, [])} />
          ))}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-500" aria-hidden />
            <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter text…" aria-label="Text filter" className="w-32 rounded-md border border-nv-800 bg-nv-900 py-1 pl-6 pr-2 text-[11px] text-ink-900 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none" />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Popover
            align="right"
            width="w-64"
            trigger={({ toggle }) => (
              <button onClick={toggle} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-600 hover:bg-nv-850 hover:text-ink-900" title="Saved views">
                <Bookmark className="h-3.5 w-3.5" /> Views
              </button>
            )}
          >
            {(close) => (
              <div className="p-1.5 text-xs">
                <button onClick={() => { onSaveView(); close(); }} className="mb-1 w-full rounded border border-dashed border-nv-700 py-1 text-[11px] text-ink-700 hover:bg-nv-850">
                  Save current filters as a view
                </button>
                {savedViews.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-ink-500">No saved views yet.</div>}
                {savedViews.map((v) => (
                  <div key={v.id} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-nv-850">
                    <button onClick={() => { router.push(`${v.route}${v.params ? `?${v.params}` : ""}`); close(); }} className="min-w-0 flex-1 truncate text-left text-ink-900" title={`${v.route}?${v.params}`}>
                      {v.name}
                      <span className="ml-1 text-[10px] text-ink-500">{v.route}</span>
                    </button>
                    <button onClick={() => deleteView(v.id)} className="rounded p-0.5 text-ink-500 hover:text-rose-300" aria-label={`Delete view ${v.name}`}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Popover>
          {active > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-600 hover:bg-nv-850 hover:text-rose-300" title="Clear all filters">
              <FilterX className="h-3.5 w-3.5" /> Clear all
            </button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-1.5 md:px-4" aria-label="Active filters">
          {chips.map((c) => (
            <Chip
              key={`${c.key}:${c.value}:${c.source ?? "bar"}`}
              tone={c.source ? "accent" : "default"}
              onRemove={() => (c.source ? removeCross(c.key, c.value) : toggleValue(c.key, c.value))}
            >
              <span className="text-ink-500">{FILTER_LABELS[c.key]}:</span> {c.label}
              {c.source && <span className="text-[10px] text-ink-500">· via {c.source}</span>}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSelect({ label, options, values, onToggle, onClear }: { label: string; options: Option[]; values: string[]; onToggle: (v: string) => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()) || o.hint?.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <Popover
      width="w-60"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className={clsx(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
            values.length ? "border-accent-500/50 bg-accent-100/60 text-accent-700" : "border-nv-800 bg-nv-900 text-ink-600 hover:border-nv-600 hover:text-ink-900",
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {label}
          {values.length > 0 && <span className="rounded bg-accent-300/40 px-1 text-[10px] tabular-nums">{values.length}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      )}
    >
      <div className="p-1.5">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="mb-1 w-full rounded border border-nv-700 bg-nv-950/60 px-2 py-1 text-[11px] text-ink-900 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none" aria-label={`Search ${label}`} />
        <div className="max-h-56 overflow-y-auto" role="listbox" aria-multiselectable>
          {shown.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-ink-500">No options.</div>}
          {shown.map((o) => {
            const on = values.includes(o.value);
            return (
              <button key={o.value} role="option" aria-selected={on} onClick={() => onToggle(o.value)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-nv-850">
                <span className={clsx("flex h-3.5 w-3.5 items-center justify-center rounded border", on ? "border-cyan-400 bg-cyan-400 text-nv-950" : "border-nv-600")}>{on && <Check className="h-2.5 w-2.5" />}</span>
                <span className="min-w-0 flex-1 truncate text-ink-900">{o.label}</span>
                {o.hint && <span className="shrink-0 text-[10px] text-ink-500">{o.hint}</span>}
              </button>
            );
          })}
        </div>
        {values.length > 0 && (
          <button onClick={onClear} className="mt-1 w-full rounded py-1 text-[11px] text-ink-500 hover:bg-nv-850 hover:text-ink-900">
            Clear {label.toLowerCase()}
          </button>
        )}
      </div>
    </Popover>
  );
}
