"""Delivery attempts and resolved package routes."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import DeliveryAttemptResult


class DeliveryAttempt(Base, UUIDPKMixin):
    __tablename__ = "delivery_attempts"

    package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packages.id"), nullable=False, index=True
    )
    rider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("riders.id"), nullable=True
    )
    attempt_number: Mapped[int] = mapped_column(nullable=False, default=1)
    result: Mapped[DeliveryAttemptResult] = mapped_column(String(32), nullable=False)
    notes: Mapped[str] = mapped_column(String(500), nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Route(Base, UUIDPKMixin, TimestampMixin):
    """A resolved, ordered path (sequence of node ids) assigned to a package's journey."""

    __tablename__ = "routes"

    package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packages.id"), nullable=False, index=True
    )
    node_sequence: Mapped[list[Any]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False)
    edge_sequence: Mapped[list[Any]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False)
    total_distance_km: Mapped[float] = mapped_column(nullable=True)
    estimated_total_time: Mapped[int] = mapped_column(nullable=True)  # minutes
    status: Mapped[str] = mapped_column(String(32), default="PLANNED", nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
