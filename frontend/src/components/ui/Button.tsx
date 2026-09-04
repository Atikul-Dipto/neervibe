import { type ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ai";
type Size = "xs" | "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-[var(--shadow-sm)] hover:bg-primary-hover disabled:hover:bg-primary",
  secondary: "border border-nv-700 bg-nv-900 text-ink-900 hover:border-nv-600 hover:bg-nv-850",
  ghost: "text-ink-600 hover:bg-nv-850 hover:text-ink-900",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500",
  ai: "bg-ai-deep text-white hover:bg-ai",
};

const SIZE_CLASSES: Record<Size, string> = {
  xs: "px-2 py-1 text-[11px]",
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
});
