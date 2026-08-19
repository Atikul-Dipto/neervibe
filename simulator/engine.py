"""Real-time logistics simulation engine.

Every tick this engine:
  1. Advances each in-flight vehicle a step along its current edge.
  2. Publishes vehicle position updates to Redis (live:vehicles).
  3. Advances packages through the state machine based on where their
     carrying vehicle is.
  4. Writes an immutable PackageEvent for every status change.
  5. Publishes package updates to Redis (live:packages).
  6. Randomly perturbs edge congestion/risk within realistic bounds.

Run standalone:
    python -m simulator.engine
"""
import asyncio
import json
import logging
import random
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine as db_engine
from app.core.redis import get_redis
from app.models.edge import LogisticsEdge
from app.models.enums import EventType, PackageStatus, VehicleStatus
from app.models.event import PackageEvent
from app.models.node import LogisticsNode
from app.models.package import Package
from app.models.vehicle import Vehicle
from app.state_machine.package_state_machine import is_valid_transition, next_possible_statuses
from simulator import redis_channels

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("simulator")


@dataclass
class VehicleRuntime:
    vehicle_id: uuid.UUID
    current_edge: LogisticsEdge | None = None
    progress: float = 0.0  # 0.0 (source) .. 1.0 (destination)
    package_ids: list[uuid.UUID] = field(default_factory=list)


def interpolate(lat1: float, lon1: float, lat2: float, lon2: float, t: float) -> tuple[float, float]:
    return lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t


