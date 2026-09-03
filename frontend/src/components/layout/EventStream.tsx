"use client";

import { Radio } from "lucide-react";
import { useControlTowerStore } from "@/store/useControlTowerStore";

export function EventStream() {
  const eventLog = useControlTowerStore((s) => s.eventLog);

  return (
    <footer className="flex h-40 shrink-0 flex-col border-t border-nv-800 bg-nv-950/80">
      <div className="flex items-center gap-2 border-b border-nv-800 px-4 py-1.5">
        <Radio className="h-3 w-3 text-emerald-400" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Live Event Stream
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
        {eventLog.length === 0 && (
          <div className="text-zinc-600">Waiting for events — start the simulator to see live updates.</div>
        )}
        {eventLog.map((e, i) => (
          <div key={`${e.package_id}-${e.timestamp}-${i}`} className="flex gap-3 py-0.5 text-zinc-400">
            <span className="tabular-nums text-zinc-600">{new Date(e.timestamp).toLocaleTimeString()}</span>
            <span className="text-teal-400">{e.tracking_number}</span>
            <span>
              {e.previous_status ? `${e.previous_status.replaceAll("_", " ")} → ` : ""}
              <span className="text-zinc-200">{e.new_status.replaceAll("_", " ")}</span>
            </span>
          </div>
        ))}
      </div>
    </footer>
  );
}
