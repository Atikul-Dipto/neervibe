"""Pydantic schemas for merchants and customers (read-only for now)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MerchantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_name: str
    phone: str
    email: str | None
    address: str | None
    city: str | None
    pickup_node_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str
    email: str | None
    address: str | None
    city: str | None
    latitude: float | None
    longitude: float | None
    created_at: datetime
    updated_at: datetime
