"use client";

import { useEffect, useState } from "react";
import { COUNTRY } from "@/config/country";
import { haversineKm, planarBearing, type LatLon } from "./geo";

/**
 * The road network the map draws along.
 *
 * Vehicles and corridors used to be straight lines between node coordinates,
 * which ran them through the Meghna, the Padma and the Bay of Bengal. The real
 * driving geometry for every connected pair of nodes is generated once by
 * `frontend/scripts/prep-roads.mjs` and shipped as a static file, so nothing
 * calls a routing service to draw a road that is already known.
 *
 * The one runtime lookup is deliberate: when a vehicle's position matches none
 * of the roads held for its leg, it is genuinely somewhere else, and
 * `fetchLiveRoute` asks for the road it is actually on.
 */

export interface RoadVariant {
  /** "primary" is the fastest road; anything else is a longer alternative. */
  name: string;
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
  /** Metres from the start of the road, one per geometry point. */
  cumulative: number[];
  lengthM: number;
}

interface RawVariant {
  name: string;
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
}

const round4 = (n: number) => Number(n.toFixed(4));

/** Coordinates, not node ids: a database reseed changes ids but not positions. */
export function edgeKey(from: LatLon, to: LatLon): string {
  return `${round4(from.lon)},${round4(from.lat)}>${round4(to.lon)},${round4(to.lat)}`;
}

function metresBetween(a: [number, number], b: [number, number]): number {
  return haversineKm({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }) * 1000;
}

function build(v: RawVariant): RoadVariant | null {
  if (!v.geometry || v.geometry.length < 2) return null;
  const cumulative = [0];
  for (let i = 1; i < v.geometry.length; i++) {
    cumulative.push(cumulative[i - 1] + metresBetween(v.geometry[i - 1], v.geometry[i]));
  }
  return { ...v, cumulative, lengthM: cumulative[cumulative.length - 1] };
}

export interface RoadMatch {
  variant: RoadVariant;
  /** Perpendicular distance from the reported position to that road. */
  offsetM: number;
  /** 0..1 along the road. */
  progress: number;
  /** The position snapped onto the road. */
  snapped: [number, number];
}

export class RoadNetwork {
  readonly generatedAt: string | null;
  private readonly edges: Map<string, RoadVariant[]>;

  constructor(edges: Map<string, RoadVariant[]>, generatedAt: string | null) {
    this.edges = edges;
    this.generatedAt = generatedAt;
  }

  get size(): number {
    return this.edges.size;
  }

  variants(from: LatLon, to: LatLon): RoadVariant[] {
    return this.edges.get(edgeKey(from, to)) ?? [];
  }

  /** The fastest road between two nodes, or null when none was generated. */
  primary(from: LatLon, to: LatLon): RoadVariant | null {
    return this.variants(from, to)[0] ?? null;
  }

  /**
   * The drawable line between two points: the road where there is one, and a
   * straight segment where there is not — an unroutable pair is rare but real
   * (a node placed off the road network), and drawing nothing would be worse
   * than drawing the direct line.
   */
  line(from: LatLon, to: LatLon): [number, number][] {
    const road = this.primary(from, to);
    if (road) return road.geometry;
    return [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ];
  }

  /** Stitch a sequence of stops into one continuous road path. */
  chain(stops: LatLon[]): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 1; i < stops.length; i++) {
      const seg = this.line(stops[i - 1], stops[i]);
      for (const p of seg) {
        const last = out[out.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
      }
    }
    return out;
  }
}

// --- Projection onto a road -------------------------------------------------

/** Closest point on segment a-to-b for p, plus how far along that segment. */
function projectOnSegment(p: [number, number], a: [number, number], b: [number, number]) {
  // Longitude degrees shrink with latitude; scaling makes the projection
  // metric-correct enough over a segment tens of metres long.
  const k = Math.cos((p[1] * Math.PI) / 180);
  const ax = a[0] * k,
    ay = a[1],
    bx = b[0] * k,
    by = b[1],
    px = p[0] * k,
    py = p[1];
  const dx = bx - ax,
    dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as [number, number] };
}

/** Where along `variant` the point sits, and how far off the road it is. */
export function projectOnRoad(variant: RoadVariant, lon: number, lat: number): RoadMatch {
  let best = { offsetM: Infinity, progress: 0, snapped: variant.geometry[0] };
  for (let i = 1; i < variant.geometry.length; i++) {
    const a = variant.geometry[i - 1];
    const b = variant.geometry[i];
    const { t, point } = projectOnSegment([lon, lat], a, b);
    const offsetM = metresBetween([lon, lat], point);
    if (offsetM < best.offsetM) {
      const along = variant.cumulative[i - 1] + (variant.cumulative[i] - variant.cumulative[i - 1]) * t;
      best = { offsetM, progress: variant.lengthM ? along / variant.lengthM : 0, snapped: point };
    }
  }
  return { variant, ...best };
}

