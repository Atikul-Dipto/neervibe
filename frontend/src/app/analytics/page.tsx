"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { CityPerformanceCard, DataGate, ShipmentTrendCard, SlaTrendCard, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarList } from "@/components/charts/BarList";
import { TrendChart } from "@/components/charts/TrendChart";
import { financeFor, STATUS_GROUPS, type Shipment } from "@/data/derive";
import { useChartTheme } from "@/components/charts/chartTheme";
import { useCross, useDrill, useOpenDrawer } from "@/data/hooks";
import { PRESET_LABELS } from "@/data/filters";
import { formatBDT, formatDate, formatPct, humanize } from "@/data/format";

export default function AnalyticsPage() {
  return (
    <DataGate>
      <Analytics />
    </DataGate>
  );
}

const FUNNEL: { key: string; label: string; reached: (s: Shipment) => boolean }[] = [
  { key: "created", label: "Created", reached: () => true },
  { key: "picked", label: "Picked up", reached: (s) => s.group !== "pending" || s.status === "PICKED_UP" },
  { key: "hub", label: "At hub", reached: (s) => ["in_transit", "out_for_delivery", "delivered", "failed", "returns"].includes(s.group) },
  { key: "dispatched", label: "Dispatched", reached: (s) => (["in_transit"].includes(s.group) && ["DISPATCHED", "IN_TRANSIT", "ARRIVED_AT_DESTINATION_HUB"].includes(s.status)) || ["out_for_delivery", "delivered", "failed", "returns"].includes(s.group) },
  { key: "ofd", label: "Out for delivery", reached: (s) => ["out_for_delivery", "delivered", "failed", "returns"].includes(s.group) },
  { key: "delivered", label: "Delivered", reached: (s) => s.group === "delivered" },
];

