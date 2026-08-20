"""Read and write endpoints for riders."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.vehicle import Rider
from app.schemas.rider import RiderAssignVehicle, RiderCreate, RiderRead
from app.services import rider_service

router = APIRouter(prefix="/riders", tags=["riders"])


@router.get("", response_model=list[RiderRead])
async def list_riders(
    rider_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Rider]:
    stmt = select(Rider)
    if rider_status:
        stmt = stmt.where(Rider.status == rider_status)
    stmt = stmt.order_by(Rider.updated_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{rider_id}", response_model=RiderRead)
async def get_rider(rider_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Rider:
    rider = await db.get(Rider, rider_id)
    if rider is None:
        raise HTTPException(status_code=404, detail="Rider not found")
    return rider


@router.post("", response_model=RiderRead, status_code=status.HTTP_201_CREATED)
async def create_rider(data: RiderCreate, db: AsyncSession = Depends(get_db)) -> Rider:
    return await rider_service.create_rider(db, data)


@router.patch("/{rider_id}/assign-vehicle", response_model=RiderRead)
async def assign_vehicle(
    rider_id: uuid.UUID, data: RiderAssignVehicle, db: AsyncSession = Depends(get_db)
) -> Rider:
    rider = await db.get(Rider, rider_id)
    if rider is None:
        raise HTTPException(status_code=404, detail="Rider not found")
    return await rider_service.assign_vehicle(db, rider, data.vehicle_id)
