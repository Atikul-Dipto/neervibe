import { type InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(
          "w-full rounded-md border border-nv-700 bg-nv-900 px-3 py-1.5 text-sm text-ink-900 placeholder:text-ink-500 transition-colors focus:border-plum focus:outline-none focus:ring-1 focus:ring-plum/25",
          className,
        )}
        {...props}
      />
    );
  },
);
