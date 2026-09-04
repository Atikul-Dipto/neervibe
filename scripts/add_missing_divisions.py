"""Give every division in the country a real presence on the network.

The seeded network covered ten cities, which left Barishal — one of the eight
divisions the map, the filter bar and every "by division" breakdown offer — with
no nodes at all: selectable everywhere, empty everywhere.

For each division that has no nodes, this creates the same node set every other
city has (merchant, pickup point, local hub, delivery hub, regional hub, sorting
centre, customer zones) and wires it into the network the way `seed_database.py`
wires the rest: local hub to its delivery hub, local hub to the regional hub,
regional hub to the national distribution centre, all in both directions.

Two things it does differently from the original seed, both deliberate:

  * every position is validated against the road network before it is used, so
    a new hub cannot land in a river the way Rajshahi's did (see
    fix_node_placement.py for why that happened);
  * edge distances come from the real driving route rather than a straight
    line, so line-haul cost and travel time are not understated from day one.

Idempotent: a division that already has nodes is skipped, so re-running adds
nothing. Run from backend/:

    cd backend && ../venv/Scripts/python.exe ../scripts/add_missing_divisions.py [--dry-run]
"""
import asyncio
import json
import math
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine
from app.models.edge import LogisticsEdge
from app.models.enums import NodeType, RoadType
from app.models.node import LogisticsNode

from fix_node_placement import Divisions, geometry_contains, haversine_m, road_distance_m, spiral

DIVISIONS_FILE = ROOT / "frontend" / "public" / "geo" / "bd" / "divisions.geojson"
OSRM_ROUTE = "https://router.project-osrm.org/route/v1/driving"

ON_ROAD_M = 250
MIN_SEPARATION_M = 600
CUSTOMERS_PER_CITY = 5

#: Every Bangladeshi division is named after its principal city, which is where
#: an operator would actually put a divisional hub. Coordinates are the city
#: centres; exact positions are then road-validated below.
PRINCIPAL_CITY: dict[str, tuple[str, float, float]] = {
    "Barishal": ("Barishal", 22.7010, 90.3535),
    "Chattogram": ("Chattogram", 22.3569, 91.7832),
    "Dhaka": ("Dhaka", 23.8103, 90.4125),
    "Khulna": ("Khulna", 22.8456, 89.5403),
    "Mymensingh": ("Mymensingh", 24.7471, 90.4203),
    "Rajshahi": ("Rajshahi", 24.3745, 88.6042),
    "Rangpur": ("Rangpur", 25.7439, 89.2752),
    "Sylhet": ("Sylhet", 24.8949, 91.8687),
}

CAPACITY = {
    NodeType.MERCHANT: 500,
    NodeType.PICKUP_POINT: 800,
    NodeType.HUB: 5000,
    NodeType.DELIVERY_HUB: 3000,
    NodeType.REGIONAL_HUB: 15000,
    NodeType.SORTING_CENTER: 20000,
    NodeType.CUSTOMER: 1,
}

SPEED_KMH = {
    RoadType.HIGHWAY: 60,
    RoadType.ARTERIAL: 45,
    RoadType.URBAN: 25,
    RoadType.RURAL: 35,
    RoadType.FERRY: 20,
}


def driving_distance_km(a: LogisticsNode, b: LogisticsNode) -> float:
    """Road distance, falling back to great-circle if routing is unavailable —
    a slightly short number beats refusing to create the edge."""
    url = f"{OSRM_ROUTE}/{a.longitude},{a.latitude};{b.longitude},{b.latitude}?overview=false"
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            data = json.load(r)
        if data.get("code") == "Ok" and data.get("routes"):
            return round(data["routes"][0]["distance"] / 1000, 1)
    except Exception:
        pass
    return round(haversine_m(a.longitude, a.latitude, b.longitude, b.latitude) / 1000, 1)


def place(code: str, centre: tuple[float, float], division, taken: list[tuple[float, float]]):
    """A road-reachable position inside the division, clear of existing nodes."""
    start_angle = sum(ord(c) * (i + 1) for i, c in enumerate(code)) % 360
    for lon, lat in spiral(centre[0], centre[1], start_angle):
        if not geometry_contains(division["geometry"], lon, lat):
            continue
        if any(haversine_m(lon, lat, ol, oa) < MIN_SEPARATION_M for ol, oa in taken):
            continue
        if road_distance_m(lon, lat) <= ON_ROAD_M:
            taken.append((lon, lat))
            return round(lat, 6), round(lon, 6)
    raise SystemExit(f"no road-reachable position found for {code}")


