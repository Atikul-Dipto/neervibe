"""Pydantic schemas for packages."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import (
    DeliveryType,
    PackageStatus,
    PackageType,
    PaymentType,
    Priority,
)


class PackageBase(BaseModel):
    order_id: uuid.UUID
    customer_id: uuid.UUID
    merchant_id: uuid.UUID
    package_type: PackageType = PackageType.PARCEL
    package_weight: float
    package_volume: float | None = None
    declared_value: float | None = None
    payment_type: PaymentType = PaymentType.PREPAID
    delivery_type: DeliveryType = DeliveryType.STANDARD
    priority: Priority = Priority.NORMAL
    source_node_id: uuid.UUID
    destination_node_id: uuid.UUID


class PackageCreate(PackageBase):
    pass


class PackageStatusUpdate(BaseModel):
    new_status: PackageStatus
    node_id: uuid.UUID | None = None
    rider_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    metadata: dict | None = None


class PackageRead(PackageBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tracking_number: str
    current_status: PackageStatus
    current_node_id: uuid.UUID | None
    assigned_rider_id: uuid.UUID | None
    assigned_vehicle_id: uuid.UUID | None
    expected_delivery_at: datetime | None
    actual_delivery_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PackageTimelineStep(BaseModel):
    event_type: str
    node_id: uuid.UUID | None
    previous_status: str | None
    new_status: str | None
    latitude: float | None
    longitude: float | None
    timestamp: datetime


class PackageTracking(BaseModel):
    tracking_number: str
    current_status: PackageStatus
    source_node_id: uuid.UUID
    destination_node_id: uuid.UUID
    current_node_id: uuid.UUID | None
    expected_delivery_at: datetime | None
    timeline: list[PackageTimelineStep]
