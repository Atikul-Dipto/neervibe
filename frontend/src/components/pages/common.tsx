"use client";

import { useMemo, type ReactNode } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import clsx from "clsx";
import { useDerived, useDataStatus, useFilteredShipments } from "@/data/provider";
import { applyFiltersPrevious, PRESET_LABELS, useFilterStore } from "@/data/filters";
import { dailySeries, hourlySeries, type DayPoint, type ExceptionItem, type HubStats, type RiderStats, type Shipment, STATUS_GROUPS } from "@/data/derive";
import { useCross, useDrill, useOpenDrawer } from "@/data/hooks";
import { useOpsStore } from "@/data/ops";
import { formatDate, formatNumber, formatPct, formatRelative } from "@/data/format";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { SegmentBar } from "@/components/charts/SegmentBar";
import { BarList } from "@/components/charts/BarList";
import { TrendChart } from "@/components/charts/TrendChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { useChartTheme } from "@/components/charts/chartTheme";
import { StatusPill, priorityTone } from "@/components/ui/StatusPill";
import { ErrorState } from "@/components/ui/States";
import { Skeleton, StatCardSkeleton } from "@/components/ui/Skeleton";
import { EXCEPTION_STATUS_TONE } from "@/components/drawer/ExceptionDetail";

