"""The core logistics entity: a package moving through the network."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import (
    DeliveryType,
    PackageStatus,
    PackageType,
    PaymentType,
    Priority,
)


class Package(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "packages"

    tracking_number: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False, index=True
    )
    merchant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False, index=True
    )

    package_type: Mapped[PackageType] = mapped_column(
        String(32), default=PackageType.PARCEL, nullable=False
    )
    package_weight: Mapped[float] = mapped_column(Float, nullable=False)  # kg
    package_volume: Mapped[float] = mapped_column(Float, nullable=True)  # cubic cm
    declared_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=True)

    payment_type: Mapped[PaymentType] = mapped_column(
        String(16), default=PaymentType.PREPAID, nullable=False
    )
    delivery_type: Mapped[DeliveryType] = mapped_column(
        String(16), default=DeliveryType.STANDARD, nullable=False
    )
    priority: Mapped[Priority] = mapped_column(String(16), default=Priority.NORMAL, nullable=False)

    current_status: Mapped[PackageStatus] = mapped_column(
        String(32), default=PackageStatus.PACKAGE_CREATED, nullable=False, index=True
    )
    current_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("logistics_nodes.id"), nullable=True
    )
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("logistics_nodes.id"), nullable=False
    )
    destination_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("logistics_nodes.id"), nullable=False
    )

    assigned_rider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("riders.id"), nullable=True
    )
    assigned_vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=True
    )

    expected_delivery_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_delivery_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Package {self.tracking_number} [{self.current_status}]>"


class PackageItem(Base, UUIDPKMixin):
    """Line items contained within a single package."""

    __tablename__ = "package_items"

    package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packages.id"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=True)
