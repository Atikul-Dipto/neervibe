"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, RiskBadge, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill, packageStatusTone, slaTone } from "@/components/ui/StatusPill";
import { Progress } from "@/components/ui/primitives";
import { ErrorState, EmptyState } from "@/components/ui/States";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarList } from "@/components/charts/BarList";
import { SLA_LABELS, type RiderStats, type Shipment } from "@/data/derive";
import { errorMessage, transitionShipment } from "@/data/actions";
import { useOpenDrawer } from "@/data/hooks";
import { useOpsStore } from "@/data/ops";
import { ROLE_BY_KEY } from "@/config/roles";
import { effectiveLists } from "@/data/filters";
import { formatMinutes, humanize } from "@/data/format";
import type { PackageStatus } from "@/types/domain";

export default function DispatchPage() {
  return (
    <DataGate>
      <Dispatch />
    </DataGate>
  );
}

/** Best rider for a parcel: same city, idle first, then lightest load, then score. */
function recommendRider(s: Shipment, riders: RiderStats[]): RiderStats | null {
  const pool = riders.filter((r) => r.city === s.city && r.rider.status !== "OFF_DUTY" && r.workload !== "overloaded");
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => a.active.length - b.active.length || (b.score ?? 0) - (a.score ?? 0))[0];
}

function nextStatusFor(s: Shipment): PackageStatus | null {
  if (s.status === "ARRIVED_AT_DESTINATION_HUB" || s.status === "RESCHEDULED") return "OUT_FOR_DELIVERY";
  if (s.status === "PACKAGE_CREATED") return "PICKUP_ASSIGNED";
  return null;
}

