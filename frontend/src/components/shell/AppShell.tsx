"use client";

import { Suspense, useState } from "react";
import { usePathname } from "next/navigation";
import { DataProvider } from "@/data/provider";
import { LiveDataProvider } from "@/components/providers/LiveDataProvider";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { FilterBar } from "./FilterBar";
import { FilterUrlSync } from "./FilterUrlSync";
import { RouteGuard } from "./RouteGuard";
import { DetailDrawer } from "@/components/drawer/DetailDrawer";

// Pages where the global filter bar has nothing to act on.
const NO_FILTER_BAR = ["/admin", "/ai"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNav, setMobileNav] = useState(false);
  const showFilters = !NO_FILTER_BAR.some((p) => pathname.startsWith(p));

  return (
    <DataProvider>
      <LiveDataProvider />
      <Suspense fallback={null}>
        <FilterUrlSync />
      </Suspense>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-nv-900 focus:px-2 focus:py-1 focus:text-xs">
        Skip to content
      </a>
      <div className="flex h-full">
        <Sidebar mobileOpen={mobileNav} onMobileClose={() => setMobileNav(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setMobileNav(true)} />
          {showFilters && <FilterBar />}
          <div className="relative flex min-h-0 flex-1">
            {/* `layer-content` isolates the page: nothing inside it can paint above
                the top bar, filter bar or sidebar, whatever z-index it sets. */}
            <main id="main" className="layer-content relative min-w-0 flex-1 overflow-y-auto">
              <RouteGuard>{children}</RouteGuard>
            </main>
            <DetailDrawer />
          </div>
        </div>
      </div>
    </DataProvider>
  );
}
