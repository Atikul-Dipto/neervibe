"use client";

import { TrackingSearch } from "@/components/packages/TrackingSearch";
import { useControlTowerStore, type ActiveView } from "@/store/useControlTowerStore";

const NAV_ITEMS: { label: string; view: ActiveView }[] = [
  { label: "Network", view: "network" },
  { label: "Operations", view: "operations" },
  { label: "Packages", view: "packages" },
  { label: "Vehicles", view: "vehicles" },
  { label: "Hubs", view: "hubs" },
  { label: "Analytics", view: "analytics" },
  { label: "AI Intelligence", view: "ai" },
];

export function TopNav() {
  const activeView = useControlTowerStore((s) => s.activeView);
  const setActiveView = useControlTowerStore((s) => s.setActiveView);

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-nv-800 bg-nv-950/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_8px_2px_rgba(45,212,191,0.6)]" />
        <span className="font-semibold tracking-wide text-slate-100">
          NEER<span className="text-teal-400">VIBE</span>
        </span>
      </div>

      <nav className="flex items-center gap-1 text-sm">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            onClick={() => setActiveView(item.view)}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              activeView === item.view
                ? "bg-nv-800 text-slate-50"
                : "text-slate-400 hover:bg-nv-900 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto w-80">
        <TrackingSearch />
      </div>
    </header>
  );
}
