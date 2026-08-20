"""Pydantic schemas for riders."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import RiderStatus


class RiderCreate(BaseModel):
    name: str
    phone: str
    current_latitude: float | None = None
    current_longitude: float | None = None
    current_node_id: uuid.UUID | None = None


class RiderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str
    status: RiderStatus
    current_latitude: float | None
    current_longitude: float | None
    current_node_id: uuid.UUID | None
    vehicle_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class RiderAssignVehicle(BaseModel):
    vehicle_id: uuid.UUID
