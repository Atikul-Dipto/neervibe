"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { NODE_TYPE_COLORS, NODE_TYPE_RADIUS, congestionColor } from "./nodeStyle";
import type { LogisticsNode, LogisticsRoute } from "@/types/domain";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const BANGLADESH_CENTER: [number, number] = [90.35, 23.9];
const SETTLED_ZOOM = 6.4;
const INTRO_START_ZOOM = 1.6;
const INTRO_DURATION_MS = 2600;
const FOCUS_ZOOM = 11;
const FOCUS_DURATION_MS = 1300;

// Matches SIMULATION_TICK_SECONDS in the backend .env — how long a vehicle's
// on-map glide from its previous tick to its latest one should take, so
// movement reads as continuous rather than teleporting between updates.
const VEHICLE_TICK_MS = 2900;

function nodesToGeoJSON(nodes: LogisticsNode[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: nodes.map((n) => ({
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
  };
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
  return { type: "FeatureCollection", features };
}

// Great-circle initial bearing from `a` to `b`, in degrees (0 = north).
function bearingBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// A small teal chevron, drawn once on an offscreen canvas and registered
// with MapLibre as an icon image — lets the symbol layer rotate it per
// vehicle via icon-rotate, unlike a plain (unrotatable) circle layer.
function buildVehicleArrowIcon(): ImageData {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2dd4bf";
  ctx.strokeStyle = "#04181a";
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
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  bearing: number;
  startedAt: number;
  regNumber: string;
  status: string;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type LoadState = { status: "loading" | "ready" | "error"; message?: string };

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const nodesByIdRef = useRef<Map<string, LogisticsNode>>(new Map());
  const vehicleAnimRef = useRef<Map<string, VehicleAnim>>(new Map());
  const hoveredNodeIdRef = useRef<string | null>(null);
  const mapReadyRef = useRef(false);
  const selectNode = useControlTowerStore((s) => s.selectNode);
  const filters = useControlTowerStore((s) => s.filters);
  const selectedNode = useControlTowerStore((s) => s.selectedNode);
  const selectedVehicle = useControlTowerStore((s) => s.selectedVehicle);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  // Map init + static layers (nodes, edges) — runs once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: DARK_STYLE,
      center: BANGLADESH_CENTER,
      zoom: INTRO_START_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }));

    map.on("error", (e) => {
      const message = e.error?.message ?? "Unknown map error";
      // eslint-disable-next-line no-console
      console.error("[maplibre error]", message);
      setLoadState({ status: "error", message: `Map style/tile error: ${message}` });
    });

    // If "load" never fires (e.g. the base map's tiles are stuck/blocked),
    // surface that instead of leaving the panel silently dark forever.
    const stallTimer = setTimeout(() => {
      setLoadState((prev) =>
        prev.status === "loading"
          ? { status: "error", message: "Map is taking unusually long to load — the base map tiles may be blocked (ad blocker / network) or slow to respond." }
          : prev,
      );
    }, 10000);

    map.on("load", async () => {
      clearTimeout(stallTimer);

      map.addImage("vehicle-arrow", buildVehicleArrowIcon(), { pixelRatio: 2 });

      map.addSource("routes", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 700, delay: 0 },
        },
      });

      map.addSource("nodes", { type: "geojson", data: EMPTY_FC, promoteId: "id" });
      map.addLayer({
        id: "nodes-circle",
        type: "circle",
        source: "nodes",
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            ["*", ["get", "radius"], 1.5],
            ["get", "radius"],
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 1],
          "circle-stroke-color": "#0a2224",
          "circle-opacity": 0,
          "circle-opacity-transition": { duration: 700, delay: 0 },
          "circle-radius-transition": { duration: 150, delay: 0 },
          "circle-stroke-width-transition": { duration: 150, delay: 0 },
        },
      });

      map.addSource("vehicles", { type: "geojson", data: EMPTY_FC, promoteId: "id" });
      map.addLayer({
        id: "vehicles-symbol",
        type: "symbol",
        source: "vehicles",
        layout: {
          "icon-image": "vehicle-arrow",
          "icon-size": 0.55,
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
        },
        paint: {
          "icon-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.92],
        },
      });

      map.on("click", "nodes-circle", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const node = nodesByIdRef.current.get(feature.properties?.id as string);
        if (node) selectNode(node);
      });
      map.on("mousemove", "nodes-circle", (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id || id === hoveredNodeIdRef.current) return;
        if (hoveredNodeIdRef.current) {
          map.setFeatureState({ source: "nodes", id: hoveredNodeIdRef.current }, { hover: false });
        }
        hoveredNodeIdRef.current = id;
        map.setFeatureState({ source: "nodes", id }, { hover: true });
      });
      map.on("mouseleave", "nodes-circle", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredNodeIdRef.current) {
          map.setFeatureState({ source: "nodes", id: hoveredNodeIdRef.current }, { hover: false });
          hoveredNodeIdRef.current = null;
        }
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
      };

      map.flyTo({ center: BANGLADESH_CENTER, zoom: SETTLED_ZOOM, duration: INTRO_DURATION_MS, essential: true });
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
          regNumber: v.registration_number,
          status: v.status,
        });
      }

      try {
        const [nodes, routes] = await Promise.all([api.listNodes(), api.listRoutes({})]);
        if (cancelled) return;
        const nodesById = new Map(nodes.map((n) => [n.id, n]));
        nodesByIdRef.current = nodesById;

        (map.getSource("nodes") as GeoJSONSource).setData(nodesToGeoJSON(nodes));
        (map.getSource("routes") as GeoJSONSource).setData(routesToGeoJSON(routes, nodesById));
        dataReady = { nodes };
        tryReveal();
      } catch (err) {
        if (cancelled) return;
        // Without this catch, a failed fetch here becomes an unhandled
        // promise rejection MapLibre never surfaces — the map silently
        // stays empty forever with no visible signal of why.
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error("[MapView] failed to load network data", err);
        dataError = `Failed to load network data from the API: ${message}`;
        tryReveal();
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(stallTimer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Live vehicle positions come from the store — LiveDataProvider owns the
  // actual WebSocket subscription (it stays mounted app-wide, unlike this
  // component, so the feed doesn't drop when the user switches pages). Each
  // incoming tick becomes a new glide target rather than an instant jump —
  // see the render loop below, which is what actually paints the motion.
  const vehicles = useControlTowerStore((s) => s.vehicles);

  // Fly the camera to whatever gets selected — a node clicked on the map,
  // or a node/vehicle selected from another view (table row, tracking
  // search) once the user comes back to Network. Keyed on id rather than
  // the object itself so a live vehicle tick updating elsewhere doesn't
  // re-trigger the flight; `vehicles` is read fresh at selection time only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    let target: { lat: number; lon: number } | null = null;
    if (selectedNode) {
      target = { lat: selectedNode.latitude, lon: selectedNode.longitude };
    } else if (selectedVehicle) {
      const live = vehicles.get(selectedVehicle.id);
      const lat = live?.latitude ?? selectedVehicle.current_latitude;
      const lon = live?.longitude ?? selectedVehicle.current_longitude;
      if (lat != null && lon != null) target = { lat, lon };
    }
    if (!target) return;
    map.flyTo({
      center: [target.lon, target.lat],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      duration: FOCUS_DURATION_MS,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, selectedVehicle?.id]);

  useEffect(() => {
    const now = performance.now();
    const anims = vehicleAnimRef.current;
    for (const [id, update] of vehicles) {
      const prev = anims.get(id);
      const to = { lat: update.latitude, lon: update.longitude };
      let from = to;
      let bearing = update.heading;
      if (prev) {
        const t = Math.min(1, (now - prev.startedAt) / VEHICLE_TICK_MS);
        from = {
          lat: prev.from.lat + (prev.to.lat - prev.from.lat) * t,
          lon: prev.from.lon + (prev.to.lon - prev.from.lon) * t,
        };
        if (from.lat !== to.lat || from.lon !== to.lon) {
          bearing = bearingBetween(from, to);
        }
      }
      anims.set(id, { from, to, bearing, startedAt: now, regNumber: update.registration_number, status: update.status });
    }
    for (const id of anims.keys()) {
      if (!vehicles.has(id)) anims.delete(id);
    }
  }, [vehicles]);

  // Continuous render loop: paints each vehicle's interpolated position
  // every frame, independent of how often WebSocket ticks actually arrive.
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const map = mapRef.current;
      const source = map?.getSource("vehicles") as GeoJSONSource | undefined;
      if (source) {
        const now = performance.now();
        const features: GeoJSON.Feature[] = [];
        for (const [id, a] of vehicleAnimRef.current) {
          const t = Math.min(1, (now - a.startedAt) / VEHICLE_TICK_MS);
          const lat = a.from.lat + (a.to.lat - a.from.lat) * t;
          const lon = a.from.lon + (a.to.lon - a.from.lon) * t;
          features.push({
            type: "Feature",
            id,
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: { id, registration_number: a.regNumber, status: a.status, bearing: a.bearing },
          });
        }
        source.setData({ type: "FeatureCollection", features });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {loadState.status === "error" && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
          <div className="flex max-w-xl items-center gap-2 rounded-md border border-rose-500/40 bg-rose-950/90 px-4 py-2 text-sm text-rose-200 shadow-[var(--shadow-md)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {loadState.message}
          </div>
        </div>
      )}

      {loadState.status === "loading" && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-nv-700 bg-nv-900/80 px-3 py-1.5 text-xs text-zinc-400 backdrop-blur">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Loading network…
          </div>
        </div>
      )}
    </div>
  );
}
