"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import clsx from "clsx";
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

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-nv-800 bg-nv-950/60 py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-nv-900 hover:text-zinc-200"
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
                filters.nodeType === type && "ring-zinc-400",
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
        className="flex items-center gap-1.5 self-end rounded-md px-1.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-nv-900 hover:text-zinc-300"
        title="Collapse filters"
      >
        <PanelLeftClose className="h-3.5 w-3.5" />
      </button>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">City</h3>
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
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Node Type</h3>
        <div className="flex flex-col gap-1">
          <LegendRow
            label="All types"
            color="#71717a"
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
      className={clsx(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-teal-500 bg-teal-500/10 text-teal-300"
          : "border-nv-700 text-zinc-400 hover:border-nv-600 hover:text-zinc-200",
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
          ? "bg-nv-800 text-zinc-100"
          : "text-zinc-400 hover:translate-x-0.5 hover:bg-teal-400/[0.06] hover:text-zinc-200",
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
