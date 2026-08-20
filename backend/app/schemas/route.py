"""Pydantic schemas for logistics network edges (routes between two nodes)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import RoadType, RouteStatus


class RouteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_node_id: uuid.UUID
    destination_node_id: uuid.UUID
    distance_km: float
    estimated_travel_time: int
    current_travel_time: int
    road_type: RoadType
    congestion_level: float
    route_status: RouteStatus
    risk_score: float
    active_package_count: int
    created_at: datetime
    updated_at: datetime


class RouteDetail(RouteRead):
    source_node_code: str
    source_node_name: str
    destination_node_code: str
    destination_node_name: str
