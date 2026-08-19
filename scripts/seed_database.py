"""Seed the database with a realistic Bangladesh logistics network:
merchants, pickup points, hubs, sorting centers, regional hubs, a
distribution center, delivery hubs and customers, plus the edges
connecting them into a hub-and-spoke graph.

Usage:
    python scripts/seed_database.py
"""
import asyncio
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.models.edge import LogisticsEdge
from app.models.enums import NodeType, RoadType
from app.models.node import LogisticsNode

# city -> (lat, lon, is_regional_hub)
CITIES: dict[str, tuple[float, float, bool]] = {
    "Dhaka": (23.8103, 90.4125, True),
    "Gazipur": (23.9999, 90.4203, False),
    "Narayanganj": (23.6238, 90.5000, False),
    "Chattogram": (22.3569, 91.7832, True),
    "Cumilla": (23.4607, 91.1809, False),
    "Sylhet": (24.8949, 91.8687, True),
    "Rajshahi": (24.3745, 88.6042, True),
    "Khulna": (22.8456, 89.5403, True),
    "Rangpur": (25.7439, 89.2752, True),
    "Mymensingh": (24.7471, 90.4203, True),
}

DISTRIBUTION_CENTER_CITY = "Dhaka"
CUSTOMERS_PER_CITY = 5


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def jitter(lat: float, lon: float, idx: int, scale: float = 0.03) -> tuple[float, float]:
    """Small deterministic offset so nodes in the same city aren't stacked."""
    angle = (idx * 47) % 360
    dlat = scale * math.cos(math.radians(angle))
    dlon = scale * math.sin(math.radians(angle))
    return lat + dlat, lon + dlon


def travel_time_minutes(distance_km: float, road_type: RoadType) -> int:
    avg_speed_kmh = {
        RoadType.HIGHWAY: 70,
        RoadType.ARTERIAL: 45,
        RoadType.URBAN: 25,
        RoadType.RURAL: 35,
        RoadType.FERRY: 20,
    }[road_type]
    return max(5, round(distance_km / avg_speed_kmh * 60))


async def make_node(
    session: AsyncSession,
    code: str,
    name: str,
    node_type: NodeType,
    lat: float,
    lon: float,
    city: str,
    capacity: int,
) -> LogisticsNode:
    node = LogisticsNode(
        node_code=code,
        node_name=name,
        node_type=node_type,
        latitude=lat,
        longitude=lon,
        geog=f"POINT({lon} {lat})",
        address=f"{name}, {city}",
        city=city,
        capacity=capacity,
        current_load=0,
    )
    session.add(node)
    return node