/** Gates a page on the data snapshot with proper loading and error states. */
export function DataGate({ children, skeleton }: { children: ReactNode; skeleton?: ReactNode }) {
  const { status, error, load } = useDataStatus();
  if (status === "error") {
    return (
      <div className="p-4">
        <ErrorState message={`The data snapshot could not be loaded: ${error ?? "unknown error"}`} onRetry={() => void load()} />
      </div>
    );
  }
  if (status !== "ready") {
    return (
      <div className="p-4">
        {skeleton ?? (
          <>
            <Skeleton className="mb-3 h-5 w-48" />
            <KpiGrid>
              {Array.from({ length: 8 }, (_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </KpiGrid>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-56" />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
  return <>{children}</>;
}

/** Everything a page usually needs, filtered and memoised. */
export function usePageData() {
  const derived = useDerived();
  const shipments = useFilteredShipments();
  const filters = useFilterStore((s) => s.filters);
  const cross = useFilterStore((s) => s.cross);
  const previous = useMemo(() => applyFiltersPrevious(derived.shipments, filters, cross, derived.now), [derived, filters, cross]);
  const daily = useMemo(() => dailySeries(shipments, derived.now), [shipments, derived.now]);
  const hourly = useMemo(() => hourlySeries(derived.events, derived.now), [derived.events, derived.now]);
  const windowLabel = filters.preset === "custom" ? "the selected range" : PRESET_LABELS[filters.preset].toLowerCase() === "all" ? "all time" : `the last ${PRESET_LABELS[filters.preset].toLowerCase().replace("last ", "")}`;
  return { derived, shipments, previous, daily, hourly, filters, cross, windowLabel, now: derived.now };
}

function deltaPct(now: number, prev: number): number | null {
  if (prev === 0) return now === 0 ? 0 : null;
  return ((now - prev) / prev) * 100;
}

/** The eight headline shipment KPIs. `mode` decides whether a click drills
 * to /shipments or cross-filters the current page. */
export function ShipmentKpiStrip({ shipments, previous, daily, mode = "cross" }: { shipments: Shipment[]; previous: Shipment[]; daily: DayPoint[]; mode?: "cross" | "drill" }) {
  const drill = useDrill();
  const cross = useCross("kpi");
  const count = (list: Shipment[], f: (s: Shipment) => boolean) => list.filter(f).length;
  const trend = (key: keyof DayPoint) => daily.slice(-14).map((d) => Number(d[key]));

  const items: { key: string; label: string; f: (s: Shipment) => boolean; tone: "neutral" | "good" | "warning" | "danger" | "accent"; goodIsUp: boolean; filterKey: "statusGroups" | "sla"; value: string; trendKey?: keyof DayPoint }[] = [
    { key: "total", label: "Total shipments", f: () => true, tone: "neutral", goodIsUp: true, filterKey: "statusGroups", value: "", trendKey: "created" },
    { key: "delivered", label: "Delivered", f: (s) => s.group === "delivered", tone: "good", goodIsUp: true, filterKey: "statusGroups", value: "delivered", trendKey: "delivered" },
    { key: "in_transit", label: "In transit", f: (s) => s.group === "in_transit", tone: "accent", goodIsUp: true, filterKey: "statusGroups", value: "in_transit" },
    { key: "ofd", label: "Out for delivery", f: (s) => s.group === "out_for_delivery", tone: "accent", goodIsUp: true, filterKey: "statusGroups", value: "out_for_delivery" },
    { key: "delayed", label: "Delayed", f: (s) => s.delayed, tone: "danger", goodIsUp: false, filterKey: "sla", value: "breached" },
    { key: "at_risk", label: "At risk", f: (s) => s.isActive && s.sla === "at_risk", tone: "warning", goodIsUp: false, filterKey: "sla", value: "at_risk" },
    { key: "failed", label: "Failed", f: (s) => s.group === "failed", tone: "danger", goodIsUp: false, filterKey: "statusGroups", value: "failed", trendKey: "failed" },
    { key: "returned", label: "Returned", f: (s) => s.group === "returns", tone: "warning", goodIsUp: false, filterKey: "statusGroups", value: "returns", trendKey: "returns" },
  ];

  return (
    <KpiGrid>
      {items.map((it) => {
        const n = count(shipments, it.f);
        const p = count(previous, it.f);
        const d = deltaPct(n, p);
        const active = it.value ? cross.activeValue(it.filterKey) === it.value : false;
        const onClick = it.value
          ? mode === "drill"
            ? () => drill("/shipments", { [it.filterKey]: [it.value] } as never)
            : () => cross.toggle(it.filterKey, it.value, it.label)
          : mode === "drill"
            ? () => drill("/shipments")
            : undefined;
        return (
          <KpiCard
            key={it.key}
            label={it.label}
            value={formatNumber(n)}
            tone={n === 0 && (it.tone === "danger" || it.tone === "warning") ? "neutral" : it.tone}
            delta={d != null ? { value: d, goodIsUp: it.goodIsUp, label: "vs previous window" } : null}
            sub={d == null ? "no comparison window" : undefined}
            trend={it.trendKey ? trend(it.trendKey) : undefined}
            onClick={onClick}
            active={active}
            hint={mode === "drill" ? "Open in Shipments" : "Filter this page"}
          />
        );
      })}
    </KpiGrid>
  );
}

export function StatusDistributionCard({ shipments, className }: { shipments: Shipment[]; className?: string }) {
  const chart = useChartTheme();
  const cross = useCross("status-distribution");
  const segments = STATUS_GROUPS.map((g) => ({ key: g.key, label: g.label, value: shipments.filter((s) => s.group === g.key).length, color: chart.statusGroup[g.key] }));
  return (
    <ChartCard title="Delivery status distribution" subtitle="Click a segment to filter the page" active={cross.active} activeLabel={cross.activeValue("statusGroups") ?? undefined} empty={shipments.length === 0} className={className}>
      <SegmentBar segments={segments} onClick={(k) => cross.toggle("statusGroups", k, STATUS_GROUPS.find((g) => g.key === k)?.label ?? k)} activeKey={cross.activeValue("statusGroups")} />
    </ChartCard>
  );
}

export function CityPerformanceCard({ shipments, className, max = 10 }: { shipments: Shipment[]; className?: string; max?: number }) {
  const cross = useCross("city-performance");
  const rows = useMemo(() => {
    const byCity = new Map<string, { total: number; delivered: number; judged: number; met: number; breached: number }>();
    for (const s of shipments) {
      const c = byCity.get(s.city) ?? { total: 0, delivered: 0, judged: 0, met: 0, breached: 0 };
      c.total += 1;
      if (s.status === "DELIVERED") c.delivered += 1;
      if (s.sla === "met" || s.sla === "missed") c.judged += 1;
      if (s.sla === "met") c.met += 1;
      if (s.delayed) c.breached += 1;
      byCity.set(s.city, c);
    }
    return [...byCity.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, max)
      .map(([city, c]) => ({
        key: city,
        label: city,
        value: c.total,
        secondary: `SLA ${formatPct(c.judged ? (c.met / c.judged) * 100 : null, 0)}${c.breached ? ` · ${c.breached} breached` : ""}`,
        color: c.breached > 3 ? "danger" : c.breached > 0 ? "warning" : "accent",
      }));
  }, [shipments, max]);
  return (
    <ChartCard title="City performance" subtitle="Shipments by destination city · click to filter" active={cross.active} activeLabel={cross.activeValue("cities") ?? undefined} empty={rows.length === 0} className={className}>
      <BarList rows={rows} onClick={(k) => cross.toggle("cities", k, k)} activeKey={cross.activeValue("cities")} />
    </ChartCard>
  );
}

export function HubLoadCard({ hubs, className, max = 8 }: { hubs: HubStats[]; className?: string; max?: number }) {
  const chart = useChartTheme();
  const open = useOpenDrawer();
  const rows = [...hubs]
    .filter((h) => h.capacity > 0)
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, max)
    .map((h) => ({ key: h.id, label: h.name, value: h.utilization * 100, display: `${Math.round(h.utilization * 100)}%`, secondary: `${h.pending.length} pending · ${h.city}`, color: chart.health[h.health] }));
  return (
    <ChartCard title="Hub load" subtitle="Capacity utilisation · click for hub detail" empty={rows.length === 0} className={className}>
      <BarList rows={rows} max={100} onClick={(k) => open("hub", k)} />
    </ChartCard>
  );
}

export function ShipmentTrendCard({ daily, className, height = 190 }: { daily: DayPoint[]; className?: string; height?: number }) {
  const setRange = useFilterStore((s) => s.setRange);
  const filters = useFilterStore((s) => s.filters);
  const activeX = filters.preset === "custom" && filters.from && filters.from === filters.to ? filters.from : null;
  return (
    <ChartCard title="Shipment trend" subtitle="Created, delivered and failed per day · click a day to zoom in" active={!!activeX} activeLabel={activeX ? formatDate(activeX) : undefined} empty={daily.length === 0} className={className}>
      <TrendChart
        data={daily}
        xKey="date"
        height={height}
        xFormatter={formatDate}
        onPointClick={(x) => setRange(x, x)}
        activeX={activeX}
        series={[
          { key: "created", label: "Created", color: "accent", kind: "area" },
          { key: "delivered", label: "Delivered", color: "good", kind: "line" },
          { key: "failed", label: "Failed attempts", color: "danger", kind: "bar" },
        ]}
      />
    </ChartCard>
  );
}

export function SlaTrendCard({ daily, className, height = 190 }: { daily: DayPoint[]; className?: string; height?: number }) {
  const data = daily.map((d) => ({ ...d, slaRate: d.onTime + d.late > 0 ? Math.round((d.onTime / (d.onTime + d.late)) * 100) : null }));
  return (
    <ChartCard title="SLA performance" subtitle="On-time share of judged deliveries per day, late deliveries as bars" empty={daily.length === 0} className={className}>
      <TrendChart
        data={data}
        xKey="date"
        height={height}
        xFormatter={formatDate}
        yFormatter={(v) => `${v}`}
        series={[
          { key: "slaRate", label: "On-time %", color: "good", kind: "line" },
          { key: "late", label: "Late deliveries", color: "danger", kind: "bar", yAxisId: "right" },
        ]}
      />
    </ChartCard>
  );
}

export function RiderUtilizationCard({ riders, className }: { riders: RiderStats[]; className?: string }) {
  const drill = useDrill();
  const slices = [
    { key: "normal", label: "Working", value: riders.filter((r) => r.workload === "normal").length, color: "accent" },
    { key: "overloaded", label: "Overloaded", value: riders.filter((r) => r.workload === "overloaded").length, color: "danger" },
    { key: "idle", label: "Idle", value: riders.filter((r) => r.workload === "idle").length, color: "warning" },
    { key: "off_duty", label: "Off duty", value: riders.filter((r) => r.workload === "off_duty").length, color: "muted" },
  ];
  return (
    <ChartCard title="Rider utilisation" subtitle="Workforce state right now · click to open riders" empty={riders.length === 0} className={className}>
      <DonutChart slices={slices} centerValue={String(riders.length)} centerLabel="riders" onClick={() => drill("/riders")} height={150} />
    </ChartCard>
  );
}

export function ExceptionsCard({ exceptions, max = 8, className, title = "Exceptions" }: { exceptions: ExceptionItem[]; max?: number; className?: string; title?: string }) {
  const open = useOpenDrawer();
  const workflow = useOpsStore((s) => s.exceptions);
  const drill = useDrill();
  const list = exceptions.filter((e) => !["resolved", "snoozed"].includes(workflow[e.id]?.status ?? "open")).slice(0, max);
  return (
    <ChartCard
      title={title}
      subtitle={`${exceptions.length} open · sorted by priority`}
      actions={
        <button onClick={() => drill("/exceptions")} className="flex items-center gap-1 text-[11px] text-accent-700 hover:underline">
          Queue <ArrowRight className="h-3 w-3" />
        </button>
      }
      empty={list.length === 0}
      emptyMessage="No open exceptions for the current filters."
      className={className}
      bodyClassName="px-1.5"
    >
      <div className="flex flex-col">
        {list.map((e) => (
          <button key={e.id} onClick={() => open("exception", e.id)} className="flex items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-nv-850">
            <AlertTriangle className={clsx("mt-0.5 h-3.5 w-3.5 shrink-0", e.priority === "critical" ? "text-rose-400" : e.priority === "high" ? "text-amber-400" : "text-ink-500")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-ink-900">{e.title}</span>
              <span className="block truncate text-[10px] text-ink-500">
                {e.city ?? "Network"} · {formatRelative(new Date(e.detectedAt))}
              </span>
            </span>
            <StatusPill tone={priorityTone(e.priority)} size="xs">
              {e.priority}
            </StatusPill>
            {workflow[e.id] && workflow[e.id].status !== "open" && (
              <StatusPill tone={EXCEPTION_STATUS_TONE[workflow[e.id].status]} size="xs">
                {workflow[e.id].status}
              </StatusPill>
            )}
          </button>
        ))}
      </div>
    </ChartCard>
  );
}

export function riskTone(score: number): "good" | "warning" | "danger" | "neutral" {
  return score >= 70 ? "danger" : score >= 40 ? "warning" : score > 0 ? "good" : "neutral";
}

export function RiskBadge({ score }: { score: number }) {
  const tone = riskTone(score);
  return (
    <span className={clsx("inline-flex items-center gap-1 tabular-nums", tone === "danger" ? "text-rose-300" : tone === "warning" ? "text-amber-300" : "text-ink-600")}>
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-nv-800">
        <span className={clsx("block h-full", tone === "danger" ? "bg-rose-400" : tone === "warning" ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${score}%` }} />
      </span>
      {score}
    </span>
  );
}
