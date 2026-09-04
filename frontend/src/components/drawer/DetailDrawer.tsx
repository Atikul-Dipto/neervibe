"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { useDrawerStore, type DrawerKind } from "@/data/drawer";
import { useDerived } from "@/data/provider";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { ShipmentDetail } from "./ShipmentDetail";
import { ExceptionDetail } from "./ExceptionDetail";
import { HubDetail, MerchantDetail, NodeDetail, RegionDetail, RiderDetail, RouteDetail, VehicleDetail } from "./EntityDetails";

const KIND_LABELS: Record<DrawerKind, string> = {
  shipment: "Shipment",
  hub: "Hub",
  node: "Facility",
  rider: "Rider",
  vehicle: "Vehicle",
  merchant: "Merchant",
  exception: "Exception",
  route: "Route",
  region: "Area",
  customer: "Customer",
};

const MAP_PAGES = ["/control-tower", "/network", "/fleet"];

/** The right-side contextual panel. Opened from anywhere via useDrawerStore. */
export function DetailDrawer() {
  const item = useDrawerStore((s) => s.item);
  const history = useDrawerStore((s) => s.history);
  const close = useDrawerStore((s) => s.close);
  const back = useDrawerStore((s) => s.back);
  const pathname = usePathname();
  const derived = useDerived();
  const ct = useControlTowerStore();

  // Keep the map in step with whatever is open, on pages that show a map:
  // opening a hub flies to it, closing the panel zooms back out.
  useEffect(() => {
    if (!MAP_PAGES.some((p) => pathname.startsWith(p))) return;
    if (!item) {
      if (ct.selectedNode || ct.selectedVehicle || ct.selectedTrackingNumber || ct.selectedRegion) ct.clearSelection();
      return;
    }
    if (item.kind === "hub" || item.kind === "node" || item.kind === "customer") {
      const node = derived.nodesById.get(item.id);
      if (node && ct.selectedNode?.id !== node.id) ct.selectNode(node);
    } else if (item.kind === "vehicle") {
      const v = derived.vehiclesById.get(item.id);
      if (v && ct.selectedVehicle?.id !== v.id) ct.selectVehicle(v);
    } else if (item.kind === "shipment") {
      const s = derived.shipmentsById.get(item.id);
      if (s && ct.selectedTrackingNumber !== s.trackingNumber) ct.selectTrackingNumber(s.trackingNumber);
    } else if (item.kind === "region") {
      const f = derived.regions?.byId.get(item.id);
      if (f && ct.selectedRegion?.id !== f.properties.id) ct.selectRegion(f.properties);
    } else if (item.kind === "rider") {
      const r = derived.ridersById.get(item.id);
      const node = r?.baseNode;
      if (node && ct.selectedNode?.id !== node.id) ct.selectNode(node);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && item) {
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, close]);

  if (!item) return null;

  return (
    <aside
      role="complementary"
      aria-label={`${KIND_LABELS[item.kind]} detail`}
      className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-nv-800 bg-nv-950 shadow-[var(--shadow-lg)] animate-[slide-in-right_160ms_ease-out] sm:w-[400px] md:static md:z-auto md:shrink-0"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-nv-800 px-2">
        {history.length > 0 ? (
          <button onClick={back} className="rounded p-1 text-ink-500 hover:bg-nv-850 hover:text-ink-900" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-6" />
        )}
        <span className="flex-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-500">{KIND_LABELS[item.kind]}</span>
        <button onClick={close} className="group rounded p-1 text-ink-500 hover:bg-nv-850 hover:text-ink-900" aria-label="Close panel (Esc)">
          <X className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {item.kind === "shipment" && <ShipmentDetail id={item.id} />}
        {item.kind === "hub" && <HubDetail id={item.id} />}
        {item.kind === "node" && <NodeDetail id={item.id} />}
        {item.kind === "rider" && <RiderDetail id={item.id} />}
        {item.kind === "vehicle" && <VehicleDetail id={item.id} />}
        {item.kind === "merchant" && <MerchantDetail id={item.id} />}
        {item.kind === "exception" && <ExceptionDetail id={item.id} />}
        {item.kind === "route" && <RouteDetail id={item.id} />}
        {item.kind === "region" && <RegionDetail id={item.id} />}
        {item.kind === "customer" && <NodeDetail id={item.id} />}
      </div>
    </aside>
  );
}
