"use client";

import { Radio } from "lucide-react";
import clsx from "clsx";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { useDerived } from "@/data/provider";
import { useDrawerStore } from "@/data/drawer";
import { formatTime, humanize } from "@/data/format";
import { StatusPill, packageStatusTone } from "@/components/ui/StatusPill";
import { useSystemStore } from "@/data/system";

/**
 * The live event stream: every status change as it arrives over the
 * WebSocket, with timestamp, event, entity, location and severity. Rows
 * open the shipment.
 */
export function EventStream({ className, max = 60, compact = false }: { className?: string; max?: number; compact?: boolean }) {
  const eventLog = useControlTowerStore((s) => s.eventLog);
  const ws = useSystemStore((s) => s.ws);
  const derived = useDerived();
  const open = useDrawerStore((s) => s.open);

  return (
    <div className={clsx("flex min-h-0 flex-col rounded-lg border border-nv-800 bg-nv-900", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-nv-800 px-3 py-1.5">
        <Radio className={clsx("h-3 w-3", ws === "open" ? "text-emerald-400" : "text-amber-400")} aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Live event stream</span>
        <span className="ml-auto text-[10px] text-ink-500">{ws === "open" ? "connected" : ws}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px]">
        {eventLog.length === 0 && <div className="px-1 py-3 text-ink-500">Waiting for events — status changes appear here as they happen.</div>}
        {eventLog.slice(0, max).map((e, i) => {
          const s = derived.shipmentsById.get(e.package_id);
          const severity = e.new_status === "DELIVERY_FAILED" || e.new_status === "LOST" || e.new_status === "DAMAGED" ? "danger" : e.new_status === "DELIVERED" ? "good" : e.new_status.startsWith("RETURN") ? "warning" : "neutral";
          return (
            <button
              key={`${e.package_id}-${e.timestamp}-${i}`}
              onClick={() => open("shipment", e.package_id)}
              className="grid w-full grid-cols-[auto_auto_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-nv-850"
            >
              <span className="tabular-nums text-ink-500">{formatTime(e.timestamp)}</span>
              <span className={clsx("h-1.5 w-1.5 rounded-full", { danger: "bg-rose-400", good: "bg-emerald-400", warning: "bg-amber-400", neutral: "bg-cyan-400" }[severity])} aria-hidden />
              <span className="truncate text-ink-700">
                <span className="text-accent-700">{e.tracking_number}</span>
                {!compact && s && <span className="text-ink-500"> · {s.city}</span>}
                <span className="text-ink-500"> {e.previous_status ? `${humanize(e.previous_status)} → ` : ""}</span>
                <span className="text-ink-900">{humanize(e.new_status)}</span>
              </span>
              {!compact && (
                <StatusPill tone={packageStatusTone(e.new_status)} size="xs">
                  {humanize(e.new_status)}
                </StatusPill>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
