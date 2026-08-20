"use client";

import { useState } from "react";
import { TrackingSearch } from "@/components/packages/TrackingSearch";

const NAV_ITEMS = ["Network", "Operations", "Packages", "Vehicles", "Hubs", "Analytics", "AI Intelligence"];

export function TopNav() {
  const [active, setActive] = useState("Network");

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
            key={item}
            onClick={() => setActive(item)}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active === item
                ? "bg-nv-800 text-slate-50"
                : "text-slate-400 hover:bg-nv-900 hover:text-slate-200"
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="ml-auto w-80">
        <TrackingSearch />
      </div>
    </header>
  );
}
