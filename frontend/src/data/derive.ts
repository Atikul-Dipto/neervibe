import { findRegionAt, haversineKm } from "@/components/map/geo";
import type { RegionIndex } from "@/store/useControlTowerStore";
import { FINANCE, deliveryFee } from "@/config/finance";
import type {
  Customer,
  DeliveryAttempt,
  LogisticsNode,
  LogisticsRoute,
  Merchant,
  NodeType,
  Order,
  Package,
  PackageEvent,
  PackageStatus,
  Rider,
  Vehicle,
} from "@/types/domain";

/**
 * The analytics layer. Everything here is a pure function of the data
 * snapshot: no fetching, no React. Pages ask for `Derived` (via the
 * DataProvider) and filter it; they never compute business rules
 * themselves, so a KPI, a chart and a table always agree.
 */

export const HUB_TYPES = new Set<NodeType>(["HUB", "SORTING_CENTER", "REGIONAL_HUB", "DISTRIBUTION_CENTER", "DELIVERY_HUB"]);
export const TERMINAL_STATUSES = new Set<PackageStatus>(["DELIVERED", "CANCELLED", "RETURNED", "LOST", "DAMAGED"]);

export type StatusGroup = "pending" | "in_transit" | "out_for_delivery" | "delivered" | "failed" | "returns" | "cancelled" | "lost";

export const STATUS_GROUPS: { key: StatusGroup; label: string }[] = [
  { key: "pending", label: "Pending pickup" },
  { key: "in_transit", label: "In transit" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "failed", label: "Failed" },
  { key: "returns", label: "Returns" },
  { key: "cancelled", label: "Cancelled" },
  { key: "lost", label: "Lost / damaged" },
];

export function statusGroup(status: PackageStatus): StatusGroup {
  switch (status) {
    case "PACKAGE_CREATED":
    case "PICKUP_ASSIGNED":
    case "PICKED_UP":
      return "pending";
    case "ARRIVED_AT_HUB":
    case "SORTING":
    case "DISPATCHED":
    case "IN_TRANSIT":
    case "ARRIVED_AT_DESTINATION_HUB":
      return "in_transit";
    case "OUT_FOR_DELIVERY":
    case "RESCHEDULED":
      return "out_for_delivery";
    case "DELIVERED":
      return "delivered";
    case "DELIVERY_FAILED":
      return "failed";
    case "RETURN_REQUESTED":
    case "RETURN_IN_TRANSIT":
    case "RETURNED":
      return "returns";
    case "CANCELLED":
      return "cancelled";
    default:
      return "lost";
  }
}

export type SlaState = "on_track" | "at_risk" | "breached" | "met" | "missed" | "n_a";
export const SLA_STATES: SlaState[] = ["on_track", "at_risk", "breached", "met", "missed", "n_a"];
export const SLA_LABELS: Record<SlaState, string> = {
  on_track: "On track",
  at_risk: "At risk",
  breached: "Breached",
  met: "Met",
  missed: "Missed",
  n_a: "N/A",
};

export interface Shipment {
  pkg: Package;
  id: string;
  trackingNumber: string;
  status: PackageStatus;
  group: StatusGroup;
  isActive: boolean;
  merchant: Merchant | null;
  merchantName: string;
  customer: Customer | null;
  customerName: string;
  order: Order | null;
  origin: LogisticsNode | null;
  destination: LogisticsNode | null;
  currentNode: LogisticsNode | null;
  rider: Rider | null;
  riderName: string | null;
  vehicle: Vehicle | null;
  vehicleReg: string | null;
  city: string;
  division: string | null;
  district: string | null;
  isCod: boolean;
  codAmount: number;
  value: number;
  createdAt: number;
  updatedAt: number;
  expectedAt: number | null;
  deliveredAt: number | null;
  ageHours: number;
  hoursToSla: number | null;
  sla: SlaState;
  delayed: boolean;
  riskScore: number;
  riskFactors: string[];
  distanceKm: number;
  attempts: DeliveryAttempt[];
  events: PackageEvent[];
  hubTouches: number;
  fee: number;
  cost: number;
}

export type HubHealth = "ok" | "warning" | "critical";

export interface HubStats {
  node: LogisticsNode;
  id: string;
  name: string;
  city: string;
  division: string | null;
  district: string | null;
  load: number;
  capacity: number;
  utilization: number;
  inbound: Shipment[];
  outbound: Shipment[];
  pending: Shipment[];
  atHub: Shipment[];
  backlogHours: number | null;
  processingMin: number | null;
  slaRisk: number;
  health: HubHealth;
  ridersBased: number;
  vehiclesAt: number;
}

export type WorkloadState = "overloaded" | "normal" | "idle" | "off_duty";

export interface RiderStats {
  rider: Rider;
  id: string;
  name: string;
  city: string | null;
  baseNode: LogisticsNode | null;
  vehicle: Vehicle | null;
  active: Shipment[];
  delivered: Shipment[];
  attempts: DeliveryAttempt[];
  deliveries: number;
  failedAttempts: number;
  successRate: number | null;
  firstAttemptRate: number | null;
  onTimeRate: number | null;
  avgDeliveryMin: number | null;
  codCollected: number;
  codInHand: number;
  earnings: number;
  score: number | null;
  workload: WorkloadState;
  lastActiveAt: number;
  hasLocation: boolean;
}

export interface MerchantStats {
  merchant: Merchant | null;
  id: string;
  name: string;
  city: string | null;
  shipments: Shipment[];
  total: number;
  active: number;
  delivered: number;
  failed: number;
  returns: number;
  deliveryRate: number | null;
  returnRate: number | null;
  failureRate: number | null;
  slaRate: number | null;
  avgDeliveryHours: number | null;
  codValue: number;
  codCollected: number;
  codPending: number;
  revenue: number;
}

