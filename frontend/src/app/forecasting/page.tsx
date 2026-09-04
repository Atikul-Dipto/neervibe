"use client";

import { useMemo, useState } from "react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarList } from "@/components/charts/BarList";
import { Tabs } from "@/components/ui/primitives";
import { Card } from "@/components/ui/Card";
import { forecastSeries } from "@/data/forecast";
import { dailySeries, type DayPoint } from "@/data/derive";
import { formatBDT, formatDate, formatNumber, formatPct } from "@/data/format";

type Horizon = 1 | 7 | 30;
type Model = "demand" | "hub" | "riders" | "sla" | "returns" | "cod" | "fleet";

const MODELS: { key: Model; label: string; metric: keyof DayPoint; unit: string; describe: string }[] = [
  { key: "demand", label: "Shipment demand", metric: "created", unit: "shipments", describe: "Daily shipment intake." },
  { key: "hub", label: "Hub congestion", metric: "created", unit: "parcels", describe: "Expected inbound load per hub from demand share." },
  { key: "riders", label: "Rider demand", metric: "created", unit: "riders", describe: "Riders needed at 8 parcels per rider per day." },
  { key: "sla", label: "SLA risk", metric: "late", unit: "late deliveries", describe: "Late deliveries per day." },
  { key: "returns", label: "Returns", metric: "returns", unit: "returns", describe: "Returns entering the flow per day." },
  { key: "cod", label: "COD", metric: "codGenerated", unit: "BDT", describe: "COD value generated per day." },
  { key: "fleet", label: "Fleet utilisation", metric: "created", unit: "% of capacity", describe: "Demand against line-haul capacity." },
];

const PARCELS_PER_RIDER = 8;
const PARCELS_PER_VEHICLE_DAY = 40;

export default function ForecastingPage() {
  return (
    <DataGate>
      <Forecasting />
    </DataGate>
  );
}

