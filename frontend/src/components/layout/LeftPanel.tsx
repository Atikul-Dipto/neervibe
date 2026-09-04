"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import clsx from "clsx";
import { COUNTRY } from "@/config/country";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { NODE_TYPE_COLORS } from "@/components/map/nodeStyle";
import type { NodeType } from "@/types/domain";

const CITIES = [
  "Dhaka",
  "Gazipur",
  "Narayanganj",
  "Chattogram",
  "Cumilla",
  "Sylhet",
  "Rajshahi",
  "Khulna",
  "Rangpur",
  "Mymensingh",
];

const NODE_TYPES = Object.keys(NODE_TYPE_COLORS) as NodeType[];

export function LeftPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const filters = useControlTowerStore((s) => s.filters);
  const setFilter = useControlTowerStore((s) => s.setFilter);
  const regions = useControlTowerStore((s) => s.regions);
  const regionsError = useControlTowerStore((s) => s.regionsError);
  const loadRegions = useControlTowerStore((s) => s.loadRegions);
  const selectedRegion = useControlTowerStore((s) => s.selectedRegion);
  const selectRegion = useControlTowerStore((s) => s.selectRegion);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  const divisions = regions ? [...regions.division].sort((a, b) => a.properties.name.localeCompare(b.properties.name)) : [];
  // A selected district keeps its parent division "open" in the picker.
  const activeDivision =
    selectedRegion?.level === "division" ? selectedRegion.name : (selectedRegion?.division ?? null);
  const districts =
    regions && activeDivision
      ? regions.district
          .filter((d) => d.properties.division === activeDivision)
          .sort((a, b) => a.properties.name.localeCompare(b.properties.name))
      : [];

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-nv-800 bg-nv-950/60 py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-nv-900 hover:text-ink-900"
          title="Expand filters"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center gap-1.5 pt-2">
          {NODE_TYPES.map((type) => (
            <span
              key={type}
              className={clsx(
                "h-2.5 w-2.5 rounded-full ring-1 ring-transparent",
                filters.nodeType === type && "ring-ink-600",
              )}
              style={{ backgroundColor: NODE_TYPE_COLORS[type] }}
              title={type.replaceAll("_", " ")}
            />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-nv-800 bg-nv-950/60 p-4 text-sm">
      <button
        onClick={() => setCollapsed(true)}
        className="flex items-center gap-1.5 self-end rounded-md px-1.5 py-1 text-xs text-ink-500 transition-colors hover:bg-nv-900 hover:text-ink-700"
        title="Collapse filters"
      >
        <PanelLeftClose className="h-3.5 w-3.5" />
      </button>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
          {COUNTRY.levels.division.label}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label={`All ${COUNTRY.name}`} active={selectedRegion === null} onClick={() => selectRegion(null)} />
          {divisions.map((d) => (
            <FilterChip
              key={d.properties.id}
              label={d.properties.name}
              active={activeDivision === d.properties.name}
              onClick={() => selectRegion(d.properties)}
            />
          ))}
        </div>
        {regionsError && <div className="mt-2 text-xs text-rose-600">Boundaries unavailable: {regionsError}</div>}

        {districts.length > 0 && (
          <div className="mt-2.5 rounded-md border border-nv-800 bg-nv-900/70 p-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              {activeDivision} · {COUNTRY.levels.district.label}s
            </div>
            <div className="flex flex-wrap gap-1">
              {districts.map((d) => (
                <FilterChip
                  key={d.properties.id}
                  label={d.properties.name}
                  active={selectedRegion?.id === d.properties.id}
                  onClick={() => selectRegion(d.properties)}
                  small
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">City</h3>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All"
            active={filters.city === null}
            onClick={() => setFilter("city", null)}
          />
          {CITIES.map((city) => (
            <FilterChip
              key={city}
              label={city}
              active={filters.city === city}
              onClick={() => setFilter("city", city)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Node Type</h3>
        <div className="flex flex-col gap-1">
          <LegendRow
            label="All types"
            color="#a48aa0"
            active={filters.nodeType === null}
            onClick={() => setFilter("nodeType", null)}
          />
          {NODE_TYPES.map((type) => (
            <LegendRow
              key={type}
              label={type.replaceAll("_", " ")}
              color={NODE_TYPE_COLORS[type]}
              active={filters.nodeType === type}
              onClick={() => setFilter("nodeType", type)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  small = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border transition-all duration-200",
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        active
          ? "border-plum bg-plum text-white shadow-[var(--shadow-sm)]"
          : "border-nv-700 text-ink-600 hover:-translate-y-px hover:border-accent-500 hover:bg-accent-300/30 hover:text-ink-900",
      )}
    >
      {label}
    </button>
  );
}

function LegendRow({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{ "--dot-color": color } as React.CSSProperties}
      className={clsx(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200",
        active
          ? "bg-nv-800 text-ink-900"
          : "text-ink-600 hover:translate-x-0.5 hover:bg-accent-300/40 hover:text-ink-900",
      )}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-200 group-hover:scale-[1.35] group-hover:shadow-[0_0_8px_1px_var(--dot-color)]"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs capitalize">{label.toLowerCase()}</span>
    </button>
  );
}