export interface FinanceSummary {
  codGenerated: number;
  codCollected: number;
  codPending: number;
  codSettled: number;
  codOutstanding: number;
  codFees: number;
  revenue: number;
  cost: number;
  linehaulCost: number;
  fuelCost: number;
  riderCost: number;
  hubCost: number;
  margin: number;
  marginPct: number | null;
  shipmentsBilled: number;
  codShipments: number;
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  ts: number;
  created: number;
  delivered: number;
  failed: number;
  returns: number;
  late: number;
  onTime: number;
  codGenerated: number;
  codCollected: number;
  revenue: number;
  cost: number;
}

export interface HourPoint {
  hour: string;
  ts: number;
  events: number;
  delivered: number;
  failed: number;
}

export type ExceptionType =
  | "SLA_BREACH"
  | "SHIPMENT_STUCK"
  | "ROUTE_CONGESTION"
  | "RIDER_INACTIVE"
  | "HUB_CONGESTION"
  | "FAILED_DELIVERY_SPIKE"
  | "COD_DISCREPANCY"
  | "ADDRESS_ISSUE"
  | "VEHICLE_ISSUE";

export type ExceptionPriority = "critical" | "high" | "medium" | "low";

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  SLA_BREACH: "SLA breach",
  SHIPMENT_STUCK: "Shipment stuck",
  ROUTE_CONGESTION: "Route congestion",
  RIDER_INACTIVE: "Rider inactive",
  HUB_CONGESTION: "Hub congestion",
  FAILED_DELIVERY_SPIKE: "Failed delivery spike",
  COD_DISCREPANCY: "COD discrepancy",
  ADDRESS_ISSUE: "Address issue",
  VEHICLE_ISSUE: "Vehicle issue",
};

export interface EntityRef {
  kind: "shipment" | "hub" | "rider" | "vehicle" | "route" | "city" | "merchant";
  id: string;
  label: string;
}

export interface ExceptionItem {
  id: string;
  type: ExceptionType;
  priority: ExceptionPriority;
  title: string;
  detail: string;
  entity: EntityRef;
  city: string | null;
  division: string | null;
  detectedAt: number;
  /** For shipment-related exceptions, the shipment id (drives cross-filtering). */
  shipmentId: string | null;
  hubId: string | null;
  riderId: string | null;
  /** What the system suggests doing about it. */
  recommendation: string;
}

export interface Snapshot {
  nodes: LogisticsNode[];
  routes: LogisticsRoute[];
  vehicles: Vehicle[];
  riders: Rider[];
  packages: Package[];
  orders: Order[];
  merchants: Merchant[];
  customers: Customer[];
  events: PackageEvent[];
  attempts: DeliveryAttempt[];
  regions: RegionIndex | null;
  now: number;
}

export interface Derived {
  now: number;
  ready: boolean;
  shipments: Shipment[];
  shipmentsById: Map<string, Shipment>;
  hubs: HubStats[];
  hubsById: Map<string, HubStats>;
  riders: RiderStats[];
  ridersById: Map<string, RiderStats>;
  merchants: MerchantStats[];
  merchantsById: Map<string, MerchantStats>;
  exceptions: ExceptionItem[];
  nodesById: Map<string, LogisticsNode>;
  routesById: Map<string, LogisticsRoute>;
  vehiclesById: Map<string, Vehicle>;
  customersById: Map<string, Customer>;
  ordersById: Map<string, Order>;
  nodes: LogisticsNode[];
  routes: LogisticsRoute[];
  vehicles: Vehicle[];
  events: PackageEvent[];
  attempts: DeliveryAttempt[];
  cities: string[];
  divisions: string[];
  districts: string[];
  hubNodes: LogisticsNode[];
  regions: RegionIndex | null;
  regionOfNode: (nodeId: string) => { district: string | null; division: string | null };
}

const HOUR = 3600e3;
const DAY = 86400e3;

const num = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null);

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

// --- Shipments --------------------------------------------------------------

function buildRegionLookup(nodes: LogisticsNode[], regions: RegionIndex | null) {
  const cache = new Map<string, { district: string | null; division: string | null }>();
  return (nodeId: string) => {
    const hit = cache.get(nodeId);
    if (hit) return hit;
    const node = nodes.find((n) => n.id === nodeId);
    let out = { district: null as string | null, division: null as string | null };
    if (node && regions) {
      const d = findRegionAt(regions.district, node.longitude, node.latitude);
      out = { district: d?.properties.name ?? null, division: d?.properties.division ?? null };
      if (!out.division) {
        const dv = findRegionAt(regions.division, node.longitude, node.latitude);
        out.division = dv?.properties.name ?? null;
      }
    }
    cache.set(nodeId, out);
    return out;
  };
}

