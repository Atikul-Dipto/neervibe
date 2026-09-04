"use client";

import { useMemo } from "react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, RiderUtilizationCard, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { StatusPill, genericStatusTone } from "@/components/ui/StatusPill";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarList } from "@/components/charts/BarList";
import { useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useFilterStore, effectiveLists } from "@/data/filters";
import { formatBDT, formatMinutes, formatPct, formatRelative, humanize } from "@/data/format";
import type { RiderStats } from "@/data/derive";

export default function RidersPage() {
  return (
    <DataGate>
      <Riders />
    </DataGate>
  );
}

function Riders() {
  const { derived, filters, cross } = usePageData();
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const clearAll = useFilterStore((s) => s.clearAll);
  const lists = effectiveLists(filters, cross);

  const riders = useMemo(() => derived.riders.filter((r) => (!lists.cities.length || (r.city && lists.cities.includes(r.city))) && (!lists.riders.length || lists.riders.includes(r.id))), [derived.riders, lists.cities, lists.riders]);
  const scored = riders.filter((r) => r.score != null);
  const avgScore = scored.length ? scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length : null;
  const withSuccess = riders.filter((r) => r.successRate != null);
  const avgSuccess = withSuccess.length ? (withSuccess.reduce((s, r) => s + (r.successRate ?? 0), 0) / withSuccess.length) * 100 : null;

  const columns = useMemo<DataColumn<RiderStats>[]>(
    () => [
      { key: "name", header: "Rider", locked: true, cell: (r) => <span className="text-ink-900">{r.name}</span>, value: (r) => r.name },
      { key: "city", header: "City", cell: (r) => <span className="text-ink-600">{r.city ?? "—"}</span>, value: (r) => r.city ?? "" },
      { key: "status", header: "Status", cell: (r) => <StatusPill tone={genericStatusTone(r.rider.status)} size="xs" withDot>{humanize(r.rider.status)}</StatusPill>, value: (r) => r.rider.status },
      { key: "workload", header: "Workload", cell: (r) => <StatusPill tone={r.workload === "overloaded" ? "danger" : r.workload === "idle" ? "warning" : "neutral"} size="xs">{humanize(r.workload)}</StatusPill>, value: (r) => r.workload },
      { key: "active", header: "Active", align: "right", cell: (r) => <span className="text-ink-900">{r.active.length}</span>, value: (r) => r.active.length },
      { key: "deliveries", header: "Deliveries", align: "right", cell: (r) => <span className="text-ink-600">{r.deliveries}</span>, value: (r) => r.deliveries },
      { key: "success", header: "Success", align: "right", cell: (r) => <span className={r.successRate != null && r.successRate < 0.75 ? "text-amber-300" : "text-ink-600"}>{formatPct(r.successRate == null ? null : r.successRate * 100, 0)}</span>, value: (r) => r.successRate ?? -1 },
      { key: "first", header: "First attempt", align: "right", cell: (r) => <span className="text-ink-600">{formatPct(r.firstAttemptRate == null ? null : r.firstAttemptRate * 100, 0)}</span>, value: (r) => r.firstAttemptRate ?? -1 },
      { key: "ontime", header: "On time", align: "right", cell: (r) => <span className="text-ink-600">{formatPct(r.onTimeRate == null ? null : r.onTimeRate * 100, 0)}</span>, value: (r) => r.onTimeRate ?? -1 },
      { key: "avg", header: "Avg delivery", align: "right", defaultHidden: true, cell: (r) => <span className="text-ink-600">{formatMinutes(r.avgDeliveryMin)}</span>, value: (r) => r.avgDeliveryMin ?? -1 },
      { key: "cod", header: "COD in hand", align: "right", cell: (r) => <span className={r.codInHand > 20000 ? "text-amber-300" : "text-ink-600"}>{formatBDT(r.codInHand, true)}</span>, value: (r) => r.codInHand },
      { key: "score", header: "Score", align: "right", cell: (r) => <span className={r.score == null ? "text-ink-500" : r.score >= 85 ? "text-emerald-300" : r.score < 70 ? "text-rose-300" : "text-ink-900"}>{r.score ?? "—"}</span>, value: (r) => r.score ?? -1 },
      { key: "last", header: "Last active", defaultHidden: true, cell: (r) => <span className="text-ink-500">{formatRelative(new Date(r.lastActiveAt))}</span>, value: (r) => r.lastActiveAt },
    ],
    [],
  );

  return (
    <Page>
      <PageHeader title="Riders" description="Workforce intelligence: availability, performance, SLA and COD by rider. Click a rider for the full profile." />
      <KpiGrid>
        <KpiCard label="Riders" value={riders.length} />
        <KpiCard label="Available" value={riders.filter((r) => r.rider.status === "AVAILABLE").length} tone="good" />
        <KpiCard label="On delivery" value={riders.filter((r) => r.rider.status === "ON_DELIVERY").length} tone="accent" />
        <KpiCard label="Idle" value={riders.filter((r) => r.workload === "idle").length} tone={riders.some((r) => r.workload === "idle") ? "warning" : "neutral"} />
        <KpiCard label="Overloaded" value={riders.filter((r) => r.workload === "overloaded").length} tone={riders.some((r) => r.workload === "overloaded") ? "danger" : "neutral"} />
        <KpiCard label="Avg success" value={formatPct(avgSuccess, 0)} tone={avgSuccess != null && avgSuccess < 80 ? "warning" : "good"} />
        <KpiCard label="Avg score" value={avgScore == null ? "—" : Math.round(avgScore)} />
        <KpiCard label="COD in hand" value={formatBDT(riders.reduce((s, r) => s + r.codInHand, 0), true)} sub="uncollected cash with riders" />
      </KpiGrid>
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_340px]">
        <DataTable columns={columns} rows={riders} rowKey={(r) => r.id} onRowClick={(r) => open("rider", r.id)} activeKey={drawerItem?.kind === "rider" ? drawerItem.id : null} initialSort={{ key: "score", dir: "desc" }} exportName="riders" emptyWhat="riders" onClearFilters={clearAll} dense />
        <div className="space-y-3">
          <RiderUtilizationCard riders={riders} />
          <ChartCard title="Top performers" subtitle="By performance score" empty={scored.length === 0}>
            <BarList rows={[...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8).map((r) => ({ key: r.id, label: r.name, value: r.score ?? 0, secondary: r.city ?? undefined, color: "good" }))} max={100} onClick={(k) => open("rider", k)} />
          </ChartCard>
          <ChartCard title="Needs attention" subtitle="Lowest scores with enough history" empty={scored.filter((r) => r.attempts.length >= 5).length === 0}>
            <BarList rows={[...scored].filter((r) => r.attempts.length >= 5).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 5).map((r) => ({ key: r.id, label: r.name, value: r.score ?? 0, secondary: `${r.failedAttempts} failed`, color: "danger" }))} max={100} onClick={(k) => open("rider", k)} />
          </ChartCard>
        </div>
      </div>
    </Page>
  );
}
