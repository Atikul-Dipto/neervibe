"""Pydantic schemas for logistics network nodes."""
import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict

from app.models.enums import NodeType, OperatingStatus


class NodeBase(BaseModel):
    node_code: str
    node_name: str
    node_type: NodeType
    latitude: float
    longitude: float
    address: str | None = None
    city: str
    capacity: int = 0
    opening_time: time | None = None
    closing_time: time | None = None


class NodeCreate(NodeBase):
    pass


class NodeRead(NodeBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    current_load: int
    operating_status: OperatingStatus
    created_at: datetime
    updated_at: datetime


class NodeUtilization(BaseModel):
    node_id: uuid.UUID
    node_code: str
    current_load: int
    capacity: int
    utilization_pct: float
    inbound_count: int
    outbound_count: int
    delayed_count: int
