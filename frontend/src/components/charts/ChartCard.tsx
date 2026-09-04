import type { ReactNode } from "react";
import clsx from "clsx";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Frame for every visualisation: title, context line, an "active" state
 * when the chart owns the page's current cross-filter, and consistent
 * loading / empty treatments.
 */
export function ChartCard({
  title,
  subtitle,
  actions,
  active,
  activeLabel,
  loading,
  empty,
  emptyMessage = "Nothing to chart for the current filters.",
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  active?: boolean;
  activeLabel?: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card selected={active} className={clsx("flex min-w-0 flex-col", className)}>
      <CardHeader
        title={title}
        subtitle={active && activeLabel ? <span className="text-accent-700">Filtering by {activeLabel}</span> : subtitle}
        actions={actions}
      />
      <div className={clsx("min-w-0 flex-1 px-3 pb-3", bodyClassName)}>
        {loading ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : empty ? (
          <EmptyState message={emptyMessage} className="py-6" />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