class SimulationEngine:
    def __init__(self) -> None:
        self.redis = get_redis()
        self.nodes: dict[uuid.UUID, LogisticsNode] = {}
        self.edges: list[LogisticsEdge] = []
        self.edges_by_source: dict[uuid.UUID, list[LogisticsEdge]] = {}
        self.vehicle_runtime: dict[uuid.UUID, VehicleRuntime] = {}
        self.tick_count = 0

    async def load_network(self, session: AsyncSession) -> None:
        nodes = (await session.execute(select(LogisticsNode))).scalars().all()
        edges = (await session.execute(select(LogisticsEdge))).scalars().all()
        self.nodes = {n.id: n for n in nodes}
        self.edges = list(edges)
        self.edges_by_source = {}
        for edge in self.edges:
            self.edges_by_source.setdefault(edge.source_node_id, []).append(edge)
        logger.info("Loaded network: %d nodes, %d edges", len(self.nodes), len(self.edges))

    async def ensure_vehicles(self, session: AsyncSession) -> None:
        result = await session.execute(select(Vehicle))
        vehicles = list(result.scalars().all())
        hub_nodes = [n for n in self.nodes.values() if n.node_type in ("HUB", "DISTRIBUTION_CENTER", "REGIONAL_HUB")]

        needed = settings.simulation_vehicle_count - len(vehicles)
        for i in range(max(0, needed)):
            start = random.choice(hub_nodes)
            v = Vehicle(
                registration_number=f"VH-{uuid.uuid4().hex[:8].upper()}",
                vehicle_type=random.choice(["MOTORCYCLE", "VAN", "MINI_TRUCK", "TRUCK"]),
                capacity=random.uniform(20, 2000),
                current_latitude=start.latitude,
                current_longitude=start.longitude,
                current_node_id=start.id,
                status=VehicleStatus.IDLE,
            )
            session.add(v)
            vehicles.append(v)
        if needed > 0:
            await session.flush()

        for v in vehicles:
            if v.id not in self.vehicle_runtime:
                self.vehicle_runtime[v.id] = VehicleRuntime(vehicle_id=v.id)

        return vehicles

    def pick_next_edge(self, node_id: uuid.UUID) -> LogisticsEdge | None:
        candidates = self.edges_by_source.get(node_id, [])
        return random.choice(candidates) if candidates else None

    async def move_vehicles(self, session: AsyncSession, vehicles: list[Vehicle]) -> None:
        for vehicle in vehicles:
            runtime = self.vehicle_runtime[vehicle.id]

            if runtime.current_edge is None:
                edge = self.pick_next_edge(vehicle.current_node_id)
                if edge is None:
                    continue
                runtime.current_edge = edge
                runtime.progress = 0.0
                vehicle.status = VehicleStatus.EN_ROUTE

            edge = runtime.current_edge
            travel_ticks = max(1, round(edge.current_travel_time * 60 / settings.simulation_tick_seconds))
            runtime.progress += 1.0 / travel_ticks

            source = self.nodes[edge.source_node_id]
            dest = self.nodes[edge.destination_node_id]

            if runtime.progress >= 1.0:
                vehicle.current_latitude = dest.latitude
                vehicle.current_longitude = dest.longitude
                vehicle.current_node_id = dest.id
                vehicle.speed = 0.0
                vehicle.status = VehicleStatus.UNLOADING
                await self.advance_packages_at_node(session, vehicle, dest)
                runtime.current_edge = None
                runtime.progress = 0.0
            else:
                lat, lon = interpolate(source.latitude, source.longitude, dest.latitude, dest.longitude, runtime.progress)
                vehicle.current_latitude = lat
                vehicle.current_longitude = lon
                base_speed = {"HIGHWAY": 70, "ARTERIAL": 45, "URBAN": 25, "RURAL": 35, "FERRY": 20}.get(
                    edge.road_type, 40
                )
                vehicle.speed = base_speed * (1 - edge.congestion_level * 0.6)
                dlat, dlon = dest.latitude - source.latitude, dest.longitude - source.longitude
                import math
                vehicle.heading = (math.degrees(math.atan2(dlon, dlat)) + 360) % 360

            await self.publish_vehicle(vehicle)

    async def advance_packages_at_node(self, session: AsyncSession, vehicle: Vehicle, node: LogisticsNode) -> None:
        result = await session.execute(
            select(Package).where(Package.assigned_vehicle_id == vehicle.id)
        )
        for package in result.scalars().all():
            possible = next_possible_statuses(package.current_status)
            if not possible:
                continue
            forward = [s for s in possible if s not in (PackageStatus.CANCELLED, PackageStatus.LOST, PackageStatus.DAMAGED)]
            if not forward:
                continue
            new_status = forward[0]
            await self.transition_package(session, package, new_status, node)

    async def transition_package(
        self, session: AsyncSession, package: Package, new_status: PackageStatus, node: LogisticsNode | None
    ) -> None:
        if not is_valid_transition(package.current_status, new_status):
            return
        previous = package.current_status
        package.current_status = new_status
        if node is not None:
            package.current_node_id = node.id
        if new_status == PackageStatus.DELIVERED:
            package.actual_delivery_at = datetime.now(timezone.utc)

        now = datetime.now(timezone.utc)
        event = PackageEvent(
            package_id=package.id,
            event_type=EventType.PACKAGE_STATUS_CHANGED,
            node_id=node.id if node else None,
            latitude=node.latitude if node else None,
            longitude=node.longitude if node else None,
            timestamp=now,
            previous_status=previous.value if hasattr(previous, "value") else previous,
            new_status=new_status.value,
            event_metadata={},
            created_at=now,
        )
        session.add(event)
        await self.publish_package(package, previous)

    async def publish_vehicle(self, vehicle: Vehicle) -> None:
        payload = {
            "vehicle_id": str(vehicle.id),
            "registration_number": vehicle.registration_number,
            "latitude": vehicle.current_latitude,
            "longitude": vehicle.current_longitude,
            "speed": round(vehicle.speed, 1),
            "heading": round(vehicle.heading, 1),
            "status": vehicle.status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.redis.publish(redis_channels.VEHICLES, json.dumps(payload))

    async def publish_package(self, package: Package, previous_status) -> None:
        payload = {
            "package_id": str(package.id),
            "tracking_number": package.tracking_number,
            "previous_status": previous_status.value if hasattr(previous_status, "value") else previous_status,
            "new_status": package.current_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.redis.publish(redis_channels.PACKAGES, json.dumps(payload))

    async def perturb_congestion(self, session: AsyncSession) -> None:
        sample = random.sample(self.edges, k=min(5, len(self.edges)))
        for edge in sample:
            delta = random.uniform(-0.05, 0.07)
            edge.congestion_level = min(1.0, max(0.0, edge.congestion_level + delta))
            edge.risk_score = min(1.0, max(0.0, edge.congestion_level * 0.6 + random.uniform(0, 0.1)))
            edge.current_travel_time = round(edge.estimated_travel_time * (1 + edge.congestion_level))
            payload = {
                "edge_id": str(edge.id),
                "congestion_level": round(edge.congestion_level, 2),
                "risk_score": round(edge.risk_score, 2),
                "current_travel_time": edge.current_travel_time,
            }
            await self.redis.publish(redis_channels.ROUTES, json.dumps(payload))

    async def assign_idle_vehicles_to_packages(self, session: AsyncSession, vehicles: list[Vehicle]) -> None:
        idle = [v for v in vehicles if v.status == VehicleStatus.IDLE or v.status == VehicleStatus.UNLOADING]
        if not idle:
            return
        result = await session.execute(
            select(Package).where(
                Package.assigned_vehicle_id.is_(None),
                Package.current_status.in_([
                    PackageStatus.PACKAGE_CREATED,
                    PackageStatus.ARRIVED_AT_HUB,
                    PackageStatus.ARRIVED_AT_DESTINATION_HUB,
                ]),
            ).limit(len(idle) * 2)
        )
        pending = list(result.scalars().all())
        random.shuffle(pending)

        for vehicle in idle:
            if not pending:
                break
            package = pending.pop()
            package.assigned_vehicle_id = vehicle.id
            vehicle.status = VehicleStatus.LOADING
            if package.current_status == PackageStatus.PACKAGE_CREATED:
                await self.transition_package(session, package, PackageStatus.PICKUP_ASSIGNED, None)

    async def tick(self) -> None:
        async with AsyncSessionLocal() as session:
            vehicles = await self.ensure_vehicles(session)
            await self.assign_idle_vehicles_to_packages(session, vehicles)
            await self.move_vehicles(session, vehicles)
            await self.perturb_congestion(session)
            await session.commit()
        self.tick_count += 1
        if self.tick_count % 10 == 0:
            logger.info("tick=%d vehicles=%d", self.tick_count, len(self.vehicle_runtime))

    async def run(self) -> None:
        async with AsyncSessionLocal() as session:
            await self.load_network(session)
        logger.info("Simulation engine started (tick=%.1fs)", settings.simulation_tick_seconds)
        while True:
            try:
                await self.tick()
            except Exception:
                logger.exception("Simulation tick failed")
            await asyncio.sleep(settings.simulation_tick_seconds)


async def main() -> None:
    engine_instance = SimulationEngine()
    try:
        await engine_instance.run()
    finally:
        await db_engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
