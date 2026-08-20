"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "@/services/api";
import { useLiveChannel } from "@/hooks/useLiveChannel";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { NODE_TYPE_COLORS, NODE_TYPE_RADIUS, congestionColor } from "./nodeStyle";
import type {
  LogisticsNode,
  LogisticsRoute,
  PackageLiveUpdate,
  VehicleLiveUpdate,
} from "@/types/domain";

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

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const nodesByIdRef = useRef<Map<string, LogisticsNode>>(new Map());
  const selectNode = useControlTowerStore((s) => s.selectNode);
  const upsertVehicle = useControlTowerStore((s) => s.upsertVehicle);
  const pushEvent = useControlTowerStore((s) => s.pushEvent);
  const filters = useControlTowerStore((s) => s.filters);

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
      // eslint-disable-next-line no-console
      console.error("[maplibre error]", e.error?.message ?? e);
    });

    map.on("load", async () => {
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
          "circle-stroke-color": "#0f172a",
        },
      });

      map.addSource("vehicles", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "vehicles-circle",
        type: "circle",
        source: "vehicles",
        paint: {
          "circle-radius": 4,
          "circle-color": "#22d3ee",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#083344",
        },
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

      const [nodes, routes] = await Promise.all([api.listNodes(), api.listRoutes({})]);
      const nodesById = new Map(nodes.map((n) => [n.id, n]));
      nodesByIdRef.current = nodesById;

      (map.getSource("nodes") as GeoJSONSource).setData(nodesToGeoJSON(nodes));
      (map.getSource("routes") as GeoJSONSource).setData(routesToGeoJSON(routes, nodesById));
    });

    return () => {
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

  // Live vehicle positions.
  const vehiclesRef = useRef<Map<string, VehicleLiveUpdate>>(new Map());
  useLiveChannel<VehicleLiveUpdate>("vehicles", (update) => {
    vehiclesRef.current.set(update.vehicle_id, update);
    upsertVehicle(update);
    const map = mapRef.current;
    const source = map?.getSource("vehicles") as GeoJSONSource | undefined;
    if (!source) return;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: Array.from(vehiclesRef.current.values()).map((v) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [v.longitude, v.latitude] },
        properties: { id: v.vehicle_id, registration_number: v.registration_number, status: v.status },
      })),
    };
    source.setData(fc);
  });

  // Live package status changes feed the bottom event stream.
  useLiveChannel<PackageLiveUpdate>("packages", (update) => pushEvent(update));

  return <div ref={containerRef} className="h-full w-full" />;
}
