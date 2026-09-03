import { type SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={clsx(
            "w-full appearance-none rounded-md border border-nv-700 bg-nv-900 px-3 py-1.5 pr-8 text-sm text-zinc-200 transition-colors focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/40",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
          aria-hidden
        />
      </div>
    );
  },
);
