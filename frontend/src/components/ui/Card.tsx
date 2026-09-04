import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Hover treatment + pointer cursor; pair with onClick. */
  interactive?: boolean;
  /** Accent border, used for the visualisation that owns the active cross-filter. */
  selected?: boolean;
}

export function Card({ className, interactive, selected, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-lg border bg-nv-900 shadow-[var(--shadow-sm)] transition-colors",
        selected ? "border-accent-500/70 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]" : "border-nv-800",
        interactive && "cursor-pointer hover:border-nv-600 hover:bg-nv-850/60",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-3 px-4 pt-3.5 pb-2", className)}>
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold text-ink-900">{title}</h3>
        {subtitle && <div className="mt-0.5 text-[11px] text-ink-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}
