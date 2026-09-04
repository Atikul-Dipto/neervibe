import type { Derived, HubStats } from "@/data/derive";

/**
 * What-if simulation. Each scenario states its model in plain terms and
 * reports current state, simulated state, the difference, expected SLA
 * impact and cost impact. The models are simple capacity arithmetic on
 * the live snapshot: honest, fast, and easy to replace with something
 * fancier once real ML lands.
 */
export interface ScenarioResult {
  title: string;
  method: string;
  current: { label: string; value: string }[];
  simulated: { label: string; value: string }[];
  difference: { label: string; value: string; tone: "good" | "warning" | "danger" | "neutral" }[];
  slaImpactPp: number;
  costImpactBdt: number;
  summary: string;
}

const PARCELS_PER_RIDER_DAY = 8;
const RIDER_RELOCATION_BDT_PER_DAY = 800;
const TEMP_CAPACITY_BDT_PER_100 = 4500;
const RESCUE_EFFICIENCY = 0.6;

export function cityOptions(derived: Derived): string[] {
  return derived.cities;
}

/** Move N riders from one city to another for a day. */
export function simulateRiderMove(derived: Derived, fromCity: string, toCity: string, riders: number): ScenarioResult {
  const activeIn = (city: string) => derived.shipments.filter((s) => s.isActive && s.city === city);
  const ridersIn = (city: string) => derived.riders.filter((r) => r.city === city && r.rider.status !== "OFF_DUTY");
  const fromActive = activeIn(fromCity);
  const toActive = activeIn(toCity);
  const fromRiders = ridersIn(fromCity).length;
  const toRiders = ridersIn(toCity).length;
  const n = Math.max(0, Math.min(riders, fromRiders));
  const toAtRisk = toActive.filter((s) => s.sla === "at_risk" || s.sla === "breached").length;
  const fromAtRisk = fromActive.filter((s) => s.sla === "at_risk" || s.sla === "breached").length;

  const loadPer = (active: number, r: number) => (r > 0 ? active / r : active);
  const toBefore = loadPer(toActive.length, toRiders);
  const toAfter = loadPer(toActive.length, toRiders + n);
  const fromBefore = loadPer(fromActive.length, fromRiders);
  const fromAfter = loadPer(fromActive.length, Math.max(0, fromRiders - n));

  const rescued = Math.min(toAtRisk, Math.round(n * PARCELS_PER_RIDER_DAY * RESCUE_EFFICIENCY));
  const spareFrom = Math.max(0, fromRiders - n) * PARCELS_PER_RIDER_DAY - fromActive.length;
  const newlyAtRisk = spareFrom >= 0 ? 0 : Math.min(fromActive.length - fromAtRisk, Math.round(-spareFrom * 0.5));
  const totalActive = derived.shipments.filter((s) => s.isActive).length || 1;
  const slaImpactPp = ((rescued - newlyAtRisk) / totalActive) * 100;
  const cost = n * RIDER_RELOCATION_BDT_PER_DAY;

  return {
    title: `Move ${n} rider${n === 1 ? "" : "s"} from ${fromCity} to ${toCity}`,
    method: `Each rider clears about ${PARCELS_PER_RIDER_DAY} parcels a day and rescues ${Math.round(RESCUE_EFFICIENCY * 100)}% of the at-risk parcels they can reach; the source city is stressed only if its remaining riders fall below the load it carries.`,
    current: [
      { label: `${toCity} riders`, value: `${toRiders}` },
      { label: `${toCity} load / rider`, value: toBefore.toFixed(1) },
      { label: `${toCity} at risk`, value: `${toAtRisk}` },
      { label: `${fromCity} riders`, value: `${fromRiders}` },
      { label: `${fromCity} load / rider`, value: fromBefore.toFixed(1) },
    ],
    simulated: [
      { label: `${toCity} riders`, value: `${toRiders + n}` },
      { label: `${toCity} load / rider`, value: toAfter.toFixed(1) },
      { label: `${toCity} at risk`, value: `${Math.max(0, toAtRisk - rescued)}` },
      { label: `${fromCity} riders`, value: `${Math.max(0, fromRiders - n)}` },
      { label: `${fromCity} load / rider`, value: fromAfter.toFixed(1) },
    ],
    difference: [
      { label: "Parcels rescued", value: `+${rescued}`, tone: rescued > 0 ? "good" : "neutral" },
      { label: `Newly at risk in ${fromCity}`, value: `${newlyAtRisk}`, tone: newlyAtRisk > 0 ? "warning" : "good" },
      { label: "Network SLA", value: `${slaImpactPp >= 0 ? "+" : ""}${slaImpactPp.toFixed(1)} pp`, tone: slaImpactPp > 0 ? "good" : slaImpactPp < 0 ? "danger" : "neutral" },
      { label: "Cost", value: `৳${cost.toLocaleString()} / day`, tone: "neutral" },
    ],
    slaImpactPp,
    costImpactBdt: cost,
    summary:
      rescued > newlyAtRisk
        ? `Worth doing: rescues ${rescued} parcels in ${toCity} for ৳${cost.toLocaleString()}, with ${newlyAtRisk === 0 ? "no" : `${newlyAtRisk}`} new exposure in ${fromCity}.`
        : `Not worth it: ${toCity} gains ${rescued} but ${fromCity} would put ${newlyAtRisk} parcels at risk.`,
  };
}

