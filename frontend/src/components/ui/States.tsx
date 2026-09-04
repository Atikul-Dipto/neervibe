import { AlertTriangle, Inbox, Loader2, RefreshCw, SearchX, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2 py-8 text-sm text-ink-500", className)} role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        "flex items-center gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300" aria-hidden />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <Button variant="secondary" size="xs" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" aria-hidden />
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title?: string;
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-2 px-4 py-10 text-center", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-nv-800 bg-nv-850">
        <Icon className="h-4 w-4 text-ink-500" aria-hidden />
      </span>
      {title && <div className="text-sm font-medium text-ink-900">{title}</div>}
      <div className="max-w-sm text-xs text-ink-500">{message}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Filters or a search produced nothing — offer the way out. */
export function NoResults({ onClear, what = "records", className }: { onClear?: () => void; what?: string; className?: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`No ${what} match`}
      message="Try widening the date range or removing a filter."
      action={
        onClear && (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )
      }
      className={className}
    />
  );
}
