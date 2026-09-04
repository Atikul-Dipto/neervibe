"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import clsx from "clsx";
import { NAV_ITEMS } from "@/config/navigation";
import { roleAllows } from "@/config/roles";
import { useOpsStore } from "@/data/ops";
import { useDerived } from "@/data/provider";

const GROUPS: ("Operate" | "Analyze" | "Manage")[] = ["Operate", "Analyze", "Manage"];

/** Compact icon rail that expands (on hover, or pinned) to show labels. */
export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const role = useOpsStore((s) => s.role);
  const pinned = useOpsStore((s) => s.sidebarExpanded);
  const setPinned = useOpsStore((s) => s.setSidebarExpanded);
  const [hover, setHover] = useState(false);
  const derived = useDerived();
  const expanded = pinned || hover || mobileOpen;
  const openExceptions = derived.exceptions.filter((e) => e.priority === "critical" || e.priority === "high").length;

  const content = (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className={clsx("flex h-12 shrink-0 items-center border-b border-nv-800 px-3", expanded ? "justify-between" : "justify-center")}>
        <Link href="/" className="flex items-center gap-2" onClick={onMobileClose}>
          <span className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-cyan-400 to-blue-600 text-[11px] font-bold text-nv-950">N</span>
          {expanded && (
            <span className="text-sm font-semibold tracking-wide text-ink-900">
              NEER<span className="text-accent-700">VIBE</span>
            </span>
          )}
        </Link>
        {mobileOpen && (
          <button onClick={onMobileClose} className="rounded p-1 text-ink-500 hover:text-ink-900 md:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((n) => n.group === group && roleAllows(role, n.route));
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-2">
              {expanded ? (
                <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{group}</div>
              ) : (
                <div className="mx-3 my-2 h-px bg-nv-800" />
              )}
              {items.map((item) => {
                const active = item.route === "/" ? pathname === "/" : pathname.startsWith(item.route);
                const badge = item.route === "/exceptions" && openExceptions > 0 ? openExceptions : null;
                return (
                  <Link
                    key={item.route}
                    href={item.route}
                    onClick={onMobileClose}
                    title={expanded ? undefined : item.label}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "group relative mx-2 my-0.5 flex items-center gap-3 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                      active ? "bg-accent-100/70 text-ink-900" : "text-ink-600 hover:bg-nv-850 hover:text-ink-900",
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-cyan-400" aria-hidden />}
                    <item.icon className={clsx("h-4 w-4 shrink-0", active ? "text-cyan-300" : "text-ink-500 group-hover:text-ink-700")} aria-hidden />
                    {expanded && <span className="flex-1 truncate">{item.label}</span>}
                    {badge != null && (
                      <span
                        className={clsx(
                          "rounded-full bg-rose-500/20 px-1.5 text-[10px] font-semibold tabular-nums text-rose-300",
                          !expanded && "absolute -right-0.5 -top-0.5 px-1",
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="hidden shrink-0 border-t border-nv-800 p-2 md:block">
        <button
          onClick={() => setPinned(!pinned)}
          className={clsx("flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-xs text-ink-500 hover:bg-nv-850 hover:text-ink-900", !expanded && "justify-center")}
          title={pinned ? "Collapse navigation" : "Keep navigation expanded"}
        >
          {pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          {expanded && <span>{pinned ? "Collapse" : "Pin open"}</span>}
        </button>
      </div>
    </nav>
  );

  return (
    <>
      <aside
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={clsx(
          "layer-sidebar relative hidden h-full shrink-0 border-r border-nv-800 bg-nv-950 transition-[width] duration-200 md:block",
          expanded ? "w-56" : "w-14",
        )}
      >
        {content}
      </aside>
      {mobileOpen && (
        <div className="layer-modal fixed inset-0 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onMobileClose} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-nv-800 bg-nv-950 shadow-[var(--shadow-lg)]">{content}</aside>
        </div>
      )}
    </>
  );
}
