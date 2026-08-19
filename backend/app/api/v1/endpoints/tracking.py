"""Public package tracking lookup by tracking number."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.event import PackageEvent
from app.models.package import Package
from app.schemas.package import PackageTracking

router = APIRouter(prefix="/tracking", tags=["tracking"])


@router.get("/{tracking_number}", response_model=PackageTracking)
async def track_package(
    tracking_number: str, db: AsyncSession = Depends(get_db)
) -> PackageTracking:
    result = await db.execute(
        select(Package).where(Package.tracking_number == tracking_number)
    )
    package = result.scalar_one_or_none()
    if package is None:
        raise HTTPException(status_code=404, detail="Tracking number not found")

    events_result = await db.execute(
        select(PackageEvent)
        .where(PackageEvent.package_id == package.id)
        .order_by(PackageEvent.timestamp.asc())
    )
    events = list(events_result.scalars().all())

    return PackageTracking(
        tracking_number=package.tracking_number,
        current_status=package.current_status,
        source_node_id=package.source_node_id,
        destination_node_id=package.destination_node_id,
        current_node_id=package.current_node_id,
        expected_delivery_at=package.expected_delivery_at,
        timeline=[
            {
                "event_type": e.event_type,
                "node_id": e.node_id,
                "previous_status": e.previous_status,
                "new_status": e.new_status,
                "latitude": e.latitude,
                "longitude": e.longitude,
                "timestamp": e.timestamp,
            }
            for e in events
        ],
    )
