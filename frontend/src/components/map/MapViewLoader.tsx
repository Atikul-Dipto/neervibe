"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// MapLibre touches window/DOM directly — must stay client-only. next/dynamic's
// ssr:false option only works inside a Client Component, hence this wrapper.
const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Loading map…
    </div>
  ),
});

export function MapViewLoader() {
  return <MapView />;
}
