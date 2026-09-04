"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { SegmentBar } from "@/components/charts/SegmentBar";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarList } from "@/components/charts/BarList";
import { financeFor, merchantStatsFor, type MerchantStats } from "@/data/derive";
import { FINANCE } from "@/config/finance";
import { useCross, useOpenDrawer } from "@/data/hooks";
import { useFilterStore } from "@/data/filters";
import { formatBDT, formatDate, formatPct, humanize } from "@/data/format";
import { DELIVERY_TYPES } from "@/types/domain";

export default function FinancePage() {
  return (
    <DataGate>
      <Finance />
    </DataGate>
  );
}

function Finance() {
  const { derived, shipments, previous, daily, now } = usePageData();
  const open = useOpenDrawer();
  const clearAll = useFilterStore((s) => s.clearAll);
  const cross = useCross("finance-service");
  const fin = useMemo(() => financeFor(shipments, now), [shipments, now]);
  const prev = useMemo(() => financeFor(previous, now), [previous, now]);
  const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

  const settlement = useMemo(() => {
    const byId = new Map<string, typeof shipments>();
    for (const s of shipments) if (s.isCod) byId.set(s.pkg.merchant_id, [...(byId.get(s.pkg.merchant_id) ?? []), s]);
    return [...byId.entries()]
      .map(([id, list]) => {
        const m = merchantStatsFor(id, derived.merchantsById.get(id)?.merchant ?? null, list);
        const f = financeFor(list, now);
        return { m, f };
      })
      .sort((a, b) => b.f.codCollected - a.f.codCollected);
  }, [shipments, derived.merchantsById, now]);

  const byService = DELIVERY_TYPES.map((t) => {
    const list = shipments.filter((s) => s.pkg.delivery_type === t);
    const f = financeFor(list, now);
    return { key: t, label: humanize(t), value: f.margin, display: formatBDT(f.margin, true), secondary: `${list.length} shipments · ${formatPct(f.marginPct, 0)} margin`, color: f.margin >= 0 ? "good" : "danger" };
  }).filter((x) => x.value !== 0 || shipments.some((s) => s.pkg.delivery_type === x.key));

  const byCity = useMemo(() => {
    const cities = new Map<string, typeof shipments>();
    for (const s of shipments) cities.set(s.city, [...(cities.get(s.city) ?? []), s]);
    return [...cities.entries()].map(([city, list]) => {
      const f = financeFor(list, now);
      return { key: city, label: city, value: f.marginPct ?? 0, display: formatPct(f.marginPct, 0), secondary: `${formatBDT(f.revenue, true)} revenue`, color: (f.marginPct ?? 0) < 0 ? "danger" : (f.marginPct ?? 0) < 20 ? "warning" : "good" };
    }).sort((a, b) => b.value - a.value);
  }, [shipments, now]);

  const columns = useMemo<DataColumn<{ m: MerchantStats; f: ReturnType<typeof financeFor> }>[]>(
    () => [
      { key: "merchant", header: "Merchant", locked: true, cell: (r) => <span className="text-ink-900">{r.m.name}</span>, value: (r) => r.m.name },
      { key: "generated", header: "COD generated", align: "right", cell: (r) => <span className="text-ink-600">{formatBDT(r.f.codGenerated)}</span>, value: (r) => r.f.codGenerated },
      { key: "collected", header: "Collected", align: "right", cell: (r) => <span className="text-ink-900">{formatBDT(r.f.codCollected)}</span>, value: (r) => r.f.codCollected },
      { key: "pending", header: "Pending", align: "right", cell: (r) => <span className="text-ink-600">{formatBDT(r.f.codPending)}</span>, value: (r) => r.f.codPending },
      { key: "settled", header: "Settled", align: "right", cell: (r) => <span className="text-emerald-300">{formatBDT(r.f.codSettled)}</span>, value: (r) => r.f.codSettled },
      { key: "outstanding", header: "Outstanding", align: "right", cell: (r) => <span className={r.f.codOutstanding > 0 ? "text-amber-300" : "text-ink-600"}>{formatBDT(r.f.codOutstanding)}</span>, value: (r) => r.f.codOutstanding },
      { key: "fees", header: "COD fees", align: "right", cell: (r) => <span className="text-ink-600">{formatBDT(r.f.codFees)}</span>, value: (r) => r.f.codFees },
      { key: "revenue", header: "Delivery revenue", align: "right", cell: (r) => <span className="text-ink-600">{formatBDT(r.f.revenue)}</span>, value: (r) => r.f.revenue },
    ],
    [],
  );

  return (
    <Page>
      <PageHeader title="COD & Finance" description="Cash on delivery, merchant settlement, revenue, cost and margin. Amounts in BDT." />
      <KpiGrid>
        <KpiCard label="COD generated" value={formatBDT(fin.codGenerated, true)} delta={delta(fin.codGenerated, prev.codGenerated) != null ? { value: delta(fin.codGenerated, prev.codGenerated)!, label: "vs previous window" } : null} sub={`${fin.codShipments} COD shipments`} />
        <KpiCard label="COD collected" value={formatBDT(fin.codCollected, true)} tone="good" delta={delta(fin.codCollected, prev.codCollected) != null ? { value: delta(fin.codCollected, prev.codCollected)!, label: "vs previous window" } : null} trend={daily.slice(-14).map((d) => d.codCollected)} />
        <KpiCard label="COD pending" value={formatBDT(fin.codPending, true)} tone="warning" sub="in the field" />
        <KpiCard label="Settled" value={formatBDT(fin.codSettled, true)} sub={`T+${FINANCE.settlementDays} cycle`} />
        <KpiCard label="Outstanding" value={formatBDT(fin.codOutstanding, true)} tone={fin.codOutstanding > 0 ? "warning" : "neutral"} sub="collected, not yet settled" />
        <KpiCard label="Revenue" value={formatBDT(fin.revenue, true)} tone="accent" sub={`${fin.shipmentsBilled} billed · modelled`} delta={delta(fin.revenue, prev.revenue) != null ? { value: delta(fin.revenue, prev.revenue)!, label: "vs previous window" } : null} />
        <KpiCard label="Cost" value={formatBDT(fin.cost, true)} sub="line-haul, riders, hubs · modelled" delta={delta(fin.cost, prev.cost) != null ? { value: delta(fin.cost, prev.cost)!, goodIsUp: false, label: "vs previous window" } : null} />
        <KpiCard label="Margin" value={formatPct(fin.marginPct, 1)} tone={fin.margin >= 0 ? "good" : "danger"} sub={formatBDT(fin.margin, true)} />
      </KpiGrid>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="COD funnel" subtitle="Generated → collected → settled" empty={fin.codGenerated === 0}>
          <SegmentBar segments={[{ key: "settled", label: "Settled", value: fin.codSettled, color: "good" }, { key: "outstanding", label: "Collected, unsettled", value: fin.codOutstanding, color: "accent" }, { key: "pending", label: "Pending", value: fin.codPending, color: "warning" }, { key: "lost", label: "Not collectable", value: Math.max(0, fin.codGenerated - fin.codCollected - fin.codPending), color: "muted" }]} />
        </ChartCard>
        <ChartCard title="Cost breakdown" subtitle="Where the delivery cost goes" empty={fin.cost === 0}>
          <DonutChart slices={[{ key: "linehaul", label: "Line-haul (ex fuel)", value: fin.linehaulCost - fin.fuelCost, color: "accent" }, { key: "fuel", label: "Fuel", value: fin.fuelCost, color: "info" }, { key: "rider", label: "Riders", value: fin.riderCost, color: "ai" }, { key: "hub", label: "Hub handling", value: fin.hubCost, color: "warning" }]} centerValue={formatBDT(fin.cost, true)} centerLabel="cost" height={140} />
        </ChartCard>
        <ChartCard title="Profitability by service" subtitle="Margin by service type · click to filter" active={cross.active} activeLabel={cross.activeValue("serviceTypes") ? humanize(cross.activeValue("serviceTypes")) : undefined} empty={byService.length === 0}>
          <BarList rows={byService} max={Math.max(1, ...byService.map((x) => Math.abs(x.value)))} onClick={(k) => cross.toggle("serviceTypes", k, humanize(k))} activeKey={cross.activeValue("serviceTypes")} />
        </ChartCard>
        <ChartCard title="Margin by city" subtitle="Modelled margin on destination city" empty={byCity.length === 0}>
          <BarList rows={byCity} max={Math.max(30, ...byCity.map((x) => x.value))} />
        </ChartCard>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_420px]">
        <DataTable columns={columns} rows={settlement} rowKey={(r) => r.m.id} onRowClick={(r) => open("merchant", r.m.id)} initialSort={{ key: "collected", dir: "desc" }} exportName="cod-settlement" emptyWhat="COD merchants" onClearFilters={clearAll} dense />
        <div className="space-y-3">
          <ChartCard title="Revenue vs cost" subtitle="Per day · revenue on creation, cost on delivery" empty={daily.length === 0}>
            <TrendChart data={daily} xKey="date" xFormatter={formatDate} yFormatter={(v) => formatBDT(v, true)} height={200} series={[{ key: "revenue", label: "Revenue", color: "accent", kind: "area" }, { key: "cost", label: "Cost", color: "danger", kind: "line" }, { key: "codCollected", label: "COD collected", color: "good", kind: "line", dashed: true }]} />
          </ChartCard>
          <Card className="p-3 text-[11px] text-ink-600">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-900">
              <Info className="h-3.5 w-3.5 text-cyan-300" /> Model assumptions
            </div>
            <ul className="space-y-0.5">
              <li>Base fee: Standard ৳{FINANCE.baseFee.STANDARD} · Express ৳{FINANCE.baseFee.EXPRESS} · Same-day ৳{FINANCE.baseFee.SAME_DAY} · Scheduled ৳{FINANCE.baseFee.SCHEDULED}; +৳{FINANCE.weightSurchargePerKg}/kg above 1 kg.</li>
              <li>COD handling fee {FINANCE.codFeeRate * 100}% of collected amount; settlement T+{FINANCE.settlementDays}.</li>
              <li>Line-haul ৳{FINANCE.linehaulPerKm}/parcel-km (fuel {FINANCE.fuelShareOfLinehaul * 100}%), rider ৳{FINANCE.riderCostPerAttempt}/attempt, hub handling ৳{FINANCE.hubHandlingPerTouch}/touch.</li>
              <li>COD amounts, order values, attempts and distances are real; the rates live in one config file for the finance team to replace.</li>
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
