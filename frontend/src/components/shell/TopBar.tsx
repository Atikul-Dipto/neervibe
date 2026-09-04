"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Moon, RefreshCw, ShieldCheck, Sun, Wifi, WifiOff } from "lucide-react";
import clsx from "clsx";
import { navItemFor } from "@/config/navigation";
import { ROLE_BY_KEY } from "@/config/roles";
import { api } from "@/services/api";
import { useDerived, useDataStatus } from "@/data/provider";
import { useOpsStore } from "@/data/ops";
import { useSystemStore } from "@/data/system";
import { toggleTheme, useTheme } from "@/data/theme";
import { useDrawerStore } from "@/data/drawer";
import { formatRelative } from "@/data/format";
import { Popover } from "@/components/ui/primitives";
import { StatusPill, priorityTone } from "@/components/ui/StatusPill";
import { GlobalSearch } from "./GlobalSearch";
import { AICommand } from "./AICommand";

const HEALTH_POLL_MS = 60_000;

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const item = navItemFor(pathname);
  return (
    <header className="layer-topbar relative flex h-12 shrink-0 items-center gap-3 border-b border-nv-800 bg-nv-950/90 px-3 backdrop-blur md:px-4">
      <button onClick={onMenu} className="rounded p-1.5 text-ink-500 hover:bg-nv-850 hover:text-ink-900 md:hidden" aria-label="Open navigation">
        <Menu className="h-4 w-4" />
      </button>
      <div className="hidden min-w-0 shrink-0 md:block md:w-44 lg:w-52">
        <div className="truncate text-sm font-semibold text-ink-900">{item?.label ?? "NeerVibe"}</div>
        <div className="truncate text-[11px] text-ink-500">{item?.hint}</div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <GlobalSearch />
        <AICommand />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <SystemStatus />
        <ThemeToggle />
        <Notifications />
        <RoleMenu />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={toggleTheme}
      className="rounded-md p-1.5 text-ink-600 hover:bg-nv-850 hover:text-ink-900"
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function SystemStatus() {
  const ws = useSystemStore((s) => s.ws);
  const apiState = useSystemStore((s) => s.api);
  const checks = useSystemStore((s) => s.apiChecks);
  const latency = useSystemStore((s) => s.apiLatencyMs);
  const setApi = useSystemStore((s) => s.setApi);
  const { loadedAt, refreshing, refresh, warnings, partial, stale } = useDataStatus();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const t0 = performance.now();
      try {
        const res = await api.health();
        if (cancelled) return;
        const allOk = Object.values(res.checks).every(Boolean);
        setApi(res.status === "ready" && allOk ? "ok" : "degraded", res.checks, Math.round(performance.now() - t0));
      } catch {
        if (!cancelled) setApi("down", {}, null);
      }
    };
    void check();
    const t = setInterval(check, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [setApi]);

  const overall = apiState === "down" ? "down" : apiState === "degraded" || ws === "error" || ws === "closed" ? "degraded" : apiState === "ok" && ws === "open" ? "ok" : "unknown";
  const dot = { ok: "bg-emerald-400", degraded: "bg-amber-400", down: "bg-rose-400", unknown: "bg-ink-500" }[overall];

  return (
    <Popover
      align="right"
      width="w-72"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-600 hover:bg-nv-850 hover:text-ink-900" title="System status" aria-label="System status">
          <span className={clsx("h-2 w-2 rounded-full", dot, overall === "ok" && "animate-[breathe_2.4s_ease-in-out_infinite]")} />
          <span className="hidden lg:inline">{overall === "ok" ? "Live" : overall === "degraded" ? "Degraded" : overall === "down" ? "Offline" : "Checking"}</span>
        </button>
      )}
    >
      <div className="p-3 text-xs">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Environment</div>
        <Row label="API" value={apiState === "ok" ? `Ready · ${latency ?? "—"} ms` : apiState === "degraded" ? "Degraded" : apiState === "down" ? "Unreachable" : "Checking…"} ok={apiState === "ok"} bad={apiState === "down"} />
        {Object.entries(checks).map(([k, v]) => (
          <Row key={k} label={`  ${k}`} value={v ? "ok" : "failing"} ok={v} bad={!v} />
        ))}
        <Row label="Live feed" value={ws === "open" ? "Connected" : ws} ok={ws === "open"} bad={ws === "error"} icon={ws === "open" ? Wifi : WifiOff} />
        <Row label="Snapshot" value={loadedAt ? `${formatRelative(new Date(loadedAt))}${stale ? " · revalidating" : partial ? " · history loading" : ""}` : "not loaded"} ok={!!loadedAt && !stale} />
        {warnings.length > 0 && (
          <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            {warnings.slice(-3).map((w, i) => (
              <div key={i} className="truncate" title={w}>
                {w}
              </div>
            ))}
          </div>
        )}
        <button onClick={() => void refresh()} disabled={refreshing} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-nv-700 py-1 text-[11px] text-ink-700 hover:bg-nv-850 disabled:opacity-50">
          <RefreshCw className={clsx("h-3 w-3", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh data now"}
        </button>
      </div>
    </Popover>
  );
}

