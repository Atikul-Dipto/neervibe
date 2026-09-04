"use client";

import { Home, Layers, LocateFixed, Minus, Plus } from "lucide-react";
import clsx from "clsx";
import { MAP_LAYER_LABELS, type MapLayerKey } from "@/store/useControlTowerStore";
import { Popover, Toggle } from "@/components/ui/primitives";

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
  layers: Record<MapLayerKey, boolean>;
  onLayer: (key: MapLayerKey, on: boolean) => void;
  followAvailable: boolean;
  following: boolean;
  onToggleFollow: () => void;
}

const LAYER_ORDER: MapLayerKey[] = ["nodes", "routes", "vehicles", "riders", "boundaries", "heatmap", "risk", "labels"];

/** Floating map controls: zoom, home, layer toggles and vehicle-follow. */
export function MapControls({ onZoomIn, onZoomOut, onHome, layers, onLayer, followAvailable, following, onToggleFollow }: MapControlsProps) {
  return (
    <div className="absolute bottom-6 right-3 flex flex-col items-end gap-2">
      {followAvailable && (
        <ControlButton active={following} onClick={onToggleFollow} title={following ? "Following vehicle — click to stop" : "Follow this vehicle"} className={clsx("rounded-md", following && "animate-[breathe_2.4s_ease-in-out_infinite]")}>
          <LocateFixed className="h-4 w-4" />
        </ControlButton>
      )}
      <div className="flex flex-col overflow-hidden rounded-md border border-nv-700 bg-nv-900/90 shadow-[var(--shadow-md)] backdrop-blur">
        <ControlButton grouped onClick={onZoomIn} title="Zoom in">
          <Plus className="h-4 w-4" />
        </ControlButton>
        <ControlButton grouped onClick={onZoomOut} title="Zoom out">
          <Minus className="h-4 w-4" />
        </ControlButton>
        <ControlButton grouped onClick={onHome} title="Zoom out to the whole network">
          <Home className="h-4 w-4" />
        </ControlButton>
      </div>
      <Popover
        align="right"
        width="w-52"
        trigger={({ open, toggle }) => (
          <ControlButton active={open} onClick={toggle} title="Map layers" className="rounded-md">
            <Layers className="h-4 w-4" />
          </ControlButton>
        )}
      >
        <div className="p-2">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Layers</div>
          {LAYER_ORDER.map((key) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 text-xs text-ink-700 hover:bg-nv-850">
              <span>{MAP_LAYER_LABELS[key]}</span>
              <Toggle checked={layers[key]} onChange={(v) => onLayer(key, v)} label={MAP_LAYER_LABELS[key]} />
            </label>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  title,
  active = false,
  grouped = false,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  grouped?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={clsx(
        "flex h-8 w-8 items-center justify-center transition-all duration-200 active:scale-95",
        grouped ? "border-b border-nv-700 last:border-b-0" : "border border-nv-700 shadow-[var(--shadow-md)] backdrop-blur",
        active ? "bg-primary text-white hover:bg-primary-hover" : "bg-nv-900/90 text-ink-600 hover:bg-nv-850 hover:text-ink-900",
        className,
      )}
    >
      {children}
    </button>
  );
}
