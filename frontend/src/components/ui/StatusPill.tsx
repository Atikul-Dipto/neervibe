import clsx from "clsx";
import type { SlaState } from "@/data/derive";
import type { PackageStatus } from "@/types/domain";

export type Tone = "accent" | "good" | "warning" | "danger" | "neutral" | "info" | "ai";

const TONE_CLASSES: Record<Tone, string> = {
  accent: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
  good: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  warning: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  danger: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  neutral: "text-ink-600 border-nv-700 bg-nv-850",
  info: "text-blue-300 border-blue-500/40 bg-blue-500/10",
  ai: "text-violet-300 border-violet-500/40 bg-violet-500/10",
};

const DOT_CLASSES: Record<Tone, string> = {
  accent: "bg-cyan-400",
  good: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  neutral: "bg-ink-500",
  info: "bg-blue-400",
  ai: "bg-violet-400",
};

export function StatusPill({
  tone = "neutral",
  children,
  withDot = false,
  className,
  size = "sm",
}: {
  tone?: Tone;
  children: React.ReactNode;
  withDot?: boolean;
  className?: string;
  size?: "xs" | "sm";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap",
        size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {withDot && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])} />}
      {children}
    </span>
  );
}

export function packageStatusTone(status: PackageStatus): Tone {
  switch (status) {
    case "DELIVERED":
      return "good";
    case "DELIVERY_FAILED":
    case "LOST":
    case "DAMAGED":
      return "danger";
    case "RETURNED":
    case "RETURN_REQUESTED":
    case "RETURN_IN_TRANSIT":
    case "RESCHEDULED":
      return "warning";
    case "CANCELLED":
      return "neutral";
    case "OUT_FOR_DELIVERY":
      return "info";
    default:
      return "accent";
  }
}

export function slaTone(sla: SlaState): Tone {
  switch (sla) {
    case "on_track":
    case "met":
      return "good";
    case "at_risk":
      return "warning";
    case "breached":
    case "missed":
      return "danger";
    default:
      return "neutral";
  }
}

export function genericStatusTone(status: string): Tone {
  if (["OPERATIONAL", "EN_ROUTE", "IDLE", "AVAILABLE", "ACTIVE"].includes(status)) return "good";
  if (["CONGESTED", "DEGRADED", "LOADING", "UNLOADING", "ON_DELIVERY", "ON_PICKUP"].includes(status)) return "warning";
  if (["OFF_DUTY", "SUSPENDED"].includes(status)) return "neutral";
  return "danger";
}

export function priorityTone(priority: string): Tone {
  switch (priority) {
    case "critical":
    case "URGENT":
      return "danger";
    case "high":
    case "HIGH":
      return "warning";
    case "medium":
    case "NORMAL":
      return "info";
    default:
      return "neutral";
  }
}
