"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { KpiCard, KpiGrid } from "@/components/kpi/KpiCard";
import { Tabs } from "@/components/ui/primitives";
import { StatusPill, priorityTone } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { ChartCard } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { PRIORITY_COLORS } from "@/components/charts/chartTheme";
import { EXCEPTION_STATUS_TONE } from "@/components/drawer/ExceptionDetail";
import { EXCEPTION_TYPE_LABELS, type ExceptionItem, type ExceptionPriority, type ExceptionType } from "@/data/derive";
import { useOpsStore, type ExceptionStatus } from "@/data/ops";
import { useOpenDrawer } from "@/data/hooks";
import { useDrawerStore } from "@/data/drawer";
import { useFilterStore, effectiveLists } from "@/data/filters";
import { ROLE_BY_KEY } from "@/config/roles";
import { formatRelative, humanize } from "@/data/format";

export default function ExceptionsPage() {
  return (
    <DataGate>
      <Suspense fallback={null}>
        <Exceptions />
      </Suspense>
    </DataGate>
  );
}

const PRIORITIES: ExceptionPriority[] = ["critical", "high", "medium", "low"];

function Exceptions() {
  const { derived, filters, cross } = usePageData();
  const params = useSearchParams();
  const open = useOpenDrawer();
  const drawerItem = useDrawerStore((s) => s.item);
  const workflow = useOpsStore((s) => s.exceptions);
  const update = useOpsStore((s) => s.updateException);
  const userName = useOpsStore((s) => s.userName);
  const role = useOpsStore((s) => s.role);
  const canAct = ROLE_BY_KEY[role].canAct;
  const clearAll = useFilterStore((s) => s.clearAll);
  const [type, setType] = useState<ExceptionType | "all">((params.get("type") as ExceptionType | null) ?? "all");
  const [priority, setPriority] = useState<ExceptionPriority | "all">("all");
  const [status, setStatus] = useState<ExceptionStatus | "all" | "active">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lists = effectiveLists(filters, cross);

  const statusOf = (e: ExceptionItem): ExceptionStatus => {
    const w = workflow[e.id];
    if (!w) return "open";
    if (w.status === "snoozed" && w.snoozedUntil && Date.parse(w.snoozedUntil) < derived.now) return "open";
    return w.status;
  };

  const scoped = useMemo(
    () => derived.exceptions.filter((e) => (!lists.cities.length || (e.city && lists.cities.includes(e.city))) && (!lists.divisions.length || (e.division && lists.divisions.includes(e.division)))),
    [derived.exceptions, lists.cities, lists.divisions],
  );
  const rows = useMemo(
    () =>
      scoped.filter((e) => {
        const st = statusOf(e);
        if (type !== "all" && e.type !== type) return false;
        if (priority !== "all" && e.priority !== priority) return false;
        if (status === "active" && (st === "resolved" || st === "snoozed")) return false;
        if (status !== "all" && status !== "active" && st !== status) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, type, priority, status, workflow, derived.now],
  );

  const counts = (p: ExceptionPriority) => scoped.filter((e) => e.priority === p && !["resolved", "snoozed"].includes(statusOf(e))).length;
  const byStatus = (s: ExceptionStatus) => scoped.filter((e) => statusOf(e) === s).length;
  const byType = useMemo(() => {
    const m = new Map<ExceptionType, number>();
    for (const e of scoped) if (!["resolved", "snoozed"].includes(statusOf(e))) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ key: t, label: EXCEPTION_TYPE_LABELS[t], value: n, color: "#fbbf24" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, workflow]);

  const columns = useMemo<DataColumn<ExceptionItem>[]>(
    () => [
      { key: "priority", header: "Priority", cell: (e) => <StatusPill tone={priorityTone(e.priority)} size="xs" withDot>{e.priority}</StatusPill>, value: (e) => PRIORITIES.indexOf(e.priority) },
      { key: "type", header: "Type", cell: (e) => <span className="text-ink-600">{EXCEPTION_TYPE_LABELS[e.type]}</span>, value: (e) => e.type },
      { key: "title", header: "Exception", locked: true, cell: (e) => <span className="text-ink-900">{e.title}</span>, value: (e) => e.title },
      { key: "entity", header: "Entity", cell: (e) => <span className="text-ink-600">{humanize(e.entity.kind)} · {e.entity.label}</span>, value: (e) => e.entity.label },
      { key: "city", header: "City", cell: (e) => <span className="text-ink-600">{e.city ?? "—"}</span>, value: (e) => e.city ?? "" },
      { key: "detected", header: "Detected", cell: (e) => <span className="text-ink-500">{formatRelative(new Date(e.detectedAt))}</span>, value: (e) => e.detectedAt },
      { key: "status", header: "Workflow", cell: (e) => <StatusPill tone={EXCEPTION_STATUS_TONE[statusOf(e)]} size="xs">{humanize(statusOf(e))}</StatusPill>, value: (e) => statusOf(e) },
      { key: "assignee", header: "Assignee", cell: (e) => <span className="text-ink-600">{workflow[e.id]?.assignee ?? "—"}</span>, value: (e) => workflow[e.id]?.assignee ?? "" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow],
  );

  const bulk = (fn: (e: ExceptionItem) => void) => {
    rows.filter((e) => selected.has(e.id)).forEach(fn);
    setSelected(new Set());
  };

  return (
    <Page>
      <PageHeader title="Exceptions" description="Central exception management. Conditions are detected from the live data; workflow state is yours." />
      <KpiGrid>
        {PRIORITIES.map((p) => (
          <KpiCard key={p} label={p} value={counts(p)} tone={p === "critical" ? "danger" : p === "high" ? "warning" : p === "medium" ? "accent" : "neutral"} onClick={() => setPriority(priority === p ? "all" : p)} active={priority === p} hint="Filter by priority" />
        ))}
        {(["open", "assigned", "escalated", "resolved"] as ExceptionStatus[]).map((s) => (
          <KpiCard key={s} label={humanize(s)} value={byStatus(s)} tone={s === "resolved" ? "good" : s === "escalated" ? "warning" : "neutral"} onClick={() => setStatus(status === s ? "active" : s)} active={status === s} hint="Filter by workflow state" />
        ))}
      </KpiGrid>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Tabs
              value={type}
              onChange={setType}
              className="flex-wrap"
              tabs={[{ key: "all" as const, label: "All types" }, ...(Object.keys(EXCEPTION_TYPE_LABELS) as ExceptionType[]).filter((t) => scoped.some((e) => e.type === t)).map((t) => ({ key: t, label: EXCEPTION_TYPE_LABELS[t], count: scoped.filter((e) => e.type === t && !["resolved", "snoozed"].includes(statusOf(e))).length }))]}
            />
            <Tabs value={status} onChange={setStatus} tabs={[{ key: "active", label: "Active" }, { key: "snoozed", label: "Snoozed", count: byStatus("snoozed") }, { key: "all", label: "Everything" }]} />
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            onRowClick={(e) => open("exception", e.id)}
            activeKey={drawerItem?.kind === "exception" ? drawerItem.id : null}
            selectable={canAct}
            selected={selected}
            onSelectedChange={setSelected}
            exportName="exceptions"
            emptyWhat="exceptions"
            onClearFilters={() => { clearAll(); setType("all"); setPriority("all"); setStatus("active"); }}
            rowClassName={(e) => (e.priority === "critical" ? "shadow-[inset_2px_0_0_0_#f87171]" : undefined)}
            bulkActions={(sel) => (
              <>
                <Button size="xs" variant="secondary" onClick={() => bulk((e) => update(e.id, { status: "assigned", assignee: userName }, "Took ownership of exception", e.entity.label))}>Assign to me</Button>
                <Button size="xs" variant="secondary" onClick={() => bulk((e) => update(e.id, { status: "escalated" }, "Escalated exception", e.entity.label))}>Escalate</Button>
                <Button size="xs" variant="secondary" onClick={() => bulk((e) => update(e.id, { status: "snoozed", snoozedUntil: new Date(Date.now() + 24 * 3600e3).toISOString() }, "Snoozed exception 24h", e.entity.label))}>Snooze 24h</Button>
                <Button size="xs" onClick={() => bulk((e) => update(e.id, { status: "resolved" }, "Resolved exception", e.entity.label))}>Resolve {sel.length}</Button>
              </>
            )}
          />
        </div>
        <div className="space-y-3">
          <ChartCard title="By priority" subtitle="Active exceptions" empty={scoped.length === 0}>
            <DonutChart slices={PRIORITIES.map((p) => ({ key: p, label: humanize(p), value: counts(p), color: PRIORITY_COLORS[p] }))} centerValue={String(PRIORITIES.reduce((n, p) => n + counts(p), 0))} centerLabel="active" onClick={(k) => setPriority(priority === k ? "all" : (k as ExceptionPriority))} activeKey={priority === "all" ? null : priority} height={140} />
          </ChartCard>
          <ChartCard title="By type" subtitle="Click to filter" empty={byType.length === 0}>
            <BarList rows={byType} onClick={(k) => setType(type === k ? "all" : (k as ExceptionType))} activeKey={type === "all" ? null : type} />
          </ChartCard>
        </div>
      </div>
    </Page>
  );
}
