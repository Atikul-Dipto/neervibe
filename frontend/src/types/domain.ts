// Mirrors backend/app/schemas/*.py and backend/app/models/enums.py.
// Keep these in sync manually until an OpenAPI codegen step is added.

export type NodeType =
  | "MERCHANT"
  | "PICKUP_POINT"
  | "HUB"
  | "SORTING_CENTER"
  | "REGIONAL_HUB"
  | "DISTRIBUTION_CENTER"
  | "DELIVERY_HUB"
  | "CUSTOMER";

export type OperatingStatus = "OPERATIONAL" | "DEGRADED" | "CONGESTED" | "CLOSED" | "MAINTENANCE";

export type PackageStatus =
  | "PACKAGE_CREATED"
  | "PICKUP_ASSIGNED"
  | "PICKED_UP"
  | "ARRIVED_AT_HUB"
  | "SORTING"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "ARRIVED_AT_DESTINATION_HUB"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURN_IN_TRANSIT"
  | "RETURNED"
  | "DELIVERY_FAILED"
  | "RESCHEDULED"
  | "LOST"
  | "DAMAGED";

export type VehicleStatus = "IDLE" | "EN_ROUTE" | "LOADING" | "UNLOADING" | "MAINTENANCE" | "OFFLINE";
export type VehicleType = "BICYCLE" | "MOTORCYCLE" | "VAN" | "TRUCK" | "MINI_TRUCK";
export type RiderStatus = "AVAILABLE" | "ON_DELIVERY" | "ON_PICKUP" | "OFF_DUTY";
export type RouteStatus = "ACTIVE" | "CONGESTED" | "BLOCKED" | "SUSPENDED";
export type RoadType = "HIGHWAY" | "ARTERIAL" | "URBAN" | "RURAL" | "FERRY";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface LogisticsNode {
  id: string;
  node_code: string;
  node_name: string;
  node_type: NodeType;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string;
  capacity: number;
  current_load: number;
  operating_status: OperatingStatus;
  created_at: string;
  updated_at: string;
}

export interface LogisticsRoute {
  id: string;
  source_node_id: string;
  destination_node_id: string;
  distance_km: number;
  estimated_travel_time: number;
  current_travel_time: number;
  road_type: RoadType;
  congestion_level: number;
  route_status: RouteStatus;
  risk_score: number;
  active_package_count: number;
}

export interface Package {
  id: string;
  tracking_number: string;
  order_id: string;
  customer_id: string;
  merchant_id: string;
  package_weight: number;
  priority: Priority;
  current_status: PackageStatus;
  current_node_id: string | null;
  source_node_id: string;
  destination_node_id: string;
  assigned_rider_id: string | null;
  assigned_vehicle_id: string | null;
  expected_delivery_at: string | null;
  actual_delivery_at: string | null;
  created_at: string;
}

export interface PackageTimelineStep {
  event_type: string;
  node_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

export interface PackageTracking {
  tracking_number: string;
  current_status: PackageStatus;
  source_node_id: string;
  destination_node_id: string;
  current_node_id: string | null;
  expected_delivery_at: string | null;
  timeline: PackageTimelineStep[];
}

export interface VehicleLiveUpdate {
  vehicle_id: string;
  registration_number: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  status: VehicleStatus;
  timestamp: string;
}

export interface PackageLiveUpdate {
  package_id: string;
  tracking_number: string;
  previous_status: PackageStatus | null;
  new_status: PackageStatus;
  timestamp: string;
}

export interface RouteLiveUpdate {
  edge_id: string;
  congestion_level: number;
  risk_score: number;
  current_travel_time: number;
}

export interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_type: VehicleType;
  capacity: number;
  current_latitude: number | null;
  current_longitude: number | null;
  current_node_id: string | null;
  speed: number;
  heading: number;
  status: VehicleStatus;
  created_at: string;
  updated_at: string;
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  status: RiderStatus;
  current_latitude: number | null;
  current_longitude: number | null;
  current_node_id: string | null;
  vehicle_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkOverview {
  total_packages: number;
  in_transit: number;
  delivered: number;
  delayed: number;
  failed_deliveries: number;
  returns: number;
  active_vehicles: number;
  active_riders: number;
  active_routes: number;
  network_utilization_pct: number;
}

export interface OperationalMetrics {
  avg_delivery_time_minutes: number | null;
  avg_pickup_time_minutes: number | null;
  hub_processing_time_minutes: number | null;
  first_attempt_delivery_rate_pct: number | null;
  on_time_delivery_rate_pct: number | null;
  sla_breach_rate_pct: number | null;
  return_rate_pct: number;
  cancellation_rate_pct: number;
}

export interface HubVolume {
  node_id: string;
  node_code: string;
  node_name: string;
  current_load: number;
  capacity: number;
}

export interface NetworkMetrics {
  active_nodes: number;
  congested_routes: number;
  high_risk_routes: number;
  highest_volume_hubs: HubVolume[];
  network_throughput_24h: number;
}

export interface AnalyticsOverview {
  network: NetworkOverview;
  operations: OperationalMetrics;
  network_metrics: NetworkMetrics;
  generated_at: string;
}

export interface ETAPredictRequest {
  distance_km: number;
  congestion_level: number;
  package_weight: number;
  hour: number;
  priority: Priority;
  day_of_week: number;
  vehicle_type: string;
}

export interface ETAPredictResponse {
  predicted_eta_minutes: number;
  confidence: number;
}
