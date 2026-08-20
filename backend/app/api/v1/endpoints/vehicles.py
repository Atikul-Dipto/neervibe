"""Read and write endpoints for vehicles."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleLocationUpdate, VehicleRead
from app.services import vehicle_service

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleRead])
async def list_vehicles(
    vehicle_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Vehicle]:
    stmt = select(Vehicle)
    if vehicle_status:
        stmt = stmt.where(Vehicle.status == vehicle_status)
    stmt = stmt.order_by(Vehicle.updated_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{vehicle_id}", response_model=VehicleRead)
async def get_vehicle(vehicle_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Vehicle:
    vehicle = await db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def create_vehicle(data: VehicleCreate, db: AsyncSession = Depends(get_db)) -> Vehicle:
    return await vehicle_service.create_vehicle(db, data)


@router.patch("/{vehicle_id}/location", response_model=VehicleRead)
async def update_vehicle_location(
    vehicle_id: uuid.UUID, data: VehicleLocationUpdate, db: AsyncSession = Depends(get_db)
) -> Vehicle:
    vehicle = await db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return await vehicle_service.update_location(db, vehicle, data)
