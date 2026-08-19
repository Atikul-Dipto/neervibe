"""Logistics network nodes (merchants, hubs, sorting centers, customers, ...)."""
from datetime import time

from geoalchemy2 import Geography
from sqlalchemy import Float, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import NodeType, OperatingStatus


class LogisticsNode(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "logistics_nodes"

    node_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    node_name: Mapped[str] = mapped_column(String(255), nullable=False)
    node_type: Mapped[NodeType] = mapped_column(String(32), nullable=False, index=True)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    geog: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)

    address: Mapped[str] = mapped_column(String(500), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    capacity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_load: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    operating_status: Mapped[OperatingStatus] = mapped_column(
        String(32), default=OperatingStatus.OPERATIONAL, nullable=False
    )

    opening_time: Mapped[time] = mapped_column(Time, nullable=True)
    closing_time: Mapped[time] = mapped_column(Time, nullable=True)

    def __repr__(self) -> str:
        return f"<LogisticsNode {self.node_code} ({self.node_type})>"