function riskFor(s: Omit<Shipment, "riskScore" | "riskFactors">, routesBySource: Map<string, LogisticsRoute[]>): { score: number; factors: string[] } {
  if (!s.isActive) return { score: 0, factors: [] };
  const factors: string[] = [];
  let score = 8;
  if (s.hoursToSla != null) {
    if (s.hoursToSla < 0) {
      score += 70;
      factors.push("Past promised delivery time");
    } else if (s.hoursToSla < 3) {
      score += 50;
      factors.push("Under 3h to SLA");
    } else if (s.hoursToSla < 6) {
      score += 35;
      factors.push("Under 6h to SLA");
    } else if (s.hoursToSla < 12) {
      score += 18;
      factors.push("Under 12h to SLA");
    }
  }
  if (s.status === "DELIVERY_FAILED" || s.status === "RESCHEDULED") {
    score += 20;
    factors.push("Previous doorstep attempt failed");
  }
  if (s.group === "returns") {
    score += 10;
    factors.push("Return in progress");
  }
  if (s.attempts.some((a) => a.result === "FAILED_ADDRESS_ISSUE")) {
    score += 10;
    factors.push("Address could not be located");
  }
  const edges = s.currentNode ? routesBySource.get(s.currentNode.id) ?? [] : [];
  const worst = edges.reduce((m, e) => Math.max(m, e.congestion_level), 0);
  if ((s.status === "DISPATCHED" || s.status === "IN_TRANSIT") && worst > 0.6) {
    score += 10;
    factors.push(`Congested outbound route (${Math.round(worst * 100)}%)`);
  }
  const hubStatus = s.currentNode?.operating_status ?? s.destination?.operating_status;
  if (hubStatus === "CONGESTED" || hubStatus === "DEGRADED") {
    score += 10;
    factors.push(`Hub ${hubStatus.toLowerCase()}`);
  }
  if (s.pkg.priority === "URGENT") {
    score += 6;
    factors.push("Urgent priority");
  }
  if (s.isCod && s.codAmount > 5000) {
    score += 5;
    factors.push("High-value COD");
  }
  if (s.ageHours > 72 && s.group !== "delivered") {
    score += 8;
    factors.push("Open for more than 3 days");
  }
  return { score: Math.min(100, Math.round(score)), factors };
}

