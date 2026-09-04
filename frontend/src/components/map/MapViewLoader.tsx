"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/data/theme";

// MapLibre touches window/DOM directly — must stay client-only. next/dynamic's
// ssr:false option only works inside a Client Component, hence this wrapper.
const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-ink-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Loading map…
    </div>
  ),
});

export function MapViewLoader() {
  // MapLibre bakes basemap colours into a loaded style, and every custom layer
  // is added once on load. Remounting on a theme change is cheaper and far less
  // error-prone than restyling ~25 layers by hand; MapView remembers the camera
  // across the remount so the view does not jump.
  const theme = useTheme();
  return <MapView key={theme} />;
}
