"""Read endpoint for delivery attempts: the per-rider record of every
doorstep success or failure, which is what rider performance is built on."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.delivery import DeliveryAttempt
from app.schemas.delivery import DeliveryAttemptRead

router = APIRouter(prefix="/delivery-attempts", tags=["deliveries"])


@router.get("", response_model=list[DeliveryAttemptRead])
async def list_delivery_attempts(
    rider_id: uuid.UUID | None = Query(default=None),
    package_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[DeliveryAttempt]:
    stmt = select(DeliveryAttempt)
    if rider_id:
        stmt = stmt.where(DeliveryAttempt.rider_id == rider_id)
    if package_id:
        stmt = stmt.where(DeliveryAttempt.package_id == package_id)
    stmt = stmt.order_by(DeliveryAttempt.attempted_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())