function Forecasting() {
  const { derived, shipments } = usePageData();
  const [horizonKey, setHorizonKey] = useState<"1" | "7" | "30">("7");
  const horizon = Number(horizonKey) as Horizon;
  const [model, setModel] = useState<Model>("demand");
  const def = MODELS.find((m) => m.key === model)!;

  // Forecasts use the full history (not the date filter), otherwise the
  // baseline would shrink with the window.
  const history = useMemo(() => dailySeries(derived.shipments, derived.now, 21), [derived]);
  const forecast = useMemo(() => forecastSeries(history.map((d) => ({ date: d.date, ts: d.ts, value: Number(d[def.metric]) })), horizon), [history, def.metric, horizon]);

  const riderCount = derived.riders.filter((r) => r.rider.status !== "OFF_DUTY").length || 1;
  const vehicleCount = derived.vehicles.length || 1;
  const scale = model === "riders" ? 1 / PARCELS_PER_RIDER : model === "fleet" ? 100 / (vehicleCount * PARCELS_PER_VEHICLE_DAY) : 1;
  const chart = forecast.points.map((p) => ({ date: p.date, history: p.kind === "history" ? p.value * scale : null, forecast: p.kind === "forecast" ? p.value * scale : null, upper: p.kind === "forecast" ? p.upper * scale : null, lower: p.kind === "forecast" ? p.lower * scale : null }));
  const lastHistory = forecast.points.filter((p) => p.kind === "history").slice(-1)[0];
  if (lastHistory) {
    const idx = chart.findIndex((c) => c.date === lastHistory.date);
    if (idx >= 0) chart[idx] = { ...chart[idx], forecast: lastHistory.value * scale, upper: lastHistory.value * scale, lower: lastHistory.value * scale };
  }
  const expected = forecast.total * scale;
  const perDay = expected / horizon;
  const fmt = (v: number) => (model === "cod" ? formatBDT(v, true) : model === "fleet" ? formatPct(v, 0) : formatNumber(Math.round(v)));

  // Hub share of active load → expected inbound per hub.
  const hubShare = useMemo(() => {
    const total = derived.hubs.reduce((s, h) => s + h.atHub.length + h.inbound.length, 0) || 1;
    return derived.hubs.map((h) => {
      const share = (h.atHub.length + h.inbound.length) / total;
      const expectedPerDay = (forecast.total / horizon) * share;
      const util = h.capacity ? (h.load + expectedPerDay) / h.capacity : 0;
      return { h, share, expectedPerDay, util };
    }).sort((a, b) => b.util - a.util);
  }, [derived.hubs, forecast.total, horizon]);

  const staffing = useMemo(() => {
    const byCity = new Map<string, number>();
    for (const s of shipments) byCity.set(s.city, (byCity.get(s.city) ?? 0) + 1);
    const total = [...byCity.values()].reduce((a, b) => a + b, 0) || 1;
    return [...byCity.entries()].map(([city, n]) => {
      const share = n / total;
      const need = Math.ceil(((forecast.total / horizon) * share) / PARCELS_PER_RIDER);
      const have = derived.riders.filter((r) => r.city === city && r.rider.status !== "OFF_DUTY").length;
      return { city, need, have, gap: need - have };
    }).sort((a, b) => b.gap - a.gap);
  }, [shipments, forecast.total, horizon, derived.riders]);

  return (
    <Page>
      <PageHeader
        title="Forecasting"
        description={`Statistical baseline over ${history.length} days of history: ${forecast.method}. Bands are 80% empirical intervals.`}
        actions={<Tabs value={horizonKey} onChange={setHorizonKey} tabs={[{ key: "1" as const, label: "Next day" }, { key: "7" as const, label: "Next 7 days" }, { key: "30" as const, label: "Next 30 days" }]} />}
      />
      <Tabs value={model} onChange={setModel} tabs={MODELS.map((m) => ({ key: m.key, label: m.label }))} className="mb-3 flex-wrap" />
      <KpiGrid>
        <KpiCard label={`Expected ${def.unit}`} value={fmt(model === "fleet" ? perDay : expected)} sub={model === "fleet" ? "average daily utilisation" : `over ${horizon} day${horizon === 1 ? "" : "s"}`} tone="accent" />
        <KpiCard label="Per day" value={fmt(perDay)} sub={`recent avg ${fmt(forecast.mean * scale)}`} />
        <KpiCard label="Trend" value={`${forecast.trendPerDay >= 0 ? "+" : ""}${(forecast.trendPerDay * scale).toFixed(model === "cod" ? 0 : 2)}`} sub="per day" tone={forecast.trendPerDay > 0 ? (model === "sla" || model === "returns" ? "warning" : "good") : "neutral"} />
        <KpiCard label="Confidence" value={formatPct(forecast.confidence * 100, 0)} tone={forecast.confidence > 0.7 ? "good" : forecast.confidence > 0.5 ? "warning" : "danger"} sub={forecast.method} />
        <KpiCard label="Riders needed" value={Math.ceil(((forecast.total / horizon) * (model === "riders" ? 1 : 1)) / PARCELS_PER_RIDER)} sub={`${riderCount} active today`} tone={Math.ceil((forecast.total / horizon) / PARCELS_PER_RIDER) > riderCount ? "warning" : "good"} />
        <KpiCard label="Vehicles needed" value={Math.ceil((forecast.total / horizon) / PARCELS_PER_VEHICLE_DAY)} sub={`${vehicleCount} in fleet`} />
        <KpiCard label="Upper band" value={fmt((forecast.horizon.reduce((s, p) => s + p.upper, 0) / horizon) * scale)} sub="per day, 80%" />
        <KpiCard label="Lower band" value={fmt((forecast.horizon.reduce((s, p) => s + p.lower, 0) / horizon) * scale)} sub="per day, 80%" />
      </KpiGrid>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_380px]">
        <ChartCard title={`${def.label} · history and forecast`} subtitle={def.describe} empty={chart.length === 0}>
          <TrendChart
            data={chart}
            xKey="date"
            height={280}
            xFormatter={formatDate}
            yFormatter={(v) => fmt(v)}
            referenceX={lastHistory?.date}
            series={[
              { key: "upper", label: "Upper 80%", color: "accent-soft", kind: "area" },
              { key: "lower", label: "Lower 80%", color: "ground", kind: "area" },
              { key: "history", label: "Actual", color: "accent", kind: "line" },
              { key: "forecast", label: "Forecast", color: "ai", kind: "line", dashed: true },
            ]}
          />
        </ChartCard>
        <div className="space-y-3">
          <ChartCard title="Recommended staffing" subtitle={`Riders needed vs available by city over ${horizon}d`} empty={staffing.length === 0}>
            <BarList rows={staffing.map((s) => ({ key: s.city, label: s.city, value: s.need, display: `${s.need}`, secondary: `${s.have} available · ${s.gap > 0 ? `+${s.gap} needed` : "ok"}`, color: s.gap > 0 ? "danger" : "good" }))} />
          </ChartCard>
          <ChartCard title="Hub congestion outlook" subtitle="Expected utilisation with forecast inbound" empty={hubShare.length === 0}>
            <BarList rows={hubShare.slice(0, 8).map((x) => ({ key: x.h.id, label: x.h.name, value: x.util * 100, display: `${Math.round(x.util * 100)}%`, secondary: `+${Math.round(x.expectedPerDay)}/day`, color: x.util >= 0.9 ? "danger" : x.util >= 0.7 ? "warning" : "good" }))} max={100} />
          </ChartCard>
        </div>
      </div>
      <Card className="mt-3 p-3 text-[11px] text-ink-600">
        Forecast method: linear trend fitted to the last {Math.min(28, history.length)} days, multiplied by a day-of-week seasonality index once two weeks of history exist. Bands are 1.28× the residual standard deviation, widening with the horizon.
        Capacity requirements assume {PARCELS_PER_RIDER} parcels per rider and {PARCELS_PER_VEHICLE_DAY} per vehicle per day. This is the baseline any trained model has to beat; replace <code className="text-ink-900">src/data/forecast.ts</code> to plug one in.
      </Card>
    </Page>
  );
}
