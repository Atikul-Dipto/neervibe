"""Read-only access to the immutable package event log."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.event import PackageEvent
from app.schemas.event import PackageEventRead

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[PackageEventRead])
async def list_events(
    package_id: uuid.UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[PackageEvent]:
    stmt = select(PackageEvent)
    if package_id:
        stmt = stmt.where(PackageEvent.package_id == package_id)
    if event_type:
        stmt = stmt.where(PackageEvent.event_type == event_type)
    stmt = stmt.order_by(PackageEvent.timestamp.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())
