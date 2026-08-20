"use client";

import dynamic from "next/dynamic";

// MapLibre touches window/DOM directly — must stay client-only. next/dynamic's
// ssr:false option only works inside a Client Component, hence this wrapper.
const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

export function MapViewLoader() {
  return <MapView />;
}