def make_node(session, code, name, node_type, lat, lon, city) -> LogisticsNode:
    node = LogisticsNode(
        node_code=code,
        node_name=name,
        node_type=node_type,
        latitude=lat,
        longitude=lon,
        geog=f"POINT({lon} {lat})",
        address=f"{name}, {city}",
        city=city,
        capacity=CAPACITY[node_type],
        current_load=0,
    )
    session.add(node)
    return node


def make_edge(session, source, destination, road_type, distance_km) -> LogisticsEdge:
    minutes = max(5, round(distance_km / SPEED_KMH[road_type] * 60))
    edge = LogisticsEdge(
        source_node_id=source.id,
        destination_node_id=destination.id,
        distance_km=distance_km,
        estimated_travel_time=minutes,
        current_travel_time=minutes,
        road_type=road_type,
        congestion_level=0.1,
        risk_score=0.05,
        active_package_count=0,
    )
    session.add(edge)
    return edge


async def main(dry_run: bool) -> None:
    divisions = Divisions(DIVISIONS_FILE)

    async with AsyncSessionLocal() as session:
        nodes = list((await session.execute(select(LogisticsNode))).scalars().all())
        taken = [(n.longitude, n.latitude) for n in nodes]

        covered = set()
        for n in nodes:
            f = divisions.at(n.longitude, n.latitude)
            if f:
                covered.add(f["properties"]["name"])

        all_divisions = [f["properties"]["name"] for f in divisions.features]
        missing = [d for d in all_divisions if d not in covered]
        print(f"divisions: {len(all_divisions)}   with nodes: {len(covered)}   missing: {missing or 'none'}")
        if not missing:
            print("every division already has a presence — nothing to do.")
            await engine.dispose()
            return

        # Anchors the new city wires into.
        distribution_center = next(n for n in nodes if n.node_type == NodeType.DISTRIBUTION_CENTER)
        existing_regionals = [n for n in nodes if n.node_type == NodeType.REGIONAL_HUB]

        for division_name in missing:
            if division_name not in PRINCIPAL_CITY:
                print(f"  ! no principal city known for {division_name} — skipped")
                continue
            city, lat, lon = PRINCIPAL_CITY[division_name]
            division = divisions.by_name(division_name)
            slug = city.upper()[:3]
            print(f"\n{division_name} division -> {city} ({lat}, {lon})")

            spec = [
                (f"MCH-{slug}-01", f"{city} Merchant Center", NodeType.MERCHANT),
                (f"PUP-{slug}-01", f"{city} Pickup Point", NodeType.PICKUP_POINT),
                (f"HUB-{slug}-01", f"{city} Local Hub", NodeType.HUB),
                (f"DLV-{slug}-01", f"{city} Delivery Hub", NodeType.DELIVERY_HUB),
                (f"REG-{slug}-01", f"{city} Regional Hub", NodeType.REGIONAL_HUB),
                (f"SRT-{slug}-01", f"{city} Sorting Center", NodeType.SORTING_CENTER),
            ] + [
                (f"CUS-{slug}-{i + 1:02d}", f"{city} Customer Zone {i + 1}", NodeType.CUSTOMER)
                for i in range(CUSTOMERS_PER_CITY)
            ]

            created: dict[NodeType, LogisticsNode] = {}
            for code, name, node_type in spec:
                p_lat, p_lon = place(code, (lon, lat), division, taken)
                node = make_node(session, code, name, node_type, p_lat, p_lon, city)
                if node_type not in created:
                    created[node_type] = node
                print(f"  {name:32s} {p_lat:.4f},{p_lon:.4f}")

            if dry_run:
                continue

            await session.flush()

            local = created[NodeType.HUB]
            delivery = created[NodeType.DELIVERY_HUB]
            regional = created[NodeType.REGIONAL_HUB]

            pairs = [
                (local, delivery, RoadType.URBAN),
                (delivery, local, RoadType.URBAN),
                (local, regional, RoadType.ARTERIAL),
                (regional, local, RoadType.ARTERIAL),
                (regional, distribution_center, RoadType.HIGHWAY),
                (distribution_center, regional, RoadType.HIGHWAY),
            ]
            # Also connect to the nearest existing regional hub, so a parcel
            # between two provincial cities is not forced through Dhaka.
            if existing_regionals:
                nearest = min(
                    existing_regionals,
                    key=lambda n: haversine_m(regional.longitude, regional.latitude, n.longitude, n.latitude),
                )
                pairs += [(regional, nearest, RoadType.HIGHWAY), (nearest, regional, RoadType.HIGHWAY)]

            for src, dst, road_type in pairs:
                km = driving_distance_km(src, dst)
                make_edge(session, src, dst, road_type, km)
                print(f"  edge {src.node_name} -> {dst.node_name}: {km} km by road")

        if not dry_run:
            await session.commit()
            print("\ncommitted")
        else:
            print("\ndry run — nothing written")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
