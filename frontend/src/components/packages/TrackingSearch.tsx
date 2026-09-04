"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useControlTowerStore } from "@/store/useControlTowerStore";

export function TrackingSearch() {
  const [value, setValue] = useState("");
  const selectTrackingNumber = useControlTowerStore((s) => s.selectTrackingNumber);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) selectTrackingNumber(trimmed);
  }

  return (
    <form onSubmit={submit} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Track package (PKG-...)"
        className="w-full rounded-md border border-nv-700 bg-nv-900 py-1.5 pl-8 pr-3 text-sm text-ink-900 placeholder:text-ink-500 transition-all duration-200 hover:border-nv-600 hover:shadow-[0_0_0_3px_rgba(69,12,63,0.08)] focus:border-plum focus:outline-none focus:ring-1 focus:ring-plum/25"
      />
    </form>
  );
}
