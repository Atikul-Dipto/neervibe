"""Business logic for vehicle registration and live location updates."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import LogEvent, get_logger
from app.models.enums import VehicleStatus
from app.models.vehicle import Vehicle, VehicleLocation
from app.schemas.vehicle import VehicleCreate, VehicleLocationUpdate

logger = get_logger(__name__)


async def create_vehicle(db: AsyncSession, data: VehicleCreate) -> Vehicle:
    vehicle = Vehicle(
        registration_number=data.registration_number,
        vehicle_type=data.vehicle_type,
        capacity=data.capacity,
        current_latitude=data.current_latitude,
        current_longitude=data.current_longitude,
        current_node_id=data.current_node_id,
        status=VehicleStatus.IDLE,
    )
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


async def update_location(db: AsyncSession, vehicle: Vehicle, data: VehicleLocationUpdate) -> Vehicle:
    """Applies a GPS update to the vehicle and appends it to the immutable
    vehicle_locations breadcrumb trail.
    """
    vehicle.current_latitude = data.latitude
    vehicle.current_longitude = data.longitude
    vehicle.speed = data.speed
    vehicle.heading = data.heading
    if data.status is not None:
        vehicle.status = data.status

    now = datetime.now(timezone.utc)
    db.add(
        VehicleLocation(
            vehicle_id=vehicle.id,
            latitude=data.latitude,
            longitude=data.longitude,
            speed=data.speed,
            heading=data.heading,
            recorded_at=now,
        )
    )
    await db.commit()
    await db.refresh(vehicle)

    logger.info(
        LogEvent.VEHICLE_LOCATION_UPDATED,
        vehicle_id=str(vehicle.id),
        latitude=data.latitude,
        longitude=data.longitude,
    )
    return vehicle