/** Add temporary sorting capacity to a hub. */
export function simulateHubCapacity(derived: Derived, hub: HubStats, extraPct: number): ScenarioResult {
  const extra = Math.round(hub.capacity * (extraPct / 100));
  const newCap = hub.capacity + extra;
  const utilBefore = hub.utilization;
  const utilAfter = newCap > 0 ? hub.load / newCap : 0;
  const clearRate = Math.max(0, utilBefore - Math.min(utilAfter, 0.75));
  const rescued = Math.min(hub.slaRisk, Math.round(hub.pending.length * clearRate));
  const totalActive = derived.shipments.filter((s) => s.isActive).length || 1;
  const slaImpactPp = (rescued / totalActive) * 100;
  const cost = Math.round((extra / 100) * TEMP_CAPACITY_BDT_PER_100) * 1;
  return {
    title: `Add ${extraPct}% temporary capacity at ${hub.name}`,
    method: "Extra capacity lowers utilisation; every point of utilisation recovered below the 75% comfort line clears a proportional share of the pending backlog and its at-risk parcels.",
    current: [
      { label: "Capacity", value: hub.capacity.toLocaleString() },
      { label: "Utilisation", value: `${Math.round(utilBefore * 100)}%` },
      { label: "Pending", value: `${hub.pending.length}` },
      { label: "At risk here", value: `${hub.slaRisk}` },
    ],
    simulated: [
      { label: "Capacity", value: newCap.toLocaleString() },
      { label: "Utilisation", value: `${Math.round(utilAfter * 100)}%` },
      { label: "Pending", value: `${Math.max(0, hub.pending.length - rescued)}` },
      { label: "At risk here", value: `${Math.max(0, hub.slaRisk - rescued)}` },
    ],
    difference: [
      { label: "Utilisation", value: `${((utilAfter - utilBefore) * 100).toFixed(0)} pp`, tone: utilAfter < utilBefore ? "good" : "neutral" },
      { label: "Parcels rescued", value: `+${rescued}`, tone: rescued > 0 ? "good" : "neutral" },
      { label: "Network SLA", value: `+${slaImpactPp.toFixed(1)} pp`, tone: slaImpactPp > 0 ? "good" : "neutral" },
      { label: "Cost", value: `৳${cost.toLocaleString()} / day`, tone: "neutral" },
    ],
    slaImpactPp,
    costImpactBdt: cost,
    summary: rescued > 0 ? `Brings ${hub.name} to ${Math.round(utilAfter * 100)}% and protects ${rescued} at-risk parcels for ৳${cost.toLocaleString()} a day.` : `${hub.name} is not capacity-bound; extra space would not move its SLA exposure.`,
  };
}

/** Hold non-urgent dispatches on a congested corridor for a few hours. */
export function simulateCorridorHold(derived: Derived, routeId: string, hours: number): ScenarioResult {
  const e = derived.routesById.get(routeId);
  const src = e ? derived.nodesById.get(e.source_node_id) : undefined;
  const dst = e ? derived.nodesById.get(e.destination_node_id) : undefined;
  const on = e ? derived.shipments.filter((s) => s.isActive && s.currentNode?.id === e.source_node_id && (s.status === "DISPATCHED" || s.status === "SORTING")) : [];
  const urgent = on.filter((s) => s.pkg.priority === "URGENT" || s.pkg.priority === "HIGH" || (s.hoursToSla != null && s.hoursToSla < hours + 4));
  const held = on.length - urgent.length;
  const delayMin = e ? e.current_travel_time - e.estimated_travel_time : 0;
  const recoveredMin = Math.max(0, delayMin) * 0.6;
  const newlyAtRisk = held > 0 ? on.filter((s) => s.hoursToSla != null && s.hoursToSla < hours + 6 && !urgent.includes(s)).length : 0;
  const totalActive = derived.shipments.filter((s) => s.isActive).length || 1;
  const slaImpactPp = ((urgent.length * 0.3 - newlyAtRisk) / totalActive) * 100;
  return {
    title: `Hold non-urgent dispatches ${src?.city ?? "?"} → ${dst?.city ?? "?"} for ${hours}h`,
    method: "Urgent and near-SLA parcels keep moving; the rest wait for congestion to ease. Congestion typically recovers 60% of the excess travel time within the hold window.",
    current: [
      { label: "Parcels queued", value: `${on.length}` },
      { label: "Congestion", value: e ? `${Math.round(e.congestion_level * 100)}%` : "—" },
      { label: "Excess travel time", value: `${Math.max(0, delayMin)} min` },
    ],
    simulated: [
      { label: "Dispatched now", value: `${urgent.length}` },
      { label: "Held", value: `${held}` },
      { label: "Excess travel time after hold", value: `${Math.max(0, Math.round(delayMin - recoveredMin))} min` },
    ],
    difference: [
      { label: "Newly at risk", value: `${newlyAtRisk}`, tone: newlyAtRisk > 0 ? "warning" : "good" },
      { label: "Network SLA", value: `${slaImpactPp >= 0 ? "+" : ""}${slaImpactPp.toFixed(1)} pp`, tone: slaImpactPp >= 0 ? "good" : "danger" },
      { label: "Cost", value: "৳0 (no extra resources)", tone: "neutral" },
    ],
    slaImpactPp,
    costImpactBdt: 0,
    summary: newlyAtRisk === 0 ? `Safe to hold ${held} parcels; the ${urgent.length} that matter keep moving.` : `Holding would put ${newlyAtRisk} parcels at risk; shorten the hold or reroute instead.`,
  };
}
