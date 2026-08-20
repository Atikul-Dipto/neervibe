import { TopNav } from "@/components/layout/TopNav";
import { LeftPanel } from "@/components/layout/LeftPanel";
import { RightPanel } from "@/components/layout/RightPanel";
import { EventStream } from "@/components/layout/EventStream";
import { MapViewLoader } from "@/components/map/MapViewLoader";

export default function Home() {
  return (
    <div className="flex h-full flex-col">
      <TopNav />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <main className="relative min-w-0 flex-1">
          <MapViewLoader />
        </main>
        <RightPanel />
      </div>
      <EventStream />
    </div>
  );
}
