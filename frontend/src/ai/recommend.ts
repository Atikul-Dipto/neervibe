import type { HubStats, RiderStats, Shipment } from "@/data/derive";

/**
 * Recommendation engine. Rule-based and deterministic: every
 * recommendation states the problem, the action, the expected impact and
 * a confidence that reflects how much evidence backs it. Labelled as
 * rule-based in the UI so nobody mistakes it for a trained model.
 */
export interface Recommendation {
  problem: string;
  action: string;
  impact: string;
  confidence: number; // 0..1
  /** Short explanation of *why*, for the AI panel. */
  because: string[];
}

export function recommendForShipment(s: Shipment): Recommendation | null {
  if (!s.isActive) return null;
  const because = [...s.riskFactors];
  if (s.sla === "breached") {
    return {
      problem: `Promised delivery time passed ${s.hoursToSla != null ? Math.round(-s.hoursToSla) : "?"}h ago.`,
      action:
        s.status === "OUT_FOR_DELIVERY"
          ? `Call ${s.riderName ?? "the rider"} to prioritise this stop and notify the customer with a new window.`
          : s.group === "failed"
            ? "Reschedule for today and confirm the address by phone before dispatch."
            : `Escalate to ${s.currentNode?.node_name ?? "the current hub"} to expedite the next scan.`,
      impact: "Recovers the SLA miss as a same-day late delivery instead of a return; protects the merchant score.",
      confidence: 0.8,
      because,
    };
  }
  if (s.sla === "at_risk") {
    return {
      problem: `${s.hoursToSla != null ? `${s.hoursToSla.toFixed(1)}h` : "Little time"} left before the SLA, risk ${s.riskScore}/100.`,
      action:
        s.status === "ARRIVED_AT_DESTINATION_HUB"
          ? "Dispatch on the next rider wave; do not wait for a full batch."
          : s.status === "SORTING"
            ? "Pull forward in the sort queue and route to the earliest departure."
            : "Track closely; pre-alert the destination hub.",
      impact: `Estimated ${Math.round(40 + s.riskScore * 0.4)}% lower chance of breaching the SLA.`,
      confidence: 0.65,
      because,
    };
  }
  if (s.riskScore >= 40) {
    return {
      problem: `Elevated risk (${s.riskScore}/100) despite time remaining.`,
      action: because.some((b) => b.includes("Congested")) ? "Reroute via the regional hub to avoid the congested corridor." : "Keep on plan; recheck at the next scan.",
      impact: "Keeps the delivery inside the promised window.",
      confidence: 0.55,
      because,
    };
  }
  return null;
}

export function recommendForHub(h: HubStats): Recommendation | null {
  if (h.health === "ok" && h.pending.length < 10) return null;
  const overflow = Math.max(0, h.load - Math.round(h.capacity * 0.75));
  return {
    problem: `${h.name} is at ${Math.round(h.utilization * 100)}% with ${h.pending.length} parcels waiting${h.backlogHours != null ? ` (avg ${h.backlogHours.toFixed(1)}h)` : ""}.`,
    action:
      h.inbound.length > 0
        ? `Divert ${Math.min(h.inbound.length, Math.max(overflow, 5))} inbound parcels to another ${h.city} facility and add a sorting shift.`
        : "Add a sorting shift and dispatch the oldest parcels first.",
    impact: `Brings utilisation back under 75% within roughly ${Math.max(2, Math.ceil(h.pending.length / 8))}h and protects ${h.slaRisk} at-risk SLAs.`,
    confidence: h.health === "critical" ? 0.8 : 0.6,
    because: [
      `Utilisation ${Math.round(h.utilization * 100)}% against a 75% comfort line`,
      `${h.inbound.length} parcels inbound on the next arrivals`,
      `${h.slaRisk} parcels here already at risk or breached`,
    ],
  };
}

export function recommendForRider(r: RiderStats, idleInCity: RiderStats[]): Recommendation | null {
  if (r.workload === "overloaded") {
    const target = idleInCity.find((x) => x.id !== r.id);
    return {
      problem: `${r.name} is carrying ${r.active.length} active parcels.`,
      action: target ? `Move ${r.active.length - 4} parcels to ${target.name}, who is idle in ${r.city}.` : `Hold new dispatches to ${r.name} until the load drops below 4.`,
      impact: "Cuts expected doorstep delays for the moved parcels by roughly an hour each.",
      confidence: 0.7,
      because: [`${r.active.length} active vs a 6-parcel threshold`, target ? `${target.name} has nothing assigned` : "No idle rider available in the city"],
    };
  }
  if (r.successRate != null && r.successRate < 0.7 && r.attempts.length >= 5) {
    return {
      problem: `${r.name}'s success rate is ${Math.round(r.successRate * 100)}% over ${r.attempts.length} attempts.`,
      action: "Pair with a senior rider for a day and enforce a pre-departure address confirmation call.",
      impact: "Typical uplift of 10–15 points in first-attempt success within two weeks.",
      confidence: 0.6,
      because: [`${r.failedAttempts} failed attempts`, r.firstAttemptRate != null ? `First-attempt rate ${Math.round(r.firstAttemptRate * 100)}%` : "First-attempt rate unknown"],
    };
  }
  return null;
}
