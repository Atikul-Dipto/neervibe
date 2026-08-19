"""Delivery vehicles and their live telemetry."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import VehicleStatus, VehicleType


class Vehicle(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "vehicles"

    registration_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    vehicle_type: Mapped[VehicleType] = mapped_column(String(32), nullable=False)
    capacity: Mapped[float] = mapped_column(Float, nullable=False)  # kg

    current_latitude: Mapped[float] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[float] = mapped_column(Float, nullable=True)
    current_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("logistics_nodes.id"), nullable=True
    )
    speed: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # km/h
    heading: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # degrees 0-360
    status: Mapped[VehicleStatus] = mapped_column(
        String(32), default=VehicleStatus.IDLE, nullable=False
    )


class VehicleLocation(Base, UUIDPKMixin):
    """Append-only GPS breadcrumb trail for vehicles (time-series)."""

    __tablename__ = "vehicle_locations"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    speed: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    heading: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class Rider(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "riders"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="AVAILABLE", nullable=False)

    current_latitude: Mapped[float] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[float] = mapped_column(Float, nullable=True)
    current_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("logistics_nodes.id"), nullable=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=True
    )