export function derive(snap: Snapshot): Derived {
  const { now } = snap;
  const nodesById = new Map(snap.nodes.map((n) => [n.id, n]));
  const routesById = new Map(snap.routes.map((r) => [r.id, r]));
  const vehiclesById = new Map(snap.vehicles.map((v) => [v.id, v]));
  const ridersById = new Map(snap.riders.map((r) => [r.id, r]));
  const merchantsById = new Map(snap.merchants.map((m) => [m.id, m]));
  const customersById = new Map(snap.customers.map((c) => [c.id, c]));
  const ordersById = new Map(snap.orders.map((o) => [o.id, o]));
  const regionOfNode = buildRegionLookup(snap.nodes, snap.regions);

  const routesBySource = new Map<string, LogisticsRoute[]>();
  for (const r of snap.routes) routesBySource.set(r.source_node_id, [...(routesBySource.get(r.source_node_id) ?? []), r]);

  const eventsByPkg = new Map<string, PackageEvent[]>();
  for (const e of snap.events) eventsByPkg.set(e.package_id, [...(eventsByPkg.get(e.package_id) ?? []), e]);
  for (const list of eventsByPkg.values()) list.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  // Packages in flight often carry no current_node_id (it is set on arrival
  // scans only); the last event with a node is the best-known location.
  const lastNodeByPkg = new Map<string, string>();
  for (const [pid, list] of eventsByPkg) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].node_id) {
        lastNodeByPkg.set(pid, list[i].node_id!);
        break;
      }
    }
  }

  const attemptsByPkg = new Map<string, DeliveryAttempt[]>();
  for (const a of snap.attempts) attemptsByPkg.set(a.package_id, [...(attemptsByPkg.get(a.package_id) ?? []), a]);
  for (const list of attemptsByPkg.values()) list.sort((a, b) => a.attempt_number - b.attempt_number);

  const shipments: Shipment[] = snap.packages.map((pkg) => {
    const origin = nodesById.get(pkg.source_node_id) ?? null;
    const destination = nodesById.get(pkg.destination_node_id) ?? null;
    const effectiveNodeId = pkg.current_node_id ?? lastNodeByPkg.get(pkg.id) ?? null;
    const currentNode = effectiveNodeId ? (nodesById.get(effectiveNodeId) ?? null) : null;
    const customer = customersById.get(pkg.customer_id) ?? null;
    const merchant = merchantsById.get(pkg.merchant_id) ?? null;
    const rider = pkg.assigned_rider_id ? (ridersById.get(pkg.assigned_rider_id) ?? null) : null;
    const vehicle = pkg.assigned_vehicle_id ? (vehiclesById.get(pkg.assigned_vehicle_id) ?? null) : null;
    const order = ordersById.get(pkg.order_id) ?? null;
    const region = regionOfNode(pkg.destination_node_id);
    const status = pkg.current_status;
    const group = statusGroup(status);
    const isActive = !TERMINAL_STATUSES.has(status);
    const createdAt = Date.parse(pkg.created_at);
    const updatedAt = Date.parse(pkg.updated_at);
    const expectedAt = num(pkg.expected_delivery_at);
    const deliveredAt = num(pkg.actual_delivery_at);
    const hoursToSla = expectedAt != null && isActive ? (expectedAt - now) / HOUR : null;
    let sla: SlaState = "n_a";
    if (status === "DELIVERED") sla = deliveredAt != null && expectedAt != null ? (deliveredAt <= expectedAt ? "met" : "missed") : "n_a";
    else if (!isActive || expectedAt == null) sla = "n_a";
    else if (hoursToSla != null && hoursToSla < 0) sla = "breached";
    else if ((hoursToSla != null && hoursToSla < 6) || group === "failed" || group === "returns" || status === "RESCHEDULED") sla = "at_risk";
    else sla = "on_track";

    const isCod = pkg.payment_type === "COD";
    const value = pkg.declared_value ?? order?.order_value ?? 0;
    const codAmount = isCod ? value : 0;
    const attempts = attemptsByPkg.get(pkg.id) ?? [];
    const events = eventsByPkg.get(pkg.id) ?? [];
    const hubTouches = events.filter((e) => e.node_id && HUB_TYPES.has(nodesById.get(e.node_id)?.node_type ?? "CUSTOMER")).length;
    const distanceKm = origin && destination ? haversineKm({ lat: origin.latitude, lon: origin.longitude }, { lat: destination.latitude, lon: destination.longitude }) : 0;
    const fee = status === "CANCELLED" ? 0 : deliveryFee(pkg.delivery_type, pkg.package_weight) + (isCod ? codAmount * FINANCE.codFeeRate : 0);
    const cost =
      distanceKm * FINANCE.linehaulPerKm * (group === "pending" || status === "CANCELLED" ? 0 : 1) +
      attempts.length * FINANCE.riderCostPerAttempt +
      Math.max(hubTouches, group === "delivered" ? 2 : 0) * FINANCE.hubHandlingPerTouch;

    const base: Omit<Shipment, "riskScore" | "riskFactors"> = {
      pkg,
      id: pkg.id,
      trackingNumber: pkg.tracking_number,
      status,
      group,
      isActive,
      merchant,
      merchantName: merchant?.business_name ?? `Merchant ${pkg.merchant_id.slice(0, 8)}`,
      customer,
      customerName: customer?.name ?? `Customer ${pkg.customer_id.slice(0, 8)}`,
      order,
      origin,
      destination,
      currentNode,
      rider,
      riderName: rider?.name ?? null,
      vehicle,
      vehicleReg: vehicle?.registration_number ?? null,
      city: destination?.city ?? customer?.city ?? "Unknown",
      division: region.division,
      district: region.district,
      isCod,
      codAmount,
      value,
      createdAt,
      updatedAt,
      expectedAt,
      deliveredAt,
      ageHours: (now - createdAt) / HOUR,
      hoursToSla,
      sla,
      delayed: isActive && sla === "breached",
      distanceKm,
      attempts,
      events,
      hubTouches,
      fee,
      cost,
    };
    const risk = riskFor(base, routesBySource);
    return { ...base, riskScore: risk.score, riskFactors: risk.factors };
  });
  const shipmentsById = new Map(shipments.map((s) => [s.id, s]));

  // --- Hubs -----------------------------------------------------------------
  const hubNodes = snap.nodes.filter((n) => HUB_TYPES.has(n.node_type));
  const sourcesOfHub = new Map<string, Set<string>>();
  for (const r of snap.routes) {
    if (!sourcesOfHub.has(r.destination_node_id)) sourcesOfHub.set(r.destination_node_id, new Set());
    sourcesOfHub.get(r.destination_node_id)!.add(r.source_node_id);
  }
  const ridersByNode = new Map<string, number>();
  for (const r of snap.riders) if (r.current_node_id) ridersByNode.set(r.current_node_id, (ridersByNode.get(r.current_node_id) ?? 0) + 1);
  const vehiclesByNode = new Map<string, number>();
  for (const v of snap.vehicles) if (v.current_node_id) vehiclesByNode.set(v.current_node_id, (vehiclesByNode.get(v.current_node_id) ?? 0) + 1);

  const active = shipments.filter((s) => s.isActive);
  const hubs: HubStats[] = hubNodes.map((node) => {
    const atHub = active.filter((s) => s.currentNode?.id === node.id);
    const sources = sourcesOfHub.get(node.id) ?? new Set();
    const inbound = active.filter((s) => (s.status === "DISPATCHED" || s.status === "IN_TRANSIT") && s.currentNode != null && sources.has(s.currentNode.id));
    const outbound = atHub.filter((s) => s.status === "DISPATCHED" || s.status === "OUT_FOR_DELIVERY");
    const pending = atHub.filter((s) => s.status === "ARRIVED_AT_HUB" || s.status === "SORTING" || s.status === "ARRIVED_AT_DESTINATION_HUB" || s.status === "PICKED_UP");
    const backlogHours = mean(pending.map((s) => (now - s.updatedAt) / HOUR));
    const processing: number[] = [];
    for (const s of shipments) {
      const arrived = s.events.find((e) => e.node_id === node.id && (e.new_status === "ARRIVED_AT_HUB" || e.new_status === "ARRIVED_AT_DESTINATION_HUB"));
      if (!arrived) continue;
      const left = s.events.find((e) => e.node_id === node.id && Date.parse(e.timestamp) > Date.parse(arrived.timestamp) && (e.new_status === "DISPATCHED" || e.new_status === "OUT_FOR_DELIVERY"));
      if (left) processing.push((Date.parse(left.timestamp) - Date.parse(arrived.timestamp)) / 60000);
    }
    const load = Math.max(node.current_load, atHub.length);
    const utilization = node.capacity > 0 ? load / node.capacity : 0;
    const status = node.operating_status;
    const slaRisk = [...pending, ...outbound].filter((s) => s.sla === "breached" || s.sla === "at_risk").length;
    // Health is operational pressure, not a nominal capacity ratio: a hub
    // whose racks are half empty is still in trouble if a third of what it
    // holds has blown its SLA or has been sitting for two days. Capacity
    // still counts — it is just not the only way a hub gets into trouble.
    const riskShare = pending.length > 0 ? slaRisk / pending.length : 0;
    const stale = backlogHours ?? 0;
    const health: HubHealth =
      status === "CONGESTED" || status === "CLOSED" || utilization >= 0.9 || stale > 48 || (pending.length >= 8 && riskShare >= 0.5)
        ? "critical"
        : status === "DEGRADED" || status === "MAINTENANCE" || utilization >= 0.7 || stale > 24 || slaRisk >= 5
          ? "warning"
          : "ok";
    const region = regionOfNode(node.id);
    return {
      node,
      id: node.id,
      name: node.node_name,
      city: node.city,
      division: region.division,
      district: region.district,
      load,
      capacity: node.capacity,
      utilization,
      inbound,
      outbound,
      pending,
      atHub,
      backlogHours,
      processingMin: mean(processing),
      slaRisk,
      health,
      ridersBased: ridersByNode.get(node.id) ?? 0,
      vehiclesAt: vehiclesByNode.get(node.id) ?? 0,
    };
  });
  const hubsById = new Map(hubs.map((h) => [h.id, h]));

  // --- Riders ---------------------------------------------------------------
  const attemptsByRider = new Map<string, DeliveryAttempt[]>();
  for (const a of snap.attempts) if (a.rider_id) attemptsByRider.set(a.rider_id, [...(attemptsByRider.get(a.rider_id) ?? []), a]);
  const shipmentsByRider = new Map<string, Shipment[]>();
  for (const s of shipments) if (s.pkg.assigned_rider_id) shipmentsByRider.set(s.pkg.assigned_rider_id, [...(shipmentsByRider.get(s.pkg.assigned_rider_id) ?? []), s]);

  const riders: RiderStats[] = snap.riders.map((rider) => {
    const attempts = attemptsByRider.get(rider.id) ?? [];
    const mine = shipmentsByRider.get(rider.id) ?? [];
    const activeMine = mine.filter((s) => s.isActive);
    const delivered = mine.filter((s) => s.status === "DELIVERED");
    const deliveries = attempts.filter((a) => a.result === "SUCCESS").length;
    const failedAttempts = attempts.length - deliveries;
    const firstAttempt = delivered.filter((s) => s.attempts.some((a) => a.result === "SUCCESS" && a.attempt_number === 1)).length;
    const deliveredWithAttempts = delivered.filter((s) => s.attempts.some((a) => a.result === "SUCCESS")).length;
    const judged = delivered.filter((s) => s.sla === "met" || s.sla === "missed");
    const onTime = judged.filter((s) => s.sla === "met").length;
    const durations: number[] = [];
    for (const s of delivered) {
      const out = s.events.find((e) => e.new_status === "OUT_FOR_DELIVERY");
      const done = s.events.find((e) => e.new_status === "DELIVERED");
      if (out && done) durations.push((Date.parse(done.timestamp) - Date.parse(out.timestamp)) / 60000);
    }
    const successRate = ratio(deliveries, attempts.length);
    const firstAttemptRate = ratio(firstAttempt, deliveredWithAttempts);
    const onTimeRate = ratio(onTime, judged.length);
    const score = successRate == null && firstAttemptRate == null && onTimeRate == null
      ? null
      : Math.round(100 * (0.5 * (successRate ?? 0.85) + 0.3 * (firstAttemptRate ?? 0.85) + 0.2 * (onTimeRate ?? 0.85)));
    const workload: WorkloadState =
      rider.status === "OFF_DUTY" ? "off_duty" : activeMine.length >= 6 ? "overloaded" : activeMine.length === 0 && rider.status === "AVAILABLE" ? "idle" : "normal";
    const baseNode = rider.current_node_id ? (nodesById.get(rider.current_node_id) ?? null) : null;
    const lastAttempt = attempts.reduce((m, a) => Math.max(m, Date.parse(a.attempted_at)), 0);
    return {
      rider,
      id: rider.id,
      name: rider.name,
      city: baseNode?.city ?? null,
      baseNode,
      vehicle: rider.vehicle_id ? (vehiclesById.get(rider.vehicle_id) ?? null) : null,
      active: activeMine,
      delivered,
      attempts,
      deliveries,
      failedAttempts,
      successRate,
      firstAttemptRate,
      onTimeRate,
      avgDeliveryMin: mean(durations),
      codCollected: delivered.reduce((sum, s) => sum + s.codAmount, 0),
      codInHand: activeMine.filter((s) => s.status === "OUT_FOR_DELIVERY").reduce((sum, s) => sum + s.codAmount, 0),
      earnings: attempts.length * FINANCE.riderCostPerAttempt,
      score,
      workload,
      lastActiveAt: Math.max(lastAttempt, Date.parse(rider.updated_at)),
      hasLocation: rider.current_latitude != null && rider.current_longitude != null,
    };
  });
  const riderStatsById = new Map(riders.map((r) => [r.id, r]));

  // --- Merchants ------------------------------------------------------------
  const shipmentsByMerchant = new Map<string, Shipment[]>();
  for (const s of shipments) shipmentsByMerchant.set(s.pkg.merchant_id, [...(shipmentsByMerchant.get(s.pkg.merchant_id) ?? []), s]);
  const merchantIds = new Set<string>([...merchantsById.keys(), ...shipmentsByMerchant.keys()]);
  const merchants: MerchantStats[] = [...merchantIds].map((id) => merchantStatsFor(id, merchantsById.get(id) ?? null, shipmentsByMerchant.get(id) ?? []));
  merchants.sort((a, b) => b.total - a.total);
  const merchantStatsById = new Map(merchants.map((m) => [m.id, m]));

  // --- Exceptions -----------------------------------------------------------
  const exceptions = deriveExceptions({ shipments, hubs, riders, vehicles: snap.vehicles, routes: snap.routes, nodesById, now, regionOfNode });

  const cities = [...new Set(snap.nodes.map((n) => n.city))].sort();
  const divisions = [...new Set(shipments.map((s) => s.division).filter((d): d is string => !!d))].sort();
  const districts = [...new Set(shipments.map((s) => s.district).filter((d): d is string => !!d))].sort();

  return {
    now,
    ready: true,
    shipments,
    shipmentsById,
    hubs,
    hubsById,
    riders,
    ridersById: riderStatsById,
    merchants,
    merchantsById: merchantStatsById,
    exceptions,
    nodesById,
    routesById,
    vehiclesById,
    customersById,
    ordersById,
    nodes: snap.nodes,
    routes: snap.routes,
    vehicles: snap.vehicles,
    events: snap.events,
    attempts: snap.attempts,
    cities,
    divisions,
    districts,
    hubNodes,
    regions: snap.regions,
    regionOfNode,
  };
}

