"""Business logic for package creation and lifecycle transitions.

Kept out of the API layer per the project's architecture rules — endpoints
call into this module, they don't touch the state machine or write
PackageEvent rows themselves.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import LogEvent, get_logger
from app.models.enums import EventType, PackageStatus
from app.models.event import PackageEvent
from app.models.package import Package
from app.schemas.package import PackageCreate
from app.state_machine.package_state_machine import assert_valid_transition

logger = get_logger(__name__)


async def create_package(db: AsyncSession, data: PackageCreate) -> Package:
    package = Package(
        tracking_number=f"PKG-{uuid.uuid4().hex[:12].upper()}",
        order_id=data.order_id,
        customer_id=data.customer_id,
        merchant_id=data.merchant_id,
        package_type=data.package_type,
        package_weight=data.package_weight,
        package_volume=data.package_volume,
        declared_value=data.declared_value,
        payment_type=data.payment_type,
        delivery_type=data.delivery_type,
        priority=data.priority,
        current_status=PackageStatus.PACKAGE_CREATED,
        source_node_id=data.source_node_id,
        destination_node_id=data.destination_node_id,
    )
    db.add(package)
    await db.flush()

    now = datetime.now(timezone.utc)
    db.add(
        PackageEvent(
            package_id=package.id,
            event_type=EventType.PACKAGE_CREATED,
            node_id=data.source_node_id,
            timestamp=now,
            previous_status=None,
            new_status=PackageStatus.PACKAGE_CREATED.value,
            event_metadata={},
            created_at=now,
        )
    )
    await db.commit()
    await db.refresh(package)

    logger.info(LogEvent.PACKAGE_CREATED, package_id=str(package.id), tracking_number=package.tracking_number)
    return package


async def transition_status(
    db: AsyncSession,
    package: Package,
    new_status: PackageStatus,
    node_id: uuid.UUID | None = None,
    rider_id: uuid.UUID | None = None,
    vehicle_id: uuid.UUID | None = None,
    metadata: dict | None = None,
) -> Package:
    """Validate and apply a status transition, writing the matching
    immutable event. Raises InvalidTransitionError (via assert_valid_transition)
    if the move isn't legal from the package's current status.
    """
    current = PackageStatus(package.current_status)
    assert_valid_transition(current, new_status)

    previous = package.current_status
    package.current_status = new_status
    if node_id is not None:
        package.current_node_id = node_id
    if rider_id is not None:
        package.assigned_rider_id = rider_id
    if vehicle_id is not None:
        package.assigned_vehicle_id = vehicle_id

    now = datetime.now(timezone.utc)
    if new_status == PackageStatus.DELIVERED:
        package.actual_delivery_at = now

    db.add(
        PackageEvent(
            package_id=package.id,
            event_type=EventType.PACKAGE_STATUS_CHANGED,
            node_id=node_id,
            timestamp=now,
            previous_status=previous,
            new_status=new_status.value,
            rider_id=rider_id,
            vehicle_id=vehicle_id,
            event_metadata=metadata or {},
            created_at=now,
        )
    )
    await db.commit()
    await db.refresh(package)

    logger.info(
        LogEvent.PACKAGE_STATUS_CHANGED,
        package_id=str(package.id),
        previous_status=previous,
        new_status=new_status.value,
    )
    return package
