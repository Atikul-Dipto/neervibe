"use client";

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
  const filters = useControlTowerStore((s) => s.filters);
  const setFilter = useControlTowerStore((s) => s.setFilter);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-nv-800 bg-nv-950/60 p-4 text-sm">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">City</h3>
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
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Node Type</h3>
        <div className="flex flex-col gap-1">
          <LegendRow
            label="All types"
            color="#64748b"
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

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-teal-500 bg-teal-500/10 text-teal-300"
          : "border-nv-700 text-slate-400 hover:border-nv-600 hover:text-slate-200"
      }`}
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
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
        active ? "bg-nv-800 text-slate-100" : "text-slate-400 hover:bg-nv-900 hover:text-slate-200"
      }`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs capitalize">{label.toLowerCase()}</span>
    </button>
  );
}
