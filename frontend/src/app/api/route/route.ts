import { NextResponse } from "next/server";

/**
 * Road geometry between two arbitrary points, for the one case the shipped
 * road file cannot cover: a vehicle that is off every road known for its leg,
 * so the map has to ask what road it is actually on.
 *
 * Everything else on the map draws from `public/geo/bd/roads.json`, which is
 * generated once by `scripts/prep-roads.mjs`. This endpoint exists so that
 * exception does not put a third-party host in the browser's request path:
 * it proxies server-side, so no API key or origin is exposed, and results are
 * memoised because the same detour is asked about on every animation tick.
 *
 * Routing is OSRM's public demo server over OpenStreetMap data. It is a shared
 * courtesy resource with no availability guarantee, hence the short timeout,
 * the cache, and a caller (`fetchLiveRoute`) that degrades to no line at all
 * rather than blocking.
 */

const OSRM = "https://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS = 6000;
const CACHE_MAX = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;

interface Entry {
  at: number;
  geometry: [number, number][] | null;
}

// Per-instance memo. Serverless instances come and go, which only costs a
// repeat lookup, so a plain Map is the right amount of machinery here.
const cache = new Map<string, Entry>();

/** "lon,lat" within Earth's bounds, rejecting anything else outright. */
function parsePoint(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length !== 2) return null;
  const lon = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return [Number(lon.toFixed(5)), Number(lat.toFixed(5))];
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = parsePoint(params.get("from"));
  const to = parsePoint(params.get("to"));
  if (!from || !to) {
    return NextResponse.json({ error: "from and to must be 'lon,lat' coordinate pairs" }, { status: 400 });
  }

  const key = `${from[0]},${from[1]}>${to[0]},${to[1]}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ geometry: hit.geometry, cached: true });
  }

  const url = `${OSRM}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
  let geometry: [number, number][] | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const data = (await res.json()) as {
        code?: string;
        routes?: { geometry?: { coordinates?: [number, number][] } }[];
      };
      const coords = data.code === "Ok" ? data.routes?.[0]?.geometry?.coordinates : undefined;
      if (coords && coords.length >= 2) {
        geometry = coords.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]);
      }
    }
  } catch {
    // Upstream unavailable or slow. Reported as "no route", not as an error:
    // the caller draws nothing rather than drawing a line through water.
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), geometry });

  return NextResponse.json(
    { geometry, attribution: "Routing © OSRM, roads © OpenStreetMap contributors (ODbL)" },
    { headers: { "cache-control": "public, max-age=1800" } },
  );
}
