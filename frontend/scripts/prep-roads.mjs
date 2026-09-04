// Builds the road geometry every vehicle and corridor is drawn along.
//
// WHY THIS EXISTS
// Vehicles used to be interpolated on a straight line between two nodes, which
// put them through the Meghna, the Padma and the Bay of Bengal, and made every
// corridor on the map a chord rather than a road. This script asks a real
// routing engine for the driving path between each pair of connected nodes
// once, and both the simulator and the map then follow that path.
//
// Nothing queries a routing service at request time because of this file: it is
// generated, committed, and read from disk. Re-run it when the network's nodes
// or routes change.
//
//   node scripts/prep-roads.mjs [apiBase]
//
// Default apiBase is the live backend. Writes:
//   frontend/public/geo/bd/roads.json       (served to the browser)
//   backend/app/data/road_geometry.json     (read by the simulator)
//
// Two kinds of leg are generated:
//   * line-haul — every edge in the routes table, hub to hub;
//   * last mile — each city's delivery hub to its customer zones, and its local
//     hub to the merchant and pickup point. Riders work these, and they are not
//     in the routes table, so without them a rider would have no road to drive.
//
// Routing: OSRM's public demo server over OpenStreetMap data. `alternatives`
// gives the realistic second-best road, which is what a driver taking "the long
// way" actually does — the simulator sends a share of trips down it and the map
// matches the vehicle back to whichever one it is on.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "..");
const REPO = path.resolve(FRONTEND, "..");

const API = process.argv[2] ?? "https://neervibe-backend.onrender.com/api/v1";
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const SIMPLIFY_TOLERANCE = 0.0004; // ~45 m — below one map pixel at city zoom
const MAX_VARIANTS = 2;
const PAUSE_MS = 400; // the demo server is a shared courtesy resource

const round = (n, dp = 5) => Number(n.toFixed(dp));
/** Stable across reseeds: node UUIDs change, coordinates do not. */
export const edgeKey = (a, b) =>
  `${round(a.longitude, 4)},${round(a.latitude, 4)}>${round(b.longitude, 4)},${round(b.latitude, 4)}`;

// --- Douglas-Peucker --------------------------------------------------------
function perpDistance(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let maxDist = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function routeBetween(a, b) {
  const url =
    `${OSRM}/${a.longitude},${a.latitude};${b.longitude},${b.latitude}` +
    `?overview=full&geometries=geojson&alternatives=true`;
  const data = await getJson(url);
  if (data.code !== "Ok" || !data.routes?.length) return null;
  return data.routes.slice(0, MAX_VARIANTS).map((r, i) => ({
    name: i === 0 ? "primary" : `alt-${i}`,
    distanceKm: round(r.distance / 1000, 2),
    durationMin: round(r.duration / 60, 1),
    geometry: simplify(r.geometry.coordinates, SIMPLIFY_TOLERANCE).map(([lon, lat]) => [round(lon), round(lat)]),
  }));
}

async function main() {
  console.log(`network from ${API}`);
  const [nodes, routes] = await Promise.all([
    getJson(`${API}/nodes?limit=1000`),
    getJson(`${API}/routes?limit=1000`),
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  console.log(`${nodes.length} nodes, ${routes.length} routes`);

  // Last-mile pairs: what a rider drives, which the routes table does not model.
  const byCity = new Map();
  for (const n of nodes) {
    if (!byCity.has(n.city)) byCity.set(n.city, []);
    byCity.get(n.city).push(n);
  }
  // A rider can start a leg from either of a city's hubs — which one depends on
  // where the parcel was handed over, and a leg with no geometry falls back to
  // a straight line, so both origins are generated.
  const lastMile = [];
  for (const [, group] of byCity) {
    const origins = group.filter((n) => n.node_type === "DELIVERY_HUB" || n.node_type === "HUB");
    const doorsteps = group.filter((n) =>
      n.node_type === "CUSTOMER" || n.node_type === "MERCHANT" || n.node_type === "PICKUP_POINT",
    );
    for (const hub of origins) {
      for (const d of doorsteps) lastMile.push([hub, d], [d, hub]);
    }
  }

  const pairs = [
    ...routes.map((r) => [byId.get(r.source_node_id), byId.get(r.destination_node_id), "line-haul"]),
    ...lastMile.map(([a, b]) => [a, b, "last-mile"]),
  ].filter(([a, b]) => a && b);

  const edges = {};
  let ok = 0, straight = 0, detours = 0;

  for (const [i, [a, b, kind]] of pairs.entries()) {
    const key = edgeKey(a, b);
    if (edges[key]) continue;

    process.stdout.write(`  [${i + 1}/${pairs.length}] ${kind} ${a.city} -> ${b.city} … `);
    let variants = null;
    try {
      variants = await routeBetween(a, b);
    } catch (err) {
      console.log(`failed (${err.message})`);
    }
    if (!variants) {
      // Recorded explicitly so consumers can tell "no road found" from
      // "not generated yet" and fall back honestly.
      edges[key] = { variants: [], kind, note: "no driving route returned" };
      straight++;
      await sleep(PAUSE_MS);
      continue;
    }
    edges[key] = { variants, kind };
    ok++;
    if (variants.length > 1) detours++;
    console.log(`${variants.length} variant(s), ${variants[0].geometry.length} pts, ${variants[0].distanceKm} km`);
    await sleep(PAUSE_MS);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    profile: "driving",
    source: "OSRM demo server (router.project-osrm.org) over OpenStreetMap data",
    attribution: "Routing © OSRM, road data © OpenStreetMap contributors (ODbL)",
    simplifyToleranceDeg: SIMPLIFY_TOLERANCE,
    edgeKeyFormat: "lon,lat>lon,lat, each rounded to 4dp",
    kinds: "line-haul = a routes-table edge; last-mile = a rider leg between a hub and a doorstep",
    edges,
  };

  const targets = [
    path.join(FRONTEND, "public", "geo", "bd", "roads.json"),
    path.join(REPO, "backend", "app", "data", "road_geometry.json"),
  ];
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, JSON.stringify(payload));
    console.log(`wrote ${path.relative(REPO, t)} (${(fs.statSync(t).size / 1024).toFixed(0)} KB)`);
  }
  const counts = Object.values(edges).reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
  console.log(`edges routed: ${ok}, with an alternative: ${detours}, unroutable: ${straight}`);
  console.log(`by kind: ${JSON.stringify(counts)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
