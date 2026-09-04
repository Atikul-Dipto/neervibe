"""The actual road a vehicle drives, instead of a straight line between nodes.

Interpolating between two node coordinates put vehicles through the Meghna,
the Padma and the Bay of Bengal, and drew every corridor as a chord rather
than a road. `frontend/scripts/prep-roads.mjs` asks a routing engine for the
driving path between each pair of connected nodes once and commits the result
to `app/data/road_geometry.json`; this module reads that file and turns a
progress fraction along an edge into a real position and heading.

The same file is served to the browser, so the map and the simulator agree on
where a road goes without either of them calling a routing service at runtime.

Where a corridor genuinely has a second sensible road, the generator records
it as an extra variant. `choose_variant` sends a small, deterministic share of
trips down it — a real detour on a real road, which is what the map's
"took the long way" detection is detecting.
"""
from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

GEOMETRY_PATH = Path(__file__).resolve().parent.parent / "data" / "road_geometry.json"

# Share of trips routed down the longer road where one exists. Kept low: a
# detour should be the exception an operator notices, not the norm.
DETOUR_SHARE = 0.2


def edge_key(src_lon: float, src_lat: float, dst_lon: float, dst_lat: float) -> str:
    """Coordinates, not node ids: a reseed changes ids but not positions."""
    return f"{round(src_lon, 4)},{round(src_lat, 4)}>{round(dst_lon, 4)},{round(dst_lat, 4)}"


@dataclass(frozen=True)
class RoadVariant:
    name: str
    distance_km: float
    duration_min: float
    points: tuple[tuple[float, float], ...]  # (lon, lat)
    cumulative: tuple[float, ...]            # metres from the start, per point
    length_m: float

    @property
    def is_detour(self) -> bool:
        return self.name != "primary"


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = a
    lon2, lat2 = b
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _build(points: list[list[float]], name: str, distance_km: float, duration_min: float) -> RoadVariant | None:
    pts = tuple((float(p[0]), float(p[1])) for p in points)
    if len(pts) < 2:
        return None
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + _haversine_m(pts[i - 1], pts[i]))
    return RoadVariant(
        name=name,
        distance_km=distance_km,
        duration_min=duration_min,
        points=pts,
        cumulative=tuple(cum),
        length_m=cum[-1],
    )


class RoadGeometry:
    """Loaded once per process; the file is a build artefact, not live data."""

    def __init__(self, path: Path = GEOMETRY_PATH) -> None:
        self.by_edge: dict[str, list[RoadVariant]] = {}
        self.generated_at: str | None = None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            logger.warning(
                "No road geometry at %s — vehicles will fall back to straight lines. "
                "Run frontend/scripts/prep-roads.mjs to generate it.",
                path,
            )
            return
        except (OSError, ValueError) as exc:
            logger.warning("Road geometry at %s is unreadable (%s); falling back to straight lines.", path, exc)
            return

        self.generated_at = raw.get("generatedAt")
        for key, entry in (raw.get("edges") or {}).items():
            variants = []
            for v in entry.get("variants") or []:
                built = _build(v.get("geometry") or [], v.get("name", "primary"), v.get("distanceKm", 0.0), v.get("durationMin", 0.0))
                if built is not None:
                    variants.append(built)
            if variants:
                self.by_edge[key] = variants
        logger.info("Road geometry: %d edges, generated %s", len(self.by_edge), self.generated_at)

    def variants(self, src_lon: float, src_lat: float, dst_lon: float, dst_lat: float) -> list[RoadVariant]:
        return self.by_edge.get(edge_key(src_lon, src_lat, dst_lon, dst_lat), [])

    def choose_variant(self, src_lon: float, src_lat: float, dst_lon: float, dst_lat: float, rng) -> RoadVariant | None:
        """The road this trip takes. Mostly the fastest one; occasionally the
        longer alternative, when the corridor actually has one."""
        options = self.variants(src_lon, src_lat, dst_lon, dst_lat)
        if not options:
            return None
        if len(options) > 1 and rng.random() < DETOUR_SHARE:
            return rng.choice(options[1:])
        return options[0]

    @staticmethod
    def position_at(variant: RoadVariant, fraction: float) -> tuple[float, float, float]:
        """(lat, lon, heading) at `fraction` of the way along the road.

        Heading uses the same planar atan2(dlon, dlat) convention the rest of
        the system does, so a heading can still be matched back to a leg.
        """
        f = min(1.0, max(0.0, fraction))
        target = variant.length_m * f
        pts, cum = variant.points, variant.cumulative

        # Segment containing `target`. Linear scan is fine: a few hundred
        # points, called once per vehicle per tick.
        i = 1
        while i < len(cum) - 1 and cum[i] < target:
            i += 1
        seg_start, seg_end = cum[i - 1], cum[i]
        t = 0.0 if seg_end <= seg_start else (target - seg_start) / (seg_end - seg_start)

        (lon1, lat1), (lon2, lat2) = pts[i - 1], pts[i]
        lon = lon1 + (lon2 - lon1) * t
        lat = lat1 + (lat2 - lat1) * t
        heading = (math.degrees(math.atan2(lon2 - lon1, lat2 - lat1)) + 360) % 360
        return lat, lon, heading


@lru_cache(maxsize=1)
def get_road_geometry() -> RoadGeometry:
    return RoadGeometry()
