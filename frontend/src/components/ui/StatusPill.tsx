import clsx from "clsx";

export type Tone = "accent" | "good" | "warning" | "danger" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  // "Active / in progress" wears the plum brand color so it stays distinct
  // from the green `good` tone on the light theme (lime vs emerald read as
  // the same green at pill size).
  accent: "text-plum border-plum/30 bg-plum/[0.06]",
  good: "text-emerald-700 border-emerald-500/40 bg-emerald-500/10",
  warning: "text-amber-700 border-amber-500/40 bg-amber-500/10",
  danger: "text-rose-600 border-rose-300 bg-rose-500/10",
  neutral: "text-ink-600 border-ink-400 bg-ink-300/30",
};

const DOT_CLASSES: Record<Tone, string> = {
  accent: "bg-plum",
  good: "bg-emerald-600",
  warning: "bg-amber-600",
  danger: "bg-rose-600",
  neutral: "bg-ink-500",
};

export function StatusPill({
  tone = "neutral",
  children,
  withDot = false,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {withDot && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])} />}
      {children}
    </span>
  );
}
