"""Business logic for rider registration and vehicle assignment."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RiderStatus
from app.models.vehicle import Rider
from app.schemas.rider import RiderCreate


async def create_rider(db: AsyncSession, data: RiderCreate) -> Rider:
    rider = Rider(
        name=data.name,
        phone=data.phone,
        status=RiderStatus.AVAILABLE,
        current_latitude=data.current_latitude,
        current_longitude=data.current_longitude,
        current_node_id=data.current_node_id,
    )
    db.add(rider)
    await db.commit()
    await db.refresh(rider)
    return rider


async def assign_vehicle(db: AsyncSession, rider: Rider, vehicle_id: uuid.UUID) -> Rider:
    rider.vehicle_id = vehicle_id
    await db.commit()
    await db.refresh(rider)
    return rider
