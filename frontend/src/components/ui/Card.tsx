import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-nv-800 bg-nv-900 shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}
