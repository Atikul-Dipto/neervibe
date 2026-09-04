"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

// Small building blocks shared across pages: tabs, chips, progress bars,
// popover menus, toggles and section labels.

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx("flex items-center gap-0.5 rounded-md border border-nv-800 bg-nv-950/50 p-0.5", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={t.key === value}
          onClick={() => onChange(t.key)}
          className={clsx(
            "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
            t.key === value ? "bg-nv-800 text-ink-900 shadow-[var(--shadow-sm)]" : "text-ink-600 hover:text-ink-900",
          )}
        >
          {t.label}
          {t.count != null && <span className="rounded bg-nv-950/60 px-1 text-[10px] tabular-nums text-ink-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  children,
  onRemove,
  tone = "default",
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  tone?: "default" | "accent" | "ai";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 text-[11px]",
        onRemove ? "pr-1" : "pr-2",
        tone === "accent" && "border-accent-500/40 bg-accent-100/60 text-accent-700",
        tone === "ai" && "border-violet-500/40 bg-violet-500/10 text-violet-300",
        tone === "default" && "border-nv-700 bg-nv-850 text-ink-700",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button onClick={onRemove} className="rounded-full p-0.5 text-ink-500 hover:bg-nv-700 hover:text-ink-900" aria-label="Remove">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function Progress({
  value,
  tone = "accent",
  className,
  label,
}: {
  value: number; // 0..1
  tone?: "accent" | "good" | "warning" | "danger" | "ai";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = {
    accent: "bg-cyan-400",
    good: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-rose-400",
    ai: "bg-violet-400",
  }[tone];
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-nv-800", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function utilizationTone(u: number): "good" | "warning" | "danger" {
  return u >= 0.9 ? "danger" : u >= 0.7 ? "warning" : "good";
}

/** Anchored popover that closes on outside click / Escape. */
export function Popover({
  trigger,
  children,
  align = "left",
  width = "w-64",
  open,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internal, setInternal] = useState(false);
  const isOpen = open ?? internal;
  const setOpen = (v: boolean) => {
    setInternal(v);
    onOpenChange?.(v);
  };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open: isOpen, toggle: () => setOpen(!isOpen) })}
      {isOpen && (
        <div
          className={clsx(
            "layer-popover absolute mt-1 rounded-md border border-nv-700 bg-nv-900 shadow-[var(--shadow-lg)] animate-[rise-in_120ms_ease-out]",
            align === "right" ? "right-0" : "left-0",
            width,
          )}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-cyan-400/60 bg-cyan-500/40" : "border-nv-700 bg-nv-800",
      )}
    >
      <span className={clsx("h-3 w-3 rounded-full bg-ink-900 transition-transform", checked ? "translate-x-3.5" : "translate-x-0.5")} />
    </button>
  );
}

export function SectionLabel({ children, className, right }: { children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={clsx("flex items-center justify-between", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{children}</div>
      {right}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-nv-700 bg-nv-950/60 px-1 font-mono text-[10px] text-ink-500">{children}</kbd>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warning" | "danger" | "accent" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "warning" ? "text-amber-300" : tone === "danger" ? "text-rose-300" : tone === "accent" ? "text-cyan-300" : "text-ink-900";
  return (
    <div className="rounded-md border border-nv-800 bg-nv-950/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={clsx("text-sm font-semibold tabular-nums", color)}>{value}</div>
      {hint && <div className="text-[10px] text-ink-500">{hint}</div>}
    </div>
  );
}
