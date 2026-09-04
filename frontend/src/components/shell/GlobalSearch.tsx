"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Package, Search, Store, Truck, Users, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { NAV_ITEMS } from "@/config/navigation";
import { useDerived } from "@/data/provider";
import { useDrawerStore, type DrawerKind } from "@/data/drawer";
import { Kbd } from "@/components/ui/primitives";

interface Hit {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  group: string;
  run: () => void;
}

/** Searches pages and every entity in the snapshot. ⌘K / Ctrl+K to focus. */
export function GlobalSearch() {
  const router = useRouter();
  const derived = useDerived();
  const openDrawer = useDrawerStore((s) => s.open);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: Hit[] = [];
    const show = (kind: DrawerKind, id: string) => () => {
      openDrawer(kind, id);
      setOpen(false);
    };
    for (const n of NAV_ITEMS) {
      if (n.label.toLowerCase().includes(term) || n.hint.toLowerCase().includes(term)) {
        out.push({ key: `page:${n.route}`, icon: n.icon, title: n.label, subtitle: n.hint, group: "Pages", run: () => { router.push(n.route); setOpen(false); } });
      }
    }
    let n = 0;
    for (const s of derived.shipments) {
      if (n >= 6) break;
      if (s.trackingNumber.toLowerCase().includes(term) || s.pkg.order_id.toLowerCase().startsWith(term) || s.customerName.toLowerCase().includes(term)) {
        out.push({ key: `s:${s.id}`, icon: Package, title: s.trackingNumber, subtitle: `${s.status.replaceAll("_", " ")} · ${s.merchantName} → ${s.city}`, group: "Shipments", run: show("shipment", s.id) });
        n += 1;
      }
    }
    for (const h of derived.hubs.filter((h) => h.name.toLowerCase().includes(term) || h.city.toLowerCase().includes(term)).slice(0, 4)) {
      out.push({ key: `h:${h.id}`, icon: Building2, title: h.name, subtitle: `${h.node.node_type.replaceAll("_", " ")} · ${h.city} · ${Math.round(h.utilization * 100)}% utilised`, group: "Hubs", run: show("hub", h.id) });
    }
    for (const r of derived.riders.filter((r) => r.name.toLowerCase().includes(term) || (r.city ?? "").toLowerCase().includes(term)).slice(0, 4)) {
      out.push({ key: `r:${r.id}`, icon: Users, title: r.name, subtitle: `${r.rider.status.replaceAll("_", " ")} · ${r.city ?? "—"} · ${r.active.length} active`, group: "Riders", run: show("rider", r.id) });
    }
    for (const v of derived.vehicles.filter((v) => v.registration_number.toLowerCase().includes(term)).slice(0, 4)) {
      out.push({ key: `v:${v.id}`, icon: Truck, title: v.registration_number, subtitle: `${v.vehicle_type.replaceAll("_", " ")} · ${v.status}`, group: "Fleet", run: show("vehicle", v.id) });
    }
    for (const m of derived.merchants.filter((m) => m.name.toLowerCase().includes(term)).slice(0, 4)) {
      out.push({ key: `m:${m.id}`, icon: Store, title: m.name, subtitle: `${m.total} shipments · ${m.city ?? "—"}`, group: "Merchants", run: show("merchant", m.id) });
    }
    return out.slice(0, 14);
  }, [q, derived, openDrawer, router]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(hits.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      hits[cursor]?.run();
      setQ("");
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  let lastGroup = "";
  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" aria-hidden />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search shipments, hubs, riders, vehicles, pages…"
        aria-label="Global search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="global-search-results"
        className="w-full rounded-md border border-nv-700 bg-nv-950/60 py-1.5 pl-8 pr-14 text-sm text-ink-900 placeholder:text-ink-500 transition-colors hover:border-nv-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 gap-0.5 md:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
      {open && q.trim() && (
        <div id="global-search-results" role="listbox" className="layer-popover absolute left-0 right-0 mt-1 max-h-96 overflow-y-auto rounded-md border border-nv-700 bg-nv-900 p-1 shadow-[var(--shadow-lg)] animate-[rise-in_120ms_ease-out]">
          {hits.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-ink-500">No matches for “{q.trim()}”.</div>
          ) : (
            hits.map((h, i) => {
              const header = h.group !== lastGroup ? h.group : null;
              lastGroup = h.group;
              return (
                <div key={h.key}>
                  {header && <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{header}</div>}
                  <button
                    role="option"
                    aria-selected={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      h.run();
                      setQ("");
                    }}
                    className={clsx("flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left", i === cursor ? "bg-nv-850 text-ink-900" : "text-ink-700")}
                  >
                    <h.icon className="h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{h.title}</span>
                      <span className="block truncate text-[11px] text-ink-500">{h.subtitle}</span>
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
