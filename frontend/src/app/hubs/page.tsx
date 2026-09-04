"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { Card } from "@/components/ui/Card";
import { Tabs, Progress, utilizationTone } from "@/components/ui/primitives";
import { StatusPill, genericStatusTone } from "@/components/ui/StatusPill";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarList } from "@/components/charts/BarList";
import { TrendChart } from "@/components/charts/TrendChart";
import { HEALTH_COLORS } from "@/components/charts/chartTheme";
import { EmptyState } from "@/components/ui/States";
import { useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useFilterStore, effectiveLists } from "@/data/filters";
import { formatMinutes, formatNumber, formatPct, humanize } from "@/data/format";
import type { HubHealth, HubStats } from "@/data/derive";

export default function HubsPage() {
  return (
    <DataGate>
      <Hubs />
    </DataGate>
  );
}

function Hubs() {
  const { derived, filters, cross } = usePageData();
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const clearAll = useFilterStore((s) => s.clearAll);
  const [health, setHealth] = useState<HubHealth | "all">("all");
  const [sort, setSort] = useState<"utilization" | "pending" | "inbound" | "slaRisk">("utilization");
  const lists = effectiveLists(filters, cross);

  const hubs = useMemo(
    () =>
      derived.hubs.filter(
        (h) =>
          (!lists.cities.length || lists.cities.includes(h.city)) &&
          (!lists.divisions.length || (h.division && lists.divisions.includes(h.division))) &&
          (!lists.hubs.length || lists.hubs.includes(h.id)) &&
          (health === "all" || h.health === health),
      ),
    [derived.hubs, lists.cities, lists.divisions, lists.hubs, health],
  );
  const sorted = useMemo(() => [...hubs].sort((a, b) => (sort === "utilization" ? b.utilization - a.utilization : sort === "pending" ? b.pending.length - a.pending.length : sort === "inbound" ? b.inbound.length - a.inbound.length : b.slaRisk - a.slaRisk)), [hubs, sort]);

  const all = derived.hubs;
  const avgUtil = all.length ? (all.reduce((s, h) => s + h.utilization, 0) / all.length) * 100 : 0;
  const processing = all.map((h) => h.processingMin).filter((x): x is number => x != null);

  // Inbound vs outbound flow per hub for the comparison chart.
  const flow = sorted.slice(0, 12).map((h) => ({ name: h.name.replace(/ (Hub|Center|Centre)$/i, ""), inbound: h.inbound.length, outbound: h.outbound.length, pending: h.pending.length }));

  return (
    <Page>
      <PageHeader title="Hubs" description="Warehouse and hub operations: capacity, inbound, outbound, sorting queue, processing time and SLA risk." />
      <KpiGrid>
        <KpiCard label="Hubs" value={all.length} sub={`${hubs.length} shown`} />
        <KpiCard label="Avg utilisation" value={formatPct(avgUtil, avgUtil < 10 ? 1 : 0)} tone={avgUtil >= 80 ? "danger" : avgUtil >= 65 ? "warning" : "good"} sub="load ÷ rated capacity" />
        <KpiCard label="Critical" value={all.filter((h) => h.health === "critical").length} tone={all.some((h) => h.health === "critical") ? "danger" : "neutral"} onClick={() => setHealth(health === "critical" ? "all" : "critical")} active={health === "critical"} />
        <KpiCard label="Under pressure" value={all.filter((h) => h.health === "warning").length} tone={all.some((h) => h.health === "warning") ? "warning" : "neutral"} onClick={() => setHealth(health === "warning" ? "all" : "warning")} active={health === "warning"} />
        <KpiCard label="Pending parcels" value={formatNumber(all.reduce((s, h) => s + h.pending.length, 0))} sub="waiting at hubs" />
        <KpiCard label="Inbound" value={formatNumber(all.reduce((s, h) => s + h.inbound.length, 0))} sub="arriving next" />
        <KpiCard label="Avg processing" value={processing.length ? formatMinutes(processing.reduce((a, b) => a + b, 0) / processing.length) : "—"} sub="arrive → dispatch" />
        <KpiCard label="SLA at risk" value={formatNumber(all.reduce((s, h) => s + h.slaRisk, 0))} tone={all.some((h) => h.slaRisk > 0) ? "warning" : "good"} sub="parcels at hubs" />
      </KpiGrid>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Tabs value={health} onChange={setHealth} tabs={[{ key: "all", label: "All" }, { key: "ok", label: "Healthy" }, { key: "warning", label: "Under pressure" }, { key: "critical", label: "Critical" }]} />
        <Tabs value={sort} onChange={setSort} tabs={[{ key: "utilization", label: "By utilisation" }, { key: "pending", label: "By backlog" }, { key: "inbound", label: "By inbound" }, { key: "slaRisk", label: "By SLA risk" }]} />
      </div>

      {sorted.length === 0 ? (
        <Card className="mt-3">
          <EmptyState title="No hubs match" message="Widen the city or division filters, or clear the health filter." />
        </Card>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sorted.map((h) => (
            <HubCard key={h.id} hub={h} active={drawerItem?.kind === "hub" && drawerItem.id === h.id} onClick={() => open("hub", h.id)} />
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <ChartCard title="Hub comparison" subtitle="Inbound, pending and outbound parcels" empty={flow.length === 0}>
          <TrendChart data={flow} xKey="name" height={220} series={[{ key: "inbound", label: "Inbound", color: "#22d3ee", kind: "bar", stackId: "a" }, { key: "pending", label: "Pending", color: "#fbbf24", kind: "bar", stackId: "a" }, { key: "outbound", label: "Outbound", color: "#34d399", kind: "bar", stackId: "a" }]} />
        </ChartCard>
        <ChartCard title="Utilisation ranking" subtitle="Click for detail" empty={sorted.length === 0}>
          <BarList rows={sorted.slice(0, 12).map((h) => ({ key: h.id, label: h.name, value: h.utilization * 100, display: `${Math.round(h.utilization * 100)}%`, secondary: h.city, color: HEALTH_COLORS[h.health] }))} max={100} onClick={(k) => open("hub", k)} activeKey={drawerItem?.kind === "hub" ? drawerItem.id : null} />
        </ChartCard>
      </div>
      <p className="mt-2 text-[10px] text-ink-500">
        Health combines rated capacity with operational pressure: a hub is under pressure when its backlog ages past 24h or 5+ parcels there are at risk, and critical past 48h, 90% capacity, or when half of a queue of 8+ has breached. Filters: {lists.cities.length ? lists.cities.join(", ") : "all cities"} · {hubs.length} of {all.length} hubs ·{" "}
        <button onClick={clearAll} className="text-accent-700 hover:underline">
          clear
        </button>
      </p>
    </Page>
  );
}

function HubCard({ hub, active, onClick }: { hub: HubStats; active: boolean; onClick: () => void }) {
  return (
    <Card interactive selected={active} onClick={onClick} className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink-900">{hub.name}</div>
          <div className="text-[11px] text-ink-500">
            {humanize(hub.node.node_type)} · {hub.city}
          </div>
        </div>
        <span className={clsx("h-2 w-2 shrink-0 rounded-full", hub.health === "critical" ? "bg-rose-400" : hub.health === "warning" ? "bg-amber-400" : "bg-emerald-400")} aria-label={hub.health} />
      </div>
      <div className="mt-2.5">
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-ink-500">
          <span>{hub.load} / {hub.capacity.toLocaleString()} slots</span>
          <span className="tabular-nums text-ink-700">{formatPct(hub.utilization * 100, hub.utilization < 0.1 ? 1 : 0)}</span>
        </div>
        <Progress value={hub.utilization} tone={utilizationTone(hub.utilization)} label="Utilisation" />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1 text-center">
        <Mini label="Inbound" value={hub.inbound.length} />
        <Mini label="Pending" value={hub.pending.length} warn={hub.pending.length > 10} />
        <Mini label="Outbound" value={hub.outbound.length} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
        <span>Processing {formatMinutes(hub.processingMin)}</span>
        <span className={hub.slaRisk > 0 ? "text-amber-300" : ""}>SLA risk {hub.slaRisk}</span>
        <StatusPill tone={genericStatusTone(hub.node.operating_status)} size="xs">
          {humanize(hub.node.operating_status)}
        </StatusPill>
      </div>
    </Card>
  );
}

function Mini({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded border border-nv-800 bg-nv-950/40 py-1">
      <div className={clsx("text-sm font-semibold tabular-nums", warn ? "text-amber-300" : "text-ink-900")}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-ink-500">{label}</div>
    </div>
  );
}
