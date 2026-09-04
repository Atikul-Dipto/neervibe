"""Put every network node somewhere a truck can actually reach.

`seed_database.py` placed nodes with `jitter()` — a blind ~3 km offset at an
angle derived from the node's index. Where a city sits on a riverbank that
walks straight into the water: Rajshahi is on the north bank of the Padma, so
its delivery hub landed 1.9 km from the nearest road, in the river, and three
of its customer zones with it. Chattogram lost nodes to the Karnaphuli the
same way.

This script tests each node objectively — OSRM's `nearest` service reports how
far a coordinate is from the road network — and relocates the ones that fail.
A replacement has to satisfy three things:

  1. within ON_ROAD_M of a road, so a vehicle can serve it;
  2. inside the same division polygon, so a node on the Padma's north bank is
     not "fixed" by moving it to a road on the Indian side;
  3. at least MIN_SEPARATION_M from every other node, so the map stays legible.

Candidates are tried on a deterministic spiral around the city centre, so
re-running produces the same layout rather than shuffling the network.

The result is written to the database *and* to `backend/app/data/node_placements.json`,
which `seed_database.py` reads so a fresh seed reproduces the corrected
positions instead of re-deriving the broken ones.

Run from backend/:
    cd backend && ../venv/Scripts/python.exe ../scripts/fix_node_placement.py [--dry-run]
"""
import asyncio
import json
import math
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.models.node import LogisticsNode

NEAREST = "https://router.project-osrm.org/nearest/v1/driving"
DIVISIONS = ROOT / "frontend" / "public" / "geo" / "bd" / "divisions.geojson"
PLACEMENTS = ROOT / "backend" / "app" / "data" / "node_placements.json"

#: A node further than this from a road cannot be served and must be moved.
ON_ROAD_M = 250
#: Two nodes closer than this are visually one dot on the map.
MIN_SEPARATION_M = 600
#: Rings of the search spiral, in degrees (~1.1 km per 0.01).
SPIRAL_RADII = [0.006, 0.012, 0.018, 0.025, 0.035, 0.045, 0.06]
SPIRAL_ANGLES = 12
PAUSE_S = 0.12


# --- geometry ---------------------------------------------------------------

def haversine_m(lon1, lat1, lon2, lat2):
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def ring_contains(ring, lon, lat):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polygon_contains(coords, lon, lat):
    if not ring_contains(coords[0], lon, lat):
        return False
    return not any(ring_contains(h, lon, lat) for h in coords[1:])


def geometry_contains(geom, lon, lat):
    if geom["type"] == "Polygon":
        return polygon_contains(geom["coordinates"], lon, lat)
    return any(polygon_contains(p, lon, lat) for p in geom["coordinates"])


class Divisions:
    def __init__(self, path: Path):
        data = json.loads(path.read_text(encoding="utf-8"))
        self.features = data["features"]

    def at(self, lon, lat):
        for f in self.features:
            b = f["properties"]["bbox"]
            if b[0] <= lon <= b[2] and b[1] <= lat <= b[3] and geometry_contains(f["geometry"], lon, lat):
                return f
        return None

    def by_name(self, name):
        for f in self.features:
            if f["properties"]["name"] == name:
                return f
        return None


# --- routing ----------------------------------------------------------------

_nearest_cache: dict[tuple[float, float], float] = {}


def road_distance_m(lon, lat):
    """Metres from this coordinate to the nearest drivable road."""
    key = (round(lon, 5), round(lat, 5))
    if key in _nearest_cache:
        return _nearest_cache[key]
    try:
        with urllib.request.urlopen(f"{NEAREST}/{lon},{lat}?number=1", timeout=25) as r:
            data = json.load(r)
        d = data["waypoints"][0]["distance"] if data.get("code") == "Ok" and data.get("waypoints") else math.inf
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError):
        d = math.inf
    _nearest_cache[key] = d
    time.sleep(PAUSE_S)
    return d


