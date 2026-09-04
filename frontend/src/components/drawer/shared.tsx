"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { Shipment } from "@/data/derive";
import { useDrawerStore, type DrawerKind } from "@/data/drawer";
import { StatusPill, packageStatusTone, slaTone } from "@/components/ui/StatusPill";
import { SLA_LABELS } from "@/data/derive";
import { formatRelative, humanize } from "@/data/format";
import type { Recommendation } from "@/ai/recommend";
import { Sparkles } from "lucide-react";

export function DrawerSection({ title, children, right, className }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={clsx("border-b border-nv-800 px-4 py-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

export function KV({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
      {items.map((it) => (
        <div key={it.k} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-ink-500">{it.k}</dt>
          <dd className="truncate text-xs text-ink-900">{it.v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A link that opens another entity in the drawer (keeps drill-down history). */
export function EntityLink({ kind, id, children, className }: { kind: DrawerKind; id: string; children: ReactNode; className?: string }) {
  const open = useDrawerStore((s) => s.open);
  return (
    <button onClick={() => open(kind, id)} className={clsx("inline-flex items-center gap-0.5 text-left text-accent-700 hover:underline", className)}>
      {children}
      <ChevronRight className="h-3 w-3 opacity-60" />
    </button>
  );
}

export function ShipmentRow({ s, showCity = true }: { s: Shipment; showCity?: boolean }) {
  const open = useDrawerStore((s) => s.open);
  return (
    <button onClick={() => open("shipment", s.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-nv-850">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-ink-900">{s.trackingNumber}</span>
          <StatusPill tone={packageStatusTone(s.status)} size="xs">
            {humanize(s.status)}
          </StatusPill>
        </span>
        <span className="block truncate text-[10px] text-ink-500">
          {s.merchantName}
          {showCity && ` → ${s.city}`} · {formatRelative(new Date(s.updatedAt))}
        </span>
      </span>
      {s.sla !== "n_a" && (
        <StatusPill tone={slaTone(s.sla)} size="xs">
          {SLA_LABELS[s.sla]}
        </StatusPill>
      )}
    </button>
  );
}

export function ShipmentList({ shipments, max = 8, emptyMessage = "None." }: { shipments: Shipment[]; max?: number; emptyMessage?: string }) {
  if (shipments.length === 0) return <div className="text-xs text-ink-500">{emptyMessage}</div>;
  return (
    <div className="flex flex-col">
      {shipments.slice(0, max).map((s) => (
        <ShipmentRow key={s.id} s={s} />
      ))}
      {shipments.length > max && <div className="px-1.5 pt-1 text-[11px] text-ink-500">+{shipments.length - max} more</div>}
    </div>
  );
}

export function RecommendationCard({ rec }: { rec: Recommendation | null }) {
  if (!rec) {
    return (
      <div className="rounded-md border border-nv-800 bg-nv-950/40 p-2.5 text-xs text-ink-500">
        No action needed right now. The system re-evaluates every minute.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
        <Sparkles className="h-3 w-3" /> Recommended action · rule-based
      </div>
      <div className="text-ink-700">
        <span className="text-ink-500">Problem · </span>
        {rec.problem}
      </div>
      <div className="mt-1 font-medium text-ink-900">{rec.action}</div>
      <div className="mt-1 text-ink-700">
        <span className="text-ink-500">Expected impact · </span>
        {rec.impact}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-ink-500">Confidence</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nv-800">
          <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.round(rec.confidence * 100)}%` }} />
        </div>
        <span className="tabular-nums text-ink-700">{Math.round(rec.confidence * 100)}%</span>
      </div>
      {rec.because.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-ink-500">
          {rec.because.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NotFound({ what }: { what: string }) {
  return <div className="p-6 text-center text-xs text-ink-500">This {what} is no longer in the current snapshot.</div>;
}
