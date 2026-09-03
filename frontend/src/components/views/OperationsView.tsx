"use client";

import { useAnalyticsOverview } from "@/hooks/useAnalyticsOverview";
import { StatCard, StatSection } from "./StatCard";
import { StatCardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";

function formatMinutes(value: number | null): string {
  if (value == null) return "No data";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${minutes}m`;
}

function formatPct(value: number | null): string {
  return value == null ? "No data" : `${value.toFixed(1)}%`;
}

export function OperationsView() {
  const { data, loading, error } = useAnalyticsOverview();

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-zinc-100">Operations</h1>

      {loading && (
        <StatSection title="Timing">
          {Array.from({ length: 3 }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </StatSection>
      )}
      {error && <ErrorState message={error} />}

      {data && (
        <>
          <StatSection title="Timing">
            <StatCard label="Avg. Delivery Time" value={formatMinutes(data.operations.avg_delivery_time_minutes)} />
            <StatCard label="Avg. Pickup Time" value={formatMinutes(data.operations.avg_pickup_time_minutes)} />
            <StatCard label="Hub Processing Time" value={formatMinutes(data.operations.hub_processing_time_minutes)} />
          </StatSection>

          <StatSection title="Delivery Performance">
            <StatCard
              label="On-Time Delivery Rate"
              value={formatPct(data.operations.on_time_delivery_rate_pct)}
              tone={
                data.operations.on_time_delivery_rate_pct == null
                  ? "default"
                  : data.operations.on_time_delivery_rate_pct >= 90
                    ? "good"
                    : data.operations.on_time_delivery_rate_pct >= 70
                      ? "warn"
                      : "bad"
              }
            />
            <StatCard
              label="SLA Breach Rate"
              value={formatPct(data.operations.sla_breach_rate_pct)}
              tone={
                data.operations.sla_breach_rate_pct == null
                  ? "default"
                  : data.operations.sla_breach_rate_pct <= 10
                    ? "good"
                    : data.operations.sla_breach_rate_pct <= 30
                      ? "warn"
                      : "bad"
              }
            />
            <StatCard
              label="First-Attempt Delivery Rate"
              value={formatPct(data.operations.first_attempt_delivery_rate_pct)}
            />
          </StatSection>

          <StatSection title="Exceptions">
            <StatCard
              label="Return Rate"
              value={formatPct(data.operations.return_rate_pct)}
              tone={data.operations.return_rate_pct > 10 ? "warn" : "default"}
            />
            <StatCard
              label="Cancellation Rate"
              value={formatPct(data.operations.cancellation_rate_pct)}
              tone={data.operations.cancellation_rate_pct > 10 ? "warn" : "default"}
            />
          </StatSection>
        </>
      )}
    </div>
  );
}
