"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/primitives";
import { NAV_ITEMS } from "@/config/navigation";
import { ROLES, roleAllows, type RoleKey } from "@/config/roles";
import { COUNTRY } from "@/config/country";
import { FINANCE } from "@/config/finance";
import { API_BASE_URL, WS_BASE_URL } from "@/services/config";
import { useOpsStore, type AuditEntry } from "@/data/ops";
import { useDataStatus } from "@/data/provider";
import { useSystemStore } from "@/data/system";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { formatDateTime, formatRelative } from "@/data/format";
import { downloadText } from "@/data/format";

type Tab = "roles" | "system" | "audit" | "quality";

export default function AdminPage() {
  return (
    <DataGate>
      <Admin />
    </DataGate>
  );
}

function Admin() {
  const [tab, setTab] = useState<Tab>("roles");
  return (
    <Page>
      <PageHeader title="Administration" description="Roles, system status, audit log and data quality." />
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ key: "roles", label: "Roles & access" }, { key: "system", label: "System" }, { key: "audit", label: "Audit log" }, { key: "quality", label: "Data quality" }]} />
      {tab === "roles" && <RolesTab />}
      {tab === "system" && <SystemTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "quality" && <QualityTab />}
    </Page>
  );
}

function RolesTab() {
  const role = useOpsStore((s) => s.role);
  const setRole = useOpsStore((s) => s.setRole);
  const userName = useOpsStore((s) => s.userName);
  const setUserName = useOpsStore((s) => s.setUserName);
  const [name, setName] = useState(userName);
  return (
    <div className="grid gap-3 xl:grid-cols-[360px_1fr]">
      <Card className="p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Session identity</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setUserName(name.trim() || "Operator");
          }}
          className="mb-4 flex gap-1.5"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          <Button size="sm" type="submit">Save</Button>
        </form>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Session role</div>
        <div className="space-y-1">
          {ROLES.map((r) => (
            <button key={r.key} onClick={() => setRole(r.key)} className={clsx("block w-full rounded-md border p-2.5 text-left transition-colors", role === r.key ? "border-cyan-500/60 bg-cyan-500/10" : "border-nv-800 hover:bg-nv-850")} aria-pressed={role === r.key}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-900">{r.name}</span>
                {role === r.key && <StatusPill tone="accent" size="xs">active</StatusPill>}
              </div>
              <div className="text-[11px] text-ink-500">{r.description}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-ink-500">Role-based access is enforced in this portal (navigation, route guards, write actions). Backend authentication and per-user accounts are the next platform milestone; until then the role is a session choice.</p>
      </Card>
      <Card>
        <CardHeader title="Access matrix" subtitle="Which modules each role can open" />
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-500">
                <th className="px-2 py-1 text-left font-medium">Module</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="px-2 py-1 text-center font-medium">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-nv-800">
              {NAV_ITEMS.map((n) => (
                <tr key={n.route}>
                  <td className="px-2 py-1 text-ink-700">{n.label}</td>
                  {ROLES.map((r) => (
                    <td key={r.key} className="px-2 py-1 text-center">
                      <span className={roleAllows(r.key as RoleKey, n.route) ? "text-emerald-300" : "text-ink-400"}>{roleAllows(r.key as RoleKey, n.route) ? "●" : "—"}</span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-2 py-1 text-ink-700">Write actions</td>
                {ROLES.map((r) => (
                  <td key={r.key} className="px-2 py-1 text-center">
                    <span className={r.canAct ? "text-emerald-300" : "text-ink-400"}>{r.canAct ? "●" : "—"}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SystemTab() {
  const { derived } = usePageData();
  const { loadedAt, warnings, refresh, refreshing } = useDataStatus();
  const sys = useSystemStore();
  const liveVehicles = useControlTowerVehicles();
  return (
    <div className="space-y-3">
      <KpiGrid>
        <KpiCard label="API" value={sys.api === "ok" ? "Ready" : sys.api} tone={sys.api === "ok" ? "good" : sys.api === "down" ? "danger" : "warning"} sub={sys.apiLatencyMs != null ? `${sys.apiLatencyMs} ms` : undefined} />
        <KpiCard label="Live feed" value={sys.ws} tone={sys.ws === "open" ? "good" : "warning"} sub={`${liveVehicles} vehicles reporting`} />
        <KpiCard label="Snapshot" value={loadedAt ? formatRelative(new Date(loadedAt)) : "—"} sub="auto-refresh every 90 s" />
        <KpiCard label="Shipments" value={derived.shipments.length} />
        <KpiCard label="Facilities" value={derived.nodes.length} />
        <KpiCard label="Corridors" value={derived.routes.length} />
        <KpiCard label="Vehicles" value={derived.vehicles.length} />
        <KpiCard label="Riders" value={derived.riders.length} />
      </KpiGrid>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="p-4 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Environment</div>
            <Button size="xs" variant="secondary" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh snapshot"}</Button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-ink-500">API base</dt><dd className="font-mono text-ink-900">{API_BASE_URL}</dd>
            <dt className="text-ink-500">Live feed</dt><dd className="font-mono text-ink-900">{WS_BASE_URL}</dd>
            <dt className="text-ink-500">Country</dt><dd className="text-ink-900">{COUNTRY.name} · {Object.values(COUNTRY.levels).map((l) => l.label).join(" / ")}</dd>
            <dt className="text-ink-500">Currency</dt><dd className="text-ink-900">{FINANCE.currency} · settlement T+{FINANCE.settlementDays}</dd>
            <dt className="text-ink-500">Simulation</dt><dd className="text-ink-900">Backend simulator advances vehicles, parcels and riders every 3 s (in-process on the API service).</dd>
            <dt className="text-ink-500">Health checks</dt>
            <dd className="text-ink-900">{Object.entries(sys.apiChecks).map(([k, v]) => `${k}: ${v ? "ok" : "failing"}`).join(" · ") || "—"}</dd>
          </dl>
          {warnings.length > 0 && (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4 text-xs">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Integration surface</div>
          <ul className="space-y-0.5 font-mono text-[11px] text-ink-700">
            {["GET /nodes", "GET /routes", "GET /packages", "PATCH /packages/{id}/status", "GET /orders", "GET /vehicles", "GET /riders", "PATCH /riders/{id}/assign-vehicle", "GET /merchants", "GET /customers", "GET /events", "GET /delivery-attempts", "GET /tracking/{tn}", "GET /analytics/overview", "POST /ml/eta/predict", "WS /ws/live/vehicles", "WS /ws/live/packages"].map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-500">Every page reads from one in-memory snapshot of these resources and writes back through the same API, so swapping the data source is a change to one loader.</p>
        </Card>
      </div>
    </div>
  );
}

function useControlTowerVehicles() {
  return useControlTowerStore((s) => s.vehicles.size);
}

function AuditTab() {
  const audit = useOpsStore((s) => s.audit);
  const columns = useMemo<DataColumn<AuditEntry>[]>(
    () => [
      { key: "at", header: "When", cell: (e) => <span className="text-ink-500">{formatDateTime(e.at)}</span>, value: (e) => e.at },
      { key: "actor", header: "Actor", cell: (e) => <span className="text-ink-700">{e.actor}</span>, value: (e) => e.actor },
      { key: "role", header: "Role", cell: (e) => <span className="text-ink-600">{e.role}</span>, value: (e) => e.role },
      { key: "action", header: "Action", cell: (e) => <span className="text-ink-900">{e.action}</span>, value: (e) => e.action },
      { key: "target", header: "Target", cell: (e) => <span className="font-mono text-ink-700">{e.target}</span>, value: (e) => e.target },
      { key: "detail", header: "Detail", cell: (e) => <span className="text-ink-500">{e.detail ?? ""}</span>, value: (e) => e.detail ?? "" },
      { key: "scope", header: "Scope", cell: (e) => <StatusPill tone={e.scope === "api" ? "accent" : "neutral"} size="xs">{e.scope === "api" ? "backend" : "portal"}</StatusPill>, value: (e) => e.scope },
    ],
    [],
  );
  return (
    <div>
      <DataTable columns={columns} rows={audit} rowKey={(e) => e.id} initialSort={{ key: "at", dir: "desc" }} exportName="audit-log" emptyWhat="audit entries" dense
        toolbar={<Button size="xs" variant="ghost" onClick={() => downloadText("audit-log.json", JSON.stringify(audit, null, 2), "application/json")}>JSON</Button>} />
      <p className="mt-2 text-[10px] text-ink-500">Backend-scoped entries changed data on the server; portal-scoped entries changed workflow state kept in this browser.</p>
    </div>
  );
}

function QualityTab() {
  const { derived } = usePageData();
  const checks = [
    { label: "Shipments without a known merchant", n: derived.shipments.filter((s) => !s.merchant).length, fix: "Merchant records missing from /merchants." },
    { label: "Shipments without a known customer", n: derived.shipments.filter((s) => !s.customer).length, fix: "Customer records missing from /customers." },
    { label: "Active shipments with no promised delivery time", n: derived.shipments.filter((s) => s.isActive && !s.expectedAt).length, fix: "SLA tracking is impossible for these." },
    { label: "Delivered shipments without a delivery attempt", n: derived.shipments.filter((s) => s.status === "DELIVERED" && s.attempts.length === 0).length, fix: "Proof of delivery is incomplete." },
    { label: "Out-for-delivery shipments without a rider", n: derived.shipments.filter((s) => s.status === "OUT_FOR_DELIVERY" && !s.pkg.assigned_rider_id).length, fix: "Assign from Dispatch." },
    { label: "Riders without a location", n: derived.riders.filter((r) => !r.hasLocation).length, fix: "They will not appear on the map." },
    { label: "Vehicles without a driver", n: derived.vehicles.filter((v) => !derived.riders.some((r) => r.rider.vehicle_id === v.id)).length, fix: "Assign from a rider profile." },
    { label: "Hubs with zero capacity", n: derived.hubs.filter((h) => h.capacity === 0).length, fix: "Utilisation cannot be computed." },
    { label: "Shipments whose destination is outside every mapped district", n: derived.shipments.filter((s) => !s.district).length, fix: "Check boundary files or coordinates." },
    { label: "COD shipments where order value and declared value disagree by >25%", n: derived.exceptions.filter((e) => e.type === "COD_DISCREPANCY").length, fix: "Listed under Exceptions." },
  ];
  return (
    <Card>
      <CardHeader title="Data quality checks" subtitle="Computed on the current snapshot" />
      <div className="divide-y divide-nv-800 px-4 pb-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center justify-between gap-3 py-2 text-xs">
            <div>
              <div className="text-ink-900">{c.label}</div>
              <div className="text-[11px] text-ink-500">{c.fix}</div>
            </div>
            <span className={clsx("shrink-0 rounded-full px-2 py-0.5 tabular-nums", c.n === 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300")}>{c.n}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
