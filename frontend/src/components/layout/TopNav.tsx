"use client";

import {
  Activity,
  BarChart3,
  Building2,
  Map as MapIcon,
  Package,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { TrackingSearch } from "@/components/packages/TrackingSearch";
import { useControlTowerStore, type ActiveView } from "@/store/useControlTowerStore";
import clsx from "clsx";

const NAV_ITEMS: { label: string; view: ActiveView; icon: LucideIcon }[] = [
  { label: "Network", view: "network", icon: MapIcon },
  { label: "Operations", view: "operations", icon: Activity },
  { label: "Packages", view: "packages", icon: Package },
  { label: "Vehicles", view: "vehicles", icon: Truck },
  { label: "Hubs", view: "hubs", icon: Building2 },
  { label: "Analytics", view: "analytics", icon: BarChart3 },
  { label: "AI Intelligence", view: "ai", icon: Sparkles },
];

export function TopNav() {
  const activeView = useControlTowerStore((s) => s.activeView);
  const setActiveView = useControlTowerStore((s) => s.setActiveView);

  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-nv-800 bg-gradient-to-b from-nv-900/85 to-nv-950/85 px-4 backdrop-blur">
      <div className="flex items-center gap-2 justify-self-start">
        <span className="h-2 w-2 animate-[breathe_2.4s_ease-in-out_infinite] rounded-full bg-accent-500" />
        <span className="font-semibold tracking-wide text-ink-900">
          NEER
          <span className="bg-gradient-to-r from-plum via-[#6e2f66] to-accent-700 bg-clip-text text-transparent">
            VIBE
          </span>
        </span>
      </div>

      <nav className="flex items-center gap-1 text-sm justify-self-center">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            onClick={() => setActiveView(item.view)}
            className={clsx(
              "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all duration-200",
              activeView === item.view
                ? "bg-gradient-to-br from-accent-300/50 to-accent-300/20 text-ink-900 shadow-[inset_0_0_0_1px_rgba(69,12,63,0.3)] after:absolute after:inset-x-3.5 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-plum after:to-accent-500"
                : "text-ink-600 hover:-translate-y-px hover:bg-accent-300/40 hover:text-ink-900",
            )}
          >
            <item.icon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden xl:inline">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="w-80 justify-self-end">
        <TrackingSearch />
      </div>
    </header>
  );
}
