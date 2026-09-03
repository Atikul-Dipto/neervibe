import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-nv-800/80", className)} />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-nv-800">
      <div className="border-b border-nv-800 bg-nv-900 px-4 py-2.5">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-nv-800">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-6 px-4 py-3">
            {Array.from({ length: columns }, (_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-nv-800 bg-nv-900/60 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2.5 h-7 w-16" />
    </div>
  );
}
