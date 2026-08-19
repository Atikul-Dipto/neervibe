"""Read endpoints for packages."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.package import Package
from app.schemas.package import PackageRead

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