function Analytics() {
  const chart = useChartTheme();
  const { derived, shipments, previous, daily, filters, now } = usePageData();
  const drill = useDrill();
  const open = useOpenDrawer();
  const stageCross = useCross("funnel");
  const compareLabel = filters.preset === "7d" ? "WoW" : filters.preset === "30d" ? "MoM" : filters.preset === "24h" || filters.preset === "today" ? "DoD" : "vs prior";

  const kpi = (list: Shipment[]) => {
    const delivered = list.filter((s) => s.status === "DELIVERED");
    const judged = delivered.filter((s) => s.sla === "met" || s.sla === "missed");
    return {
      total: list.length,
      delivered: delivered.length,
      deliveryRate: list.length ? (delivered.length / list.filter((s) => !s.isActive && s.status !== "CANCELLED").length) * 100 : null,
      sla: judged.length ? (judged.filter((s) => s.sla === "met").length / judged.length) * 100 : null,
      failed: list.filter((s) => s.group === "failed").length,
      returns: list.filter((s) => s.group === "returns").length,
      avgHours: delivered.length ? delivered.reduce((a, s) => a + ((s.deliveredAt ?? s.createdAt) - s.createdAt) / 3600e3, 0) / delivered.length : null,
      cost: financeFor(list, now).cost / Math.max(1, list.length),
    };
  };
  const cur = kpi(shipments);
  const prev = kpi(previous);
  const d = (a: number | null, b: number | null, pp = false) => (a == null || b == null ? null : pp ? a - b : b === 0 ? null : ((a - b) / b) * 100);

  const funnel = FUNNEL.map((f, i) => ({ ...f, n: shipments.filter(f.reached).length, color: ["muted", "accent", "info", "ai", "warning", "good"][i] }));

  const cohorts = useMemo(() => {
    const weeks = new Map<string, Shipment[]>();
    for (const s of shipments) {
      const dt = new Date(s.createdAt);
      const monday = new Date(dt);
      monday.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      weeks.set(key, [...(weeks.get(key) ?? []), s]);
    }
    return [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, list]) => {
        const k = kpi(list);
        return { week: formatDate(week), created: list.length, deliveryRate: k.deliveryRate == null ? null : Math.round(k.deliveryRate), sla: k.sla == null ? null : Math.round(k.sla), avgHours: k.avgHours == null ? null : Math.round(k.avgHours) };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipments]);

  const pareto = useMemo(() => {
    const byM = new Map<string, { name: string; n: number }>();
    for (const s of shipments) {
      const m = byM.get(s.pkg.merchant_id) ?? { name: s.merchantName, n: 0 };
      m.n += 1;
      byM.set(s.pkg.merchant_id, m);
    }
    const sorted = [...byM.values()].sort((a, b) => b.n - a.n);
    const total = sorted.reduce((a, m) => a + m.n, 0);
    const rows: { name: string; n: number; cum: number }[] = [];
    let running = 0;
    for (const m of sorted) {
      running += m.n;
      rows.push({ name: m.name, n: m.n, cum: total ? Math.round((running / total) * 100) : 0 });
    }
    const eighty = rows.findIndex((r) => r.cum >= 80) + 1;
    return { rows: rows.slice(0, 12), eighty, count: sorted.length };
  }, [shipments]);

  const cityMatrix = useMemo(() => {
    const cities = [...new Set(shipments.map((s) => s.city))].sort();
    return cities.map((city) => ({ city, counts: STATUS_GROUPS.map((g) => shipments.filter((s) => s.city === city && s.group === g.key).length), total: shipments.filter((s) => s.city === city).length }));
  }, [shipments]);
  const matrixMax = Math.max(1, ...cityMatrix.flatMap((r) => r.counts));

  const costByCity = useMemo(() => {
    const cities = new Map<string, Shipment[]>();
    for (const s of shipments) cities.set(s.city, [...(cities.get(s.city) ?? []), s]);
    return [...cities.entries()].map(([city, list]) => ({ key: city, label: city, value: financeFor(list, now).cost / list.length, display: formatBDT(financeFor(list, now).cost / list.length), secondary: `${list.length} shipments`, color: "ai" })).sort((a, b) => b.value - a.value);
  }, [shipments, now]);

  return (
    <Page>
      <PageHeader title="Analytics" description={`Advanced logistics BI. Comparison window: ${compareLabel} (${PRESET_LABELS[filters.preset]} vs the window before it).`} />
      <KpiGrid>
        <KpiCard label="Shipments" value={cur.total} delta={d(cur.total, prev.total) != null ? { value: d(cur.total, prev.total)!, label: compareLabel } : null} trend={daily.slice(-14).map((x) => x.created)} onClick={() => drill("/shipments")} />
        <KpiCard label="Delivered" value={cur.delivered} tone="good" delta={d(cur.delivered, prev.delivered) != null ? { value: d(cur.delivered, prev.delivered)!, label: compareLabel } : null} onClick={() => drill("/shipments", { statusGroups: ["delivered"] })} />
        <KpiCard label="Delivery rate" value={formatPct(cur.deliveryRate, 0)} tone="good" delta={d(cur.deliveryRate, prev.deliveryRate, true) != null ? { value: d(cur.deliveryRate, prev.deliveryRate, true)!, suffix: "pp", label: compareLabel } : null} />
        <KpiCard label="SLA met" value={formatPct(cur.sla, 0)} tone={cur.sla != null && cur.sla < 85 ? "warning" : "good"} delta={d(cur.sla, prev.sla, true) != null ? { value: d(cur.sla, prev.sla, true)!, suffix: "pp", label: compareLabel } : null} />
        <KpiCard label="Failed" value={cur.failed} tone="danger" delta={d(cur.failed, prev.failed) != null ? { value: d(cur.failed, prev.failed)!, goodIsUp: false, label: compareLabel } : null} onClick={() => drill("/shipments", { statusGroups: ["failed"] })} />
        <KpiCard label="Returns" value={cur.returns} tone="warning" delta={d(cur.returns, prev.returns) != null ? { value: d(cur.returns, prev.returns)!, goodIsUp: false, label: compareLabel } : null} onClick={() => drill("/returns")} />
        <KpiCard label="Avg delivery time" value={cur.avgHours == null ? "—" : `${cur.avgHours.toFixed(0)}h`} delta={d(cur.avgHours, prev.avgHours) != null ? { value: d(cur.avgHours, prev.avgHours)!, goodIsUp: false, label: compareLabel } : null} />
        <KpiCard label="Cost / shipment" value={formatBDT(cur.cost)} sub="modelled" delta={d(cur.cost, prev.cost) != null ? { value: d(cur.cost, prev.cost)!, goodIsUp: false, label: compareLabel } : null} />
      </KpiGrid>
      <p className="mt-1 text-[10px] text-ink-500">Year-over-year comparison needs 12+ months of history; the snapshot currently spans {Math.round((now - Math.min(...derived.shipments.map((s) => s.createdAt))) / 86400e3)} days.</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ShipmentTrendCard daily={daily} />
        <SlaTrendCard daily={daily} />
        <ChartCard title="Delivery funnel" subtitle="Shipments that reached each stage · click to filter" active={stageCross.active} activeLabel={stageCross.activeValue("statusGroups") ? humanize(stageCross.activeValue("statusGroups")) : undefined} empty={shipments.length === 0}>
          <BarList rows={funnel.map((f) => ({ key: f.key, label: f.label, value: f.n, secondary: `${formatPct(funnel[0].n ? (f.n / funnel[0].n) * 100 : null, 0)}`, color: f.color }))} onClick={(k) => k === "delivered" && stageCross.toggle("statusGroups", "delivered", "Delivered")} activeKey={stageCross.activeValue("statusGroups") === "delivered" ? "delivered" : null} />
        </ChartCard>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <ChartCard title="Cohort analysis" subtitle="By creation week: delivery rate, SLA and average delivery hours" empty={cohorts.length === 0}>
          <TrendChart data={cohorts} xKey="week" height={200} series={[{ key: "created", label: "Created", color: "accent", kind: "bar" }, { key: "deliveryRate", label: "Delivery %", color: "good", kind: "line", yAxisId: "right" }, { key: "sla", label: "SLA %", color: "warning", kind: "line", yAxisId: "right", dashed: true }]} />
        </ChartCard>
        <ChartCard title="Pareto · merchants" subtitle={pareto.count ? `${pareto.eighty} of ${pareto.count} merchants generate 80% of volume` : "No merchants"} empty={pareto.rows.length === 0}>
          <BarList rows={pareto.rows.map((r, i) => ({ key: r.name + i, label: r.name, value: r.n, secondary: `${r.cum}% cum.`, color: r.cum <= 80 ? "accent" : "muted" }))} />
        </ChartCard>
        <CityPerformanceCard shipments={shipments} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <ChartCard title="City × status heatmap" subtitle="Shipment counts by destination city and stage" empty={cityMatrix.length === 0} className="xl:col-span-2" bodyClassName="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-500">
                <th className="px-2 py-1 text-left font-medium">City</th>
                {STATUS_GROUPS.map((g) => (
                  <th key={g.key} className="px-1 py-1 text-center font-medium">{g.label}</th>
                ))}
                <th className="px-2 py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {cityMatrix.map((row) => (
                <tr key={row.city}>
                  <td className="px-2 py-0.5 text-ink-700">{row.city}</td>
                  {row.counts.map((n, i) => (
                    <td key={i} className="px-1 py-0.5 text-center">
                      <button
                        onClick={() => drill("/shipments", { cities: [row.city], statusGroups: [STATUS_GROUPS[i].key] })}
                        className={clsx("w-full rounded px-1 py-1 tabular-nums transition-colors hover:ring-1 hover:ring-cyan-400", n === 0 ? "text-ink-400" : "text-ink-900")}
                        style={{ backgroundColor: n === 0 ? "transparent" : `${chart.statusGroup[STATUS_GROUPS[i].key]}${Math.round(20 + (n / matrixMax) * 70).toString(16).padStart(2, "0")}` }}
                        title={`${row.city} · ${STATUS_GROUPS[i].label}: ${n}`}
                      >
                        {n}
                      </button>
                    </td>
                  ))}
                  <td className="px-2 py-0.5 text-right tabular-nums text-ink-900">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard title="Cost analysis" subtitle="Modelled cost per shipment by destination city" empty={costByCity.length === 0}>
          <BarList rows={costByCity} />
        </ChartCard>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <ChartCard title="Hub ranking" subtitle="Parcels handled (at, inbound, outbound) · click for detail" empty={derived.hubs.length === 0}>
          <BarList rows={[...derived.hubs].map((h) => ({ key: h.id, label: h.name, value: h.atHub.length + h.inbound.length + h.outbound.length, secondary: `${Math.round(h.utilization * 100)}% util.` })).sort((a, b) => b.value - a.value).slice(0, 8)} onClick={(k) => open("hub", k)} />
        </ChartCard>
        <ChartCard title="Rider ranking" subtitle="Deliveries completed · click for profile" empty={derived.riders.length === 0}>
          <BarList rows={[...derived.riders].sort((a, b) => b.deliveries - a.deliveries).slice(0, 8).map((r) => ({ key: r.id, label: r.name, value: r.deliveries, secondary: `score ${r.score ?? "—"}`, color: "good" }))} onClick={(k) => open("rider", k)} />
        </ChartCard>
        <ChartCard title="Return analysis" subtitle="Returns by package type" empty={shipments.filter((s) => s.group === "returns").length === 0}>
          <BarList rows={[...new Set(shipments.filter((s) => s.group === "returns").map((s) => s.pkg.package_type))].map((t) => ({ key: t, label: humanize(t), value: shipments.filter((s) => s.group === "returns" && s.pkg.package_type === t).length, color: "warning" })).sort((a, b) => b.value - a.value)} />
        </ChartCard>
      </div>
    </Page>
  );
}
