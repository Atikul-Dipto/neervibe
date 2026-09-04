// Statistical forecasting over the daily series. Deliberately transparent:
// linear trend + weekly seasonality with an empirical 80% band. It is the
// baseline an ML model would have to beat, and the UI labels it as such.

export interface ForecastPoint {
  date: string;
  ts: number;
  value: number;
  lower: number;
  upper: number;
  kind: "history" | "forecast";
}

export interface ForecastResult {
  points: ForecastPoint[];
  horizon: ForecastPoint[];
  trendPerDay: number;
  seasonality: number[];
  method: string;
  confidence: number;
  mean: number;
  total: number;
}

const DAY = 86400e3;

/**
 * `history` is expected to end with today's (partial) bucket, which is
 * excluded from the fit so a half-finished day does not drag the trend.
 */
export function forecastSeries(history: { date: string; ts: number; value: number }[], horizonDays: number): ForecastResult {
  const fit = history.length > 1 ? history.slice(0, -1) : history;
  const n = fit.length;
  const values = fit.map((h) => h.value);
  const meanAll = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const asHistory = (h: { date: string; ts: number; value: number }): ForecastPoint => ({ ...h, lower: h.value, upper: h.value, kind: "history" });

  if (n < 5) {
    const band = Math.max(1, meanAll * 0.5);
    const lastTs = n ? fit[n - 1].ts : Date.now();
    const horizon: ForecastPoint[] = [];
    for (let h = 1; h <= horizonDays; h++) {
      const ts = lastTs + h * DAY;
      horizon.push({ date: new Date(ts).toISOString().slice(0, 10), ts, value: meanAll, lower: Math.max(0, meanAll - band), upper: meanAll + band, kind: "forecast" });
    }
    return {
      points: [...fit.map(asHistory), ...horizon],
      horizon,
      trendPerDay: 0,
      seasonality: Array(7).fill(1),
      method: "Mean (insufficient history)",
      confidence: 0.3,
      mean: meanAll,
      total: horizon.reduce((s, p) => s + p.value, 0),
    };
  }

  // Linear regression on the most recent window.
  const window = fit.slice(-Math.min(28, n));
  const w = window.length;
  const xs = window.map((_, i) => i);
  const ys = window.map((h) => h.value);
  const xm = xs.reduce((a, b) => a + b, 0) / w;
  const ym = ys.reduce((a, b) => a + b, 0) / w;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < w; i++) {
    sxy += (xs[i] - xm) * (ys[i] - ym);
    sxx += (xs[i] - xm) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = ym - slope * xm;

  // Weekly seasonality once there are two weeks to compare.
  const seasonality = Array(7).fill(1) as number[];
  if (n >= 14 && ym > 0) {
    const byDow: number[][] = Array.from({ length: 7 }, () => []);
    for (const h of fit) byDow[new Date(h.ts).getUTCDay()].push(h.value);
    for (let d = 0; d < 7; d++) {
      const m = byDow[d].length ? byDow[d].reduce((a, b) => a + b, 0) / byDow[d].length : meanAll;
      seasonality[d] = Math.min(1.5, Math.max(0.5, meanAll > 0 ? m / meanAll : 1));
    }
  }

  const residuals = window.map((h, i) => h.value - (intercept + slope * i) * seasonality[new Date(h.ts).getUTCDay()]);
  const std = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, w - 2));
  const lastTs = fit[n - 1].ts;
  const horizon: ForecastPoint[] = [];
  for (let h = 1; h <= horizonDays; h++) {
    const ts = lastTs + h * DAY;
    const base = Math.max(0, (intercept + slope * (w - 1 + h)) * seasonality[new Date(ts).getUTCDay()]);
    const band = 1.28 * std * Math.sqrt(1 + h / w);
    horizon.push({ date: new Date(ts).toISOString().slice(0, 10), ts, value: base, lower: Math.max(0, base - band), upper: base + band, kind: "forecast" });
  }
  const confidence = Math.min(0.92, Math.max(0.35, ym > 0 ? 1 - std / ym : 0.35));
  return {
    points: [...fit.map(asHistory), ...horizon],
    horizon,
    trendPerDay: slope,
    seasonality,
    method: n >= 14 ? "Linear trend × weekly seasonality" : "Linear trend",
    confidence,
    mean: ym,
    total: horizon.reduce((s, p) => s + p.value, 0),
  };
}
