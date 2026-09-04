"use client";

import { Home, Layers, LocateFixed, Minus, Plus } from "lucide-react";
import clsx from "clsx";

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
  showBoundaries: boolean;
  onToggleBoundaries: () => void;
  followAvailable: boolean;
  following: boolean;
  onToggleFollow: () => void;
}

/** Floating map controls — replaces MapLibre's stock NavigationControl so
 * zoom, "home", boundary toggling and vehicle-follow share one styled stack. */
export function MapControls({
  onZoomIn,
  onZoomOut,
  onHome,
  showBoundaries,
  onToggleBoundaries,
  followAvailable,
  following,
  onToggleFollow,
}: MapControlsProps) {
  return (
    <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2">
      {followAvailable && (
        <ControlButton
          active={following}
          onClick={onToggleFollow}
          title={following ? "Following vehicle — click to stop" : "Follow this vehicle"}
          className={clsx("rounded-lg", following && "animate-[breathe_2.4s_ease-in-out_infinite]")}
        >
          <LocateFixed className="h-4 w-4" />
        </ControlButton>
      )}

      <div className="flex flex-col overflow-hidden rounded-lg border border-nv-800 bg-white/90 shadow-[var(--shadow-md)] backdrop-blur">
        <ControlButton grouped onClick={onZoomIn} title="Zoom in">
          <Plus className="h-4 w-4" />
        </ControlButton>
        <ControlButton grouped onClick={onZoomOut} title="Zoom out">
          <Minus className="h-4 w-4" />
        </ControlButton>
        <ControlButton grouped onClick={onHome} title="Zoom out to the whole network (Esc)">
          <Home className="h-4 w-4" />
        </ControlButton>
      </div>

      <ControlButton
        active={showBoundaries}
        onClick={onToggleBoundaries}
        title={showBoundaries ? "Hide division / district boundaries" : "Show division / district boundaries"}
        className="rounded-lg"
      >
        <Layers className="h-4 w-4" />
      </ControlButton>
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
        "flex h-9 w-9 items-center justify-center transition-all duration-200 active:scale-95",
        grouped
          ? "border-b border-nv-800 last:border-b-0"
          : "border border-nv-800 shadow-[var(--shadow-md)] backdrop-blur",
        // bg utilities are mutually exclusive — never stack a white base
        // under the active plum, or the stylesheet order decides which wins.
        active
          ? "bg-plum text-white hover:bg-plum-hover"
          : "bg-white/90 text-ink-600 hover:bg-accent-300/40 hover:text-ink-900",
        className,
      )}
    >
      {children}
    </button>
  );
}
