"""Backfill an immutable package_events history for every existing package,
consistent with its current_status and the package state machine.

Usage:
    python scripts/generate_dummy_events.py
"""
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.models.enums import EventType, PackageStatus
from app.models.event import PackageEvent
from app.models.node import LogisticsNode
from app.models.package import Package

HAPPY_PATH: list[PackageStatus] = [
    PackageStatus.PACKAGE_CREATED,
    PackageStatus.PICKUP_ASSIGNED,
    PackageStatus.PICKED_UP,
    PackageStatus.ARRIVED_AT_HUB,
    PackageStatus.SORTING,
    PackageStatus.DISPATCHED,
    PackageStatus.IN_TRANSIT,
    PackageStatus.ARRIVED_AT_DESTINATION_HUB,
    PackageStatus.OUT_FOR_DELIVERY,
    PackageStatus.DELIVERED,
]

# For statuses off the happy path, the prefix of the happy path to walk
# through before branching to the final status.
BRANCH_PREFIX_LEN: dict[PackageStatus, int] = {
    PackageStatus.CANCELLED: 2,  # CREATED, PICKUP_ASSIGNED, then CANCELLED
    PackageStatus.LOST: 7,       # ... IN_TRANSIT, then LOST
    PackageStatus.DAMAGED: 7,    # ... IN_TRANSIT, then DAMAGED
    PackageStatus.DELIVERY_FAILED: 9,   # ... OUT_FOR_DELIVERY, then FAILED
    PackageStatus.RESCHEDULED: 9,
    PackageStatus.RETURN_REQUESTED: 9,
    PackageStatus.RETURN_IN_TRANSIT: 9,
    PackageStatus.RETURNED: 9,
}


def build_path(current_status: PackageStatus) -> list[PackageStatus]:
    # Package.current_status is stored as a plain VARCHAR column, so a value
    # freshly loaded from the DB (as opposed to one just constructed in this
    # process) comes back as a str, not a PackageStatus. Normalize once here
    # so every returned path element is guaranteed to be a real enum member.
    current_status = PackageStatus(current_status)

    if current_status in HAPPY_PATH:
        idx = HAPPY_PATH.index(current_status)
        return HAPPY_PATH[: idx + 1]

    prefix_len = BRANCH_PREFIX_LEN.get(current_status, 1)
    prefix = HAPPY_PATH[:prefix_len]

    if current_status == PackageStatus.CANCELLED:
        return [*prefix, PackageStatus.CANCELLED]
    if current_status in (PackageStatus.LOST, PackageStatus.DAMAGED):
        return [*prefix, current_status]
    if current_status == PackageStatus.DELIVERY_FAILED:
        return [*prefix, PackageStatus.DELIVERY_FAILED]
    if current_status == PackageStatus.RESCHEDULED:
        return [*prefix, PackageStatus.DELIVERY_FAILED, PackageStatus.RESCHEDULED]
    if current_status == PackageStatus.RETURN_REQUESTED:
        return [*prefix, PackageStatus.DELIVERY_FAILED, PackageStatus.RETURN_REQUESTED]
    if current_status == PackageStatus.RETURN_IN_TRANSIT:
        return [*prefix, PackageStatus.DELIVERY_FAILED, PackageStatus.RETURN_REQUESTED,
                PackageStatus.RETURN_IN_TRANSIT]
    if current_status == PackageStatus.RETURNED:
        return [*prefix, PackageStatus.DELIVERY_FAILED, PackageStatus.RETURN_REQUESTED,
                PackageStatus.RETURN_IN_TRANSIT, PackageStatus.RETURNED]
    return [PackageStatus.PACKAGE_CREATED, current_status]


def node_for_step(
    status: PackageStatus,
    source_node: LogisticsNode,
    dest_node: LogisticsNode,
    source_hub: LogisticsNode | None,
    dest_hub: LogisticsNode | None,
) -> LogisticsNode | None:
    early = {
        PackageStatus.PACKAGE_CREATED,
        PackageStatus.PICKUP_ASSIGNED,
        PackageStatus.PICKED_UP,
    }
    origin_hub_steps = {
        PackageStatus.ARRIVED_AT_HUB,
        PackageStatus.SORTING,
        PackageStatus.DISPATCHED,
    }
    dest_hub_steps = {
        PackageStatus.ARRIVED_AT_DESTINATION_HUB,
        PackageStatus.OUT_FOR_DELIVERY,
    }
    if status in early:
        return source_node
    if status in origin_hub_steps:
        return source_hub or source_node
    if status in dest_hub_steps:
        return dest_hub or dest_node
    if status == PackageStatus.DELIVERED:
        return dest_node
    if status == PackageStatus.IN_TRANSIT:
        return None
    return dest_hub or source_hub


async def backfill() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(PackageEvent.id).limit(1))
        if existing.scalar_one_or_none() is not None:
            print("package_events already populated. Skipping.")
            return

        packages = (await session.execute(select(Package))).scalars().all()
        if not packages:
            print("No packages found — run generate_dummy_packages.py first.")
            return

        hubs_by_city: dict[str, LogisticsNode] = {}
        for node in (
            await session.execute(select(LogisticsNode).where(LogisticsNode.node_type == "HUB"))
        ).scalars().all():
            hubs_by_city[node.city] = node

        nodes_by_id = {
            n.id: n
            for n in (await session.execute(select(LogisticsNode))).scalars().all()
        }

        total_events = 0
        batch_size = 2000

        for package in packages:
            source_node = nodes_by_id[package.source_node_id]
            dest_node = nodes_by_id[package.destination_node_id]
            source_hub = hubs_by_city.get(source_node.city)
            dest_hub = hubs_by_city.get(dest_node.city)

            path = build_path(package.current_status)
            window_end = package.actual_delivery_at or datetime.now(timezone.utc)
            window_start = package.created_at
            span_seconds = max((window_end - window_start).total_seconds(), 60)

            prev_status: PackageStatus | None = None
            for i, status in enumerate(path):
                fraction = i / max(len(path) - 1, 1)
                # jitter so timestamps aren't perfectly evenly spaced
                fraction = min(1.0, max(0.0, fraction + random.uniform(-0.03, 0.03)))
                ts = window_start + timedelta(seconds=span_seconds * fraction)
                node = node_for_step(status, source_node, dest_node, source_hub, dest_hub)

                event_type = (
                    EventType.PACKAGE_CREATED if i == 0 else EventType.PACKAGE_STATUS_CHANGED
                )

                session.add(
                    PackageEvent(
                        package_id=package.id,
                        event_type=event_type,
                        node_id=node.id if node else None,
                        latitude=node.latitude if node else None,
                        longitude=node.longitude if node else None,
                        timestamp=ts,
                        previous_status=prev_status.value if prev_status else None,
                        new_status=status.value,
                        rider_id=package.assigned_rider_id,
                        vehicle_id=package.assigned_vehicle_id,
                        event_metadata={},
                        created_at=ts,
                    )
                )
                total_events += 1
                prev_status = status

            if total_events % batch_size < len(path):
                await session.commit()
                print(f"  ... {total_events} events written")

        await session.commit()
        print(f"Backfilled {total_events} events across {len(packages)} packages.")


async def main() -> None:
    await backfill()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
