import { API_BASE_URL } from "./config";
import type { LogisticsNode, LogisticsRoute, Package, PackageTracking } from "@/types/domain";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listNodes: (params?: { city?: string; node_type?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<LogisticsNode[]>(`/nodes${qs ? `?${qs}` : ""}`);
  },
  getNode: (id: string) => request<LogisticsNode>(`/nodes/${id}`),

  listRoutes: (params?: { source_node_id?: string; destination_node_id?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<LogisticsRoute[]>(`/routes${qs ? `?${qs}` : ""}`);
  },

  listPackages: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams(params as Record<string, string | number> as Record<string, string>).toString();
    return request<Package[]>(`/packages${qs ? `?${qs}` : ""}`);
  },

  trackPackage: (trackingNumber: string) =>
    request<PackageTracking>(`/tracking/${encodeURIComponent(trackingNumber)}`),

  health: () => request<{ status: string; checks: Record<string, boolean> }>("/health/ready"),
};

export { ApiError };
