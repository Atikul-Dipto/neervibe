import type { Derived, Shipment } from "@/data/derive";
import { dailySeries } from "@/data/derive";
import { forecastSeries } from "@/data/forecast";
import type { DrawerItem } from "@/data/drawer";
import { simulateRiderMove } from "./simulate";

/**
 * Natural-language query router. Intent matching is pattern-based and
 * every answer is computed from the snapshot, so the copilot never
 * invents a number. Unknown questions get the list of things it can do.
 */
export interface NlqResult {
  intent: string;
  answer: string;
  bullets: string[];
  actions: { label: string; href: string }[];
  drawer?: DrawerItem;
  scenario?: { fromCity: string; toCity: string; riders: number };
}

export const SUGGESTED_QUERIES = [
  "Why did SLA fall today?",
  "Show me delayed shipments in Dhaka",
  "Which hub is overloaded?",
  "Which riders are underutilized?",
  "What caused today's delivery failures?",
  "Which merchant has the highest return rate?",
  "Predict tomorrow's shipment volume",
  "What happens if I move 3 riders from Khulna to Dhaka?",
  "Which route should be optimized first?",
];

function findCity(q: string, cities: string[]): string | null {
  const lower = q.toLowerCase();
  return cities.find((c) => lower.includes(c.toLowerCase())) ?? null;
}

