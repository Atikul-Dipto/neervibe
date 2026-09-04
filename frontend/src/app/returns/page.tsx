"use client";

import { useMemo } from "react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { StatusPill, packageStatusTone } from "@/components/ui/StatusPill";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarList } from "@/components/charts/BarList";
import { DonutChart } from "@/components/charts/DonutChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { useCross, useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useFilterStore } from "@/data/filters";
import { formatBDT, formatDate, formatMinutes, formatPct, formatRelative, humanize } from "@/data/format";
import type { Shipment } from "@/data/derive";

export default function ReturnsPage() {
  return (
    <DataGate>
      <Returns />
    </DataGate>
  );
}

function Returns() {
  const { shipments, previous, daily, derived } = usePageData();
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const clearAll = useFilterStore((s) => s.clearAll);
  const merchantCross = useCross("return-merchants");
  const cityCross = useCross("return-cities");

  const returns = useMemo(() => shipments.filter((s) => s.group === "returns"), [shipments]);
  const prevReturns = previous.filter((s) => s.group === "returns");
  const rate = shipments.length ? (returns.length / shipments.length) * 100 : null;
  const prevRate = previous.length ? (prevReturns.length / previous.length) * 100 : null;
  const value = returns.reduce((s, x) => s + x.value, 0);
  const processing = returns
    .map((s) => {
      const req = s.events.find((e) => e.new_status === "RETURN_REQUESTED");
      const done = s.events.find((e) => e.new_status === "RETURNED");
      return req && done ? (Date.parse(done.timestamp) - Date.parse(req.timestamp)) / 60000 : null;
    })
    .filter((x): x is number => x != null);
  const failedToReturn = shipments.filter((s) => s.attempts.some((a) => a.result !== "SUCCESS"));

  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of returns) for (const a of s.attempts) if (a.result !== "SUCCESS") m.set(a.result, (m.get(a.result) ?? 0) + 1);
    if (m.size === 0) for (const s of returns) m.set(s.status, (m.get(s.status) ?? 0) + 1);
    return [...m.entries()].map(([k, v], i) => ({ key: k, label: humanize(k), value: v, color: ["danger", "warning", "info", "ai"][i % 4] }));
  }, [returns]);

  const byMerchant = useMemo(() => {
    const m = new Map<string, { name: string; total: number; returns: number }>();
    for (const s of shipments) {
      const x = m.get(s.pkg.merchant_id) ?? { name: s.merchantName, total: 0, returns: 0 };
      x.total += 1;
      if (s.group === "returns") x.returns += 1;
      m.set(s.pkg.merchant_id, x);
    }
    return [...m.entries()].filter(([, x]) => x.total >= 3).map(([id, x]) => ({ key: id, label: x.name, value: (x.returns / x.total) * 100, display: `${((x.returns / x.total) * 100).toFixed(0)}%`, secondary: `${x.returns} of ${x.total}`, color: x.returns / x.total > 0.1 ? "danger" : "warning" })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [shipments]);

  const byCity = useMemo(() => {
    const m = new Map<string, { total: number; returns: number }>();
    for (const s of shipments) {
      const x = m.get(s.city) ?? { total: 0, returns: 0 };
      x.total += 1;
      if (s.group === "returns") x.returns += 1;
      m.set(s.city, x);
    }
    return [...m.entries()].map(([city, x]) => ({ key: city, label: city, value: x.returns, secondary: `${formatPct(x.total ? (x.returns / x.total) * 100 : null, 0)} of ${x.total}`, color: "warning" })).sort((a, b) => b.value - a.value);
  }, [shipments]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of returns) m.set(s.pkg.package_type, (m.get(s.pkg.package_type) ?? 0) + 1);
    return [...m.entries()].map(([k, v], i) => ({ key: k, label: humanize(k), value: v, color: ["accent", "info", "ai", "good", "warning", "danger"][i % 6] }));
  }, [returns]);

  const columns = useMemo<DataColumn<Shipment>[]>(
    () => [
      { key: "tracking", header: "Tracking ID", locked: true, cell: (s) => <span className="font-mono text-ink-900">{s.trackingNumber}</span>, value: (s) => s.trackingNumber },
      { key: "status", header: "Stage", cell: (s) => <StatusPill tone={packageStatusTone(s.status)} size="xs">{humanize(s.status)}</StatusPill>, value: (s) => s.status },
      { key: "merchant", header: "Merchant", cell: (s) => <span className="text-ink-700">{s.merchantName}</span>, value: (s) => s.merchantName },
      { key: "city", header: "City", cell: (s) => <span className="text-ink-600">{s.city}</span>, value: (s) => s.city },
      { key: "reason", header: "Last failure reason", cell: (s) => <span className="text-ink-600">{humanize(s.attempts.filter((a) => a.result !== "SUCCESS").slice(-1)[0]?.result ?? null)}</span>, value: (s) => s.attempts.filter((a) => a.result !== "SUCCESS").slice(-1)[0]?.result ?? "" },
      { key: "value", header: "Value", align: "right", cell: (s) => <span className="text-ink-600">{formatBDT(s.value)}</span>, value: (s) => s.value },
      { key: "cod", header: "COD", cell: (s) => <span className="text-ink-600">{s.isCod ? formatBDT(s.codAmount) : "Prepaid"}</span>, value: (s) => s.codAmount },
      { key: "age", header: "In returns for", cell: (s) => <span className="text-ink-500">{formatRelative(new Date(s.updatedAt))}</span>, value: (s) => s.updatedAt },
    ],
    [],
  );

  return (
    <Page>
      <PageHeader title="Returns" description="Reverse logistics: what is coming back, why, from whom, and how long it takes." />
      <KpiGrid>
        <KpiCard label="Return rate" value={formatPct(rate)} tone={rate != null && rate > 8 ? "warning" : "good"} delta={rate != null && prevRate != null ? { value: rate - prevRate, suffix: "pp", goodIsUp: false, label: "vs previous window" } : null} />
        <KpiCard label="Return volume" value={returns.length} tone="warning" delta={prevReturns.length ? { value: ((returns.length - prevReturns.length) / prevReturns.length) * 100, goodIsUp: false, label: "vs previous window" } : null} trend={daily.slice(-14).map((d) => d.returns)} />
        <KpiCard label="Return value" value={formatBDT(value, true)} sub="declared value in the returns flow" />
        <KpiCard label="Avg processing" value={processing.length ? formatMinutes(processing.reduce((a, b) => a + b, 0) / processing.length) : "—"} sub="request → returned" />
        <KpiCard label="Completed" value={returns.filter((s) => s.status === "RETURNED").length} tone="neutral" />
        <KpiCard label="In transit back" value={returns.filter((s) => s.status === "RETURN_IN_TRANSIT").length} tone="accent" />
        <KpiCard label="Requested" value={returns.filter((s) => s.status === "RETURN_REQUESTED").length} tone="warning" />
        <KpiCard label="Failed → return" value={formatPct(failedToReturn.length ? (failedToReturn.filter((s) => s.group === "returns").length / failedToReturn.length) * 100 : null, 0)} sub="of shipments with a failed attempt" />
      </KpiGrid>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Reason analysis" subtitle="Doorstep outcomes behind returns" empty={reasons.length === 0}>
          <DonutChart slices={reasons} centerValue={String(returns.length)} centerLabel="returns" height={140} />
        </ChartCard>
        <ChartCard title="Merchant comparison" subtitle="Return rate · click to filter" active={merchantCross.active} activeLabel={byMerchant.find((m) => m.key === merchantCross.activeValue("merchants"))?.label} empty={byMerchant.length === 0}>
          <BarList rows={byMerchant} max={Math.max(20, ...byMerchant.map((m) => m.value))} onClick={(k) => merchantCross.toggle("merchants", k, byMerchant.find((m) => m.key === k)?.label ?? k)} activeKey={merchantCross.activeValue("merchants")} />
        </ChartCard>
        <ChartCard title="City comparison" subtitle="Returns by destination city · click to filter" active={cityCross.active} activeLabel={cityCross.activeValue("cities") ?? undefined} empty={byCity.length === 0}>
          <BarList rows={byCity} onClick={(k) => cityCross.toggle("cities", k, k)} activeKey={cityCross.activeValue("cities")} />
        </ChartCard>
        <ChartCard title="Package type analysis" subtitle="What kind of goods come back" empty={byType.length === 0}>
          <DonutChart slices={byType} centerValue={String(returns.length)} centerLabel="items" height={140} />
        </ChartCard>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_380px]">
        <DataTable columns={columns} rows={returns} rowKey={(s) => s.id} onRowClick={(s) => open("shipment", s.id)} activeKey={drawerItem?.kind === "shipment" ? drawerItem.id : null} initialSort={{ key: "age", dir: "asc" }} exportName="returns" emptyWhat="returns" onClearFilters={clearAll} dense />
        <ChartCard title="Return timeline" subtitle="Returns entering the flow per day" empty={daily.length === 0}>
          <TrendChart data={daily} xKey="date" xFormatter={formatDate} height={220} series={[{ key: "returns", label: "Returns", color: "warning", kind: "bar" }, { key: "failed", label: "Failed attempts", color: "danger", kind: "line" }]} />
        </ChartCard>
      </div>
      <p className="mt-2 text-[10px] text-ink-500">Snapshot covers {derived.shipments.length} shipments; SKU-level analysis uses package type until item lines are exposed by the API.</p>
    </Page>
  );
}