export function merchantStatsFor(id: string, merchant: Merchant | null, shipments: Shipment[]): MerchantStats {
  const delivered = shipments.filter((s) => s.status === "DELIVERED");
  const failed = shipments.filter((s) => s.group === "failed" || s.attempts.some((a) => a.result !== "SUCCESS"));
  const returns = shipments.filter((s) => s.group === "returns");
  const judged = delivered.filter((s) => s.sla === "met" || s.sla === "missed");
  const closed = shipments.filter((s) => !s.isActive && s.status !== "CANCELLED");
  return {
    merchant,
    id,
    name: merchant?.business_name ?? `Merchant ${id.slice(0, 8)}`,
    city: merchant?.city ?? null,
    shipments,
    total: shipments.length,
    active: shipments.filter((s) => s.isActive).length,
    delivered: delivered.length,
    failed: failed.length,
    returns: returns.length,
    deliveryRate: ratio(delivered.length, closed.length),
    returnRate: ratio(returns.length, shipments.length),
    failureRate: ratio(failed.length, shipments.length),
    slaRate: ratio(judged.filter((s) => s.sla === "met").length, judged.length),
    avgDeliveryHours: mean(delivered.filter((s) => s.deliveredAt != null).map((s) => (s.deliveredAt! - s.createdAt) / HOUR)),
    codValue: shipments.reduce((sum, s) => sum + s.codAmount, 0),
    codCollected: delivered.reduce((sum, s) => sum + s.codAmount, 0),
    codPending: shipments.filter((s) => s.isActive).reduce((sum, s) => sum + s.codAmount, 0),
    revenue: shipments.reduce((sum, s) => sum + s.fee, 0),
  };
}