function pct(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

export function runQuery(raw: string, derived: Derived): NlqResult {
  const q = raw.trim();
  const lower = q.toLowerCase();
  const city = findCity(q, derived.cities);
  const active = derived.shipments.filter((s) => s.isActive);

  // Tracking number lookup.
  const tn = q.match(/PKG-[A-Z0-9]+/i)?.[0]?.toUpperCase();
  if (tn) {
    const s = derived.shipments.find((x) => x.trackingNumber === tn);
    if (s) {
      return {
        intent: "track",
        answer: `${s.trackingNumber} is ${s.status.replaceAll("_", " ").toLowerCase()} — ${s.merchantName} → ${s.city}, SLA ${s.sla.replaceAll("_", " ")}, risk ${s.riskScore}/100.`,
        bullets: s.riskFactors,
        actions: [{ label: "Open on the map", href: "/control-tower" }],
        drawer: { kind: "shipment", id: s.id },
      };
    }
    return { intent: "track", answer: `No shipment ${tn} in the current snapshot.`, bullets: [], actions: [{ label: "Search shipments", href: `/shipments?q=${encodeURIComponent(tn)}` }] };
  }

  // What-if: move riders.
  const move = lower.match(/move\s+(\d+)\s+riders?\s+(?:from\s+([a-z]+)\s+)?to\s+([a-z]+)/);
  if (move) {
    const n = Number(move[1]);
    const toCity = derived.cities.find((c) => c.toLowerCase() === move[3]) ?? city ?? "Dhaka";
    const fromCity =
      derived.cities.find((c) => c.toLowerCase() === (move[2] ?? "")) ??
      derived.riders.filter((r) => r.workload === "idle").map((r) => r.city).find((c): c is string => !!c && c !== toCity) ??
      derived.cities.find((c) => c !== toCity) ??
      toCity;
    const result = simulateRiderMove(derived, fromCity, toCity, n);
    return {
      intent: "simulate",
      answer: result.summary,
      bullets: result.difference.map((d) => `${d.label}: ${d.value}`),
      actions: [{ label: "Open in the simulator", href: `/ai?tab=simulate&from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}&riders=${n}` }, { label: "Dispatch board", href: "/dispatch" }],
      scenario: { fromCity, toCity, riders: n },
    };
  }

  // Why did SLA fall / drop.
  if (/sla/.test(lower) && /(fall|fell|drop|down|worse|decline|why)/.test(lower)) {
    const daily = dailySeries(derived.shipments, derived.now, 14);
    const today = daily[daily.length - 1];
    const prior = daily.slice(-8, -1);
    const rate = (d: { onTime: number; late: number }) => (d.onTime + d.late > 0 ? d.onTime / (d.onTime + d.late) : null);
    const todayRate = today ? rate(today) : null;
    const priorAgg = prior.reduce((a, d) => ({ onTime: a.onTime + d.onTime, late: a.late + d.late }), { onTime: 0, late: 0 });
    const priorRate = rate(priorAgg);
    const breached = active.filter((s) => s.sla === "breached");
    const byCity = new Map<string, number>();
    for (const s of breached) byCity.set(s.city, (byCity.get(s.city) ?? 0) + 1);
    const top = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const reasons = new Map<string, number>();
    for (const s of derived.shipments) for (const a of s.attempts) if (a.result !== "SUCCESS" && derived.now - Date.parse(a.attempted_at) < 86400e3) reasons.set(a.result, (reasons.get(a.result) ?? 0) + 1);
    const hubs = derived.hubs.filter((h) => h.health !== "ok").map((h) => `${h.name} (${Math.round(h.utilization * 100)}%)`);
    return {
      intent: "sla-explain",
      answer:
        todayRate != null && priorRate != null
          ? `On-time delivery is ${Math.round(todayRate * 100)}% today against ${Math.round(priorRate * 100)}% over the prior week. ${breached.length} active shipments are already past their promise.`
          : `${breached.length} active shipments are past their promised time; not enough deliveries have been judged today to compute a rate yet.`,
      bullets: [
        ...top.map(([c, n]) => `${c} carries ${n} breached shipments`),
        ...[...reasons.entries()].map(([r, n]) => `${n} failed attempts in 24h: ${r.replaceAll("_", " ").toLowerCase()}`),
        ...(hubs.length ? [`Hubs under pressure: ${hubs.join(", ")}`] : []),
      ],
      actions: [{ label: "Breached shipments", href: "/shipments?sla=breached" }, { label: "Exceptions", href: "/exceptions" }, { label: "SLA trend", href: "/analytics" }],
    };
  }

  // Delayed / late shipments (optionally in a city).
  if (/(delay|late|overdue|breach)/.test(lower) && /(shipment|parcel|package|deliver)/.test(lower)) {
    const list = active.filter((s) => s.sla === "breached" && (!city || s.city === city));
    return {
      intent: "delayed",
      answer: `${list.length} delayed shipment${list.length === 1 ? "" : "s"}${city ? ` in ${city}` : ""}${list.length ? `, the oldest ${Math.round(Math.max(...list.map((s) => -(s.hoursToSla ?? 0))))}h past promise` : ""}.`,
      bullets: list.slice(0, 5).map((s) => `${s.trackingNumber} · ${s.merchantName} → ${s.city} · ${s.status.replaceAll("_", " ").toLowerCase()}`),
      actions: [{ label: "Open filtered list", href: `/shipments?sla=breached${city ? `&city=${encodeURIComponent(city)}` : ""}` }],
    };
  }

  // Overloaded hub.
  if (/hub/.test(lower) && /(overload|congest|busy|capacity|full)/.test(lower)) {
    const ranked = [...derived.hubs].sort((a, b) => b.utilization - a.utilization).slice(0, 3);
    const top = ranked[0];
    return {
      intent: "hub-load",
      answer: top ? `${top.name} is the most loaded at ${Math.round(top.utilization * 100)}% with ${top.pending.length} parcels waiting.` : "No hub data.",
      bullets: ranked.map((h) => `${h.name} (${h.city}): ${Math.round(h.utilization * 100)}% · ${h.pending.length} pending · ${h.slaRisk} at risk`),
      actions: [{ label: "Hubs overview", href: "/hubs" }],
      drawer: top ? { kind: "hub", id: top.id } : undefined,
    };
  }

  // Underutilised riders.
  if (/rider/.test(lower) && /(under|idle|unused|free|available|utili)/.test(lower)) {
    const idle = derived.riders.filter((r) => r.workload === "idle" && (!city || r.city === city));
    return {
      intent: "riders-idle",
      answer: `${idle.length} rider${idle.length === 1 ? "" : "s"} ${city ? `in ${city} ` : ""}have nothing assigned right now.`,
      bullets: idle.slice(0, 6).map((r) => `${r.name} · ${r.city ?? "—"} · score ${r.score ?? "—"}`),
      actions: [{ label: "Dispatch board", href: "/dispatch" }, { label: "Riders", href: "/riders" }],
    };
  }

  // Delivery failure causes.
  if (/(fail|failure)/.test(lower)) {
    const reasons = new Map<string, number>();
    const byCity = new Map<string, number>();
    let total = 0;
    for (const s of derived.shipments) {
      for (const a of s.attempts) {
        if (a.result === "SUCCESS" || derived.now - Date.parse(a.attempted_at) > 86400e3) continue;
        total += 1;
        reasons.set(a.result, (reasons.get(a.result) ?? 0) + 1);
        byCity.set(s.city, (byCity.get(s.city) ?? 0) + 1);
      }
    }
    return {
      intent: "failures",
      answer: total ? `${total} doorstep attempts failed in the last 24h.` : "No failed doorstep attempts in the last 24h.",
      bullets: [
        ...[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r.replaceAll("_", " ").toLowerCase()}: ${n} (${pct(n, total)})`),
        ...[...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c}: ${n}`),
      ],
      actions: [{ label: "Failed shipments", href: "/shipments?stage=failed" }, { label: "Returns", href: "/returns" }],
    };
  }

  // Merchant return rate.
  if (/merchant/.test(lower) && /(return|worst|highest)/.test(lower)) {
    const ranked = derived.merchants.filter((m) => m.total >= 5).sort((a, b) => (b.returnRate ?? 0) - (a.returnRate ?? 0)).slice(0, 3);
    const top = ranked[0];
    return {
      intent: "merchant-returns",
      answer: top ? `${top.name} has the highest return rate at ${Math.round((top.returnRate ?? 0) * 100)}% of ${top.total} shipments.` : "Not enough merchant volume to rank.",
      bullets: ranked.map((m) => `${m.name}: ${Math.round((m.returnRate ?? 0) * 100)}% returns · ${Math.round((m.deliveryRate ?? 0) * 100)}% delivered`),
      actions: [{ label: "Merchant ranking", href: "/merchants" }],
      drawer: top ? { kind: "merchant", id: top.id } : undefined,
    };
  }

  // Forecast.
  if (/(predict|forecast|tomorrow|next week|next 7|next 30)/.test(lower)) {
    const daily = dailySeries(derived.shipments, derived.now, 14);
    const horizon = /30/.test(lower) ? 30 : /(week|7)/.test(lower) ? 7 : 1;
    const f = forecastSeries(daily.map((d) => ({ date: d.date, ts: d.ts, value: d.created })), horizon);
    const first = f.horizon[0];
    return {
      intent: "forecast",
      answer: horizon === 1 ? `Expect about ${Math.round(first.value)} shipments tomorrow (80% band ${Math.round(first.lower)}–${Math.round(first.upper)}).` : `Expect about ${Math.round(f.total)} shipments over the next ${horizon} days, averaging ${Math.round(f.total / horizon)} a day.`,
      bullets: [`Method: ${f.method}`, `Trend ${f.trendPerDay >= 0 ? "+" : ""}${f.trendPerDay.toFixed(2)} shipments/day`, `Confidence ${Math.round(f.confidence * 100)}%`],
      actions: [{ label: "Forecasting", href: "/forecasting" }],
    };
  }

  // Route optimisation.
  if (/(route|corridor)/.test(lower)) {
    const ranked = [...derived.routes].sort((a, b) => b.congestion_level * b.active_package_count - a.congestion_level * a.active_package_count).slice(0, 3);
    const label = (id: string) => derived.nodesById.get(id)?.city ?? "?";
    const top = ranked[0];
    return {
      intent: "routes",
      answer: top ? `${label(top.source_node_id)} → ${label(top.destination_node_id)} first: ${Math.round(top.congestion_level * 100)}% congestion with ${top.active_package_count} parcels on it and ${top.current_travel_time - top.estimated_travel_time} min excess travel.` : "No route data.",
      bullets: ranked.map((r) => `${label(r.source_node_id)} → ${label(r.destination_node_id)}: ${Math.round(r.congestion_level * 100)}% · ${r.active_package_count} parcels`),
      actions: [{ label: "Network", href: "/network" }],
      drawer: top ? { kind: "route", id: top.id } : undefined,
    };
  }

  // Generic "show me X in city".
  if (city) {
    const list = active.filter((s) => s.city === city);
    return {
      intent: "city",
      answer: `${city}: ${list.length} active shipments, ${list.filter((s) => s.sla === "breached").length} breached, ${derived.riders.filter((r) => r.city === city).length} riders based there.`,
      bullets: [],
      actions: [{ label: `Shipments in ${city}`, href: `/shipments?city=${encodeURIComponent(city)}` }, { label: "Control tower", href: `/control-tower?city=${encodeURIComponent(city)}` }],
    };
  }

  return {
    intent: "help",
    answer: "I can answer operational questions from the live snapshot. Try one of these:",
    bullets: SUGGESTED_QUERIES,
    actions: [],
  };
}

export function topShipmentsByRisk(shipments: Shipment[], n = 5): Shipment[] {
  return [...shipments].filter((s) => s.isActive).sort((a, b) => b.riskScore - a.riskScore).slice(0, n);
}
