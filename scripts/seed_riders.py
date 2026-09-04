"""Seed the last-mile rider workforce and backfill delivery attempts.

The network seed creates facilities and vehicles but no riders, so the
Riders / Dispatch / Fleet modules had nothing to show. This script:

  1. Creates RIDERS_PER_CITY riders per city, based at that city's delivery
     hub (skipped if riders already exist, so it is safe to re-run).
  2. Assigns each vehicle a driver from the same city where possible.
  3. Backfills rider assignments plus DeliveryAttempt rows for packages
     that have already reached the doorstep (delivered / failed / returned),
     so rider performance has history from day one instead of starting at
     zero. Existing assignments and attempts are left untouched.

Run from backend/ so app.core.config resolves ../.env:
    cd backend && ../venv/Scripts/python.exe ../scripts/seed_riders.py
"""
import asyncio
import hashlib
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.models.delivery import DeliveryAttempt
from app.models.enums import DeliveryAttemptResult, NodeType, PackageStatus, RiderStatus
from app.models.node import LogisticsNode
from app.models.package import Package
from app.models.vehicle import Rider, Vehicle

RIDERS_PER_CITY = 4

RIDER_NAMES = [
    "Rafiqul Islam", "Shahadat Hossain", "Mahmudul Hasan", "Tanvir Ahmed", "Jahangir Alam",
    "Sabbir Rahman", "Nazmul Huda", "Arif Chowdhury", "Kamrul Hasan", "Mizanur Rahman",
    "Shakil Ahmed", "Rubel Mia", "Imran Khan", "Fahim Reza", "Rasel Sarkar",
    "Ashraful Alam", "Sohel Rana", "Monir Hossain", "Habibur Rahman", "Zahid Hasan",
    "Rakib Uddin", "Nasir Uddin", "Saiful Islam", "Al Amin", "Shariful Islam",
    "Abdul Kader", "Delwar Hossain", "Mehedi Hasan", "Tariqul Islam", "Ripon Das",
    "Sumon Barua", "Anwar Hossain", "Faruk Ahmed", "Selim Reza", "Masud Rana",
    "Rony Ahmed", "Liton Mia", "Jewel Rana", "Hasan Mahmud", "Biplob Roy",
]

FAILURE_REASONS = [
    (DeliveryAttemptResult.FAILED_NO_RECIPIENT, "Recipient unavailable at address"),
    (DeliveryAttemptResult.FAILED_ADDRESS_ISSUE, "Address could not be located"),
    (DeliveryAttemptResult.FAILED_REFUSED, "Recipient refused the parcel"),
]

DOORSTEP_STATUSES = [
    PackageStatus.DELIVERED,
    PackageStatus.DELIVERY_FAILED,
    PackageStatus.RESCHEDULED,
    PackageStatus.RETURN_REQUESTED,
    PackageStatus.RETURN_IN_TRANSIT,
    PackageStatus.RETURNED,
    PackageStatus.OUT_FOR_DELIVERY,
]


def stable_pick(key: str, modulo: int) -> int:
    """Deterministic pseudo-random index so re-runs make the same choices."""
    return int(hashlib.sha1(key.encode()).hexdigest(), 16) % modulo


