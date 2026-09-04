import type { ReactNode } from "react";
import clsx from "clsx";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-3 flex flex-wrap items-end justify-between gap-2", className)}>
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-ink-900">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-[1800px] p-3 md:p-4", className)}>{children}</div>;
}

export function Section({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("mb-3", className)}>
      {(title || right) && (
        <div className="mb-1.5 flex items-center justify-between">
          {title && <h2 className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
