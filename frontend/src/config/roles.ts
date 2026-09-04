// Role-based access, applied client-side to navigation and route guards.
// The backend has no authentication yet (roadmap Phase 2), so the active
// role is a *session* choice made on the Administration page and stored in
// the browser. It shapes what the UI shows; it is not a security boundary.

export type RoleKey =
  | "super_admin"
  | "operations_manager"
  | "fleet_manager"
  | "warehouse_manager"
  | "finance"
  | "merchant";

export interface RoleDef {
  key: RoleKey;
  name: string;
  description: string;
  /** Routes the role may open. "*" = everything. */
  routes: string[] | "*";
  /** Whether the role can perform write actions (dispatch, status changes, exception workflow). */
  canAct: boolean;
}

export const ROLES: RoleDef[] = [
  { key: "super_admin", name: "Super Admin", description: "Everything, including administration.", routes: "*", canAct: true },
  {
    key: "operations_manager",
    name: "Operations Manager",
    description: "Runs the day: control tower, shipments, dispatch, hubs, riders and exceptions.",
    routes: ["/", "/control-tower", "/shipments", "/dispatch", "/hubs", "/riders", "/exceptions", "/analytics", "/ai"],
    canAct: true,
  },
  {
    key: "fleet_manager",
    name: "Fleet Manager",
    description: "Vehicles, drivers and the route network.",
    routes: ["/", "/fleet", "/riders", "/network", "/control-tower"],
    canAct: true,
  },
  {
    key: "warehouse_manager",
    name: "Warehouse Manager",
    description: "Hub capacity, sorting queues and the shipments moving through them.",
    routes: ["/", "/hubs", "/shipments", "/exceptions"],
    canAct: true,
  },
  {
    key: "finance",
    name: "Finance",
    description: "COD, settlement, revenue and cost.",
    routes: ["/", "/finance", "/merchants", "/analytics"],
    canAct: false,
  },
  {
    key: "merchant",
    name: "Merchant",
    description: "A merchant's own shipments, returns, COD and analytics.",
    routes: ["/", "/shipments", "/returns", "/finance", "/analytics"],
    canAct: false,
  },
];

export const ROLE_BY_KEY: Record<RoleKey, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.key, r])) as Record<RoleKey, RoleDef>;

/** Administration is where the session role is chosen, so it stays reachable
 * from every role; its write-level settings are guarded inside the page. */
const ALWAYS_ALLOWED = ["/admin"];

export function roleAllows(role: RoleKey, route: string): boolean {
  if (ALWAYS_ALLOWED.some((r) => route === r || route.startsWith(`${r}/`))) return true;
  const def = ROLE_BY_KEY[role];
  if (!def) return false;
  if (def.routes === "*") return true;
  return def.routes.some((r) => (r === "/" ? route === "/" : route === r || route.startsWith(`${r}/`)));
}
