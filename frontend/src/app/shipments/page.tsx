"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, RiskBadge, ShipmentKpiStrip, StatusDistributionCard, usePageData } from "@/components/pages/common";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/primitives";
import { StatusPill, packageStatusTone, slaTone } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ErrorState } from "@/components/ui/States";
import { SLA_LABELS, STATUS_GROUPS, type Shipment } from "@/data/derive";
import { PACKAGE_TRANSITIONS, TRANSITION_LABELS, errorMessage, transitionShipment } from "@/data/actions";
import { useFilterStore } from "@/data/filters";
import { useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useOpsStore } from "@/data/ops";
import { ROLE_BY_KEY } from "@/config/roles";
import { formatBDT, formatDateTime, formatMinutes, humanize } from "@/data/format";
import type { PackageStatus } from "@/types/domain";

export default function ShipmentsPage() {
  return (
    <DataGate>
      <Shipments />
    </DataGate>
  );
}

function Shipments() {
  const { shipments, previous, daily } = usePageData();
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const filters = useFilterStore((s) => s.filters);
  const setSearch = useFilterStore((s) => s.setSearch);
  const setList = useFilterStore((s) => s.setList);
  const clearAll = useFilterStore((s) => s.clearAll);
  const role = useOpsStore((s) => s.role);
  const canAct = ROLE_BY_KEY[role].canAct;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<PackageStatus | "">("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const stage = filters.statusGroups.length === 1 ? filters.statusGroups[0] : filters.statusGroups.length === 0 ? "all" : "multi";

  const columns = useMemo<DataColumn<Shipment>[]>(
    () => [
      { key: "tracking", header: "Tracking ID", locked: true, cell: (s) => <span className="font-mono text-ink-900">{s.trackingNumber}</span>, value: (s) => s.trackingNumber },
      { key: "order", header: "Order ID", defaultHidden: true, cell: (s) => <span className="font-mono text-ink-600">{s.order?.order_number ?? s.pkg.order_id.slice(0, 8)}</span>, value: (s) => s.order?.order_number ?? s.pkg.order_id },
      { key: "merchant", header: "Merchant", cell: (s) => <span className="text-ink-700">{s.merchantName}</span>, value: (s) => s.merchantName },
      { key: "customer", header: "Customer", cell: (s) => <span className="text-ink-700">{s.customerName}</span>, value: (s) => s.customerName },
      { key: "origin", header: "Origin", defaultHidden: true, cell: (s) => <span className="text-ink-600">{s.origin?.city ?? "—"}</span>, value: (s) => s.origin?.city ?? "" },
      { key: "destination", header: "Destination", cell: (s) => <span className="text-ink-600">{s.city}{s.district ? <span className="text-ink-500"> · {s.district}</span> : null}</span>, value: (s) => s.city },
      { key: "hub", header: "Current hub", cell: (s) => <span className="text-ink-600">{s.currentNode?.node_name ?? "—"}</span>, value: (s) => s.currentNode?.node_name ?? "" },
      { key: "rider", header: "Rider", cell: (s) => <span className="text-ink-600">{s.riderName ?? "—"}</span>, value: (s) => s.riderName ?? "" },
      { key: "status", header: "Status", cell: (s) => <StatusPill tone={packageStatusTone(s.status)} size="xs">{humanize(s.status)}</StatusPill>, value: (s) => s.status },
      {
        key: "eta",
        header: "ETA",
        cell: (s) => (
          <span className={s.hoursToSla != null && s.hoursToSla < 0 ? "text-rose-300" : "text-ink-600"}>
            {s.status === "DELIVERED" ? formatDateTime(s.pkg.actual_delivery_at) : s.hoursToSla == null ? "—" : s.hoursToSla < 0 ? `${formatMinutes(-s.hoursToSla * 60)} late` : formatMinutes(s.hoursToSla * 60)}
          </span>
        ),
        value: (s) => s.expectedAt ?? 0,
      },
      { key: "sla", header: "SLA", cell: (s) => (s.sla === "n_a" ? <span className="text-ink-500">—</span> : <StatusPill tone={slaTone(s.sla)} size="xs">{SLA_LABELS[s.sla]}</StatusPill>), value: (s) => s.sla },
      { key: "cod", header: "COD", align: "right", cell: (s) => <span className={s.isCod ? "text-ink-900" : "text-ink-500"}>{s.isCod ? formatBDT(s.codAmount) : "Prepaid"}</span>, value: (s) => s.codAmount },
      { key: "risk", header: "Risk", cell: (s) => <RiskBadge score={s.riskScore} />, value: (s) => s.riskScore },
      { key: "service", header: "Service", defaultHidden: true, cell: (s) => <span className="text-ink-600">{humanize(s.pkg.delivery_type)}</span>, value: (s) => s.pkg.delivery_type },
      { key: "priority", header: "Priority", defaultHidden: true, cell: (s) => <span className="text-ink-600">{humanize(s.pkg.priority)}</span>, value: (s) => s.pkg.priority },
      { key: "created", header: "Created", defaultHidden: true, cell: (s) => <span className="text-ink-500">{formatDateTime(s.pkg.created_at)}</span>, value: (s) => s.createdAt },
    ],
    [],
  );

  const selectedRows = shipments.filter((s) => selected.has(s.id));
  const commonTransitions = selectedRows.length
    ? selectedRows.map((s) => PACKAGE_TRANSITIONS[s.status]).reduce((acc, list) => acc.filter((t) => list.includes(t)))
    : [];

  const applyBulk = async () => {
    if (!bulkStatus) return;
    setBulkBusy(true);
    setBulkResult(null);
    let ok = 0;
    const failures: string[] = [];
    for (const s of selectedRows) {
      try {
        await transitionShipment(s.pkg, bulkStatus, { nodeId: s.pkg.current_node_id ?? undefined });
        ok += 1;
      } catch (err) {
        failures.push(`${s.trackingNumber}: ${errorMessage(err, "rejected")}`);
      }
    }
    setBulkBusy(false);
    setBulkResult(`${ok} updated${failures.length ? `, ${failures.length} failed — ${failures.slice(0, 2).join("; ")}` : ""}.`);
    setSelected(new Set());
    setBulkStatus("");
  };

  return (
    <Page>
      <PageHeader title="Shipments" description="Complete shipment lifecycle. Click a row for the full record; select rows for bulk actions." />
      <ShipmentKpiStrip shipments={shipments} previous={previous} daily={daily} mode="cross" />
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Tabs
              value={stage}
              onChange={(k) => setList("statusGroups", k === "all" ? [] : [k])}
              tabs={[{ key: "all", label: "All", count: shipments.length }, ...STATUS_GROUPS.map((g) => ({ key: g.key, label: g.label, count: shipments.filter((s) => s.group === g.key).length }))]}
              className="flex-wrap"
            />
          </div>
          <DataTable
            columns={columns}
            rows={shipments}
            rowKey={(s) => s.id}
            onRowClick={(s) => open("shipment", s.id)}
            activeKey={drawerItem?.kind === "shipment" ? drawerItem.id : null}
            selectable={canAct}
            selected={selected}
            onSelectedChange={setSelected}
            initialSort={{ key: "risk", dir: "desc" }}
            exportName="shipments"
            emptyWhat="shipments"
            onClearFilters={clearAll}
            toolbar={
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-500" />
                <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tracking, merchant, customer…" aria-label="Search shipments" className="w-56 rounded-md border border-nv-700 bg-nv-950/60 py-1 pl-6 pr-2 text-[11px] text-ink-900 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none" />
              </div>
            }
            bulkActions={() => (
              <div className="flex items-center gap-1.5">
                <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as PackageStatus | "")} className="w-52" aria-label="Bulk status action">
                  <option value="">{commonTransitions.length ? "Bulk action…" : "No action shared by selection"}</option>
                  {commonTransitions.map((t) => (
                    <option key={t} value={t}>
                      {TRANSITION_LABELS[t] ?? humanize(t)}
                    </option>
                  ))}
                </Select>
                <Button size="xs" disabled={!bulkStatus || bulkBusy} onClick={applyBulk}>
                  {bulkBusy ? "Applying…" : `Apply to ${selectedRows.length}`}
                </Button>
              </div>
            )}
          />
          {bulkResult && (
            <div className="mt-2">
              {bulkResult.includes("failed") ? <ErrorState message={bulkResult} /> : <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">{bulkResult}</div>}
            </div>
          )}
        </div>
        <div className="space-y-3">
          <StatusDistributionCard shipments={shipments} />
          <SlaBreakdown shipments={shipments} />
        </div>
      </div>
    </Page>
  );
}

function SlaBreakdown({ shipments }: { shipments: Shipment[] }) {
  const setList = useFilterStore((s) => s.setList);
  const current = useFilterStore((s) => s.filters.sla);
  const rows = (["on_track", "at_risk", "breached", "met", "missed"] as const).map((k) => ({ k, n: shipments.filter((s) => s.sla === k).length }));
  return (
    <div className="rounded-lg border border-nv-800 bg-nv-900 p-3">
      <div className="mb-2 text-[13px] font-semibold text-ink-900">SLA breakdown</div>
      <div className="space-y-1">
        {rows.map(({ k, n }) => (
          <button key={k} onClick={() => setList("sla", current.length === 1 && current[0] === k ? [] : [k])} className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-nv-850 ${current.includes(k) ? "bg-accent-100/40" : ""}`} aria-pressed={current.includes(k)}>
            <StatusPill tone={slaTone(k)} size="xs">{SLA_LABELS[k]}</StatusPill>
            <span className="tabular-nums text-ink-900">{n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
