import type { Derived, ExceptionItem, FinanceSummary, Shipment } from "@/data/derive";
import { recommendForHub, recommendForRider, type Recommendation } from "./recommend";
import type { Anomaly } from "./anomaly";

/**
 * The AI Operations Brief: a deterministic narrative assembled from the
 * derived data. Every sentence is traceable to a number on screen, which
 * is the point: an operator can act on it without second-guessing where
 * it came from.
 */
export interface BriefBullet {
  text: string;
  tone: "neutral" | "good" | "warning" | "danger";
  href?: string;
}

export interface BriefSection {
  title: string;
  bullets: BriefBullet[];
}

export interface OpsBrief {
  generatedAt: number;
  headline: string;
  sections: BriefSection[];
  actions: (Recommendation & { target: string; href?: string })[];
}

function pct(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}
function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(0)}%`;
}
function deltaText(now: number | null, prev: number | null, unit = "pp"): string {
  if (now == null || prev == null) return "";
  const d = now - prev;
  if (Math.abs(d) < 0.5) return " (flat vs previous window)";
  return ` (${d > 0 ? "+" : ""}${d.toFixed(0)}${unit} vs previous window)`;
}

export function buildOpsBrief(
  derived: Derived,
  current: Shipment[],
  previous: Shipment[],
  finance: FinanceSummary,
  anomalies: Anomaly[],
  exceptions: ExceptionItem[],
  windowLabel: string,
): OpsBrief {
  const active = current.filter((s) => s.isActive);
  const delivered = current.filter((s) => s.status === "DELIVERED");
  const judged = delivered.filter((s) => s.sla === "met" || s.sla === "missed");
  const slaRate = pct(judged.filter((s) => s.sla === "met").length, judged.length);
  const prevJudged = previous.filter((s) => s.sla === "met" || s.sla === "missed");
  const prevSla = pct(prevJudged.filter((s) => s.sla === "met").length, prevJudged.length);
  const breached = active.filter((s) => s.sla === "breached");
  const atRisk = active.filter((s) => s.sla === "at_risk");
  const failed = current.filter((s) => s.group === "failed");
  const prevFailed = previous.filter((s) => s.group === "failed");
  const volumeDelta = previous.length > 0 ? ((current.length - previous.length) / previous.length) * 100 : null;

  const byCity = new Map<string, number>();
  for (const s of [...breached, ...atRisk]) byCity.set(s.city, (byCity.get(s.city) ?? 0) + 1);
  const worstCities = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const criticalHubs = derived.hubs.filter((h) => h.health === "critical");
  const warningHubs = derived.hubs.filter((h) => h.health === "warning");
  const overloaded = derived.riders.filter((r) => r.workload === "overloaded");
  const idle = derived.riders.filter((r) => r.workload === "idle");

  const headline =
    breached.length > 0
      ? `${breached.length} shipment${breached.length === 1 ? "" : "s"} past SLA and ${atRisk.length} at risk; SLA performance ${fmtPct(slaRate)}${deltaText(slaRate, prevSla)}.`
      : `Network is healthy: ${active.length} active shipments, SLA performance ${fmtPct(slaRate)}${deltaText(slaRate, prevSla)}.`;

  const sections: BriefSection[] = [
    {
      title: "What changed",
      bullets: [
        {
          text: `${current.length.toLocaleString()} shipments in ${windowLabel}${volumeDelta != null ? ` (${volumeDelta > 0 ? "+" : ""}${volumeDelta.toFixed(0)}% vs the previous window)` : ""}; ${delivered.length} delivered, ${active.length} still moving.`,
          tone: "neutral",
          href: "/shipments",
        },
        {
          text: `SLA met on ${fmtPct(slaRate)} of judged deliveries${deltaText(slaRate, prevSla)}.`,
          tone: slaRate == null ? "neutral" : slaRate >= 90 ? "good" : slaRate >= 75 ? "warning" : "danger",
          href: "/analytics",
        },
        {
          text: `${failed.length} failed deliveries${prevFailed.length ? ` vs ${prevFailed.length} previously` : ""}; ${current.filter((s) => s.group === "returns").length} in the returns flow.`,
          tone: failed.length > prevFailed.length ? "warning" : "neutral",
          href: "/exceptions",
        },
        {
          text: `COD: ৳${Math.round(finance.codCollected).toLocaleString()} collected of ৳${Math.round(finance.codGenerated).toLocaleString()} generated; ৳${Math.round(finance.codPending).toLocaleString()} still in the field.`,
          tone: "neutral",
          href: "/finance",
        },
      ],
    },
    {
      title: "Why it changed",
      bullets:
        anomalies.length === 0
          ? [{ text: "No statistically unusual movement in intake, deliveries or failures against the 7-day baseline.", tone: "good" }]
          : anomalies.slice(0, 4).map((a) => ({ text: `${a.title}: ${a.detail}`, tone: a.severity === "high" ? "danger" : a.severity === "medium" ? "warning" : "neutral", href: a.href })),
    },
    {
      title: "Where it is happening",
      bullets:
        worstCities.length === 0
          ? [{ text: "No city carries SLA exposure right now.", tone: "good" }]
          : worstCities.map(([city, n]) => ({ text: `${city}: ${n} shipment${n === 1 ? "" : "s"} breached or at risk.`, tone: n >= 5 ? "danger" : "warning", href: `/shipments?city=${encodeURIComponent(city)}&sla=breached,at_risk` })),
    },
    {
      title: "Who is affected",
      bullets: [
        criticalHubs.length + warningHubs.length === 0
          ? { text: "All hubs are inside their capacity comfort line.", tone: "good" as const }
          : { text: `${criticalHubs.length} hub${criticalHubs.length === 1 ? "" : "s"} critical (${criticalHubs.map((h) => h.name).join(", ") || "none"}) and ${warningHubs.length} under pressure.`, tone: criticalHubs.length ? ("danger" as const) : ("warning" as const), href: "/hubs" },
        { text: `${overloaded.length} rider${overloaded.length === 1 ? "" : "s"} overloaded, ${idle.length} idle and available for rebalancing.`, tone: overloaded.length ? "warning" : "neutral", href: "/riders" },
        { text: `${exceptions.filter((e) => e.priority === "critical").length} critical and ${exceptions.filter((e) => e.priority === "high").length} high-priority exceptions open.`, tone: exceptions.some((e) => e.priority === "critical") ? "danger" : "neutral", href: "/exceptions" },
      ],
    },
  ];

  const actions: OpsBrief["actions"] = [];
  for (const h of criticalHubs.slice(0, 2)) {
    const rec = recommendForHub(h);
    if (rec) actions.push({ ...rec, target: h.name, href: "/hubs" });
  }
  for (const r of overloaded.slice(0, 2)) {
    const rec = recommendForRider(r, idle.filter((x) => x.city === r.city));
    if (rec) actions.push({ ...rec, target: r.name, href: "/dispatch" });
  }
  if (breached.length > 0) {
    actions.push({
      problem: `${breached.length} shipments are past their promised time.`,
      action: `Work the SLA-breach queue oldest-first; ${breached.filter((s) => s.status === "OUT_FOR_DELIVERY").length} are already with riders and can be rescued today.`,
      impact: "Converts breaches into late-but-delivered rather than returns; protects merchant scores.",
      confidence: 0.75,
      because: [`${breached.length} breached, ${atRisk.length} at risk`],
      target: "SLA queue",
      href: "/exceptions?type=SLA_BREACH",
    });
  }
  if (actions.length === 0) {
    actions.push({
      problem: "No pressure points detected.",
      action: "Use the quiet window to clear stuck shipments and address-issue exceptions.",
      impact: "Keeps tomorrow's SLA exposure low.",
      confidence: 0.6,
      because: ["No critical hubs, no overloaded riders, no SLA breaches"],
      target: "Network",
      href: "/exceptions",
    });
  }

  return { generatedAt: derived.now, headline, sections, actions: actions.slice(0, 4) };
}
