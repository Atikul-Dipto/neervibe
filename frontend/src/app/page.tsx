"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import {
  CityPerformanceCard,
  DataGate,
  ExceptionsCard,
  HubLoadCard,
  RiderUtilizationCard,
  ShipmentKpiStrip,
  ShipmentTrendCard,
  SlaTrendCard,
  StatusDistributionCard,
  usePageData,
} from "@/components/pages/common";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { EventStream } from "@/components/layout/EventStream";
import { Card, CardHeader } from "@/components/ui/Card";
import { financeFor } from "@/data/derive";
import { buildOpsBrief } from "@/ai/brief";
import { detectAnomalies } from "@/ai/anomaly";
import { useDataStatus } from "@/data/provider";
import { formatRelative } from "@/data/format";
import { effectiveLists } from "@/data/filters";

export default function CommandCenterPage() {
  return (
    <DataGate>
      <CommandCenter />
    </DataGate>
  );
}

function CommandCenter() {
  const { derived, shipments, previous, daily, windowLabel, filters, cross } = usePageData();
  const { loadedAt, refreshing } = useDataStatus();
  const lists = effectiveLists(filters, cross);
  const hubs = useMemo(() => derived.hubs.filter((h) => (!lists.cities.length || lists.cities.includes(h.city)) && (!lists.divisions.length || (h.division && lists.divisions.includes(h.division)))), [derived.hubs, lists.cities, lists.divisions]);
  const riders = useMemo(() => derived.riders.filter((r) => !lists.cities.length || (r.city && lists.cities.includes(r.city))), [derived.riders, lists.cities]);
  const exceptions = useMemo(() => derived.exceptions.filter((e) => (!lists.cities.length || (e.city && lists.cities.includes(e.city))) && (!lists.divisions.length || (e.division && lists.divisions.includes(e.division)))), [derived.exceptions, lists.cities, lists.divisions]);
  const brief = useMemo(() => {
    const anomalies = detectAnomalies(derived, daily);
    return buildOpsBrief(derived, shipments, previous, financeFor(shipments, derived.now), anomalies, exceptions, windowLabel);
  }, [derived, shipments, previous, daily, exceptions, windowLabel]);

  return (
    <Page>
      <PageHeader
        title="Command Center"
        description={`Executive and operational overview · snapshot ${loadedAt ? formatRelative(new Date(loadedAt)) : "loading"}${refreshing ? " · refreshing" : ""}`}
      />
      <ShipmentKpiStrip shipments={shipments} previous={previous} daily={daily} mode="drill" />

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card className="relative h-[380px] overflow-hidden xl:col-span-2">
          <div className="absolute left-3 top-3 z-10 rounded-md border border-nv-700 bg-nv-900/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500 backdrop-blur">Live network</div>
          <Link href="/control-tower" className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-nv-700 bg-nv-900/85 px-2 py-1 text-[11px] text-ink-700 backdrop-blur hover:text-ink-900">
            Control tower <ArrowRight className="h-3 w-3" />
          </Link>
          <MapViewLoader />
        </Card>
        <AiBriefCard brief={brief} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ShipmentTrendCard daily={daily} />
        <SlaTrendCard daily={daily} />
        <StatusDistributionCard shipments={shipments} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <CityPerformanceCard shipments={shipments} />
        <HubLoadCard hubs={hubs} />
        <RiderUtilizationCard riders={riders} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <ExceptionsCard exceptions={exceptions} />
        <EventStream className="h-72" />
      </div>
    </Page>
  );
}

function AiBriefCard({ brief }: { brief: ReturnType<typeof buildOpsBrief> }) {
  const toneClass = { neutral: "bg-ink-500", good: "bg-emerald-400", warning: "bg-amber-400", danger: "bg-rose-400" };
  return (
    <Card className="flex h-[380px] flex-col border-violet-500/30">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-violet-300" /> AI Operations Brief
          </span>
        }
        subtitle={`Generated ${formatRelative(new Date(brief.generatedAt))} · rule-based, every figure traceable`}
        actions={
          <Link href="/ai" className="text-[11px] text-violet-300 hover:underline">
            Copilot
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <p className="mb-3 text-sm text-ink-900">{brief.headline}</p>
        {brief.sections.map((sec) => (
          <div key={sec.title} className="mb-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{sec.title}</div>
            <ul className="space-y-1">
              {sec.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ink-700">
                  <span className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", toneClass[b.tone])} />
                  {b.href ? (
                    <Link href={b.href} className="hover:text-ink-900 hover:underline">
                      {b.text}
                    </Link>
                  ) : (
                    <span>{b.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">Recommended actions</div>
        <ul className="space-y-1.5">
          {brief.actions.map((a, i) => (
            <li key={i} className="rounded-md border border-violet-500/25 bg-violet-500/5 px-2.5 py-2 text-xs">
              <div className="text-ink-900">{a.action}</div>
              <div className="mt-0.5 text-[11px] text-ink-500">
                {a.impact} · confidence {Math.round(a.confidence * 100)}%
                {a.href && (
                  <Link href={a.href} className="ml-1 text-violet-300 hover:underline">
                    Go →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