/** The road, of those given, that the position best fits. */
export function matchRoad(variants: RoadVariant[], lon: number, lat: number): RoadMatch | null {
  let best: RoadMatch | null = null;
  for (const v of variants) {
    const m = projectOnRoad(v, lon, lat);
    if (!best || m.offsetM < best.offsetM) best = m;
  }
  return best;
}

/** Split a road at a progress fraction into what is behind and what is ahead. */
export function splitRoad(variant: RoadVariant, progress: number, at?: [number, number]) {
  const target = variant.lengthM * Math.min(1, Math.max(0, progress));
  const behind: [number, number][] = [];
  const ahead: [number, number][] = [];
  for (let i = 0; i < variant.geometry.length; i++) {
    (variant.cumulative[i] <= target ? behind : ahead).push(variant.geometry[i]);
  }
  const here = at ?? variant.geometry[variant.geometry.length - 1];
  behind.push(here);
  ahead.unshift(here);
  return { behind, ahead };
}

/** Remaining road distance in km from a progress fraction. */
export function remainingKm(variant: RoadVariant, progress: number): number {
  return (variant.lengthM * (1 - Math.min(1, Math.max(0, progress)))) / 1000;
}

/** Heading of the road at a progress fraction, in the simulator's convention. */
export function headingAt(variant: RoadVariant, progress: number): number {
  const target = variant.lengthM * Math.min(1, Math.max(0, progress));
  let i = 1;
  while (i < variant.cumulative.length - 1 && variant.cumulative[i] < target) i++;
  const [lon1, lat1] = variant.geometry[i - 1];
  const [lon2, lat2] = variant.geometry[i];
  return planarBearing({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 });
}

// --- Loading ----------------------------------------------------------------

const EMPTY = new RoadNetwork(new Map(), null);
let cached: RoadNetwork | null = null;
let inflight: Promise<RoadNetwork> | null = null;

export function loadRoads(): Promise<RoadNetwork> {
  if (cached) return Promise.resolve(cached);
  inflight ??= fetch(COUNTRY.roadsFile)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    })
    .then((raw: { generatedAt?: string; edges?: Record<string, { variants?: RawVariant[] }> }) => {
      const edges = new Map<string, RoadVariant[]>();
      for (const [key, entry] of Object.entries(raw.edges ?? {})) {
        const built = (entry.variants ?? []).map(build).filter((v): v is RoadVariant => v !== null);
        if (built.length) edges.set(key, built);
      }
      cached = new RoadNetwork(edges, raw.generatedAt ?? null);
      return cached;
    })
    .catch((err) => {
      // A missing geometry file degrades the map to straight lines rather than
      // breaking it, and says so once in the console.
      console.warn(`[roads] ${COUNTRY.roadsFile} unavailable (${err}); corridors fall back to direct lines.`);
      cached = EMPTY;
      return cached;
    });
  return inflight;
}

/** The road network, once loaded. Null until then. */
export function useRoads(): RoadNetwork | null {
  const [roads, setRoads] = useState<RoadNetwork | null>(cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    void loadRoads().then((r) => {
      if (live) setRoads(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return roads;
}

/**
 * How far a vehicle still has to drive, along the road it is on rather than
 * across country. Returns null when the corridor has no geometry, so callers
 * can fall back to their straight-line figure and say so.
 */
export function roadRemainingFrom(
  roads: RoadNetwork | null,
  source: LatLon,
  at: LatLon,
  destination: LatLon,
): { km: number; variant: RoadVariant } | null {
  if (!roads) return null;
  const match = matchRoad(roads.variants(source, destination), at.lon, at.lat);
  if (!match || match.offsetM > OFF_ROUTE_M) return null;
  return { km: remainingKm(match.variant, match.progress), variant: match.variant };
}

// --- Live re-routing --------------------------------------------------------

/** How far off every known road a vehicle must be before it counts as
 *  off-route. Generous enough to absorb geometry simplification (~45 m) and
 *  position noise. */
export const OFF_ROUTE_M = 750;

const liveRouteCache = new Map<string, [number, number][] | null>();

/**
 * The road actually connecting two points, asked for at request time. Used
 * only when a vehicle is off every road held for its leg — the answer is
 * cached, so a vehicle sitting off-route costs one lookup, not one per tick.
 */
export async function fetchLiveRoute(from: LatLon, to: LatLon): Promise<[number, number][] | null> {
  const key = edgeKey(from, to);
  const hit = liveRouteCache.get(key);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(`/api/route?from=${from.lon},${from.lat}&to=${to.lon},${to.lat}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { geometry?: [number, number][] };
    const geometry = data.geometry && data.geometry.length >= 2 ? data.geometry : null;
    liveRouteCache.set(key, geometry);
    return geometry;
  } catch {
    liveRouteCache.set(key, null);
    return null;
  }
}
