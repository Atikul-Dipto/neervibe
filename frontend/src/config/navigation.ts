import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  LayoutDashboard,
  Network,
  Package,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { RoleKey } from "./roles";

export interface NavItem {
  label: string;
  route: string;
  icon: LucideIcon;
  group: "Operate" | "Analyze" | "Manage";
  /** Short description shown in the expanded rail and in the global search. */
  hint: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Command Center", route: "/", icon: LayoutDashboard, group: "Operate", hint: "Executive and operational overview" },
  { label: "Control Tower", route: "/control-tower", icon: Activity, group: "Operate", hint: "Live map, queue and detail" },
  { label: "Shipments", route: "/shipments", icon: Package, group: "Operate", hint: "Full shipment lifecycle" },
  { label: "Dispatch", route: "/dispatch", icon: Send, group: "Operate", hint: "Rider assignment and last mile" },
  { label: "Hubs", route: "/hubs", icon: Building2, group: "Operate", hint: "Warehouse and hub operations" },
  { label: "Fleet", route: "/fleet", icon: Truck, group: "Operate", hint: "Vehicles and transport" },
  { label: "Riders", route: "/riders", icon: Users, group: "Operate", hint: "Workforce intelligence" },
  { label: "Returns", route: "/returns", icon: RotateCcw, group: "Operate", hint: "Reverse logistics" },
  { label: "Exceptions", route: "/exceptions", icon: AlertTriangle, group: "Operate", hint: "Central exception management" },
  { label: "Merchants", route: "/merchants", icon: Store, group: "Analyze", hint: "Merchant performance" },
  { label: "COD & Finance", route: "/finance", icon: Wallet, group: "Analyze", hint: "Cash on delivery and profitability" },
  { label: "Analytics", route: "/analytics", icon: BarChart3, group: "Analyze", hint: "Advanced logistics BI" },
  { label: "Forecasting", route: "/forecasting", icon: TrendingUp, group: "Analyze", hint: "Next day, week and month" },
  { label: "AI Intelligence", route: "/ai", icon: Sparkles, group: "Analyze", hint: "Copilot, anomalies, simulation" },
  { label: "Network", route: "/network", icon: Network, group: "Manage", hint: "Strategic network planning" },
  { label: "Administration", route: "/admin", icon: Settings, group: "Manage", hint: "Roles, system, audit" },
];

export function navItemFor(pathname: string): NavItem | undefined {
  if (pathname === "/") return NAV_ITEMS[0];
  return NAV_ITEMS.find((n) => n.route !== "/" && pathname.startsWith(n.route));
}

export function itemsForRole(allowed: (route: string) => boolean): NavItem[] {
  return NAV_ITEMS.filter((n) => allowed(n.route));
}

export type { RoleKey };
