"""Pydantic schemas for the immutable package event log."""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class PackageEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    package_id: uuid.UUID
    event_type: str
    node_id: uuid.UUID | None
    latitude: float | None
    longitude: float | None
    timestamp: datetime
    previous_status: str | None
    new_status: str | None
    rider_id: uuid.UUID | None
    vehicle_id: uuid.UUID | None
    event_metadata: dict[str, Any]
    created_at: datetime
