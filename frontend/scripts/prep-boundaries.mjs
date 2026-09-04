// Builds the administrative-boundary files under public/geo/<country>/ from
// geoBoundaries (https://www.geoboundaries.org) — the open, CC-licensed
// boundary set that covers every country, so onboarding a new operator's
// territory is a matter of pointing this at a different ISO3 code.
//
// Bangladesh (the shipped set):
//   ADM1 (divisions) — CC0, sourced from Wikimedia Commons
//   ADM2 (districts) — CC BY 3.0 IGO, Bangladesh Bureau of Statistics / OCHA
//
// Steps (run from frontend/):
//   1. Look up download URLs:
//        curl https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM1/
//        curl https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM2/
//      and fetch each `simplifiedGeometryGeoJSON` as adm1.geojson / adm2.geojson.
//   2. Thin them to web size while keeping shared borders intact:
//        npx mapshaper adm2.geojson -simplify 8%  keep-shapes -o precision=0.0001 adm2_simple.geojson
//        npx mapshaper adm1.geojson -simplify 60% keep-shapes -o precision=0.0001 adm1_simple.geojson
//   3. node scripts/prep-boundaries.mjs adm1_simple.geojson adm2_simple.geojson public/geo/bd
//
// Output features carry { id, name, level, division?, bbox } in `properties`,
// which is the contract src/config/country.ts and the map layers rely on.

import fs from "node:fs";
import path from "node:path";

const [adm1Path, adm2Path, outDir] = process.argv.slice(2);
if (!adm1Path || !adm2Path || !outDir) {
  console.error("usage: node scripts/prep-boundaries.mjs <adm1.geojson> <adm2.geojson> <out-dir>");
  process.exit(1);
}

// geoBoundaries still uses pre-2018 romanisations for several Bangladeshi
// places; the app's own city names use the current official spellings.
const RENAME = {
  Chittagong: "Chattogram", Rajshani: "Rajshahi", Barisal: "Barishal", Bogra: "Bogura",
  Brahamanbaria: "Brahmanbaria", Comilla: "Cumilla", Jessore: "Jashore", Jhalokati: "Jhalakathi",
  Maulvibazar: "Moulvibazar", Nawabganj: "Chapainawabganj", Netrakona: "Netrokona",
};
const norm = (n) => RENAME[n] ?? n;

function ringContains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygonContains(coords, pt) {
  if (!ringContains(coords[0], pt)) return false;
  for (let i = 1; i < coords.length; i++) if (ringContains(coords[i], pt)) return false;
  return true;
}
function geomContains(geom, pt) {
  if (geom.type === "Polygon") return polygonContains(geom.coordinates, pt);
  return geom.coordinates.some((p) => polygonContains(p, pt));
}
function vertices(geom) {
  const out = [];
  const walk = (c) => (typeof c[0] === "number" ? out.push(c) : c.forEach(walk));
  walk(geom.coordinates);
  return out;
}
function bbox(geom) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const [x, y] of vertices(geom)) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY].map((v) => +v.toFixed(4));
}

const adm1 = JSON.parse(fs.readFileSync(adm1Path, "utf8"));
const adm2 = JSON.parse(fs.readFileSync(adm2Path, "utf8"));

const divisions = adm1.features.map((f) => ({
  type: "Feature",
  id: f.properties.shapeID,
  geometry: f.geometry,
  properties: { id: f.properties.shapeID, name: norm(f.properties.shapeName), level: "division", bbox: bbox(f.geometry) },
}));

const districts = adm2.features.map((f) => {
  // Parent division = whichever contains the majority of this district's
  // vertices (robust to the two datasets' borders not lining up exactly).
  const votes = new Map();
  for (const v of vertices(f.geometry)) {
    for (const d of divisions) {
      if (geomContains(d.geometry, v)) votes.set(d.properties.name, (votes.get(d.properties.name) ?? 0) + 1);
    }
  }
  const parent = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    type: "Feature",
    id: f.properties.shapeID,
    geometry: f.geometry,
    properties: { id: f.properties.shapeID, name: norm(f.properties.shapeName), level: "district", division: parent, bbox: bbox(f.geometry) },
  };
});

fs.mkdirSync(outDir, { recursive: true });
const write = (name, features) =>
  fs.writeFileSync(path.join(outDir, name), JSON.stringify({ type: "FeatureCollection", features }));
write("divisions.geojson", divisions);
write("districts.geojson", districts);

console.log("divisions:", divisions.map((d) => d.properties.name).join(", "));
const byDiv = {};
for (const d of districts) (byDiv[d.properties.division] ??= []).push(d.properties.name);
for (const [k, v] of Object.entries(byDiv)) console.log(`${k} (${v.length}):`, v.join(", "));
