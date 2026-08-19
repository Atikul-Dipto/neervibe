"""Logistics network edges — directed connections between two nodes."""
import uuid

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import RoadType, RouteStatus


class LogisticsEdge(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "logistics_edges"

    source_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("logistics_nodes.id"), nullable=False, index=True
    )
    destination_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("logistics_nodes.id"), nullable=False, index=True
    )

    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_travel_time: Mapped[int] = mapped_column(Integer, nullable=False)  # minutes
    current_travel_time: Mapped[int] = mapped_column(Integer, nullable=False)  # minutes

    road_type: Mapped[RoadType] = mapped_column(String(32), default=RoadType.ARTERIAL, nullable=False)
    congestion_level: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # 0.0-1.0
    route_status: Mapped[RouteStatus] = mapped_column(
        String(32), default=RouteStatus.ACTIVE, nullable=False
    )
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # 0.0-1.0
    active_package_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<LogisticsEdge {self.source_node_id} -> {self.destination_node_id}>"