function Row({ label, value, ok, bad, icon: Icon }: { label: string; value: string; ok?: boolean; bad?: boolean; icon?: typeof Wifi }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex items-center gap-1.5 whitespace-pre text-ink-500">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className={clsx("tabular-nums", bad ? "text-rose-300" : ok ? "text-emerald-300" : "text-ink-700")}>{value}</span>
    </div>
  );
}

function Notifications() {
  const derived = useDerived();
  const seenAt = useOpsStore((s) => s.notificationsSeenAt);
  const markSeen = useOpsStore((s) => s.markNotificationsSeen);
  const workflow = useOpsStore((s) => s.exceptions);
  const openDrawer = useDrawerStore((s) => s.open);
  const seenTs = seenAt ? Date.parse(seenAt) : 0;

  const items = useMemo(
    () =>
      derived.exceptions
        .filter((e) => (e.priority === "critical" || e.priority === "high") && !["resolved", "snoozed"].includes(workflow[e.id]?.status ?? "open"))
        .slice(0, 12),
    [derived.exceptions, workflow],
  );
  const unseen = items.filter((e) => e.detectedAt > seenTs).length;

  return (
    <Popover
      align="right"
      width="w-80"
      onOpenChange={(o) => o && markSeen()}
      trigger={({ toggle }) => (
        <button onClick={toggle} className="relative rounded-md p-1.5 text-ink-600 hover:bg-nv-850 hover:text-ink-900" aria-label={`Notifications, ${unseen} new`}>
          <Bell className="h-4 w-4" />
          {unseen > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{unseen}</span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-96 overflow-y-auto p-1.5">
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Critical & high exceptions</span>
            <Link href="/exceptions" onClick={close} className="text-[11px] text-accent-700 hover:underline">
              Open queue
            </Link>
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-ink-500">Nothing needs attention right now.</div>
          ) : (
            items.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  openDrawer("exception", e.id);
                  close();
                }}
                className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-nv-850"
              >
                <span className="flex items-center gap-2">
                  <StatusPill tone={priorityTone(e.priority)} size="xs">
                    {e.priority}
                  </StatusPill>
                  <span className="truncate text-xs text-ink-900">{e.title}</span>
                </span>
                <span className="truncate text-[11px] text-ink-500">
                  {e.city ?? "Network"} · {formatRelative(new Date(e.detectedAt))}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </Popover>
  );
}

function RoleMenu() {
  const role = useOpsStore((s) => s.role);
  const userName = useOpsStore((s) => s.userName);
  const def = ROLE_BY_KEY[role];
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Popover
      align="right"
      width="w-60"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-nv-850" aria-label="Account and role">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-nv-700 to-nv-600 text-[10px] font-semibold text-ink-900">{initials || "OP"}</span>
          <span className="hidden text-left xl:block">
            <span className="block text-xs text-ink-900">{userName}</span>
            <span className="block text-[10px] text-ink-500">{def.name}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <div className="p-3 text-xs">
          <div className="text-ink-900">{userName}</div>
          <div className="mb-2 flex items-center gap-1 text-[11px] text-ink-500">
            <ShieldCheck className="h-3 w-3" /> {def.name}
          </div>
          <p className="mb-2 text-[11px] text-ink-500">{def.description}</p>
          <Link href="/admin" onClick={close} className="block rounded border border-nv-700 py-1 text-center text-[11px] text-ink-700 hover:bg-nv-850">
            Switch role · Administration
          </Link>
        </div>
      )}
    </Popover>
  );
}
