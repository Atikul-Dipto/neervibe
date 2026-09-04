// Deployment-level geography. NeerVibe is built to be dropped into any
// logistics operator's country: swap the boundary files under public/geo,
// the overview camera and the level labels, and every region feature on
// the map (hover, click-to-focus, area stats, region picker) follows.
//
// Boundary files are GeoJSON FeatureCollections whose features carry
// { id, name, level, division?, bbox } in `properties` — see
// scripts/prep-boundaries.mjs for how the Bangladesh set was produced.

export type RegionLevel = "division" | "district";

export const COUNTRY = {
  code: "BD",
  name: "Bangladesh",
  /** Overview camera — where the intro flight lands and "Home" returns to. */
  center: [90.35, 23.9] as [number, number],
  overviewZoom: 6.4,
  levels: {
    division: { label: "Division", file: "/geo/bd/divisions.geojson" },
    district: { label: "District", file: "/geo/bd/districts.geojson" },
  } satisfies Record<RegionLevel, { label: string; file: string }>,
  /** Zoom at which the finer level (districts) starts to appear. */
  districtRevealZoom: 7,
  /** Driving geometry for every connected pair of nodes, built by
   *  scripts/prep-roads.mjs. Vehicles and corridors are drawn along these
   *  rather than along straight lines between coordinates. */
  roadsFile: "/geo/bd/roads.json",
  // Kept short: it sits in the map's bottom-left corner alongside the
  // basemap's own credits, which already name OpenStreetMap.
  attribution:
    'Boundaries © <a href="https://www.geoboundaries.org" target="_blank" rel="noreferrer">geoBoundaries</a> · Roads © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>',
};
