"use client";

import { useState } from "react";
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
    <form onSubmit={submit}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Track package (PKG-...)"
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
      />
    </form>
  );
}
