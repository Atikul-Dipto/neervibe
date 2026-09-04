"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  AttributionControl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertTriangle, Loader2, MapPin, X } from "lucide-react";
import { api } from "@/services/api";
import { COUNTRY } from "@/config/country";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { NODE_TYPE_COLORS, NODE_TYPE_RADIUS, congestionColor } from "./nodeStyle";
import {
  bboxOfPositions,
  bearingBetween,
  findRegionAt,
  inferVehicleLeg,
  type BBox,
  type LatLon,
  type RegionFeature,
  type VehicleLeg,
} from "./geo";
import { MapControls } from "./MapControls";
import type { LogisticsNode, LogisticsRoute, Vehicle } from "@/types/domain";

// CARTO Positron — the light basemap that matches the cream/plum theme.
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const INTRO_START_ZOOM = 1.6;
const INTRO_DURATION_MS = 2600;
const FOCUS_ZOOM = 11;
const FOCUS_DURATION_MS = 1300;
const REGION_FIT_DURATION_MS = 1500;
const REGION_MAX_ZOOM = 10.5;
const HOME_DURATION_MS = 1600;
// Space kept clear around a framed region/path: the floating chip sits at
// the top, the controls bottom-right.
const FIT_PADDING = { top: 84, bottom: 56, left: 48, right: 64 };

// Matches SIMULATION_TICK_SECONDS in the backend .env — how long a vehicle's
// on-map glide from its previous tick to its latest one should take, so
// movement reads as continuous rather than teleporting between updates.
const VEHICLE_TICK_MS = 2900;
const TRAIL_LENGTH = 40;

const PLUM = "#450c3f";
const PLUM_SOFT = "#5a2953";
const LIME = "#b9d175";
const LIME_DEEP = "#7a9a2e";
const LIME_TEXT = "#5f7a1f";
const CREAM = "#f5fbda";

// Cycled by the render loop so dashed "remaining path" lines flow toward
// their destination — the standard MapLibre dash-animation technique.
const DASH_SEQUENCE: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

// Boundary layers toggled by the "Layers" control. The *selected* outline is
// deliberately excluded — an explicit selection should never vanish.
const BOUNDARY_LAYERS = [
  "division-fill", "district-fill", "division-dim", "district-dim",
  "district-line", "division-line", "region-focus-fill", "region-focus-line",
];

type PickKind = "vehicle" | "node" | "district" | "division";
const PICK_ORDER: [string, PickKind][] = [
  ["vehicles-symbol", "vehicle"],
  ["nodes-circle", "node"],
  ["district-fill", "district"],
  ["division-fill", "division"],
];

function nodesToGeoJSON(nodes: LogisticsNode[]): GeoJSON.FeatureCollection {
  return fc(
    nodes.map((n) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [n.longitude, n.latitude] },
      properties: {
        id: n.id,
        node_code: n.node_code,
        node_name: n.node_name,
        node_type: n.node_type,
        city: n.city,
        color: NODE_TYPE_COLORS[n.node_type],
        radius: NODE_TYPE_RADIUS[n.node_type],
      },
    })),
  );
}

function routesToGeoJSON(routes: LogisticsRoute[], nodesById: Map<string, LogisticsNode>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const r of routes) {
    const source = nodesById.get(r.source_node_id);
    const dest = nodesById.get(r.destination_node_id);
    if (!source || !dest) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [source.longitude, source.latitude],
          [dest.longitude, dest.latitude],
        ],
      },
      properties: {
        id: r.id,
        congestion_level: r.congestion_level,
        color: congestionColor(r.congestion_level),
        route_status: r.route_status,
      },
    });
  }
  return fc(features);
}

function pointFeature(lon: number, lat: number, properties: Record<string, unknown>): GeoJSON.Feature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties };
}

function lineFeature(coordinates: [number, number][], properties: Record<string, unknown> = {}): GeoJSON.Feature {
  return { type: "Feature", geometry: { type: "LineString", coordinates }, properties };
}