export function financeFor(shipments: Shipment[], now: number): FinanceSummary {
  const cod = shipments.filter((s) => s.isCod);
  const collected = cod.filter((s) => s.status === "DELIVERED");
  const settleBefore = now - FINANCE.settlementDays * DAY;
  const codGenerated = cod.reduce((sum, s) => sum + s.codAmount, 0);
  const codCollected = collected.reduce((sum, s) => sum + s.codAmount, 0);
  const codSettled = collected.filter((s) => (s.deliveredAt ?? 0) <= settleBefore).reduce((sum, s) => sum + s.codAmount, 0);
  const codPending = cod.filter((s) => s.isActive).reduce((sum, s) => sum + s.codAmount, 0);
  const billed = shipments.filter((s) => s.status !== "CANCELLED");
  const revenue = billed.reduce((sum, s) => sum + s.fee, 0);
  const linehaulCost = billed.reduce((sum, s) => sum + s.distanceKm * FINANCE.linehaulPerKm * (s.group === "pending" ? 0 : 1), 0);
  const riderCost = shipments.reduce((sum, s) => sum + s.attempts.length * FINANCE.riderCostPerAttempt, 0);
  const hubCost = shipments.reduce((sum, s) => sum + Math.max(s.hubTouches, s.group === "delivered" ? 2 : 0) * FINANCE.hubHandlingPerTouch, 0);
  const cost = linehaulCost + riderCost + hubCost;
  return {
    codGenerated,
    codCollected,
    codPending,
    codSettled,
    codOutstanding: codCollected - codSettled,
    codFees: codCollected * FINANCE.codFeeRate,
    revenue,
    cost,
    linehaulCost,
    fuelCost: linehaulCost * FINANCE.fuelShareOfLinehaul,
    riderCost,
    hubCost,
    margin: revenue - cost,
    marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
    shipmentsBilled: billed.length,
    codShipments: cod.length,
  };
}

/** Daily buckets spanning the shipments' creation dates through `now`. */
export function dailySeries(shipments: Shipment[], now: number, minDays = 14): DayPoint[] {
  if (shipments.length === 0) return [];
  const first = Math.min(...shipments.map((s) => s.createdAt));
  const start = Math.min(first, now - (minDays - 1) * DAY);
  const days = new Map<string, DayPoint>();
  for (let ts = new Date(start).setUTCHours(0, 0, 0, 0); ts <= now; ts += DAY) {
    const date = dayKey(ts);
    days.set(date, { date, ts, created: 0, delivered: 0, failed: 0, returns: 0, late: 0, onTime: 0, codGenerated: 0, codCollected: 0, revenue: 0, cost: 0 });
  }
  const bump = (ts: number | null, fn: (d: DayPoint) => void) => {
    if (ts == null) return;
    const d = days.get(dayKey(ts));
    if (d) fn(d);
  };
  for (const s of shipments) {
    bump(s.createdAt, (d) => {
      d.created += 1;
      d.codGenerated += s.codAmount;
      d.revenue += s.fee;
    });
    bump(s.deliveredAt, (d) => {
      d.delivered += 1;
      d.codCollected += s.codAmount;
      d.cost += s.cost;
      if (s.sla === "missed") d.late += 1;
      if (s.sla === "met") d.onTime += 1;
    });
    for (const a of s.attempts) if (a.result !== "SUCCESS") bump(Date.parse(a.attempted_at), (d) => (d.failed += 1));
    if (s.group === "returns") bump(s.updatedAt, (d) => (d.returns += 1));
  }
  return [...days.values()];
}

export function hourlySeries(events: PackageEvent[], now: number, hours = 24): HourPoint[] {
  const start = now - (hours - 1) * HOUR;
  const buckets: HourPoint[] = [];
  for (let i = 0; i < hours; i++) {
    const ts = new Date(start + i * HOUR).setMinutes(0, 0, 0);
    buckets.push({ hour: new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), ts, events: 0, delivered: 0, failed: 0 });
  }
  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (t < start - HOUR) continue;
    const idx = Math.floor((new Date(t).setMinutes(0, 0, 0) - buckets[0].ts) / HOUR);
    const b = buckets[idx];
    if (!b) continue;
    b.events += 1;
    if (e.new_status === "DELIVERED") b.delivered += 1;
    if (e.new_status === "DELIVERY_FAILED") b.failed += 1;
  }
  return buckets;
}

