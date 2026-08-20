"use client";

import { TopNav } from "@/components/layout/TopNav";
import { LeftPanel } from "@/components/layout/LeftPanel";
import { RightPanel } from "@/components/layout/RightPanel";
import { EventStream } from "@/components/layout/EventStream";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { LiveDataProvider } from "@/components/providers/LiveDataProvider";
import { OperationsView } from "@/components/views/OperationsView";
import { PackagesView } from "@/components/views/PackagesView";
import { VehiclesView } from "@/components/views/VehiclesView";
import { HubsView } from "@/components/views/HubsView";
import { AnalyticsView } from "@/components/views/AnalyticsView";
import { AIIntelligenceView } from "@/components/views/AIIntelligenceView";
import { useControlTowerStore } from "@/store/useControlTowerStore";

export default function Home() {
  const activeView = useControlTowerStore((s) => s.activeView);

  return (
    <div className="flex h-full flex-col">
      <LiveDataProvider />
      <TopNav />
      <div className="flex min-h-0 flex-1">
        {activeView === "network" && <LeftPanel />}
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          {activeView === "network" && <MapViewLoader />}
          {activeView === "operations" && <OperationsView />}
          {activeView === "packages" && <PackagesView />}
          {activeView === "vehicles" && <VehiclesView />}
          {activeView === "hubs" && <HubsView />}
          {activeView === "analytics" && <AnalyticsView />}
          {activeView === "ai" && <AIIntelligenceView />}
        </main>
        <RightPanel />
      </div>
      <EventStream />
    </div>
  );
}