function Dispatch() {
  const { derived, shipments, filters, cross } = usePageData();
  const open = useOpenDrawer();
  const role = useOpsStore((s) => s.role);
  const canAct = ROLE_BY_KEY[role].canAct;
  const lists = effectiveLists(filters, cross);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoResult, setAutoResult] = useState<string | null>(null);

  const riders = useMemo(() => derived.riders.filter((r) => !lists.cities.length || (r.city && lists.cities.includes(r.city))), [derived.riders, lists.cities]);
  const queue = useMemo(() => shipments.filter((s) => s.isActive && nextStatusFor(s) != null && !s.pkg.assigned_rider_id).sort((a, b) => b.riskScore - a.riskScore), [shipments]);
  const active = useMemo(() => riders.filter((r) => r.active.length > 0).sort((a, b) => b.active.length - a.active.length), [riders]);
  const available = useMemo(() => riders.filter((r) => r.rider.status === "AVAILABLE").sort((a, b) => a.active.length - b.active.length), [riders]);

  const assign = async (s: Shipment, riderId: string | null) => {
    const status = nextStatusFor(s);
    if (!status) return;
    setBusy((b) => new Set(b).add(s.id));
    setErrors((e) => ({ ...e, [s.id]: "" }));
    try {
      await transitionShipment(s.pkg, status, { riderId: riderId ?? undefined, nodeId: s.pkg.current_node_id ?? undefined });
    } catch (err) {
      setErrors((e) => ({ ...e, [s.id]: errorMessage(err, "Assignment failed") }));
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(s.id);
        return n;
      });
    }
  };

  const autoAssign = async (n: number) => {
    setAutoResult(null);
    let ok = 0;
    const load = new Map<string, number>();
    for (const s of queue.slice(0, n)) {
      const pool = riders.map((r) => ({ ...r, active: [...r.active, ...Array(load.get(r.id) ?? 0)] }));
      const rec = recommendRider(s, pool as RiderStats[]);
      if (!rec) continue;
      load.set(rec.id, (load.get(rec.id) ?? 0) + 1);
      try {
        await transitionShipment(s.pkg, nextStatusFor(s)!, { riderId: rec.id, nodeId: s.pkg.current_node_id ?? undefined });
        ok += 1;
      } catch {
        // surfaced per row on the next render
      }
    }
    setAutoResult(`${ok} parcel${ok === 1 ? "" : "s"} assigned to the recommended riders.`);
  };

  // Capacity planning per city: out-for-delivery demand vs rider capacity.
  const capacity = useMemo(() => {
    const cities = new Map<string, { demand: number; riders: number }>();
    for (const s of shipments.filter((x) => x.isActive && (x.group === "out_for_delivery" || x.status === "ARRIVED_AT_DESTINATION_HUB"))) {
      const c = cities.get(s.city) ?? { demand: 0, riders: 0 };
      c.demand += 1;
      cities.set(s.city, c);
    }
    for (const r of derived.riders) {
      if (!r.city || r.rider.status === "OFF_DUTY") continue;
      const c = cities.get(r.city) ?? { demand: 0, riders: 0 };
      c.riders += 1;
      cities.set(r.city, c);
    }
    return [...cities.entries()].map(([city, c]) => ({ city, ...c, ratio: c.riders ? c.demand / (c.riders * 8) : 1 })).sort((a, b) => b.ratio - a.ratio);
  }, [shipments, derived.riders]);

  const corridors = useMemo(
    () =>
      [...derived.routes]
        .map((e) => ({ e, eff: e.estimated_travel_time / Math.max(e.current_travel_time, 1) }))
        .sort((a, b) => a.eff - b.eff)
        .slice(0, 8)
        .map(({ e, eff }) => ({ key: e.id, label: `${derived.nodesById.get(e.source_node_id)?.city ?? "?"} → ${derived.nodesById.get(e.destination_node_id)?.city ?? "?"}`, value: eff * 100, display: `${Math.round(eff * 100)}%`, secondary: `${e.active_package_count} parcels · +${e.current_travel_time - e.estimated_travel_time} min`, color: eff < 0.6 ? "#f87171" : eff < 0.8 ? "#fbbf24" : "#34d399" })),
    [derived],
  );

  return (
    <Page>
      <PageHeader
        title="Dispatch"
        description="Rider assignment and last-mile operations. Assignments go through the backend state machine."
        actions={
          canAct && queue.length > 0 ? (
            <Button size="sm" variant="ai" onClick={() => autoAssign(Math.min(10, queue.length))}>
              <Sparkles className="h-3.5 w-3.5" /> AI assign top {Math.min(10, queue.length)}
            </Button>
          ) : null
        }
      />
      <KpiGrid>
        <KpiCard label="Unassigned" value={queue.length} tone={queue.length > 0 ? "warning" : "good"} sub="ready for a rider" />
        <KpiCard label="Available riders" value={available.length} tone="good" />
        <KpiCard label="Active routes" value={active.length} tone="accent" sub="riders with parcels" />
        <KpiCard label="Overloaded" value={riders.filter((r) => r.workload === "overloaded").length} tone={riders.some((r) => r.workload === "overloaded") ? "danger" : "neutral"} />
        <KpiCard label="Out for delivery" value={shipments.filter((s) => s.group === "out_for_delivery").length} tone="accent" />
        <KpiCard label="At risk in queue" value={queue.filter((s) => s.sla !== "on_track").length} tone={queue.some((s) => s.sla !== "on_track") ? "danger" : "neutral"} />
        <KpiCard label="Predicted delays" value={queue.filter((s) => s.riskScore >= 50).length} tone="warning" sub="risk ≥ 50 before dispatch" />
        <KpiCard label="Cities short" value={capacity.filter((c) => c.ratio > 1).length} tone={capacity.some((c) => c.ratio > 1) ? "danger" : "good"} sub="demand above rider capacity" />
      </KpiGrid>
      {autoResult && <div className="mt-2 rounded border border-violet-500/40 bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-200">{autoResult}</div>}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="flex max-h-[640px] flex-col">
          <CardHeader title={`Unassigned shipments · ${queue.length}`} subtitle="Highest risk first · recommended rider pre-selected" />
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {queue.length === 0 ? (
              <EmptyState message="Nothing is waiting for a rider in the current filters." />
            ) : (
              queue.map((s) => {
                const rec = recommendRider(s, riders);
                const chosen = choice[s.id] ?? rec?.id ?? "";
                const pool = riders.filter((r) => r.city === s.city && r.rider.status !== "OFF_DUTY");
                return (
                  <div key={s.id} className="mb-1.5 rounded-md border border-nv-800 bg-nv-950/40 p-2">
                    <button onClick={() => open("shipment", s.id)} className="flex w-full items-center justify-between text-left">
                      <span className="font-mono text-[11px] text-ink-900">{s.trackingNumber}</span>
                      <RiskBadge score={s.riskScore} />
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-ink-500">
                      <StatusPill tone={packageStatusTone(s.status)} size="xs">{humanize(s.status)}</StatusPill>
                      {s.sla !== "n_a" && <StatusPill tone={slaTone(s.sla)} size="xs">{SLA_LABELS[s.sla]}</StatusPill>}
                      <span>{s.city}{s.hoursToSla != null ? ` · ${s.hoursToSla < 0 ? "late" : `${formatMinutes(s.hoursToSla * 60)} left`}` : ""}</span>
                    </div>
                    {canAct && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <select value={chosen} onChange={(e) => setChoice((c) => ({ ...c, [s.id]: e.target.value }))} className="min-w-0 flex-1 rounded border border-nv-700 bg-nv-950/60 px-1.5 py-1 text-[11px] text-ink-900" aria-label="Rider">
                          <option value="">Auto (backend picks)</option>
                          {pool.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} · {r.active.length} active{rec?.id === r.id ? " · recommended" : ""}
                            </option>
                          ))}
                        </select>
                        <Button size="xs" disabled={busy.has(s.id)} onClick={() => assign(s, chosen || null)}>
                          {busy.has(s.id) ? "…" : nextStatusFor(s) === "PICKUP_ASSIGNED" ? "Assign pickup" : "Dispatch"}
                        </Button>
                      </div>
                    )}
                    {rec && <div className="mt-1 text-[10px] text-violet-300">Recommended: {rec.name} ({rec.active.length} active, score {rec.score ?? "—"})</div>}
                    {errors[s.id] && <ErrorState message={errors[s.id]} className="mt-1 py-1 text-[11px]" />}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="flex max-h-[640px] flex-col">
          <CardHeader title={`Available riders · ${available.length}`} subtitle="Lightest load first" />
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {available.length === 0 ? <EmptyState message="No available riders in the current filters." /> : available.map((r) => <RiderRow key={r.id} r={r} onClick={() => open("rider", r.id)} />)}
          </div>
        </Card>

        <Card className="flex max-h-[640px] flex-col">
          <CardHeader title={`Active routes · ${active.length}`} subtitle="Riders currently carrying parcels" />
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {active.length === 0 ? <EmptyState message="No rider has parcels assigned right now." /> : active.map((r) => <RiderRow key={r.id} r={r} onClick={() => open("rider", r.id)} showParcels />)}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <ChartCard title="Capacity planning" subtitle="Last-mile demand vs rider capacity (8 parcels / rider / day) by city" empty={capacity.length === 0}>
          <div className="space-y-1.5">
            {capacity.map((c) => (
              <div key={c.city} className="text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-700">{c.city}</span>
                  <span className={clsx("tabular-nums", c.ratio > 1 ? "text-rose-300" : c.ratio > 0.8 ? "text-amber-300" : "text-ink-500")}>
                    {c.demand} parcels · {c.riders} riders · {Math.round(c.ratio * 100)}%
                  </span>
                </div>
                <Progress value={Math.min(1, c.ratio)} tone={c.ratio > 1 ? "danger" : c.ratio > 0.8 ? "warning" : "good"} label={`${c.city} capacity`} className="mt-1" />
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Route efficiency" subtitle="Planned ÷ current travel time · lowest first · click for the corridor" empty={corridors.length === 0}>
          <BarList rows={corridors} max={100} onClick={(k) => open("route", k)} />
        </ChartCard>
      </div>
    </Page>
  );
}

function RiderRow({ r, onClick, showParcels }: { r: RiderStats; onClick: () => void; showParcels?: boolean }) {
  const open = useOpenDrawer();
  return (
    <div className="mb-1.5 rounded-md border border-nv-800 bg-nv-950/40 p-2">
      <button onClick={onClick} className="flex w-full items-center justify-between text-left">
        <span className="text-xs text-ink-900">{r.name}</span>
        <span className="text-[10px] text-ink-500">
          {r.city ?? "—"} · score {r.score ?? "—"}
        </span>
      </button>
      <div className="mt-1 flex items-center gap-2">
        <Progress value={Math.min(1, r.active.length / 6)} tone={r.workload === "overloaded" ? "danger" : r.active.length >= 4 ? "warning" : "good"} label="Workload" className="flex-1" />
        <span className="text-[10px] tabular-nums text-ink-500">{r.active.length}/6</span>
      </div>
      {showParcels && (
        <div className="mt-1 flex flex-wrap gap-1">
          {r.active.slice(0, 6).map((s) => (
            <button key={s.id} onClick={() => open("shipment", s.id)} className="rounded border border-nv-700 px-1 font-mono text-[9px] text-ink-600 hover:text-ink-900">
              {s.trackingNumber.replace("PKG-", "")}
            </button>
          ))}
          {r.active.length > 6 && <span className="text-[9px] text-ink-500">+{r.active.length - 6}</span>}
        </div>
      )}
    </div>
  );
}
