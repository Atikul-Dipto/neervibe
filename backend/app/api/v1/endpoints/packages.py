"""Read and write endpoints for packages."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.package import Package
from app.schemas.package import PackageCreate, PackageRead, PackageStatusUpdate
from app.services import package_service
from app.state_machine.package_state_machine import InvalidTransitionError

router = APIRouter(prefix="/packages", tags=["packages"])


@router.get("", response_model=list[PackageRead])
async def list_packages(
    status: str | None = Query(default=None),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Package]:
    stmt = select(Package)
    if status:
        stmt = stmt.where(Package.current_status == status)
    stmt = stmt.order_by(Package.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{package_id}", response_model=PackageRead)
async def get_package(package_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Package:
    package = await db.get(Package, package_id)
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return package


@router.post("", response_model=PackageRead, status_code=status.HTTP_201_CREATED)
async def create_package(data: PackageCreate, db: AsyncSession = Depends(get_db)) -> Package:
    return await package_service.create_package(db, data)


@router.patch("/{package_id}/status", response_model=PackageRead)
async def update_package_status(
    package_id: uuid.UUID, data: PackageStatusUpdate, db: AsyncSession = Depends(get_db)
) -> Package:
    package = await db.get(Package, package_id)
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")
    try:
        return await package_service.transition_status(
            db,
            package,
            data.new_status,
            node_id=data.node_id,
            rider_id=data.rider_id,
            vehicle_id=data.vehicle_id,
            metadata=data.metadata,
        )
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