// A small plum chevron, drawn once on an offscreen canvas and registered
// with MapLibre as an icon image — lets the symbol layer rotate it per
// vehicle via icon-rotate, unlike a plain (unrotatable) circle layer.
function buildVehicleArrowIcon(): ImageData {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PLUM;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size / 2, 3);
  ctx.lineTo(size - 6, size - 6);
  ctx.lineTo(size / 2, size - 13);
  ctx.lineTo(6, size - 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

interface VehicleAnim {
  from: LatLon;
  to: LatLon;
  bearing: number;
  startedAt: number;
  /** Feed timestamp of `to` — lets us ignore store churn that isn't a new fix. */
  timestamp: string;
  regNumber: string;
  status: string;
  speed: number;
}

interface Tooltip {
  title: string;
  subtitle: string;
}

type LoadState = { status: "loading" | "ready" | "error"; message?: string };

function pickFeature(map: MapLibreMap, point: { x: number; y: number }): { kind: PickKind; feature: MapGeoJSONFeature } | null {
  const layers = PICK_ORDER.map(([id]) => id).filter((id) => map.getLayer(id));
  if (layers.length === 0) return null;
  const feats = map.queryRenderedFeatures([point.x, point.y], { layers });
  for (const [layer, kind] of PICK_ORDER) {
    const feature = feats.find((f) => f.layer.id === layer);
    if (feature) return { kind, feature };
  }
  return null;
}

function describe(kind: PickKind, f: MapGeoJSONFeature): Tooltip {
  const p = f.properties ?? {};
  switch (kind) {
    case "vehicle":
      return {
        title: String(p.registration_number),
        subtitle: `${String(p.status).replaceAll("_", " ")} · ${Number(p.speed).toFixed(0)} km/h`,
      };
    case "node":
      return { title: String(p.node_name), subtitle: `${String(p.node_type).replaceAll("_", " ")} · ${p.city}` };
    case "district":
      return {
        title: `${p.name} ${COUNTRY.levels.district.label}`,
        subtitle: `${p.division} ${COUNTRY.levels.division.label} · click to focus`,
      };
    default:
      return { title: `${p.name} ${COUNTRY.levels.division.label}`, subtitle: "Click to focus" };
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReadyRef = useRef(false);
  const nodesByIdRef = useRef<Map<string, LogisticsNode>>(new Map());
  const routesRef = useRef<LogisticsRoute[]>([]);
  const vehiclesByIdRef = useRef<Map<string, Vehicle>>(new Map());
  const vehicleAnimRef = useRef<Map<string, VehicleAnim>>(new Map());
  const trailsRef = useRef<Map<string, [number, number][]>>(new Map());
  const hoveredRef = useRef<{ source: string; id: string } | null>(null);
  const selectedVehicleIdRef = useRef<string | null>(null);
  const selectedRegionIdRef = useRef<string | null>(null);
  const legRef = useRef<VehicleLeg | null>(null);
  const packageBboxRef = useRef<BBox | null>(null);
  const packagePulseRef = useRef<[number, number] | null>(null);
  const followRef = useRef(false);
  // Programmatic flights (focus/fit/home) must not be cut short by the
  // follow-camera easing that fires on every vehicle tick.
  const flightUntilRef = useRef(0);
  const hadSelectionRef = useRef(false);
  const focusIdRef = useRef<string | null>(null);

  const selectNode = useControlTowerStore((s) => s.selectNode);
  const selectVehicle = useControlTowerStore((s) => s.selectVehicle);
  const selectRegion = useControlTowerStore((s) => s.selectRegion);
  const setNetwork = useControlTowerStore((s) => s.setNetwork);
  const setFollowVehicle = useControlTowerStore((s) => s.setFollowVehicle);
  const setShowBoundaries = useControlTowerStore((s) => s.setShowBoundaries);
  const filters = useControlTowerStore((s) => s.filters);
  const selectedNode = useControlTowerStore((s) => s.selectedNode);
  const selectedVehicle = useControlTowerStore((s) => s.selectedVehicle);
  const selectedRegion = useControlTowerStore((s) => s.selectedRegion);
  const selectedTrackingNumber = useControlTowerStore((s) => s.selectedTrackingNumber);
  const trackedPackage = useControlTowerStore((s) => s.trackedPackage);
  const regions = useControlTowerStore((s) => s.regions);
  const nodes = useControlTowerStore((s) => s.nodes);
  const followVehicle = useControlTowerStore((s) => s.followVehicle);
  const showBoundaries = useControlTowerStore((s) => s.showBoundaries);
  // Live vehicle positions come from the store — LiveDataProvider owns the
  // actual WebSocket subscription (it stays mounted app-wide, unlike this
  // component, so the feed doesn't drop when the user switches pages).
  const vehicles = useControlTowerStore((s) => s.vehicles);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [focusRegion, setFocusRegion] = useState<RegionFeature["properties"] | null>(null);

  // --- Imperative helpers. They read the store directly (not props) so the
  // load sequence and event handlers can call them with current state. ---

  const applyCamera = (map: MapLibreMap) => {
    const s = useControlTowerStore.getState();
    const fly = (opts: { center: [number, number]; zoom: number; duration: number }) => {
      flightUntilRef.current = performance.now() + opts.duration + 100;
      map.flyTo({ ...opts, essential: true });
    };
    const fit = (bbox: BBox, duration: number, maxZoom: number) => {
      flightUntilRef.current = performance.now() + duration + 100;
      map.fitBounds(bbox as LngLatBoundsLike, { padding: FIT_PADDING, duration, maxZoom, linear: false, essential: true });
    };

    if (s.selectedNode) {
      fly({
        center: [s.selectedNode.longitude, s.selectedNode.latitude],
        zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
        duration: FOCUS_DURATION_MS,
      });
    } else if (s.selectedVehicle) {
      const live = s.vehicles.get(s.selectedVehicle.id);
      const lat = live?.latitude ?? s.selectedVehicle.current_latitude;
      const lon = live?.longitude ?? s.selectedVehicle.current_longitude;
      if (lat != null && lon != null) {
        fly({ center: [lon, lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: FOCUS_DURATION_MS });
      }
    } else if (s.selectedTrackingNumber) {
      if (packageBboxRef.current) fit(packageBboxRef.current, REGION_FIT_DURATION_MS, FOCUS_ZOOM);
    } else if (s.selectedRegion) {
      // fitBounds with linear:false is a flyTo under the hood — from a
      // zoomed-in spot it arcs *out* over the country and back *in* on the
      // area, which is exactly the zoom-out-then-highlight the UX calls for.
      fit(s.selectedRegion.bbox, REGION_FIT_DURATION_MS, REGION_MAX_ZOOM);
    } else if (hadSelectionRef.current) {
      fly({ center: COUNTRY.center, zoom: COUNTRY.overviewZoom, duration: HOME_DURATION_MS });
    }
    hadSelectionRef.current = !!(s.selectedNode || s.selectedVehicle || s.selectedTrackingNumber || s.selectedRegion);
  };

  const applyRegionVisuals = (map: MapLibreMap) => {
    const s = useControlTowerStore.getState();
    const region = s.selectedRegion;
    const source = map.getSource("region-selected") as GeoJSONSource | undefined;
    if (!source) return;
    const feature = region && s.regions ? (s.regions.byId.get(region.id) ?? null) : null;
    source.setData(feature ? fc([feature]) : EMPTY_FC);
    if (feature) {
      // Fade the outline in rather than popping it on — transitions only
      // apply to constant paint values, hence the two-step set.
      map.setPaintProperty("region-selected-line", "line-opacity", 0);
      requestAnimationFrame(() => {
        if (mapRef.current === map) map.setPaintProperty("region-selected-line", "line-opacity", 1);
      });
    }
    // Everything *outside* the focused area gets a cream wash. Done with a
    // filtered constant-opacity layer (not a per-feature expression) so the
    // wash can cross-fade in and out.
    for (const level of ["division", "district"] as const) {
      const dim = `${level}-dim`;
      if (region && region.level === level) {
        map.setFilter(dim, ["!=", ["get", "id"], region.id]);
        map.setPaintProperty(dim, "fill-opacity", 0.45);
      } else {
        map.setPaintProperty(dim, "fill-opacity", 0);
      }
    }
    // The viewport-focus hint is redundant while an area is explicitly selected.
    const focusVisibility = region ? "none" : "visible";
    for (const id of ["region-focus-fill", "region-focus-line"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", s.showBoundaries ? focusVisibility : "none");
    }
  };

  const recomputeLeg = () => {
    const s = useControlTowerStore.getState();
    const sel = s.selectedVehicle;
    const live = sel ? s.vehicles.get(sel.id) : undefined;
    legRef.current =
      sel && live
        ? inferVehicleLeg(
            { lat: live.latitude, lon: live.longitude, heading: live.heading, speed: live.speed, status: live.status },
            sel.current_node_id,
            routesRef.current,
            nodesByIdRef.current,
          )
        : null;
  };

  // Map init + static layers — runs once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    useControlTowerStore.getState().loadRegions();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: COUNTRY.center,
      zoom: INTRO_START_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    // Bottom-left: the floating controls own the bottom-right corner.
    map.addControl(new AttributionControl({ compact: true, customAttribution: COUNTRY.attribution }), "bottom-left");

    map.on("error", (e) => {
      const message = e.error?.message ?? "Unknown map error";
       
      console.error("[maplibre error]", message);
      setLoadState({ status: "error", message: `Map style/tile error: ${message}` });
    });

    // If "load" never fires (e.g. the base map's tiles are stuck/blocked),
    // surface that instead of leaving the panel silently blank forever.
    const stallTimer = setTimeout(() => {
      setLoadState((prev) =>
        prev.status === "loading"
          ? { status: "error", message: "Map is taking unusually long to load — the base map tiles may be blocked (ad blocker / network) or slow to respond." }
          : prev,
      );
    }, 10000);

    const clearHover = () => {
      if (hoveredRef.current) {
        map.setFeatureState(hoveredRef.current, { hover: false });
        hoveredRef.current = null;
      }
      map.getCanvas().style.cursor = "";
      setTooltip(null);
    };

    const setFocus = (feature: RegionFeature | null) => {
      const id = feature?.properties.id ?? null;
      if (id === focusIdRef.current) return;
      focusIdRef.current = id;
      (map.getSource("region-focus") as GeoJSONSource | undefined)?.setData(feature ? fc([feature]) : EMPTY_FC);
      setFocusRegion(feature ? feature.properties : null);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const s = useControlTowerStore.getState();
      if (s.selectedNode || s.selectedVehicle || s.selectedTrackingNumber) s.selectNode(null);
      else if (s.selectedRegion) s.selectRegion(null);
      else map.flyTo({ center: COUNTRY.center, zoom: COUNTRY.overviewZoom, duration: HOME_DURATION_MS, essential: true });
    };
    window.addEventListener("keydown", onKeyDown);

    map.on("load", async () => {
      clearTimeout(stallTimer);
      map.addImage("vehicle-arrow", buildVehicleArrowIcon(), { pixelRatio: 2 });

      // Administrative boundaries sit *below* the basemap's place labels so
      // town names stay legible over the washes and outlines.
      const labelLayer = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      const loadedRegions = useControlTowerStore.getState().regions;
      map.addSource("regions-division", { type: "geojson", data: loadedRegions ? fc(loadedRegions.division) : EMPTY_FC, promoteId: "id" });
      map.addSource("regions-district", { type: "geojson", data: loadedRegions ? fc(loadedRegions.district) : EMPTY_FC, promoteId: "id" });
      map.addSource("region-focus", { type: "geojson", data: EMPTY_FC });
      map.addSource("region-selected", { type: "geojson", data: EMPTY_FC });

      const hover: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
      map.addLayer({
        id: "division-fill", type: "fill", source: "regions-division",
        paint: { "fill-color": LIME, "fill-opacity": ["case", hover, 0.22, 0.06] },
      }, labelLayer);
      map.addLayer({
        id: "district-fill", type: "fill", source: "regions-district", minzoom: COUNTRY.districtRevealZoom,
        paint: { "fill-color": LIME, "fill-opacity": ["case", hover, 0.26, 0.01] },
      }, labelLayer);
      map.addLayer({
        id: "division-dim", type: "fill", source: "regions-division",
        paint: { "fill-color": CREAM, "fill-opacity": 0, "fill-opacity-transition": { duration: 500, delay: 0 } },
      }, labelLayer);
      map.addLayer({
        id: "district-dim", type: "fill", source: "regions-district", minzoom: COUNTRY.districtRevealZoom,
        paint: { "fill-color": CREAM, "fill-opacity": 0, "fill-opacity-transition": { duration: 500, delay: 0 } },
      }, labelLayer);
      // Borders sharpen with zoom: divisions are always drawn (thin at
      // country scale, bold up close); districts fade in past the reveal zoom.
      map.addLayer({
        id: "district-line", type: "line", source: "regions-district", minzoom: COUNTRY.districtRevealZoom,
        layout: { "line-join": "round" },
        paint: {
          "line-color": PLUM_SOFT,
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 10, 1.4, 13, 2],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 8, 0.6],
          "line-dasharray": [3, 2],
        },
      }, labelLayer);
      map.addLayer({
        id: "division-line", type: "line", source: "regions-division",
        layout: { "line-join": "round" },
        paint: {
          "line-color": PLUM,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 7, 1.6, 11, 2.8],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.25, 6, 0.75],
        },
      }, labelLayer);
      map.addLayer({
        id: "region-focus-fill", type: "fill", source: "region-focus",
        paint: { "fill-color": LIME, "fill-opacity": 0.1 },
      }, labelLayer);
      map.addLayer({
        id: "region-focus-line", type: "line", source: "region-focus",
        layout: { "line-join": "round" },
        paint: { "line-color": LIME_DEEP, "line-width": 2, "line-dasharray": [2, 1.5] },
      }, labelLayer);
      map.addLayer({
        id: "region-selected-glow", type: "line", source: "region-selected",
        layout: { "line-join": "round" },
        paint: { "line-color": LIME_DEEP, "line-width": 12, "line-blur": 10, "line-opacity": 0.35 },
      }, labelLayer);
      map.addLayer({
        id: "region-selected-line", type: "line", source: "region-selected",
        layout: { "line-join": "round" },
        paint: { "line-color": PLUM, "line-width": 2.5, "line-opacity": 0, "line-opacity-transition": { duration: 600, delay: 0 } },
      }, labelLayer);

      map.addSource("routes", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "routes-line", type: "line", source: "routes",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 700, delay: 0 },
        },
      });

      // Package tracking: the path already covered (solid) and what's left (flowing dashes).
      map.addSource("package-traveled", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "package-traveled", type: "line", source: "package-traveled",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": LIME_TEXT, "line-width": 3.5, "line-opacity": 0.9 },
      });
      map.addSource("package-remaining", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "package-remaining", type: "line", source: "package-remaining",
        layout: { "line-join": "round" },
        paint: { "line-color": PLUM, "line-width": 2.5, "line-dasharray": DASH_SEQUENCE[0], "line-opacity": 0.85 },
      });

      // Selected-vehicle tracking: breadcrumb trail behind, next-stop leg ahead.
      map.addSource("vehicle-trail", { type: "geojson", data: EMPTY_FC, lineMetrics: true });
      map.addLayer({
        id: "vehicle-trail", type: "line", source: "vehicle-trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 4,
          "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(69,12,63,0)", 1, "rgba(69,12,63,0.85)"],
        },
      });
      map.addSource("vehicle-leg", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "vehicle-leg", type: "line", source: "vehicle-leg",
        paint: { "line-color": PLUM, "line-width": 2.5, "line-dasharray": DASH_SEQUENCE[0], "line-opacity": 0.8 },
      });

      // Expanding rings under whatever is being tracked (vehicle, its next stop, a package).
      map.addSource("pulses", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "pulse-ring", type: "circle", source: "pulses",
        paint: {
          "circle-radius": 8,
          "circle-color": ["match", ["get", "kind"], "dest", LIME_DEEP, PLUM],
          "circle-opacity": 0.4,
          "circle-stroke-width": 0,
        },
      });

      map.addSource("nodes", { type: "geojson", data: EMPTY_FC, promoteId: "id" });
      map.addLayer({
        id: "nodes-circle", type: "circle", source: "nodes",
        paint: {
          "circle-radius": ["case", hover, ["*", ["get", "radius"], 1.5], ["get", "radius"]],
          "circle-color": ["get", "color"],
          "circle-stroke-width": ["case", hover, 2, 1],
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0,
          "circle-opacity-transition": { duration: 700, delay: 0 },
        },
      });

      map.addLayer({
        id: "pulse-core", type: "circle", source: "pulses", filter: ["==", ["get", "kind"], "package"],
        paint: { "circle-radius": 6, "circle-color": PLUM, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      map.addSource("package-endpoints", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "package-endpoints", type: "circle", source: "package-endpoints",
        paint: {
          "circle-radius": 7,
          "circle-color": ["match", ["get", "role"], "origin", LIME_DEEP, PLUM],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "package-endpoint-labels", type: "symbol", source: "package-endpoints",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Montserrat Medium", "Open Sans Bold"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: { "text-color": PLUM, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      });

      map.addSource("vehicles", { type: "geojson", data: EMPTY_FC, promoteId: "id" });
      map.addLayer({
        id: "vehicles-symbol", type: "symbol", source: "vehicles",
        layout: {
          "icon-image": "vehicle-arrow",
          "icon-size": ["case", ["boolean", ["get", "selected"], false], 0.9, 0.55],
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
        },
        paint: {
          "icon-opacity": [
            "case",
            ["boolean", ["get", "selected"], false], 1,
            hover, 1,
            ["boolean", ["get", "dimmed"], false], 0.4,
            0.92,
          ],
        },
      });

      // One click handler with explicit precedence — vehicles over nodes over
      // areas — instead of per-layer handlers that would all fire at once
      // where things overlap. A click on nothing steps the selection back
      // out (item → area → country), which is the "zoom out" gesture.
      map.on("click", (e: MapMouseEvent) => {
        const picked = pickFeature(map, e.point);
        const s = useControlTowerStore.getState();
        if (!picked) {
          if (s.selectedNode || s.selectedVehicle || s.selectedTrackingNumber) s.selectNode(null);
          else if (s.selectedRegion) s.selectRegion(null);
          return;
        }
        const id = String(picked.feature.properties?.id ?? picked.feature.id);
        if (picked.kind === "vehicle") {
          const known = vehiclesByIdRef.current.get(id);
          if (known) selectVehicle(known);
          else
            api
              .getVehicle(id)
              .then((v) => {
                vehiclesByIdRef.current.set(v.id, v);
                selectVehicle(v);
              })
              .catch(() => {});
        } else if (picked.kind === "node") {
          const node = nodesByIdRef.current.get(id);
          if (node) selectNode(node);
        } else {
          const feature = s.regions?.byId.get(id);
          if (feature) selectRegion(feature.properties);
        }
      });

      map.on("mousemove", (e: MapMouseEvent) => {
        const el = tooltipRef.current;
        if (el) el.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
        const picked = pickFeature(map, e.point);
        if (!picked) {
          if (hoveredRef.current) clearHover();
          return;
        }
        const id = String(picked.feature.properties?.id ?? picked.feature.id);
        const source = picked.feature.source;
        if (hoveredRef.current?.id === id && hoveredRef.current.source === source) return;
        if (hoveredRef.current) map.setFeatureState(hoveredRef.current, { hover: false });
        hoveredRef.current = { source, id };
        map.setFeatureState({ source, id }, { hover: true });
        map.getCanvas().style.cursor = picked.kind === "vehicle" || picked.kind === "node" ? "pointer" : "";
        setTooltip(describe(picked.kind, picked.feature));
      });
      map.on("mouseout", clearHover);

      // Dragging the map is the universal "I'll take it from here" — stop
      // chasing the vehicle rather than fighting the user for the camera.
      map.on("dragstart", () => {
        if (followRef.current) setFollowVehicle(false);
      });

      // As the user zooms in past district scale, softly outline whichever
      // district is under the centre of the view and offer it as a focus.
      map.on("moveend", () => {
        const s = useControlTowerStore.getState();
        if (s.selectedRegion || !s.regions || map.getZoom() < COUNTRY.districtRevealZoom + 0.3) {
          setFocus(null);
          return;
        }
        const c = map.getCenter();
        setFocus(findRegionAt(s.regions.district, c.lng, c.lat));
      });

      // The cinematic zoom and the network fetch race — nodes/routes only
      // fade in once BOTH the camera has settled and the data has arrived,
      // whichever finishes last, so the reveal never looks premature.
      let flightDone = false;
      let dataReady: { nodes: LogisticsNode[] } | null = null;
      let dataError: string | null = null;
      const tryReveal = () => {
        if (cancelled || !flightDone || (!dataReady && !dataError)) return;
        if (dataError) {
          setLoadState({ status: "error", message: dataError });
          return;
        }
        if (dataReady!.nodes.length === 0) {
          setLoadState({
            status: "error",
            message: "Map loaded but the network has no nodes — run scripts/seed_database.py against the backend.",
          });
          return;
        }
        map.setPaintProperty("nodes-circle", "circle-opacity", 1);
        map.setPaintProperty("routes-line", "line-opacity", 0.55);
        setLoadState({ status: "ready" });
        // Honour whatever was already selected before this map mounted
        // (e.g. a row picked on the Vehicles page, then back to Network).
        applyRegionVisuals(map);
        applyCamera(map);
      };

      map.flyTo({ center: COUNTRY.center, zoom: COUNTRY.overviewZoom, duration: INTRO_DURATION_MS, essential: true });
      flightUntilRef.current = performance.now() + INTRO_DURATION_MS + 100;
      map.once("moveend", () => {
        flightDone = true;
        tryReveal();
      });
      mapReadyRef.current = true;

      // Populate immediately from whatever LiveDataProvider has already
      // collected — don't wait for the next WebSocket tick to show vehicles
      // that were already in flight before this map instance mounted.
      const initialVehicles = useControlTowerStore.getState().vehicles;
      for (const v of initialVehicles.values()) {
        vehicleAnimRef.current.set(v.vehicle_id, {
          from: { lat: v.latitude, lon: v.longitude },
          to: { lat: v.latitude, lon: v.longitude },
          bearing: v.heading,
          startedAt: performance.now(),
          timestamp: v.timestamp,
          regNumber: v.registration_number,
          status: v.status,
          speed: v.speed,
        });
      }

      try {
        const [nodeList, routes, vehicleList] = await Promise.all([
          api.listNodes(),
          api.listRoutes({}),
          api.listVehicles({ limit: 500 }).catch(() => [] as Vehicle[]),
        ]);
        if (cancelled) return;
        const nodesById = new Map(nodeList.map((n) => [n.id, n]));
        nodesByIdRef.current = nodesById;
        routesRef.current = routes;
        vehiclesByIdRef.current = new Map(vehicleList.map((v) => [v.id, v]));
        setNetwork(nodeList, routes);

        (map.getSource("nodes") as GeoJSONSource).setData(nodesToGeoJSON(nodeList));
        (map.getSource("routes") as GeoJSONSource).setData(routesToGeoJSON(routes, nodesById));
        recomputeLeg();
        dataReady = { nodes: nodeList };
        tryReveal();
      } catch (err) {
        if (cancelled) return;
        // Without this catch, a failed fetch here becomes an unhandled
        // promise rejection MapLibre never surfaces — the map silently
        // stays empty forever with no visible signal of why.
        const message = err instanceof Error ? err.message : String(err);
         
        console.error("[MapView] failed to load network data", err);
        dataError = `Failed to load network data from the API: ${message}`;
        tryReveal();
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(stallTimer);
      window.removeEventListener("keydown", onKeyDown);
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boundary data can arrive before or after the map finishes loading.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regions || !map.getSource("regions-division")) return;
    (map.getSource("regions-division") as GeoJSONSource).setData(fc(regions.division));
    (map.getSource("regions-district") as GeoJSONSource).setData(fc(regions.district));
    applyRegionVisuals(map);
     
  }, [regions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    for (const id of BOUNDARY_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showBoundaries ? "visible" : "none");
    }
    if (showBoundaries) applyRegionVisuals(map);
     
  }, [showBoundaries]);

  // Re-filter the nodes layer whenever filters change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("nodes")) return;
    const all = Array.from(nodesByIdRef.current.values());
    const filtered = all.filter(
      (n) =>
        (!filters.nodeType || n.node_type === filters.nodeType) &&
        (!filters.city || n.city === filters.city),
    );
    (map.getSource("nodes") as GeoJSONSource)?.setData(nodesToGeoJSON(filtered));
  }, [filters]);

  useEffect(() => {
    selectedVehicleIdRef.current = selectedVehicle?.id ?? null;
    recomputeLeg();
     
  }, [selectedVehicle]);

  useEffect(() => {
    followRef.current = followVehicle;
  }, [followVehicle]);

  useEffect(() => {
    selectedRegionIdRef.current = selectedRegion?.id ?? null;
  }, [selectedRegion]);

  // Each incoming tick becomes a new glide target rather than an instant
  // jump — the render loop below is what actually paints the motion.
  useEffect(() => {
    const now = performance.now();
    const anims = vehicleAnimRef.current;
    const trails = trailsRef.current;
    const map = mapRef.current;
    const selId = selectedVehicleIdRef.current;

    for (const [id, update] of vehicles) {
      const prev = anims.get(id);
      // The store map is rebuilt on *every* message; only a genuinely new
      // fix for this vehicle should restart its glide, otherwise the
      // animation keeps resetting and the vehicle crawls.
      if (prev && prev.timestamp === update.timestamp) continue;

      const to = { lat: update.latitude, lon: update.longitude };
      let from = to;
      let bearing = update.heading;
      if (prev) {
        const t = Math.min(1, (now - prev.startedAt) / VEHICLE_TICK_MS);
        from = {
          lat: prev.from.lat + (prev.to.lat - prev.from.lat) * t,
          lon: prev.from.lon + (prev.to.lon - prev.from.lon) * t,
        };
        if (from.lat !== to.lat || from.lon !== to.lon) bearing = bearingBetween(from, to);
      }
      anims.set(id, {
        from,
        to,
        bearing,
        startedAt: now,
        timestamp: update.timestamp,
        regNumber: update.registration_number,
        status: update.status,
        speed: update.speed,
      });

      const trail = trails.get(id) ?? [];
      const last = trail[trail.length - 1];
      if (!last || last[0] !== to.lon || last[1] !== to.lat) {
        trail.push([to.lon, to.lat]);
        if (trail.length > TRAIL_LENGTH) trail.shift();
        trails.set(id, trail);
      }

      // Follow camera: glide the viewport to the new fix over the same
      // duration as the vehicle's own glide, so it stays pinned in view
      // like a ride-hailing app tracking a car.
      if (map && id === selId && followRef.current && mapReadyRef.current && now > flightUntilRef.current) {
        map.easeTo({ center: [to.lon, to.lat], duration: VEHICLE_TICK_MS, easing: (t: number) => t, essential: true });
      }
    }
    for (const id of anims.keys()) {
      if (!vehicles.has(id)) {
        anims.delete(id);
        trails.delete(id);
      }
    }
    recomputeLeg();
     
  }, [vehicles]);

  // Package path: origin → every hub it's been scanned at → destination.
  useEffect(() => {
    const nodesById = nodesByIdRef.current;
    const pkg = trackedPackage;
    let traveled: [number, number][] = [];
    let remaining: [number, number][] = [];
    const endpoints: GeoJSON.Feature[] = [];
    let pulse: [number, number] | null = null;

    if (pkg) {
      const src = nodesById.get(pkg.source_node_id);
      const dst = nodesById.get(pkg.destination_node_id);
      const seen: [number, number][] = [];
      if (src) seen.push([src.longitude, src.latitude]);
      for (const step of pkg.timeline) {
        if (step.latitude == null || step.longitude == null) continue;
        const last = seen[seen.length - 1];
        if (!last || last[0] !== step.longitude || last[1] !== step.latitude) seen.push([step.longitude, step.latitude]);
      }
      traveled = seen;
      const last = seen[seen.length - 1];
      if (dst && last && (last[0] !== dst.longitude || last[1] !== dst.latitude)) {
        remaining = [last, [dst.longitude, dst.latitude]];
      }
      if (src) endpoints.push(pointFeature(src.longitude, src.latitude, { role: "origin", label: `Origin · ${src.node_name}` }));
      if (dst) endpoints.push(pointFeature(dst.longitude, dst.latitude, { role: "destination", label: `Destination · ${dst.node_name}` }));
      const current = pkg.current_node_id ? nodesById.get(pkg.current_node_id) : undefined;
      pulse = current ? [current.longitude, current.latitude] : (last ?? null);
    }

    packageBboxRef.current = bboxOfPositions([...traveled, ...remaining]);
    packagePulseRef.current = pulse;

    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !map.getSource("package-traveled")) return;
    (map.getSource("package-traveled") as GeoJSONSource).setData(traveled.length >= 2 ? fc([lineFeature(traveled)]) : EMPTY_FC);
    (map.getSource("package-remaining") as GeoJSONSource).setData(remaining.length === 2 ? fc([lineFeature(remaining)]) : EMPTY_FC);
    (map.getSource("package-endpoints") as GeoJSONSource).setData(fc(endpoints));
  }, [trackedPackage, nodes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    applyRegionVisuals(map);
     
  }, [selectedRegion?.id]);

  // Fly the camera to whatever gets selected, or back out when it's cleared.
  // Keyed on ids rather than objects so a live vehicle tick updating
  // elsewhere doesn't re-trigger the flight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    applyCamera(map);
     
  }, [selectedNode?.id, selectedVehicle?.id, selectedTrackingNumber, trackedPackage?.tracking_number, selectedRegion?.id]);

  // Continuous render loop: vehicle glides, the selected vehicle's trail and
  // next-stop leg, pulse rings, the selected area's glow and the flowing
  // dashes — all independent of how often WebSocket ticks actually arrive.
  useEffect(() => {
    let raf: number;
    let frame = 0;
    let lastDashStep = -1;
    let lastPulseKey = "";
    let hadTracking = false;

    const tick = () => {
      frame += 1;
      const map = mapRef.current;
      const vehicleSource = map?.getSource("vehicles") as GeoJSONSource | undefined;
      if (map && vehicleSource) {
        const now = performance.now();
        const selId = selectedVehicleIdRef.current;
        let selPos: [number, number] | null = null;
        const features: GeoJSON.Feature[] = [];
        for (const [id, a] of vehicleAnimRef.current) {
          const t = Math.min(1, (now - a.startedAt) / VEHICLE_TICK_MS);
          const lat = a.from.lat + (a.to.lat - a.from.lat) * t;
          const lon = a.from.lon + (a.to.lon - a.from.lon) * t;
          const selected = id === selId;
          if (selected) selPos = [lon, lat];
          features.push({
            type: "Feature",
            id,
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {
              id,
              selected,
              dimmed: selId != null && !selected,
              registration_number: a.regNumber,
              status: a.status,
              speed: a.speed,
              bearing: a.bearing,
            },
          });
        }
        vehicleSource.setData(fc(features));

        const trailSource = map.getSource("vehicle-trail") as GeoJSONSource | undefined;
        const legSource = map.getSource("vehicle-leg") as GeoJSONSource | undefined;
        const pulseSource = map.getSource("pulses") as GeoJSONSource | undefined;
        const leg = legRef.current;
        const pulses: GeoJSON.Feature[] = [];

        if (selId && selPos) {
          const trail = trailsRef.current.get(selId) ?? [];
          trailSource?.setData(trail.length > 0 ? fc([lineFeature([...trail, selPos])]) : EMPTY_FC);
          legSource?.setData(leg ? fc([lineFeature([selPos, [leg.dest.longitude, leg.dest.latitude]])]) : EMPTY_FC);
          pulses.push(pointFeature(selPos[0], selPos[1], { kind: "vehicle" }));
          if (leg) pulses.push(pointFeature(leg.dest.longitude, leg.dest.latitude, { kind: "dest" }));
          hadTracking = true;
        } else if (hadTracking) {
          trailSource?.setData(EMPTY_FC);
          legSource?.setData(EMPTY_FC);
          hadTracking = false;
        }
        if (packagePulseRef.current) {
          pulses.push(pointFeature(packagePulseRef.current[0], packagePulseRef.current[1], { kind: "package" }));
        }

        const pulseKey = pulses
          .map((p) => `${(p.geometry as GeoJSON.Point).coordinates.join(",")}:${p.properties?.kind}`)
          .join("|");
        if (pulseKey !== lastPulseKey) {
          pulseSource?.setData(fc(pulses));
          lastPulseKey = pulseKey;
        }
        if (pulses.length > 0 && frame % 2 === 0) {
          const phase = (now % 1600) / 1600;
          map.setPaintProperty("pulse-ring", "circle-radius", 6 + 22 * phase);
          map.setPaintProperty("pulse-ring", "circle-opacity", 0.5 * (1 - phase));
        }
        if (selectedRegionIdRef.current && frame % 3 === 0 && map.getLayer("region-selected-glow")) {
          map.setPaintProperty("region-selected-glow", "line-opacity", 0.3 + 0.2 * Math.sin(now / 450));
        }
        const dashStep = Math.floor(now / 70) % DASH_SEQUENCE.length;
        if (dashStep !== lastDashStep && map.getLayer("vehicle-leg")) {
          lastDashStep = dashStep;
          map.setPaintProperty("vehicle-leg", "line-dasharray", DASH_SEQUENCE[dashStep]);
          map.setPaintProperty("package-remaining", "line-dasharray", DASH_SEQUENCE[dashStep]);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const levelLabel = (level: "division" | "district") => COUNTRY.levels[level].label;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Hover card — positioned imperatively on mousemove, so only its
          content goes through React state. */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform"
        style={{ visibility: tooltip ? "visible" : "hidden" }}
      >
        {tooltip && (
          <div className="rounded-md border border-nv-800 bg-white/95 px-2.5 py-1.5 text-xs shadow-[var(--shadow-md)]">
            <div className="font-semibold text-ink-900">{tooltip.title}</div>
            <div className="text-ink-500">{tooltip.subtitle}</div>
          </div>
        )}
      </div>

      {(selectedRegion || focusRegion) && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
          {selectedRegion ? (
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-plum/20 bg-white/90 py-1.5 pl-3 pr-1.5 text-xs shadow-[var(--shadow-md)] backdrop-blur">
              <MapPin className="h-3.5 w-3.5 text-accent-700" aria-hidden />
              <span className="font-semibold text-ink-900">
                {selectedRegion.name} {levelLabel(selectedRegion.level)}
              </span>
              {selectedRegion.division && (
                <span className="text-ink-500">
                  · {selectedRegion.division} {levelLabel("division")}
                </span>
              )}
              <button
                onClick={() => selectRegion(null)}
                title="Zoom out (Esc)"
                className="group ml-1 rounded-full p-1 text-ink-500 transition-colors hover:bg-nv-850 hover:text-ink-900"
              >
                <X className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
              </button>
            </div>
          ) : (
            focusRegion && (
              <button
                onClick={() => selectRegion(focusRegion)}
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-nv-800 bg-white/85 px-3 py-1.5 text-xs text-ink-600 shadow-[var(--shadow-sm)] backdrop-blur transition-all duration-200 hover:-translate-y-px hover:border-plum/30 hover:text-ink-900"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
                <span>
                  Viewing <span className="font-semibold text-ink-900">{focusRegion.name}</span>
                  {focusRegion.division && (
                    <span>
                      {" "}· {focusRegion.division} {levelLabel("division")}
                    </span>
                  )}
                </span>
                <span className="text-ink-400">— click to focus</span>
              </button>
            )
          )}
        </div>
      )}

      <MapControls
        onZoomIn={() => mapRef.current?.zoomIn({ duration: 350 })}
        onZoomOut={() => mapRef.current?.zoomOut({ duration: 350 })}
        onHome={() => {
          const s = useControlTowerStore.getState();
          const hadInner = !!(s.selectedNode || s.selectedVehicle || s.selectedTrackingNumber);
          if (hadInner) s.selectNode(null);
          if (s.selectedRegion) s.selectRegion(null);
          if (!hadInner && !s.selectedRegion) {
            mapRef.current?.flyTo({ center: COUNTRY.center, zoom: COUNTRY.overviewZoom, duration: HOME_DURATION_MS, essential: true });
          }
        }}
        showBoundaries={showBoundaries}
        onToggleBoundaries={() => setShowBoundaries(!showBoundaries)}
        followAvailable={selectedVehicle != null}
        following={followVehicle}
        onToggleFollow={() => setFollowVehicle(!followVehicle)}
      />

      {loadState.status === "error" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
          <div className="flex max-w-xl items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800 shadow-[var(--shadow-md)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {loadState.message}
          </div>
        </div>
      )}

      {loadState.status === "loading" && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-nv-700 bg-nv-900/80 px-3 py-1.5 text-xs text-ink-600 backdrop-blur">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Loading network…
          </div>
        </div>
      )}
    </div>
  );
}
