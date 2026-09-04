import { API_BASE_URL } from "./config";
import type {
  AnalyticsOverview,
  ETAPredictRequest,
  ETAPredictResponse,
  LogisticsNode,
  LogisticsRoute,
  Package,
  PackageTracking,
  Vehicle,
} from "@/types/domain";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// URLSearchParams stringifies `undefined`/`null` values as the literal text
// "undefined"/"null" rather than omitting them, so callers passing
// `status: status || undefined` for an "all" filter would otherwise send a
// bogus `?status=undefined` query param. Strip nullish values first.
function toQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

async function requestJson<T>(path: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listNodes: (params?: { city?: string; node_type?: string }) =>
    request<LogisticsNode[]>(`/nodes${toQueryString(params)}`),
  getNode: (id: string) => request<LogisticsNode>(`/nodes/${id}`),

  listRoutes: (params?: { source_node_id?: string; destination_node_id?: string }) =>
    request<LogisticsRoute[]>(`/routes${toQueryString(params)}`),

  listPackages: (params?: { status?: string; limit?: number }) =>
    request<Package[]>(`/packages${toQueryString(params)}`),

  listVehicles: (params?: { status?: string; limit?: number }) =>
    request<Vehicle[]>(`/vehicles${toQueryString(params)}`),

  getVehicle: (id: string) => request<Vehicle>(`/vehicles/${id}`),

  trackPackage: (trackingNumber: string) =>
    request<PackageTracking>(`/tracking/${encodeURIComponent(trackingNumber)}`),

  getAnalyticsOverview: () => request<AnalyticsOverview>("/analytics/overview"),

  predictEta: (data: ETAPredictRequest) =>
    requestJson<ETAPredictResponse>("/ml/eta/predict", "POST", data),

  health: () => request<{ status: string; checks: Record<string, boolean> }>("/health/ready"),
};

export { ApiError };
