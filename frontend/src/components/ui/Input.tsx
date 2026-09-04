import { type InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(
          "w-full rounded-md border border-nv-700 bg-nv-950/60 px-3 py-1.5 text-sm text-ink-900 placeholder:text-ink-500 transition-colors hover:border-nv-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30",
          className,
        )}
        {...props}
      />
    );
  },
);
