"use client";

import clsx from "clsx";

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** A single stacked distribution bar with a clickable legend. */
export function SegmentBar({
  segments,
  onClick,
  activeKey,
  className,
  height = 10,
}: {
  segments: Segment[];
  onClick?: (key: string) => void;
  activeKey?: string | null;
  className?: string;
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  if (total === 0) return <div className="py-4 text-center text-xs text-ink-500">No data for the current filters.</div>;
  return (
    <div className={className}>
      <div className="flex w-full overflow-hidden rounded-full bg-nv-800" style={{ height }}>
        {shown.map((s) => (
          <button
            key={s.key}
            onClick={onClick ? () => onClick(s.key) : undefined}
            title={`${s.label}: ${s.value.toLocaleString()} (${Math.round((s.value / total) * 100)}%)`}
            className={clsx("transition-opacity", onClick && "cursor-pointer hover:opacity-80", activeKey && activeKey !== s.key && "opacity-35")}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            aria-label={s.label}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((s) => (
          <button
            key={s.key}
            onClick={onClick ? () => onClick(s.key) : undefined}
            className={clsx(
              "flex items-center gap-1.5 rounded px-1 text-[11px] transition-colors",
              onClick && "hover:bg-nv-850",
              activeKey === s.key ? "text-accent-700" : "text-ink-600",
            )}
            aria-pressed={activeKey === s.key}
          >
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="tabular-nums text-ink-900">{s.value.toLocaleString()}</span>
            <span className="tabular-nums text-ink-500">{Math.round((s.value / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
