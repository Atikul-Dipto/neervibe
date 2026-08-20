"""Pydantic schemas for vehicles and their live location updates."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import VehicleStatus, VehicleType


class VehicleCreate(BaseModel):
    registration_number: str
    vehicle_type: VehicleType
    capacity: float = Field(gt=0)
    current_latitude: float | None = None
    current_longitude: float | None = None
    current_node_id: uuid.UUID | None = None


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    registration_number: str
    vehicle_type: VehicleType
    capacity: float
    current_latitude: float | None
    current_longitude: float | None
    current_node_id: uuid.UUID | None
    speed: float
    heading: float
    status: VehicleStatus
    created_at: datetime
    updated_at: datetime


class VehicleLocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed: float = Field(ge=0, default=0.0)
    heading: float = Field(ge=0, le=360, default=0.0)
    status: VehicleStatus | None = None
