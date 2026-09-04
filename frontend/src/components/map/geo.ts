import type { RegionLevel } from "@/config/country";
import type { LogisticsNode, LogisticsRoute } from "@/types/domain";

export type BBox = [number, number, number, number];

export interface RegionProps {
  id: string;
  name: string;
  level: RegionLevel;
  /** Parent division name — districts only. */
  division?: string;
  bbox: BBox;
}

export type RegionFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, RegionProps> & { id: string };

export interface LatLon {
  lat: number;
  lon: number;
}

// --- Point-in-polygon -------------------------------------------------------

function ringContains(ring: GeoJSON.Position[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(coords: GeoJSON.Position[][], lon: number, lat: number): boolean {
  if (!ringContains(coords[0], lon, lat)) return false;
  for (let i = 1; i < coords.length; i++) if (ringContains(coords[i], lon, lat)) return false;
  return true;
}

export function geometryContains(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon, lon: number, lat: number): boolean {
  if (geom.type === "Polygon") return polygonContains(geom.coordinates, lon, lat);
  return geom.coordinates.some((p) => polygonContains(p, lon, lat));
}

export function regionContains(region: RegionFeature, lon: number, lat: number): boolean {
  const [minX, minY, maxX, maxY] = region.properties.bbox;
  if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false;
  return geometryContains(region.geometry, lon, lat);
}

export function findRegionAt(regions: RegionFeature[], lon: number, lat: number): RegionFeature | null {
  for (const r of regions) if (regionContains(r, lon, lat)) return r;
  return null;
}

export function bboxOfPositions(positions: [number, number][]): BBox | null {
  if (positions.length === 0) return null;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const [x, y] of positions) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

// --- Distance / bearing -----------------------------------------------------

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Great-circle initial bearing from `a` to `b`, degrees clockwise from north. */
export function bearingBetween(a: LatLon, b: LatLon): number {
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The simulator's own (planar) heading formula — atan2(Δlon, Δlat). Kept
 * identical so a live heading can be matched back to the edge that produced it. */
export function planarBearing(from: LatLon, to: LatLon): number {
  return (toDeg(Math.atan2(to.lon - from.lon, to.lat - from.lat)) + 360) % 360;
}

// --- Next-stop inference ----------------------------------------------------

export interface VehicleLeg {
  source: LogisticsNode;
  dest: LogisticsNode;
  remainingKm: number;
  /** Minutes at the vehicle's current speed; null when it's stationary. */
  etaMinutes: number | null;
}

/**
 * The live feed doesn't say where a vehicle is going, but it does say which
 * node it last left (`current_node_id`) and its heading — and every vehicle
 * travels along a network edge. Among edges leaving that node, the one whose
 * bearing matches the heading is the leg in progress, and its far end is the
 * next stop. Returns null when the vehicle isn't moving or nothing matches.
 */
export function inferVehicleLeg(
  live: LatLon & { heading: number; speed: number; status: string },
  currentNodeId: string | null,
  routes: LogisticsRoute[],
  nodesById: Map<string, LogisticsNode>,
): VehicleLeg | null {
  if (live.status !== "EN_ROUTE" || !currentNodeId) return null;
  const source = nodesById.get(currentNodeId);
  if (!source) return null;

  let best: LogisticsNode | null = null;
  let bestDiff = 20; // degrees — anything looser is a different edge
  for (const r of routes) {
    if (r.source_node_id !== currentNodeId) continue;
    const dest = nodesById.get(r.destination_node_id);
    if (!dest) continue;
    const b = planarBearing(
      { lat: source.latitude, lon: source.longitude },
      { lat: dest.latitude, lon: dest.longitude },
    );
    const diff = Math.abs(((b - live.heading + 540) % 360) - 180);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = dest;
    }
  }
  if (!best) return null;

  const remainingKm = haversineKm(live, { lat: best.latitude, lon: best.longitude });
  return {
    source,
    dest: best,
    remainingKm,
    etaMinutes: live.speed > 1 ? (remainingKm / live.speed) * 60 : null,
  };
}