// --- Exceptions -------------------------------------------------------------

function deriveExceptions(ctx: {
  shipments: Shipment[];
  hubs: HubStats[];
  riders: RiderStats[];
  vehicles: Vehicle[];
  routes: LogisticsRoute[];
  nodesById: Map<string, LogisticsNode>;
  now: number;
  regionOfNode: Derived["regionOfNode"];
}): ExceptionItem[] {
  const { shipments, hubs, riders, vehicles, routes, nodesById, now } = ctx;
  const out: ExceptionItem[] = [];
  const shipRef = (s: Shipment): EntityRef => ({ kind: "shipment", id: s.id, label: s.trackingNumber });

  for (const s of shipments) {
    if (!s.isActive) continue;
    if (s.sla === "breached") {
      const overdue = s.hoursToSla != null ? -s.hoursToSla : 0;
      out.push({
        id: `sla:${s.id}`,
        type: "SLA_BREACH",
        priority: s.pkg.priority === "URGENT" || s.codAmount > 5000 || overdue > 24 ? "critical" : "high",
        title: `${s.trackingNumber} is ${Math.round(overdue)}h past its promised delivery`,
        detail: `${s.merchantName} → ${s.city}. Status ${s.status.replaceAll("_", " ").toLowerCase()}${s.riderName ? `, with ${s.riderName}` : ""}. Risk ${s.riskScore}/100.`,
        entity: shipRef(s),
        city: s.city,
        division: s.division,
        detectedAt: s.expectedAt ?? s.updatedAt,
        shipmentId: s.id,
        hubId: s.currentNode?.id ?? null,
        riderId: s.pkg.assigned_rider_id,
        recommendation: s.status === "OUT_FOR_DELIVERY" ? "Call the rider and prioritise this stop." : s.group === "failed" ? "Reschedule today and confirm the address with the customer." : "Escalate to the hub supervisor to expedite dispatch.",
      });
    }
    const idleHours = (now - s.updatedAt) / HOUR;
    if (idleHours > 24 && s.status !== "OUT_FOR_DELIVERY" && s.group !== "returns") {
      out.push({
        id: `stuck:${s.id}`,
        type: "SHIPMENT_STUCK",
        priority: idleHours > 72 ? "high" : "medium",
        title: `${s.trackingNumber} has not moved in ${Math.round(idleHours)}h`,
        detail: `Last status ${s.status.replaceAll("_", " ").toLowerCase()} at ${s.currentNode?.node_name ?? "unknown location"}.`,
        entity: shipRef(s),
        city: s.city,
        division: s.division,
        detectedAt: s.updatedAt,
        shipmentId: s.id,
        hubId: s.currentNode?.id ?? null,
        riderId: s.pkg.assigned_rider_id,
        recommendation: s.currentNode ? `Ask ${s.currentNode.node_name} to locate and scan the parcel.` : "Trace the parcel from its last scan.",
      });
    }
    if (s.attempts.some((a) => a.result === "FAILED_ADDRESS_ISSUE")) {
      out.push({
        id: `addr:${s.id}`,
        type: "ADDRESS_ISSUE",
        priority: "medium",
        title: `Address could not be located for ${s.trackingNumber}`,
        detail: `${s.customerName} in ${s.city}. ${s.attempts.length} attempt(s) so far.`,
        entity: shipRef(s),
        city: s.city,
        division: s.division,
        detectedAt: Date.parse(s.attempts[s.attempts.length - 1].attempted_at),
        shipmentId: s.id,
        hubId: s.currentNode?.id ?? null,
        riderId: s.pkg.assigned_rider_id,
        recommendation: "Verify the address with the customer before the next attempt.",
      });
    }
    if (s.isCod && s.order && s.pkg.declared_value != null && Math.abs(s.order.order_value - s.pkg.declared_value) / Math.max(s.order.order_value, 1) > 0.25) {
      out.push({
        id: `cod:${s.id}`,
        type: "COD_DISCREPANCY",
        priority: "low",
        title: `COD amount differs from order value on ${s.trackingNumber}`,
        detail: `Declared ৳${Math.round(s.pkg.declared_value)} vs order ৳${Math.round(s.order.order_value)}.`,
        entity: shipRef(s),
        city: s.city,
        division: s.division,
        detectedAt: s.createdAt,
        shipmentId: s.id,
        hubId: null,
        riderId: s.pkg.assigned_rider_id,
        recommendation: "Confirm the collectable amount with the merchant before delivery.",
      });
    }
  }

  for (const h of hubs) {
    if (h.health === "critical" || (h.health === "warning" && h.pending.length > 10)) {
      out.push({
        id: `hub:${h.id}`,
        type: "HUB_CONGESTION",
        priority: h.health === "critical" ? "critical" : "high",
        title: `${h.name} at ${Math.round(h.utilization * 100)}% capacity`,
        detail: `${h.pending.length} parcels waiting, ${h.inbound.length} inbound, backlog ${h.backlogHours != null ? `${h.backlogHours.toFixed(1)}h` : "n/a"}. Status ${h.node.operating_status.toLowerCase()}.`,
        entity: { kind: "hub", id: h.id, label: h.name },
        city: h.city,
        division: h.division,
        detectedAt: now,
        shipmentId: null,
        hubId: h.id,
        riderId: null,
        recommendation: `Add a sorting shift or divert inbound volume to another ${h.city} facility.`,
      });
    }
  }

  const failedByCity = new Map<string, number>();
  const outcomesByCity = new Map<string, number>();
  for (const s of shipments) {
    for (const a of s.attempts) {
      if (now - Date.parse(a.attempted_at) > DAY) continue;
      outcomesByCity.set(s.city, (outcomesByCity.get(s.city) ?? 0) + 1);
      if (a.result !== "SUCCESS") failedByCity.set(s.city, (failedByCity.get(s.city) ?? 0) + 1);
    }
  }
  for (const [city, failed] of failedByCity) {
    const total = outcomesByCity.get(city) ?? 0;
    if (failed >= 3 && failed / Math.max(total, 1) >= 0.3) {
      out.push({
        id: `failspike:${city}`,
        type: "FAILED_DELIVERY_SPIKE",
        priority: failed / Math.max(total, 1) >= 0.5 ? "high" : "medium",
        title: `${failed} of ${total} doorstep attempts in ${city} failed in 24h`,
        detail: `Failure rate ${Math.round((failed / Math.max(total, 1)) * 100)}% against a network norm near 15%.`,
        entity: { kind: "city", id: city, label: city },
        city,
        division: null,
        detectedAt: now,
        shipmentId: null,
        hubId: null,
        riderId: null,
        recommendation: "Review the failure reasons; brief riders on address confirmation calls before departure.",
      });
    }
  }

  for (const r of riders) {
    const staleHours = (now - r.lastActiveAt) / HOUR;
    if (r.rider.status === "ON_DELIVERY" && r.active.length === 0) {
      out.push({
        id: `rider:${r.id}`,
        type: "RIDER_INACTIVE",
        priority: "low",
        title: `${r.name} is marked on delivery with nothing assigned`,
        detail: `Based at ${r.baseNode?.node_name ?? "unknown"}; last activity ${Math.round(staleHours)}h ago.`,
        entity: { kind: "rider", id: r.id, label: r.name },
        city: r.city,
        division: r.baseNode ? ctx.regionOfNode(r.baseNode.id).division : null,
        detectedAt: r.lastActiveAt,
        shipmentId: null,
        hubId: r.baseNode?.id ?? null,
        riderId: r.id,
        recommendation: "Confirm the rider's status and release them to the available pool.",
      });
    } else if (r.workload === "overloaded") {
      out.push({
        id: `riderload:${r.id}`,
        type: "RIDER_INACTIVE",
        priority: "medium",
        title: `${r.name} is carrying ${r.active.length} active parcels`,
        detail: `Above the 6-parcel comfort threshold in ${r.city ?? "their city"}.`,
        entity: { kind: "rider", id: r.id, label: r.name },
        city: r.city,
        division: r.baseNode ? ctx.regionOfNode(r.baseNode.id).division : null,
        detectedAt: now,
        shipmentId: null,
        hubId: r.baseNode?.id ?? null,
        riderId: r.id,
        recommendation: "Rebalance new dispatches to idle riders in the same city.",
      });
    }
  }

  for (const e of routes) {
    if (e.congestion_level >= 0.8 || e.route_status === "BLOCKED" || e.route_status === "SUSPENDED") {
      const src = nodesById.get(e.source_node_id);
      const dst = nodesById.get(e.destination_node_id);
      out.push({
        id: `route:${e.id}`,
        type: "ROUTE_CONGESTION",
        priority: e.route_status === "BLOCKED" ? "high" : "medium",
        title: `${src?.city ?? "?"} → ${dst?.city ?? "?"} corridor at ${Math.round(e.congestion_level * 100)}% congestion`,
        detail: `${src?.node_name ?? e.source_node_id} to ${dst?.node_name ?? e.destination_node_id}: travel time ${e.current_travel_time} min vs ${e.estimated_travel_time} planned, ${e.active_package_count} parcels on it.`,
        entity: { kind: "route", id: e.id, label: `${src?.city ?? "?"} → ${dst?.city ?? "?"}` },
        city: dst?.city ?? null,
        division: dst ? ctx.regionOfNode(dst.id).division : null,
        detectedAt: now,
        shipmentId: null,
        hubId: e.destination_node_id,
        riderId: null,
        recommendation: "Hold non-urgent dispatches on this corridor or reroute via the regional hub.",
      });
    }
  }

  for (const v of vehicles) {
    if (v.status === "MAINTENANCE" || v.status === "OFFLINE") {
      const node = v.current_node_id ? nodesById.get(v.current_node_id) : undefined;
      out.push({
        id: `vehicle:${v.id}`,
        type: "VEHICLE_ISSUE",
        priority: "medium",
        title: `${v.registration_number} is ${v.status.toLowerCase()}`,
        detail: `${v.vehicle_type.replaceAll("_", " ").toLowerCase()} at ${node?.node_name ?? "unknown location"}.`,
        entity: { kind: "vehicle", id: v.id, label: v.registration_number },
        city: node?.city ?? null,
        division: node ? ctx.regionOfNode(node.id).division : null,
        detectedAt: Date.parse(v.updated_at),
        shipmentId: null,
        hubId: v.current_node_id,
        riderId: null,
        recommendation: "Reassign its load to an idle vehicle in the same city.",
      });
    }
  }

  const order: Record<ExceptionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => order[a.priority] - order[b.priority] || b.detectedAt - a.detectedAt);
}

export const EMPTY_DERIVED: Derived = {
  now: 0,
  ready: false,
  shipments: [],
  shipmentsById: new Map(),
  hubs: [],
  hubsById: new Map(),
  riders: [],
  ridersById: new Map(),
  merchants: [],
  merchantsById: new Map(),
  exceptions: [],
  nodesById: new Map(),
  routesById: new Map(),
  vehiclesById: new Map(),
  customersById: new Map(),
  ordersById: new Map(),
  nodes: [],
  routes: [],
  vehicles: [],
  events: [],
  attempts: [],
  cities: [],
  divisions: [],
  districts: [],
  hubNodes: [],
  regions: null,
  regionOfNode: () => ({ district: null, division: null }),
};
