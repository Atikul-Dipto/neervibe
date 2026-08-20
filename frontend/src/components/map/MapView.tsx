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
import { api } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { NODE_TYPE_COLORS, NODE_TYPE_RADIUS, congestionColor } from "./nodeStyle";
import type { LogisticsNode, LogisticsRoute } from "@/types/domain";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const BANGLADESH_CENTER: [number, number] = [90.35, 23.9];

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

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type LoadState = { status: "loading" | "ready" | "error"; message?: string };

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const nodesByIdRef = useRef<Map<string, LogisticsNode>>(new Map());
  const selectNode = useControlTowerStore((s) => s.selectNode);
  const filters = useControlTowerStore((s) => s.filters);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  // Map init + static layers (nodes, edges) — runs once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: DARK_STYLE,
      center: BANGLADESH_CENTER,
      zoom: 6.4,
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
      map.addSource("routes", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": 0.55,
        },
      });

      map.addSource("nodes", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "nodes-circle",
        type: "circle",
        source: "nodes",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0a2224",
        },
      });

      map.addSource("vehicles", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "vehicles-circle",
        type: "circle",
        source: "vehicles",
        paint: {
          "circle-radius": 4,
          "circle-color": "#2dd4bf",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#042f2e",
        },
      });

      // Populate immediately from whatever LiveDataProvider has already
      // collected — don't wait for the next WebSocket tick to show vehicles
      // that were already in flight before this map instance mounted.
      const initialVehicles = useControlTowerStore.getState().vehicles;
      (map.getSource("vehicles") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: Array.from(initialVehicles.values()).map((v) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [v.longitude, v.latitude] },
          properties: { id: v.vehicle_id, registration_number: v.registration_number, status: v.status },
        })),
      });

      map.on("click", "nodes-circle", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const node = nodesByIdRef.current.get(feature.properties?.id as string);
        if (node) selectNode(node);
      });
      map.on("mouseenter", "nodes-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "nodes-circle", () => {
        map.getCanvas().style.cursor = "";
      });

      try {
        const [nodes, routes] = await Promise.all([api.listNodes(), api.listRoutes({})]);
        const nodesById = new Map(nodes.map((n) => [n.id, n]));
        nodesByIdRef.current = nodesById;

        (map.getSource("nodes") as GeoJSONSource).setData(nodesToGeoJSON(nodes));
        (map.getSource("routes") as GeoJSONSource).setData(routesToGeoJSON(routes, nodesById));

        if (nodes.length === 0) {
          setLoadState({
            status: "error",
            message: "Map loaded but the network has no nodes — run scripts/seed_database.py against the backend.",
          });
        } else {
          setLoadState({ status: "ready" });
        }
      } catch (err) {
        // Without this catch, a failed fetch here becomes an unhandled
        // promise rejection MapLibre never surfaces — the map silently
        // stays empty forever with no visible signal of why.
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error("[MapView] failed to load network data", err);
        setLoadState({ status: "error", message: `Failed to load network data from the API: ${message}` });
      }
    });

    return () => {
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
  // component, so the feed doesn't drop when the user switches pages).
  const vehicles = useControlTowerStore((s) => s.vehicles);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("vehicles") as GeoJSONSource | undefined;
    if (!source) return;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: Array.from(vehicles.values()).map((v) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [v.longitude, v.latitude] },
        properties: { id: v.vehicle_id, registration_number: v.registration_number, status: v.status },
      })),
    };
    source.setData(fc);
  }, [vehicles]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {loadState.status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md border border-nv-700 bg-nv-900/90 px-4 py-2 text-sm text-slate-300">
            Loading network map…
          </div>
        </div>
      )}

      {loadState.status === "error" && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
          <div className="max-w-xl rounded-md border border-rose-500/40 bg-rose-950/90 px-4 py-2 text-sm text-rose-200">
            {loadState.message}
          </div>
        </div>
      )}
    </div>
  );
}
