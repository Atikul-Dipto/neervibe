"""Pydantic schemas for the network/operations analytics endpoint."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class NetworkOverview(BaseModel):
    total_packages: int
    in_transit: int
    delivered: int
    delayed: int
    failed_deliveries: int
    returns: int
    active_vehicles: int
    active_riders: int
    active_routes: int
    network_utilization_pct: float


class OperationalMetrics(BaseModel):
    avg_delivery_time_minutes: float | None
    avg_pickup_time_minutes: float | None
    hub_processing_time_minutes: float | None
    first_attempt_delivery_rate_pct: float | None
    on_time_delivery_rate_pct: float | None
    sla_breach_rate_pct: float | None
    return_rate_pct: float
    cancellation_rate_pct: float


class HubVolume(BaseModel):
    node_id: uuid.UUID
    node_code: str
    node_name: str
    current_load: int
    capacity: int


class NetworkMetrics(BaseModel):
    active_nodes: int
    congested_routes: int
    high_risk_routes: int
    highest_volume_hubs: list[HubVolume]
    network_throughput_24h: int


class AnalyticsOverview(BaseModel):
    network: NetworkOverview
    operations: OperationalMetrics
    network_metrics: NetworkMetrics
    generated_at: datetime
