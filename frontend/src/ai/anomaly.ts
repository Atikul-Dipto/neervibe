import type { DayPoint, Derived } from "@/data/derive";

/**
 * Anomaly detection over the daily series and the entity stats. Simple,
 * explainable statistics: a value is anomalous when it sits more than two
 * standard deviations from its recent baseline, or when an entity is a
 * clear outlier among its peers.
 */
export interface Anomaly {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  metric: string;
  value: number;
  expected: number;
  zscore: number;
  href?: string;
  entity?: { kind: "hub" | "rider" | "city"; id: string };
}

function stats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
  return { mean, std };
}

function seriesAnomaly(daily: DayPoint[], key: keyof DayPoint, label: string, badIsUp: boolean, id: string, href?: string): Anomaly | null {
  if (daily.length < 8) return null;
  const today = daily[daily.length - 1];
  const baseline = daily.slice(-8, -1).map((d) => Number(d[key]));
  const { mean, std } = stats(baseline);
  const value = Number(today[key]);
  const z = std > 0 ? (value - mean) / std : value > mean ? 2 : 0;
  if (Math.abs(z) < 2 || (mean === 0 && value === 0)) return null;
  const up = value > mean;
  const bad = badIsUp ? up : !up;
  return {
    id,
    severity: Math.abs(z) >= 3 ? (bad ? "high" : "low") : bad ? "medium" : "low",
    title: `${label} ${up ? "above" : "below"} its 7-day norm today`,
    detail: `${value.toLocaleString()} today vs a baseline of ${mean.toFixed(1)} (${z > 0 ? "+" : ""}${z.toFixed(1)}σ).`,
    metric: label,
    value,
    expected: mean,
    zscore: z,
    href,
  };
}

export function detectAnomalies(derived: Derived, daily: DayPoint[]): Anomaly[] {
  const out: Anomaly[] = [];
  const s1 = seriesAnomaly(daily, "created", "Shipment intake", false, "series:created", "/shipments?range=today");
  const s2 = seriesAnomaly(daily, "failed", "Failed attempts", true, "series:failed", "/exceptions");
  const s3 = seriesAnomaly(daily, "delivered", "Deliveries", false, "series:delivered", "/shipments?range=today&stage=delivered");
  const s4 = seriesAnomaly(daily, "late", "Late deliveries", true, "series:late", "/shipments?range=today&sla=missed");
  for (const a of [s1, s2, s3, s4]) if (a) out.push(a);

  // Hub utilisation outliers among hubs with a real capacity.
  const hubs = derived.hubs.filter((h) => h.capacity > 0);
  const { mean: hm, std: hs } = stats(hubs.map((h) => h.utilization));
  for (const h of hubs) {
    const z = hs > 0 ? (h.utilization - hm) / hs : 0;
    if (z >= 2 && h.utilization >= 0.6) {
      out.push({
        id: `hub:${h.id}`,
        severity: h.utilization >= 0.9 ? "high" : "medium",
        title: `${h.name} utilisation is an outlier`,
        detail: `${Math.round(h.utilization * 100)}% against a network average of ${Math.round(hm * 100)}% (+${z.toFixed(1)}σ).`,
        metric: "Hub utilisation",
        value: h.utilization,
        expected: hm,
        zscore: z,
        entity: { kind: "hub", id: h.id },
      });
    }
  }

  // City failure-rate outliers over the last 7 days.
  const byCity = new Map<string, { failed: number; total: number }>();
  const since = derived.now - 7 * 86400e3;
  for (const s of derived.shipments) {
    for (const a of s.attempts) {
      if (Date.parse(a.attempted_at) < since) continue;
      const c = byCity.get(s.city) ?? { failed: 0, total: 0 };
      c.total += 1;
      if (a.result !== "SUCCESS") c.failed += 1;
      byCity.set(s.city, c);
    }
  }
  const rates = [...byCity.entries()].filter(([, c]) => c.total >= 5).map(([city, c]) => ({ city, rate: c.failed / c.total, ...c }));
  const { mean: rm, std: rs } = stats(rates.map((r) => r.rate));
  for (const r of rates) {
    const z = rs > 0 ? (r.rate - rm) / rs : 0;
    if (z >= 1.5 && r.rate >= 0.25) {
      out.push({
        id: `city:${r.city}`,
        severity: r.rate >= 0.4 ? "high" : "medium",
        title: `${r.city} failure rate is well above the network`,
        detail: `${Math.round(r.rate * 100)}% of ${r.total} attempts failed this week vs ${Math.round(rm * 100)}% elsewhere.`,
        metric: "Failure rate",
        value: r.rate,
        expected: rm,
        zscore: z,
        href: `/shipments?city=${encodeURIComponent(r.city)}&stage=failed`,
        entity: { kind: "city", id: r.city },
      });
    }
  }

  // Rider success-rate outliers with enough evidence.
  const riders = derived.riders.filter((r) => r.attempts.length >= 5 && r.successRate != null);
  const { mean: sm, std: ss } = stats(riders.map((r) => r.successRate!));
  for (const r of riders) {
    const z = ss > 0 ? (r.successRate! - sm) / ss : 0;
    if (z <= -1.5) {
      out.push({
        id: `rider:${r.id}`,
        severity: r.successRate! < 0.6 ? "medium" : "low",
        title: `${r.name} is underperforming peers`,
        detail: `${Math.round(r.successRate! * 100)}% success over ${r.attempts.length} attempts vs a ${Math.round(sm * 100)}% norm.`,
        metric: "Rider success rate",
        value: r.successRate!,
        expected: sm,
        zscore: z,
        entity: { kind: "rider", id: r.id },
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || Math.abs(b.zscore) - Math.abs(a.zscore));
}
