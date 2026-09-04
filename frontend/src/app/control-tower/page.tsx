"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Clock } from "lucide-react";
import { DataGate, usePageData, RiskBadge } from "@/components/pages/common";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { EventStream } from "@/components/layout/EventStream";
import { Tabs } from "@/components/ui/primitives";
import { StatusPill, packageStatusTone, priorityTone, slaTone } from "@/components/ui/StatusPill";
import { SLA_LABELS } from "@/data/derive";
import { useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useOpsStore } from "@/data/ops";
import { formatDateTime, formatMinutes, formatRelative, humanize } from "@/data/format";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { COUNTRY } from "@/config/country";
import { effectiveLists } from "@/data/filters";

type QueueTab = "risk" | "breached" | "ofd" | "exceptions";

export default function ControlTowerPage() {
  return (
    <DataGate>
      <ControlTower />
    </DataGate>
  );
}

function ControlTower() {
  const { derived, shipments, filters, cross } = usePageData();
  const [tab, setTab] = useState<QueueTab>("risk");
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const workflow = useOpsStore((s) => s.exceptions);
  const regions = useControlTowerStore((s) => s.regions);
  const selectedRegion = useControlTowerStore((s) => s.selectedRegion);
  const lists = effectiveLists(filters, cross);

  const active = useMemo(() => shipments.filter((s) => s.isActive), [shipments]);
  const byRisk = useMemo(() => [...active].sort((a, b) => b.riskScore - a.riskScore), [active]);
  const breached = useMemo(() => byRisk.filter((s) => s.sla === "breached"), [byRisk]);
  const ofd = useMemo(() => byRisk.filter((s) => s.group === "out_for_delivery"), [byRisk]);
  const exceptions = useMemo(
    () => derived.exceptions.filter((e) => !["resolved", "snoozed"].includes(workflow[e.id]?.status ?? "open") && (!lists.cities.length || (e.city && lists.cities.includes(e.city)))),
    [derived.exceptions, workflow, lists.cities],
  );
  const schedule = useMemo(() => active.filter((s) => s.expectedAt != null).sort((a, b) => (a.expectedAt ?? 0) - (b.expectedAt ?? 0)).slice(0, 10), [active]);
  const divisions = regions ? [...regions.division].sort((a, b) => a.properties.name.localeCompare(b.properties.name)) : [];

  const list = tab === "risk" ? byRisk.slice(0, 40) : tab === "breached" ? breached : tab === "ofd" ? ofd : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-nv-800 bg-nv-950/60 lg:flex">
          <div className="border-b border-nv-800 p-2">
            <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{COUNTRY.levels.division.label}s</div>
            <div className="flex flex-wrap gap-1">
              {divisions.map((d) => {
                const on = selectedRegion?.id === d.properties.id || selectedRegion?.division === d.properties.name;
                return (
                  <button
                    key={d.properties.id}
                    onClick={() => open("region", d.properties.id)}
                    className={clsx("rounded-full border px-2 py-0.5 text-[11px] transition-colors", on ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300" : "border-nv-700 text-ink-600 hover:border-nv-600 hover:text-ink-900")}
                    aria-pressed={on}
                  >
                    {d.properties.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-b border-nv-800 p-2">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "risk", label: "Risk", count: byRisk.filter((s) => s.riskScore >= 40).length },
                { key: "breached", label: "Breached", count: breached.length },
                { key: "ofd", label: "OFD", count: ofd.length },
                { key: "exceptions", label: "Alerts", count: exceptions.length },
              ]}
              className="w-full"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {tab === "exceptions" ? (
              exceptions.length === 0 ? (
                <div className="p-4 text-center text-xs text-ink-500">No open exceptions.</div>
              ) : (
                exceptions.slice(0, 40).map((e) => (
                  <button key={e.id} onClick={() => open("exception", e.id)} className={clsx("mb-0.5 flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-nv-850", drawerItem?.kind === "exception" && drawerItem.id === e.id && "bg-accent-100/40")}>
                    <AlertTriangle className={clsx("mt-0.5 h-3.5 w-3.5 shrink-0", e.priority === "critical" ? "text-rose-400" : "text-amber-400")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-ink-900">{e.title}</span>
                      <span className="block text-[10px] text-ink-500">{e.city ?? "Network"} · {formatRelative(new Date(e.detectedAt))}</span>
                    </span>
                    <StatusPill tone={priorityTone(e.priority)} size="xs">{e.priority}</StatusPill>
                  </button>
                ))
              )
            ) : list.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-500">Nothing in this queue for the current filters.</div>
            ) : (
              list.map((s) => (
                <button key={s.id} onClick={() => open("shipment", s.id)} className={clsx("mb-0.5 flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-nv-850", drawerItem?.kind === "shipment" && drawerItem.id === s.id && "bg-accent-100/40 shadow-[inset_2px_0_0_0_var(--primary)]")}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-ink-900">{s.trackingNumber}</span>
                    <RiskBadge score={s.riskScore} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusPill tone={packageStatusTone(s.status)} size="xs">{humanize(s.status)}</StatusPill>
                    {s.sla !== "n_a" && <StatusPill tone={slaTone(s.sla)} size="xs">{SLA_LABELS[s.sla]}</StatusPill>}
                  </span>
                  <span className="truncate text-[10px] text-ink-500">
                    {s.merchantName} → {s.city} · {s.hoursToSla != null ? (s.hoursToSla < 0 ? `${formatMinutes(-s.hoursToSla * 60)} late` : `${formatMinutes(s.hoursToSla * 60)} left`) : "no SLA"}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="relative min-w-0 flex-1">
          <MapViewLoader />
          <div className="pointer-events-none absolute left-3 top-3 hidden gap-1.5 md:flex">
            {[
              ["Facilities", derived.nodes.length],
              ["Vehicles live", useControlTowerStore.getState().vehicles.size || derived.vehicles.length],
              ["Riders", derived.riders.length],
              ["Active", active.length],
              ["Breached", breached.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border border-nv-700 bg-nv-900/85 px-2 py-1 backdrop-blur">
                <div className="text-[9px] uppercase tracking-wider text-ink-500">{label}</div>
                <div className={clsx("text-sm font-semibold tabular-nums", label === "Breached" && Number(value) > 0 ? "text-rose-300" : "text-ink-900")}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid h-44 shrink-0 grid-cols-1 gap-2 border-t border-nv-800 bg-nv-950 p-2 md:grid-cols-[1fr_360px]">
        <EventStream className="min-h-0" compact />
        <div className="hidden min-h-0 flex-col rounded-lg border border-nv-800 bg-nv-900 md:flex">
          <div className="flex items-center gap-2 border-b border-nv-800 px-3 py-1.5">
            <Clock className="h-3 w-3 text-cyan-300" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Delivery schedule · next promises</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
            {schedule.length === 0 ? (
              <div className="px-1 py-3 text-xs text-ink-500">No promised deliveries in the current filters.</div>
            ) : (
              schedule.map((s) => (
                <button key={s.id} onClick={() => open("shipment", s.id)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] hover:bg-nv-850">
                  <span className={clsx("tabular-nums", (s.hoursToSla ?? 0) < 0 ? "text-rose-300" : "text-ink-500")}>{formatDateTime(s.pkg.expected_delivery_at)}</span>
                  <span className="truncate text-ink-700">
                    <span className="font-mono text-ink-900">{s.trackingNumber}</span> · {s.city}
                  </span>
                  <StatusPill tone={slaTone(s.sla)} size="xs">{SLA_LABELS[s.sla]}</StatusPill>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