async def make_edge(
    session: AsyncSession,
    source: LogisticsNode,
    destination: LogisticsNode,
    road_type: RoadType = RoadType.ARTERIAL,
) -> LogisticsEdge:
    distance = round(haversine_km(source.latitude, source.longitude, destination.latitude, destination.longitude), 1)
    est_time = travel_time_minutes(distance, road_type)
    edge = LogisticsEdge(
        source_node_id=source.id,
        destination_node_id=destination.id,
        distance_km=distance,
        estimated_travel_time=est_time,
        current_travel_time=est_time,
        road_type=road_type,
        congestion_level=0.1,
        risk_score=0.05,
        active_package_count=0,
    )
    session.add(edge)
    return edge


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(LogisticsNode.id).limit(1))
        if existing.scalar_one_or_none() is not None:
            print("Database already seeded (logistics_nodes is non-empty). Skipping.")
            return

        regional_hubs: dict[str, LogisticsNode] = {}
        local_hubs: dict[str, LogisticsNode] = {}
        delivery_hubs: dict[str, LogisticsNode] = {}
        distribution_center: LogisticsNode | None = None

        # --- Per-city nodes ---
        for city, (lat, lon, is_regional) in CITIES.items():
            slug = city.upper()[:3]

            merch_lat, merch_lon = jitter(lat, lon, 1)
            merchant = await make_node(
                session, f"MCH-{slug}-01", f"{city} Merchant Center", NodeType.MERCHANT,
                merch_lat, merch_lon, city, capacity=500,
            )

            pp_lat, pp_lon = jitter(lat, lon, 2)
            pickup = await make_node(
                session, f"PUP-{slug}-01", f"{city} Pickup Point", NodeType.PICKUP_POINT,
                pp_lat, pp_lon, city, capacity=800,
            )

            hub_lat, hub_lon = jitter(lat, lon, 3)
            local_hub = await make_node(
                session, f"HUB-{slug}-01", f"{city} Local Hub", NodeType.HUB,
                hub_lat, hub_lon, city, capacity=5000,
            )
            local_hubs[city] = local_hub

            dh_lat, dh_lon = jitter(lat, lon, 4)
            delivery_hub = await make_node(
                session, f"DLV-{slug}-01", f"{city} Delivery Hub", NodeType.DELIVERY_HUB,
                dh_lat, dh_lon, city, capacity=3000,
            )
            delivery_hubs[city] = delivery_hub

            if is_regional:
                rh_lat, rh_lon = jitter(lat, lon, 5)
                regional_hub = await make_node(
                    session, f"REG-{slug}-01", f"{city} Regional Hub", NodeType.REGIONAL_HUB,
                    rh_lat, rh_lon, city, capacity=15000,
                )
                regional_hubs[city] = regional_hub

                sc_lat, sc_lon = jitter(lat, lon, 6)
                await make_node(
                    session, f"SRT-{slug}-01", f"{city} Sorting Center", NodeType.SORTING_CENTER,
                    sc_lat, sc_lon, city, capacity=20000,
                )

            if city == DISTRIBUTION_CENTER_CITY:
                dc_lat, dc_lon = jitter(lat, lon, 7)
                distribution_center = await make_node(
                    session, f"DC-{slug}-01", f"{city} National Distribution Center",
                    NodeType.DISTRIBUTION_CENTER, dc_lat, dc_lon, city, capacity=50000,
                )

            for i in range(CUSTOMERS_PER_CITY):
                c_lat, c_lon = jitter(lat, lon, 10 + i, scale=0.05)
                await make_node(
                    session, f"CUS-{slug}-{i+1:02d}", f"{city} Customer Zone {i+1}",
                    NodeType.CUSTOMER, c_lat, c_lon, city, capacity=1,
                )

        await session.flush()
        assert distribution_center is not None

        # --- Edges: merchant/pickup -> local hub (intra-city, urban roads) ---
        for city in CITIES:
            local_hub = local_hubs[city]
            # local hub <-> its city's delivery hub
            await make_edge(session, local_hub, delivery_hubs[city], RoadType.URBAN)
            await make_edge(session, delivery_hubs[city], local_hub, RoadType.URBAN)

        # --- Edges: local hub -> nearest regional hub (or itself if regional) ---
        nearest_regional_for = {
            "Dhaka": "Dhaka",
            "Gazipur": "Dhaka",
            "Narayanganj": "Dhaka",
            "Chattogram": "Chattogram",
            "Cumilla": "Chattogram",
            "Sylhet": "Sylhet",
            "Rajshahi": "Rajshahi",
            "Khulna": "Khulna",
            "Rangpur": "Rangpur",
            "Mymensingh": "Mymensingh",
        }
        for city, regional_city in nearest_regional_for.items():
            if city == regional_city:
                continue
            await make_edge(session, local_hubs[city], regional_hubs[regional_city], RoadType.ARTERIAL)
            await make_edge(session, regional_hubs[regional_city], local_hubs[city], RoadType.ARTERIAL)

        # --- Edges: every regional hub <-> national distribution center (Dhaka) ---
        for city, regional_hub in regional_hubs.items():
            if city == DISTRIBUTION_CENTER_CITY:
                continue
            await make_edge(session, regional_hub, distribution_center, RoadType.HIGHWAY)
            await make_edge(session, distribution_center, regional_hub, RoadType.HIGHWAY)

        # Dhaka's own local hub connects directly to the distribution center too
        await make_edge(session, local_hubs["Dhaka"], distribution_center, RoadType.URBAN)
        await make_edge(session, distribution_center, local_hubs["Dhaka"], RoadType.URBAN)

        await session.commit()

        node_count = await session.execute(select(LogisticsNode.id))
        edge_count = await session.execute(select(LogisticsEdge.id))
        print(f"Seeded {len(node_count.all())} nodes and {len(edge_count.all())} edges "
              f"across {len(CITIES)} cities.")


async def main() -> None:
    await seed()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
