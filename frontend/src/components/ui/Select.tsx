import { type SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className={clsx("relative", className)}>
        <select
          ref={ref}
          className="w-full appearance-none rounded-md border border-nv-700 bg-nv-950/60 px-3 py-1.5 pr-8 text-sm text-ink-900 transition-colors hover:border-nv-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500"
          aria-hidden
        />
      </div>
    );
  },
);