async def seed(session: AsyncSession) -> None:
    nodes = {n.id: n for n in (await session.execute(select(LogisticsNode))).scalars().all()}
    cities = sorted({n.city for n in nodes.values()})
    vehicles = list((await session.execute(select(Vehicle))).scalars().all())
    riders = list((await session.execute(select(Rider))).scalars().all())

    if not riders:
        name_idx = 0
        for city in cities:
            base = next(
                (n for n in nodes.values() if n.city == city and n.node_type == NodeType.DELIVERY_HUB),
                next((n for n in nodes.values() if n.city == city and n.node_type == NodeType.HUB), None),
            )
            if base is None:
                continue
            for _ in range(RIDERS_PER_CITY):
                name = RIDER_NAMES[name_idx % len(RIDER_NAMES)]
                name_idx += 1
                rider = Rider(
                    name=name,
                    phone="+88017" + str(stable_pick(name + city, 10**8)).zfill(8),
                    status=RiderStatus.AVAILABLE,
                    current_latitude=base.latitude,
                    current_longitude=base.longitude,
                    current_node_id=base.id,
                )
                session.add(rider)
                riders.append(rider)
        await session.flush()
        print("created", len(riders), "riders across", len(cities), "cities")
    else:
        print(len(riders), "riders already exist; skipping creation")

    def rider_city(r: Rider) -> str:
        return nodes[r.current_node_id].city if r.current_node_id in nodes else ""

    riders_by_city: dict[str, list[Rider]] = {}
    for r in riders:
        riders_by_city.setdefault(rider_city(r), []).append(r)

    # Drivers: one rider per vehicle, same city where possible.
    assigned_vehicles = 0
    taken = {r.vehicle_id for r in riders if r.vehicle_id}
    for v in vehicles:
        if v.id in taken:
            continue
        city = nodes[v.current_node_id].city if v.current_node_id in nodes else ""
        pool = [r for r in riders_by_city.get(city, []) if r.vehicle_id is None] or [
            r for r in riders if r.vehicle_id is None
        ]
        if not pool:
            break
        pool[0].vehicle_id = v.id
        taken.add(v.id)
        assigned_vehicles += 1
    print("assigned drivers to", assigned_vehicles, "vehicles")

    # Backfill doorstep history.
    packages = list(
        (
            await session.execute(
                select(Package).where(Package.current_status.in_([s.value for s in DOORSTEP_STATUSES]))
            )
        )
        .scalars()
        .all()
    )
    already_attempted = set((await session.execute(select(DeliveryAttempt.package_id).distinct())).scalars().all())

    assigned = attempts = 0
    for p in packages:
        dest = nodes.get(p.destination_node_id)
        pool = riders_by_city.get(dest.city if dest else "", []) or riders
        if not pool:
            break
        if p.assigned_rider_id is None:
            rider = pool[stable_pick(str(p.id), len(pool))]
            p.assigned_rider_id = rider.id
            assigned += 1
            if p.current_status == PackageStatus.OUT_FOR_DELIVERY:
                rider.status = RiderStatus.ON_DELIVERY
        if p.id in already_attempted or p.current_status == PackageStatus.OUT_FOR_DELIVERY:
            continue
        when = p.actual_delivery_at or p.updated_at
        if p.current_status == PackageStatus.DELIVERED:
            # Most parcels land first time; some needed a second visit.
            attempt_number = 1
            if stable_pick(str(p.id) + "retry", 100) < 15:
                reason, note = FAILURE_REASONS[stable_pick(str(p.id) + "why", len(FAILURE_REASONS))]
                session.add(
                    DeliveryAttempt(
                        package_id=p.id, rider_id=p.assigned_rider_id, attempt_number=1,
                        result=reason, notes=note, attempted_at=when - timedelta(hours=20),
                    )
                )
                attempts += 1
                attempt_number = 2
            session.add(
                DeliveryAttempt(
                    package_id=p.id, rider_id=p.assigned_rider_id, attempt_number=attempt_number,
                    result=DeliveryAttemptResult.SUCCESS, notes="Delivered to recipient", attempted_at=when,
                )
            )
            attempts += 1
        else:
            reason, note = FAILURE_REASONS[stable_pick(str(p.id) + "why", len(FAILURE_REASONS))]
            session.add(
                DeliveryAttempt(
                    package_id=p.id, rider_id=p.assigned_rider_id, attempt_number=1,
                    result=reason, notes=note, attempted_at=when,
                )
            )
            attempts += 1
    print("backfilled", assigned, "rider assignments and", attempts, "delivery attempts over", len(packages), "doorstep packages")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await seed(session)
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