def spiral(lon, lat, start_angle):
    """Deterministic candidate positions, nearest ring first.

    `start_angle` is derived from the node's code so that two nodes searching
    the same city set off in different directions. Without it every relocated
    node walks the rings in the same order and they all pile into whichever
    corner happens to be reachable first.
    """
    yield lon, lat
    step = 360 / SPIRAL_ANGLES
    for radius in SPIRAL_RADII:
        for k in range(SPIRAL_ANGLES):
            angle = math.radians(start_angle + k * step)
            # Longitude degrees shrink with latitude, so the ring stays circular.
            yield lon + radius * math.sin(angle) / max(0.2, math.cos(math.radians(lat))), lat + radius * math.cos(angle)


def relocate(node, city_centre, division, taken):
    """First candidate that is on a road, in the division, and not on top of
    another node. Returns None when the search finds nothing."""
    start_angle = sum(ord(c) * (i + 1) for i, c in enumerate(node.node_code)) % 360
    for lon, lat in spiral(city_centre[0], city_centre[1], start_angle):
        if division is not None and not geometry_contains(division["geometry"], lon, lat):
            continue
        if any(haversine_m(lon, lat, ol, oa) < MIN_SEPARATION_M for ol, oa in taken):
            continue
        if road_distance_m(lon, lat) <= ON_ROAD_M:
            return lon, lat
    return None


async def main(dry_run: bool) -> None:
    divisions = Divisions(DIVISIONS)

    async with AsyncSessionLocal() as session:  # type: AsyncSession
        nodes = list((await session.execute(select(LogisticsNode))).scalars().all())
        print(f"{len(nodes)} nodes")

        # A city's centre is the median of the nodes already sitting on a road:
        # data-driven, so this works for a network this script has never seen.
        by_city: dict[str, list[LogisticsNode]] = {}
        for n in nodes:
            by_city.setdefault(n.city, []).append(n)

        offroad: list[tuple[LogisticsNode, float]] = []
        good: list[LogisticsNode] = []
        print("\nchecking every node against the road network…")
        for n in nodes:
            d = road_distance_m(n.longitude, n.latitude)
            (offroad.append((n, d)) if d > ON_ROAD_M else good.append(n))
        print(f"  on a road: {len(good)}   unreachable: {len(offroad)}")

        centres: dict[str, tuple[float, float]] = {}
        for city, group in by_city.items():
            ok = [n for n in group if n in good]
            pool = ok or group
            lons = sorted(n.longitude for n in pool)
            lats = sorted(n.latitude for n in pool)
            centres[city] = (lons[len(lons) // 2], lats[len(lats) // 2])

        taken = [(n.longitude, n.latitude) for n in good]
        moved = []
        for n, d in sorted(offroad, key=lambda x: -x[1]):
            division = divisions.at(n.longitude, n.latitude) or divisions.at(*centres[n.city])
            found = relocate(n, centres[n.city], division, taken)
            if found is None:
                print(f"  ! no reachable spot for {n.node_name} ({d:,.0f} m off-road) — left in place")
                continue
            lon, lat = found
            print(
                f"  {n.node_name:34s} {d:7,.0f} m off-road  "
                f"{n.latitude:.4f},{n.longitude:.4f} -> {lat:.4f},{lon:.4f}"
            )
            moved.append((n, lat, lon))
            taken.append((lon, lat))
            if not dry_run:
                n.latitude = round(lat, 6)
                n.longitude = round(lon, 6)

        if not dry_run:
            await session.commit()

        # The placement file is what makes a fresh seed reproduce this layout.
        placements = {
            n.node_code: {"lat": round(n.latitude, 6), "lon": round(n.longitude, 6), "city": n.city}
            for n in nodes
        }
        PLACEMENTS.parent.mkdir(parents=True, exist_ok=True)
        if not dry_run:
            PLACEMENTS.write_text(json.dumps(placements, indent=1, sort_keys=True), encoding="utf-8")
            print(f"\nwrote {PLACEMENTS.relative_to(ROOT)} ({len(placements)} nodes)")

        print(f"\n{'would move' if dry_run else 'moved'} {len(moved)} of {len(nodes)} nodes")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
