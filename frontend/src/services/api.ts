import { API_BASE_URL } from "./config";
import type {
  AnalyticsOverview,
  Customer,
  DeliveryAttempt,
  ETAPredictRequest,
  ETAPredictResponse,
  LogisticsNode,
  LogisticsRoute,
  Merchant,
  Order,
  Package,
  PackageEvent,
  PackageStatusUpdate,
  PackageTracking,
  Rider,
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

/** Walks a limit/offset endpoint until a short page comes back. The API caps
 * pages (500 for most resources), so "everything" is a handful of requests. */
async function listAll<T>(
  page: (limit: number, offset: number) => Promise<T[]>,
  pageSize: number,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const chunk = await page(pageSize, i * pageSize);
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}

export const api = {
  listNodes: (params?: { city?: string; node_type?: string }) =>
    request<LogisticsNode[]>(`/nodes${toQueryString(params)}`),
  getNode: (id: string) => request<LogisticsNode>(`/nodes/${id}`),

  listRoutes: (params?: { source_node_id?: string; destination_node_id?: string; limit?: number }) =>
    request<LogisticsRoute[]>(`/routes${toQueryString(params)}`),

  listPackages: (params?: { status?: string; limit?: number; offset?: number }) =>
    request<Package[]>(`/packages${toQueryString(params)}`),
  listAllPackages: () => listAll<Package>((limit, offset) => api.listPackages({ limit, offset }), 500),
  getPackage: (id: string) => request<Package>(`/packages/${id}`),
  updatePackageStatus: (id: string, body: PackageStatusUpdate) =>
    requestJson<Package>(`/packages/${id}/status`, "PATCH", body),

  listOrders: (params?: { customer_id?: string; limit?: number; offset?: number }) =>
    request<Order[]>(`/orders${toQueryString(params)}`),
  listAllOrders: () => listAll<Order>((limit, offset) => api.listOrders({ limit, offset }), 500),

  listVehicles: (params?: { status?: string; limit?: number; offset?: number }) =>
    request<Vehicle[]>(`/vehicles${toQueryString(params)}`),
  getVehicle: (id: string) => request<Vehicle>(`/vehicles/${id}`),

  listRiders: (params?: { status?: string; limit?: number; offset?: number }) =>
    request<Rider[]>(`/riders${toQueryString(params)}`),
  getRider: (id: string) => request<Rider>(`/riders/${id}`),
  assignRiderVehicle: (riderId: string, vehicleId: string) =>
    requestJson<Rider>(`/riders/${riderId}/assign-vehicle`, "PATCH", { vehicle_id: vehicleId }),

  listMerchants: (params?: { city?: string; limit?: number; offset?: number }) =>
    request<Merchant[]>(`/merchants${toQueryString(params)}`),
  listCustomers: (params?: { city?: string; limit?: number; offset?: number }) =>
    request<Customer[]>(`/customers${toQueryString(params)}`),

  listEvents: (params?: { package_id?: string; event_type?: string; limit?: number; offset?: number }) =>
    request<PackageEvent[]>(`/events${toQueryString(params)}`),

  listDeliveryAttempts: (params?: { rider_id?: string; package_id?: string; limit?: number; offset?: number }) =>
    request<DeliveryAttempt[]>(`/delivery-attempts${toQueryString(params)}`),
  listAllDeliveryAttempts: () =>
    listAll<DeliveryAttempt>((limit, offset) => api.listDeliveryAttempts({ limit, offset }), 1000, 5),

  trackPackage: (trackingNumber: string) =>
    request<PackageTracking>(`/tracking/${encodeURIComponent(trackingNumber)}`),

  getAnalyticsOverview: () => request<AnalyticsOverview>("/analytics/overview"),

  predictEta: (data: ETAPredictRequest) =>
    requestJson<ETAPredictResponse>("/ml/eta/predict", "POST", data),

  health: () => request<{ status: string; checks: Record<string, boolean> }>("/health/ready"),
};

export { ApiError };
