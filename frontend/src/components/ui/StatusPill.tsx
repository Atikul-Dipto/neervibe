import clsx from "clsx";

export type Tone = "accent" | "good" | "warning" | "danger" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  accent: "text-teal-300 border-teal-500/40 bg-teal-500/10",
  good: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  warning: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  danger: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  neutral: "text-zinc-400 border-zinc-600 bg-zinc-800/60",
};

const DOT_CLASSES: Record<Tone, string> = {
  accent: "bg-teal-400",
  good: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  neutral: "bg-zinc-500",
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
