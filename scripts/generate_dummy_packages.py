"""Generate synthetic customers, merchants, orders and packages.

Usage:
    python scripts/generate_dummy_packages.py --count 1000
"""
import argparse
import asyncio
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from faker import Faker
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.services.placement import NodeGraph, locate_package
from app.models.enums import (
    DeliveryType,
    PackageStatus,
    PackageType,
    PaymentType,
    Priority,
)
from app.models.node import LogisticsNode
from app.models.order import Order
from app.models.package import Package
from app.models.party import Customer, Merchant

fake = Faker()

# Weighted so most packages are somewhere mid-journey or delivered, a
# realistic long tail of exceptions, rather than a uniform random status.
STATUS_WEIGHTS: list[tuple[PackageStatus, float]] = [
    (PackageStatus.PACKAGE_CREATED, 0.05),
    (PackageStatus.PICKUP_ASSIGNED, 0.04),
    (PackageStatus.PICKED_UP, 0.05),
    (PackageStatus.ARRIVED_AT_HUB, 0.06),
    (PackageStatus.SORTING, 0.04),
    (PackageStatus.DISPATCHED, 0.05),
    (PackageStatus.IN_TRANSIT, 0.12),
    (PackageStatus.ARRIVED_AT_DESTINATION_HUB, 0.05),
    (PackageStatus.OUT_FOR_DELIVERY, 0.07),
    (PackageStatus.DELIVERED, 0.35),
    (PackageStatus.DELIVERY_FAILED, 0.03),
    (PackageStatus.RESCHEDULED, 0.02),
    (PackageStatus.CANCELLED, 0.02),
    (PackageStatus.RETURN_REQUESTED, 0.01),
    (PackageStatus.RETURNED, 0.01),
    (PackageStatus.LOST, 0.005),
    (PackageStatus.DAMAGED, 0.005),
]


def weighted_status() -> PackageStatus:
    statuses, weights = zip(*STATUS_WEIGHTS)
    return random.choices(statuses, weights=weights, k=1)[0]


async def ensure_parties(session: AsyncSession, n_customers: int, n_merchants: int) -> None:
    existing = await session.execute(select(func.count()).select_from(Customer))
    if existing.scalar_one() >= n_customers:
        return

    for _ in range(n_customers):
        session.add(
            Customer(
                name=fake.name(),
                phone=fake.msisdn()[:15],
                email=fake.email(),
                address=fake.address(),
                city=random.choice(["Dhaka", "Chattogram", "Sylhet", "Rajshahi", "Khulna"]),
            )
        )
    for _ in range(n_merchants):
        session.add(
            Merchant(
                business_name=fake.company(),
                phone=fake.msisdn()[:15],
                email=fake.company_email(),
                address=fake.address(),
                city=random.choice(["Dhaka", "Chattogram", "Sylhet", "Rajshahi", "Khulna"]),
            )
        )
    await session.commit()


async def generate(count: int) -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(func.count()).select_from(Package))
        if existing.scalar_one() >= count:
            print(f"Database already has >= {count} packages. Skipping.")
            return

        await ensure_parties(session, n_customers=max(20, count // 10), n_merchants=max(10, count // 25))

        customers = (await session.execute(select(Customer))).scalars().all()
        merchants = (await session.execute(select(Merchant))).scalars().all()
        source_nodes = (
            (await session.execute(select(LogisticsNode).where(LogisticsNode.node_type == "MERCHANT")))
            .scalars()
            .all()
        )
        dest_nodes = (
            (await session.execute(select(LogisticsNode).where(LogisticsNode.node_type == "CUSTOMER")))
            .scalars()
            .all()
        )

        if not customers or not merchants or not source_nodes or not dest_nodes:
            print("Run scripts/seed_database.py first — logistics network is empty.")
            return

        # A parcel is always physically somewhere: without a current node,
        # hub load and sorting queues read zero for the whole network.
        graph = NodeGraph(list((await session.execute(select(LogisticsNode))).scalars().all()))

        now = datetime.now(timezone.utc)
        created = 0
        batch_size = 500

        for i in range(count):
            customer = random.choice(customers)
            merchant = random.choice(merchants)
            created_at = now - timedelta(days=random.uniform(0, 21), hours=random.uniform(0, 23))
            status = weighted_status()
            delivery_type = random.choices(
                [DeliveryType.STANDARD, DeliveryType.EXPRESS, DeliveryType.SAME_DAY, DeliveryType.SCHEDULED],
                weights=[0.6, 0.25, 0.1, 0.05],
                k=1,
            )[0]
            sla_hours = {"STANDARD": 72, "EXPRESS": 24, "SAME_DAY": 8, "SCHEDULED": 48}[delivery_type.value]
            expected_delivery_at = created_at + timedelta(hours=sla_hours)

            order = Order(
                order_number=f"ORD-{uuid.uuid4().hex[:10].upper()}",
                customer_id=customer.id,
                merchant_id=merchant.id,
                order_value=round(random.uniform(200, 15000), 2),
                status="PLACED",
                placed_at=created_at,
            )
            session.add(order)
            await session.flush()

            actual_delivery_at = None
            if status == PackageStatus.DELIVERED:
                actual_delivery_at = created_at + timedelta(hours=random.uniform(2, sla_hours * 1.3))

            source_node = random.choice(source_nodes)
            dest_node = random.choice(dest_nodes)
            current_node = locate_package(status, source_node, dest_node, graph)

            package = Package(
                tracking_number=f"PKG-{uuid.uuid4().hex[:12].upper()}",
                order_id=order.id,
                customer_id=customer.id,
                merchant_id=merchant.id,
                package_type=random.choice(list(PackageType)),
                package_weight=round(random.uniform(0.2, 25.0), 2),
                package_volume=round(random.uniform(500, 50000), 1),
                declared_value=round(random.uniform(200, 15000), 2),
                payment_type=random.choices(
                    [PaymentType.PREPAID, PaymentType.COD], weights=[0.4, 0.6], k=1
                )[0],
                delivery_type=delivery_type,
                priority=random.choices(
                    list(Priority), weights=[0.15, 0.55, 0.22, 0.08], k=1
                )[0],
                current_status=status,
                source_node_id=source_node.id,
                destination_node_id=dest_node.id,
                current_node_id=current_node.id if current_node else None,
                expected_delivery_at=expected_delivery_at,
                actual_delivery_at=actual_delivery_at,
                created_at=created_at,
            )
            session.add(package)
            created += 1

            if created % batch_size == 0:
                await session.commit()
                print(f"  ... {created}/{count} packages")

        await session.commit()
        print(f"Generated {created} packages (with orders, customers, merchants as needed).")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=100)
    args = parser.parse_args()
    await generate(args.count)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
