// Display formatting shared by every page. Currency is BDT throughout.

const BDT = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");

export function formatBDT(value: number | null | undefined, compact = false): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e7) return `৳${(value / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `৳${(value / 1e5).toFixed(1)} L`;
    if (abs >= 1e3) return `৳${(value / 1e3).toFixed(1)}k`;
  }
  return `৳${BDT.format(Math.round(value))}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return NUM.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return NUM.format(Math.round(value));
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDelta(value: number | null | undefined, digits = 1, suffix = "%"): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const m = Math.round(minutes);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return rest ? `${h}h ${rest}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatHours(hours: number | null | undefined): string {
  return hours == null ? "—" : formatMinutes(hours * 60);
}

export function formatRelative(iso: string | Date | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const diffMin = Math.round((now - t) / 60000);
  if (Math.abs(diffMin) < 1) return "just now";
  const future = diffMin < 0;
  const abs = Math.abs(diffMin);
  let text: string;
  if (abs < 60) text = `${abs} min`;
  else if (abs < 24 * 60) text = `${Math.floor(abs / 60)}h`;
  else text = `${Math.floor(abs / 1440)}d`;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** "OUT_FOR_DELIVERY" -> "Out for delivery" */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replaceAll("_", " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "OUT_FOR_DELIVERY" -> "OUT FOR DELIVERY" (for compact uppercase labels) */
export function label(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "—";
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T; header: string }[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))].join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
