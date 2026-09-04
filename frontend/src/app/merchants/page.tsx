"use client";

import { useMemo } from "react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarList } from "@/components/charts/BarList";
import { merchantStatsFor, type MerchantStats } from "@/data/derive";
import { useCross, useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useFilterStore } from "@/data/filters";
import { formatBDT, formatPct } from "@/data/format";

export default function MerchantsPage() {
  return (
    <DataGate>
      <Merchants />
    </DataGate>
  );
}

function Merchants() {
  const { derived, shipments } = usePageData();
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const clearAll = useFilterStore((s) => s.clearAll);
  const cross = useCross("merchant-volume");

  // Recompute merchant stats on the *filtered* shipments so the ranking
  // respects the date range and every other filter.
  const merchants = useMemo(() => {
    const byId = new Map<string, typeof shipments>();
    for (const s of shipments) byId.set(s.pkg.merchant_id, [...(byId.get(s.pkg.merchant_id) ?? []), s]);
    return [...byId.entries()].map(([id, list]) => merchantStatsFor(id, derived.merchantsById.get(id)?.merchant ?? null, list)).sort((a, b) => b.total - a.total);
  }, [shipments, derived.merchantsById]);

  const totals = {
    shipments: merchants.reduce((s, m) => s + m.total, 0),
    cod: merchants.reduce((s, m) => s + m.codValue, 0),
    revenue: merchants.reduce((s, m) => s + m.revenue, 0),
  };
  const avg = (f: (m: MerchantStats) => number | null) => {
    const v = merchants.map(f).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const columns = useMemo<DataColumn<MerchantStats>[]>(
    () => [
      { key: "name", header: "Merchant", locked: true, cell: (m) => <span className="text-ink-900">{m.name}</span>, value: (m) => m.name },
      { key: "city", header: "City", cell: (m) => <span className="text-ink-600">{m.city ?? "—"}</span>, value: (m) => m.city ?? "" },
      { key: "total", header: "Shipments", align: "right", cell: (m) => <span className="text-ink-900">{m.total}</span>, value: (m) => m.total },
      { key: "active", header: "Active", align: "right", cell: (m) => <span className="text-ink-600">{m.active}</span>, value: (m) => m.active },
      { key: "delivery", header: "Delivery rate", align: "right", cell: (m) => <span className={m.deliveryRate != null && m.deliveryRate < 0.85 ? "text-amber-300" : "text-ink-600"}>{formatPct(m.deliveryRate == null ? null : m.deliveryRate * 100, 0)}</span>, value: (m) => m.deliveryRate ?? -1 },
      { key: "returns", header: "Return rate", align: "right", cell: (m) => <span className={m.returnRate != null && m.returnRate > 0.08 ? "text-rose-300" : "text-ink-600"}>{formatPct(m.returnRate == null ? null : m.returnRate * 100, 0)}</span>, value: (m) => m.returnRate ?? -1 },
      { key: "sla", header: "SLA met", align: "right", cell: (m) => <span className="text-ink-600">{formatPct(m.slaRate == null ? null : m.slaRate * 100, 0)}</span>, value: (m) => m.slaRate ?? -1 },
      { key: "hours", header: "Avg delivery", align: "right", cell: (m) => <span className="text-ink-600">{m.avgDeliveryHours == null ? "—" : `${m.avgDeliveryHours.toFixed(0)}h`}</span>, value: (m) => m.avgDeliveryHours ?? -1 },
      { key: "cod", header: "COD value", align: "right", cell: (m) => <span className="text-ink-600">{formatBDT(m.codValue, true)}</span>, value: (m) => m.codValue },
      { key: "collected", header: "COD collected", align: "right", cell: (m) => <span className="text-ink-600">{formatBDT(m.codCollected, true)}</span>, value: (m) => m.codCollected },
      { key: "revenue", header: "Revenue (modelled)", align: "right", cell: (m) => <span className="text-ink-900">{formatBDT(m.revenue, true)}</span>, value: (m) => m.revenue },
    ],
    [],
  );

  return (
    <Page>
      <PageHeader title="Merchants" description="Merchant performance management: volume, delivery and return rates, SLA, COD and billing." />
      <KpiGrid>
        <KpiCard label="Merchants" value={merchants.length} />
        <KpiCard label="Shipments" value={totals.shipments} />
        <KpiCard label="Avg delivery rate" value={formatPct((avg((m) => m.deliveryRate) ?? 0) * 100, 0)} tone="good" />
        <KpiCard label="Avg return rate" value={formatPct((avg((m) => m.returnRate) ?? 0) * 100, 1)} tone="warning" />
        <KpiCard label="Avg SLA met" value={formatPct((avg((m) => m.slaRate) ?? 0) * 100, 0)} />
        <KpiCard label="COD value" value={formatBDT(totals.cod, true)} />
        <KpiCard label="Revenue" value={formatBDT(totals.revenue, true)} sub="delivery fees, modelled" tone="accent" />
        <KpiCard label="Top merchant share" value={formatPct(totals.shipments && merchants[0] ? (merchants[0].total / totals.shipments) * 100 : null, 0)} sub={merchants[0]?.name} />
      </KpiGrid>
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_360px]">
        <DataTable columns={columns} rows={merchants} rowKey={(m) => m.id} onRowClick={(m) => open("merchant", m.id)} activeKey={drawerItem?.kind === "merchant" ? drawerItem.id : null} initialSort={{ key: "total", dir: "desc" }} exportName="merchants" emptyWhat="merchants" onClearFilters={clearAll} dense />
        <div className="space-y-3">
          <ChartCard title="Volume ranking" subtitle="Click to filter the page to a merchant" active={cross.active} activeLabel={merchants.find((m) => m.id === cross.activeValue("merchants"))?.name} empty={merchants.length === 0}>
            <BarList rows={merchants.slice(0, 10).map((m) => ({ key: m.id, label: m.name, value: m.total, secondary: m.city ?? undefined }))} onClick={(k) => cross.toggle("merchants", k, merchants.find((m) => m.id === k)?.name ?? k)} activeKey={cross.activeValue("merchants")} />
          </ChartCard>
          <ChartCard title="Highest return rates" subtitle="Merchants with at least 5 shipments" empty={merchants.filter((m) => m.total >= 5).length === 0}>
            <BarList rows={merchants.filter((m) => m.total >= 5).sort((a, b) => (b.returnRate ?? 0) - (a.returnRate ?? 0)).slice(0, 6).map((m) => ({ key: m.id, label: m.name, value: (m.returnRate ?? 0) * 100, display: `${((m.returnRate ?? 0) * 100).toFixed(0)}%`, secondary: `${m.returns} returns`, color: "#f87171" }))} max={Math.max(20, ...merchants.map((m) => (m.returnRate ?? 0) * 100))} onClick={(k) => open("merchant", k)} />
          </ChartCard>
        </div>
      </div>
    </Page>
  );
}
